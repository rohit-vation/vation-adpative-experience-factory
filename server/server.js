/**
 * Application server: serves the app and answers /api/generate with Gemini.
 *
 *   npm start       http://localhost:3000
 *
 * Without GEMINI_API_KEY the server still runs and the app stays in demo mode.
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

import { callAI, aiStatus, modelsFor, AiError } from './ai/index.js';
import { SYSTEM_PROMPT } from '../src/ai/system-prompt.js';
import { PROMPT_BUILDERS } from '../src/ai/prompts.js';
import { validate } from '../src/ai/validate.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = process.env.PORT || 3000;

/** Shown above results the model could only estimate. */
const NOTICES = {
  map: 'The model only has the component names, not your real source code. The source implementation is a plausible example, not read from your repository.',
  audit: 'The model cannot open websites or run tests. Scores, measurements and findings are estimates, not measurements.',
  migrate: 'The model cannot crawl the site. Page counts, templates and mappings are estimates, not a real inventory.'
};

/* ---------- Limits ---------- */

const MAX_BODY_BYTES = 50_000;
const MAX_TEXT_LENGTH = 6000;
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

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new AiError('That request is too large.', 413);
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

  // One retry: models occasionally return broken JSON or leave out a section
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await callAI({ choice, system: SYSTEM_PROMPT, prompt });
    try {
      const data = validate(workflow, parseModelJson(text), input);
      if (NOTICES[workflow]) data._notice = NOTICES[workflow];
      return data;
    } catch (err) {
      lastError = err;
      console.warn(`[${workflow}] attempt ${attempt} rejected:`, err.message);
    }
  }
  console.error(`[${workflow}] giving up:`, lastError.message);
  throw new AiError('The AI answer was incomplete. Try again.', 502);
}

/* ---------- Routes ---------- */

async function handleApi(req, res, path) {
  try {
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
    if (!(err instanceof AiError)) console.error(err);
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

/*
// Start only when run directly (so tests can import this file)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, () => {
    const status = aiStatus();
    console.log(`Adaptive Experience Factory: http://localhost:${PORT}`);
    const ready = status.providers.filter((p) => p.configured);
    console.log(ready.length
      ? `AI ready: ${ready.map((p) => `${p.label} (${p.defaultModel})`).join(', ')}. Default: ${status.defaultProvider}`
      : 'AI: off (no API key in .env), running in demo mode');
  });
}
*/

const server = createServer();

// Start locally only when run directly (so local 'npm start' and tests still work)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    const status = aiStatus();
    console.log(`Adaptive Experience Factory: http://localhost:${PORT}`);
    const ready = status.providers.filter((p) => p.configured);
    console.log(ready.length
      ? `AI ready: ${ready.map((p) => `${p.label} (${p.defaultModel})`).join(', ')}. Default: ${status.defaultProvider}`
      : 'AI: off (no API key in .env), running in demo mode');
  });
}

// Export the server listener request handler for Vercel's serverless environment
export default (req, res) => {
  server.emit('request', req, res);
};

