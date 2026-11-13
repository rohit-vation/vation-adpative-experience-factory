/**
 * Application server: serves the app and answers /api/generate with Gemini.
 *
 *   npm start       http://localhost:3000
 *
 * AI generation always uses a configured provider API. If the provider key is missing or rejected, the request fails with an explicit error; there is no demo fallback.
 *
 * Routes
 *   GET  /api/status     { ai: boolean, provider, model }
 *   POST /api/generate   { workflow, input }  ->  { data }   or   { error }
 *   anything else        static files from the project folder
 *
 * The browser sends only the workflow name and the form values. The prompt is built here,
 * so a visitor cannot send arbitrary prompts through your key.
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv } from './env.js';
loadEnv(); // must run before the AI layer reads its settings
setLogLevel(process.env.LOG_LEVEL || 'INFO');
await initAemForge();

import { callAI, aiStatus, modelsFor, AiError } from './ai/index.js';
import { SYSTEM_PROMPT } from '../src/ai/system-prompt.js';
import { PROMPT_BUILDERS } from '../src/ai/prompts.js';
import { validate } from '../src/ai/validate.js';
import { repairAemGenerationResponse } from '../src/services/aem-generation-repair.js';
import { ensureCompleteAemFiles } from '../src/services/generate.js';
import { logger, setLogLevel } from './logger.js';
import { handleAemForgeApi, initAemForge } from './aem-forge.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

/** Shown above results the model could only estimate. */
const NOTICES = {
  map: 'The model only has the component names, not your real source code. The source implementation is a plausible example, not read from your repository.',
  audit: 'The model cannot open websites or run tests. Scores, measurements and findings are estimates, not measurements.',
  migrate: 'The model cannot crawl the site. Page counts, templates and mappings are estimates, not a real inventory.'
};

/* ---------- Limits ---------- */

// Detailed component briefs can legitimately be very long. Keep a generous but bounded
// request limit to prevent accidental/unbounded payloads while allowing full specifications.
const MAX_BODY_BYTES = 1_000_000;
const MAX_TEXT_LENGTH = 100_000;
const RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: Number(process.env.RATE_LIMIT_MAX) || 30 };
const hits = new Map(); // ip -> [timestamps]

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT.max;
}

/* ---------- Helpers ---------- */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req, maxBytes = MAX_BODY_BYTES) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new AiError('That request is too large.', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (err) {
    throw new AiError('The request was not valid JSON.', 400);
  }
}

/** Pull a JSON object out of the model's text, even if it wrapped it in a code fence. */
export function parseModelJson(text) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(clean);
  } catch (err) {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw err;
  }
}

const aemFileRole = (file) => {
  const name = String(file?.name || '');
  const lang = String(file?.lang || '').toLowerCase();
  if (/\.(?:html?|htl)$/i.test(name) || /^(?:html?|htl)$/.test(lang)) return 'htl';
  if (/\.css$/i.test(name) || lang === 'css') return 'css';
  if (/\.(?:m?js)$/i.test(name) || /^(?:js|javascript)$/.test(lang)) return 'js';
  if (/\.java$/i.test(name) || lang === 'java') return 'java';
  return '';
};

const fieldSignature = (fields) => (Array.isArray(fields) ? fields : []).map((field) => ({
  name: field?.name || '',
  type: field?.type || '',
  composite: field?.composite === true,
  children: fieldSignature(field?.children)
}));

/**
 * Repair models sometimes return a new partial AEM file list and accidentally
 * drop an asset from the previous attempt. Current files remain authoritative;
 * carry forward only missing file roles when the field schema is compatible.
 */
