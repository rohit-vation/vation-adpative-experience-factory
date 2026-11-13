/**
 * The one AI entry point for the whole server. Everything else calls this and never
 * knows which company is behind it.
 *
 *   callAI({ choice, system, prompt })  -> string   (the model's reply text)
 *   aiStatus()                          -> what the browser needs to draw the picker
 *   modelsFor(providerId)               -> model names for the picker (live list, else suggestions)
 *
 * `choice` is { provider, model }, both optional. Missing parts fall back to the .env defaults.
 * Retries and the fallback model live here, so every provider gets them.
 *
 * Provider contract (see providers/openai.js):
 *   { id, label, keyEnv, config(), generate(cfg, model, system, prompt) -> text, listModels(cfg) -> [name] }
 */

import { AiError } from './errors.js';
import { logger } from '../logger.js';
import { PROVIDERS } from './providers/index.js';

export { AiError };

const RETRYABLE = [500, 502, 503, 504, 529];
const MAX_TRIES = 3;
const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:\/-]{0,79}$/;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const retryDelayMs = () => {
  const raw = process.env.AI_RETRY_DELAY_MS ?? process.env.GEMINI_RETRY_DELAY_MS;
  return raw !== undefined && raw !== '' ? Number(raw) : 2000;
};

/* ---------- Which provider and model ---------- */

// Provider API is the only runtime generation path. A configured key is required;
// there is no per-session or environment toggle that silently falls back to demo data.
const hasProviderKey = (provider) => Boolean(provider.config().key);
const hasAnyProviderKey = () => Object.values(PROVIDERS).some(hasProviderKey);
const apiEnabled = () => true;
const configured = (provider) => hasProviderKey(provider);

/** The provider used when the browser does not choose one. */
function defaultProvider() {
  const wanted = PROVIDERS[process.env.AI_PROVIDER];
  if (wanted && hasProviderKey(wanted)) return wanted;
  return Object.values(PROVIDERS).find(hasProviderKey) || null;
}

function resolveChoice(choice = {}) {
  const provider = choice.provider ? PROVIDERS[choice.provider] : defaultProvider();
  if (!provider) throw new AiError(choice.provider ? 'Unknown AI provider.' : 'No AI provider key is configured. Set GEMINI_API_KEY or OPENAI_API_KEY in the server .env before generating.', choice.provider ? 400 : 503);

  const cfg = provider.config();
  if (!cfg.key) throw new AiError(`${provider.label} API key is missing. Set ${provider.keyEnv} in the server .env before generating.`, 503);

  let model = cfg.model;
  if (choice.model !== undefined && choice.model !== '') {
    if (typeof choice.model !== 'string' || !MODEL_NAME.test(choice.model)) throw new AiError('That model name is not valid.', 400);
    model = choice.model.replace(/^models\//, '');
  }
  return { provider, cfg, model };
}

/* ---------- Generate ---------- */

/** One model with retries. Busy errors wait longer each time; other errors (key, quota, name) fail at once. */
async function withRetries({ provider, cfg }, model, system, prompt) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      return await provider.generate(cfg, model, system, prompt);
    } catch (err) {
      lastError = err;
      if (!RETRYABLE.includes(err.upstreamStatus) || attempt === MAX_TRIES) break;
      const delay = retryDelayMs() * 3 ** (attempt - 1);
      logger.warn('ai-provider', `${provider.label} busy; retrying request.`, { status: err.upstreamStatus, model, delayMs: delay, nextAttempt: attempt + 1, maxAttempts: MAX_TRIES });
      await sleep(delay);
    }
  }
  throw lastError;
}

export async function callAI({ choice, system, prompt }) {
  const picked = resolveChoice(choice);
  try {
    return await withRetries(picked, picked.model, system, prompt);
  } catch (err) {
    const { provider, cfg, model } = picked;
    if (cfg.fallbackModel && cfg.fallbackModel !== model && RETRYABLE.includes(err.upstreamStatus)) {
      logger.warn('ai-provider', 'Primary model remains busy; trying configured fallback.', { provider: provider.id, primaryModel: model, fallbackModel: cfg.fallbackModel });
      return await provider.generate(cfg, cfg.fallbackModel, system, prompt);
    }
    throw err;
  }
}

/* ---------- What the browser needs ---------- */

export function aiStatus() {
  const enabled = apiEnabled();
  const def = defaultProvider();
  return {
    apiEnabled: enabled,
    ai: Boolean(def),
    // Backward-compatible label for older UI/tests, while defaultProvider remains the stable id.
    provider: def ? def.label : null,
    model: def ? def.config().model : null,
    defaultProvider: def ? def.id : null,
    providers: Object.values(PROVIDERS).map((p) => {
      const cfg = p.config();
      return { id: p.id, label: p.label, configured: Boolean(cfg.key), defaultModel: cfg.model, models: cfg.suggested };
    })
  };
}

const modelCache = new Map(); // provider id -> { at, models, live }

/** Model names for the picker. Asks the provider for its real list, and falls back to the suggestions. */
export async function modelsFor(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new AiError('Unknown AI provider.', 400);
  const cfg = provider.config();
  if (!cfg.key) throw new AiError(`${provider.label} is not set up on the server.`, 400);

  const cached = modelCache.get(providerId);
  if (cached && Date.now() - cached.at < (cached.live ? 10 * 60_000 : 60_000)) return cached;

  let names = [];
  let live = false;
  let providerError = '';
  let providerErrorStatus = null;
  try {
    names = await provider.listModels(cfg);
    live = names.length > 0;
  } catch (err) {
    providerError = err.message || `${provider.label} model discovery failed.`;
    providerErrorStatus = err.status || err.upstreamStatus || null;
    logger.warn('ai-provider', 'Provider model discovery failed; using suggestions and exposing the error state.', { provider: provider.id, status: providerErrorStatus, message: providerError });
  }
  const unique = [...new Set([cfg.model, ...cfg.suggested, ...names.sort().reverse()])];
  const entry = { at: Date.now(), models: unique, live, defaultModel: cfg.model, error: providerError, errorStatus: providerErrorStatus };
  modelCache.set(providerId, entry);
  return entry;
}