export function mergeAemRetryData(previous, current) {
  if (!previous || !current || typeof previous !== 'object' || typeof current !== 'object') return current;
  const previousImpl = previous.implementations?.aem;
  const currentImpl = current.implementations?.aem;
  if (!previousImpl || typeof previousImpl !== 'object' || !currentImpl || typeof currentImpl !== 'object') return current;

  const previousFields = Array.isArray(previousImpl.fields) ? previousImpl.fields : [];
  const currentFields = Array.isArray(currentImpl.fields) ? currentImpl.fields : [];
  const usePreviousFields = currentFields.length === 0 && previousFields.length > 0;
  const schemaCompatible = usePreviousFields ||
    JSON.stringify(fieldSignature(previousFields)) === JSON.stringify(fieldSignature(currentFields));
  const currentFiles = Array.isArray(currentImpl.files) ? currentImpl.files.filter((file) => file && typeof file === 'object') : [];
  const previousFiles = Array.isArray(previousImpl.files) ? previousImpl.files.filter((file) => file && typeof file === 'object') : [];
  const mergedFiles = [...currentFiles];

  if (schemaCompatible) {
    const presentRoles = new Set(currentFiles.map(aemFileRole).filter(Boolean));
    const presentNames = new Set(currentFiles.map((file) => String(file.name || '')));
    for (const file of previousFiles) {
      const role = aemFileRole(file);
      const name = String(file.name || '');
      if (role) {
        if (presentRoles.has(role)) continue;
        mergedFiles.push(file);
        presentRoles.add(role);
      } else if (name && !presentNames.has(name)) {
        mergedFiles.push(file);
        presentNames.add(name);
      }
    }
  }

  const aem = {
    ...currentImpl,
    fields: currentFields.length ? currentFields : previousFields,
    model: Array.isArray(currentImpl.model) && currentImpl.model.length
      ? currentImpl.model
      : (Array.isArray(previousImpl.model) ? previousImpl.model : []),
    files: mergedFiles,
    ...(schemaCompatible && !String(currentImpl.directJcrHtl || '').trim() && String(previousImpl.directJcrHtl || '').trim()
      ? { directJcrHtl: previousImpl.directJcrHtl }
      : {})
  };
  return {
    ...current,
    implementations: { ...current.implementations, aem }
  };
}

/** Reject inputs that are the wrong type or absurdly long before they reach a prompt. */
function checkInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AiError('Missing input.', 400);
  for (const [key, value] of Object.entries(input)) {
    const ok =
      typeof value === 'string' ? value.length <= MAX_TEXT_LENGTH :
      Array.isArray(value) ? value.length <= 20 && value.every((v) => typeof v === 'string' && v.length < 100) :
      false;
    if (!ok) throw new AiError(`Input "${key}" is not valid.`, 400);
  }
}

/* ---------- Generate ---------- */

async function generate(workflow, input, choice) {
  const buildPrompt = PROMPT_BUILDERS[workflow];
  if (!buildPrompt) throw new AiError('Unknown workflow.', 400);
  checkInput(input);

  let prompt;
  try {
    prompt = buildPrompt(input);
  } catch (err) {
    throw new AiError('Some inputs are missing or not recognized.', 400);
  }

  // Complex AEM briefs get a third bounded attempt. Preserve earlier source files
  // across repairs when the field schema is compatible.
  const complexAemCreate = workflow === 'create' && input.cms === 'aem' &&
    /\b(?:multi[\s-]?field|composite|carousel|slider|sling[\s-]*model|tabs?|tabbed|accordion|faq|frequently asked questions|video|interactive|external api)\b/i.test(
      String(input.name || '') + ' ' + String(input.description || '')
    );
  const maxAttempts = complexAemCreate ? 3 : 2;
  let lastError;
  let previousResponse = null;
  logger.info('ai-generate', `Generating ${workflow} workflow.`, { provider: choice?.provider || 'default', model: choice?.model || 'default' });
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const text = await callAI({ choice, system: SYSTEM_PROMPT, prompt });
    let candidateResponse = null;
    try {
      const parsedResponse = parseModelJson(text);
      candidateResponse = previousResponse ? mergeAemRetryData(previousResponse, parsedResponse) : parsedResponse;
      candidateResponse = repairAemGenerationResponse(candidateResponse, input);
      const validatedData = validate(workflow, candidateResponse, input);
      // The AI owns component-specific behaviour; deterministic assembly owns complete AEM
      // scaffolding (dialog, metadata, manifest and indexed clientlibs). Validate both stages.
      const assembledData = workflow === 'create'
        ? ensureCompleteAemFiles(validatedData, input)
        : validatedData;
      const data = workflow === 'create'
        ? validate(workflow, assembledData, input)
        : assembledData;
      if (NOTICES[workflow]) data._notice = NOTICES[workflow];
      logger.info('ai-generate', `${workflow} workflow completed.`, { attempt, resultKeys: Object.keys(data || {}).length });
      return data;
    } catch (err) {
      lastError = err;
      if (candidateResponse) previousResponse = candidateResponse;
      const reason = String(err?.message || 'Validation failed.').replace(/[\r\n]+/g, ' ').slice(0, 600);
      logger.warn('ai-generate', `${workflow} AI response rejected during validation.`, { attempt, reason });
      if (attempt < maxAttempts) {
        prompt += '\n\nREPAIR THE PREVIOUS RESPONSE. Deterministic validation rejected it for this reason: ' + reason +
          '\nReturn the complete corrected JSON object in the original required schema, not a patch or explanation. Correct the stated defect, keep all requested behavior and all previously valid fields/files, and do not weaken or omit requirements to silence validation. For AEM, keep fields, dialog/model/HTL/CSS/JS/clientlibs consistent; provide a model-free directJcrHtl when composite multifields or Sling Model-based logic require the direct-JCR path. Ensure required Java/Sling Model source and all required JavaScript assets are present.';
      }
    }
  }
  logger.error('ai-generate', `${workflow} generation exhausted retries.`, { reason: lastError?.message || 'Unknown validation failure' });
  throw new AiError('The AI answer was incomplete. Try again.', 502);
}

/* ---------- Routes ---------- */

async function handleApi(req, res, path) {
  const startedAt = Date.now();
  res.once('finish', () => {
    if (path !== '/api/logs' && !path.startsWith('/api/logs/')) {
      logger.debug('http', `${req.method} ${path} → ${res.statusCode}`, { elapsedMs: Date.now() - startedAt });
    }
  });
  try {
    if (path.startsWith('/api/aem/') || path === '/api/logs' || path.startsWith('/api/logs/')) {
      const handled = await handleAemForgeApi(req, res, path, { readJson, sendJson });
      if (handled === false) sendJson(res, 404, { error: 'Unknown AEM/logs API route.' });
      return;
    }
    if (path === '/api/status' && req.method === 'GET') {
      return sendJson(res, 200, aiStatus());
    }

    if (path === '/api/models' && req.method === 'GET') {
      const provider = new URL(req.url, 'http://x').searchParams.get('provider');
      return sendJson(res, 200, await modelsFor(provider));
    }

    if (path === '/api/generate' && req.method === 'POST') {
      if (rateLimited(req.socket.remoteAddress || 'unknown')) {
        throw new AiError('Too many requests. Wait a few minutes and try again.', 429);
      }
      const { workflow, input, ai } = await readJson(req);
      if (ai !== undefined && (typeof ai !== 'object' || ai === null || Array.isArray(ai))) throw new AiError('The AI choice is not valid.', 400);
      const started = Date.now();
      const data = await generate(workflow, input, ai || {});
      console.log(`[${workflow}] ok in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      return sendJson(res, 200, { data });
    }

    sendJson(res, 404, { error: 'Not found.' });
  } catch (err) {
    const status = err instanceof AiError ? err.status : 500;
    logger.error('http', 'API request failed.', { method: req.method, path, status, message: err.message });
    sendJson(res, status, { error: err instanceof AiError ? err.message : 'Something went wrong on the server.' });
  }
}

async function handleStatic(res, path) {
  try {
    const file = resolve(join(ROOT, normalize(path === '/' ? '/index.html' : path)));

    // Only the app itself is public. Never serve .env, server code or anything outside the folder.
    const relative = file.slice(ROOT.length + 1).replaceAll('\\', '/');
    const isPublic = relative === 'index.html' || relative.startsWith('src/');
    if (!file.startsWith(ROOT) || !isPublic) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }

    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}

export function createServer() {
  return http.createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.startsWith('/api/')) return handleApi(req, res, path);
    return handleStatic(res, path);
  });
}

// Start only when run directly (so tests can import this file)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, HOST, () => {
    const status = aiStatus();
    logger.info('startup', `Adaptive Experience Factory started at http://${HOST}:${PORT}`);
    const configuredProviders = status.providers.filter((provider) => provider.configured);
    console.log(configuredProviders.length
      ? `AI API required; configured providers (key validity is checked on request): ${configuredProviders.map((provider) => `${provider.label} (${provider.defaultModel})`).join(', ')}. Default: ${status.defaultProvider}`
      : 'AI API required but no provider key is configured. Set GEMINI_API_KEY or OPENAI_API_KEY in the server .env before generating.');
    logger.info('startup', 'AI provider status checked.', { apiEnabled: true, configuredProviders: configuredProviders.map((provider) => provider.id) });
  });
}
