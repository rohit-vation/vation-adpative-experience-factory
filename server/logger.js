import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const LEVELS = Object.freeze({ TRACE: 10, DEBUG: 20, INFO: 30, WARN: 40, ERROR: 50, OFF: 99 });
const MAX_ENTRIES = 3000;
const MAX_LOG_BYTES = 5 * 1024 * 1024;
const LOG_DIR = path.join(os.homedir(), '.adaptive-experience-factory', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'aef-runtime.jsonl');
const ring = [];
let sequence = 0;
let currentLevel = normalizeLevel(process.env.LOG_LEVEL || 'INFO');
let writeChain = Promise.resolve();

function normalizeLevel(value) {
  const level = String(value || 'INFO').toUpperCase();
  return Object.hasOwn(LEVELS, level) ? level : 'INFO';
}

function scrubString(value) {
  let out = String(value);
  out = out.replace(/(authorization\s*[:=]\s*(?:bearer|basic)\s+)[^\s,;"']+/ig, '$1[REDACTED]');
  out = out.replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/g, 'Bearer [REDACTED]');
  out = out.replace(/\bBasic\s+[A-Za-z0-9+/=]{12,}/g, 'Basic [REDACTED]');
  out = out.replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_API_KEY]');
  out = out.replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[REDACTED_API_KEY]');
  out = out.replace(/([?&](?:token|access_token|client_secret|password|api_key)=)[^&\s]+/ig, '$1[REDACTED]');
  out = out.replace(/((?:password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*)("[^"]*"|'[^']*'|[^,\s}]+)/ig, '$1[REDACTED]');
  return out.slice(0, 3000);
}

function scrub(value, key = '', depth = 0) {
  if (/password|passwd|secret|token|api[_-]?key|authorization|cookie|credential|privatekey/i.test(key)) return '[REDACTED]';
  if (depth > 5) return '[MAX_DEPTH]';
  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 60).map((item) => scrub(item, '', depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [childKey, child] of Object.entries(value).slice(0, 100)) {
      out[childKey] = scrub(child, childKey, depth + 1);
    }
    return out;
  }
  return String(value);
}

async function appendEntry(entry) {
  if (String(process.env.LOG_TO_FILE || 'true').toLowerCase() === 'false') return;
  writeChain = writeChain.then(async () => {
    await fs.mkdir(LOG_DIR, { recursive: true });
    try {
      const stat = await fs.stat(LOG_FILE);
      if (stat.size >= MAX_LOG_BYTES) {
        const rotated = path.join(LOG_DIR, `aef-runtime-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
        await fs.rename(LOG_FILE, rotated);
        const files = (await fs.readdir(LOG_DIR)).filter((name) => /^aef-runtime-.*\.jsonl$/.test(name)).sort().reverse();
        for (const name of files.slice(8)) await fs.rm(path.join(LOG_DIR, name), { force: true });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await fs.appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
  }).catch(() => {
    // Logging must never crash AEF if a file system denies write access.
  });
  return writeChain;
}

export function log(level, scope, message, details = undefined) {
  const safeLevel = normalizeLevel(level);
  if (LEVELS[safeLevel] < LEVELS[currentLevel] || safeLevel === 'OFF') return null;
  const entry = {
    id: ++sequence,
    timestamp: new Date().toISOString(),
    level: safeLevel,
    scope: scrubString(scope || 'app').slice(0, 80),
    message: scrubString(message || '').slice(0, 1600),
    ...(details === undefined ? {} : { details: scrub(details) }),
  };
  ring.push(entry);
  if (ring.length > MAX_ENTRIES) ring.splice(0, ring.length - MAX_ENTRIES);
  const consoleMessage = `[${entry.level}] ${entry.scope}: ${entry.message}`;
  if (safeLevel === 'ERROR') console.error(consoleMessage, entry.details || '');
  else if (safeLevel === 'WARN') console.warn(consoleMessage, entry.details || '');
  else if (safeLevel === 'DEBUG' || safeLevel === 'TRACE') console.debug(consoleMessage, entry.details || '');
  else console.info(consoleMessage, entry.details || '');
  void appendEntry(entry);
  return entry;
}

export const logger = Object.freeze({
  trace: (scope, message, details) => log('TRACE', scope, message, details),
  debug: (scope, message, details) => log('DEBUG', scope, message, details),
  info: (scope, message, details) => log('INFO', scope, message, details),
  warn: (scope, message, details) => log('WARN', scope, message, details),
  error: (scope, message, details) => log('ERROR', scope, message, details),
});

export function queryLogs({ after = 0, level = 'TRACE', query = '', limit = 500 } = {}) {
  const minimum = LEVELS[normalizeLevel(level)];
  const needle = String(query || '').trim().toLowerCase().slice(0, 200);
  const max = Math.max(1, Math.min(1500, Number(limit) || 500));
  const result = ring.filter((entry) => entry.id > Number(after || 0) && LEVELS[entry.level] >= minimum)
    .filter((entry) => !needle || `${entry.scope} ${entry.message} ${JSON.stringify(entry.details || {})}`.toLowerCase().includes(needle))
    .slice(-max);
  return { entries: result, latestId: sequence, level: currentLevel, levels: Object.keys(LEVELS).filter((item) => item !== 'OFF') };
}

export function clearLogs() {
  const count = ring.length;
  ring.length = 0;
  log('INFO', 'logs', `Log panel cleared (${count} in-memory entries removed).`);
  return { cleared: count };
}

export function setLogLevel(value) {
  const next = normalizeLevel(value);
  if (next === 'OFF' || !Object.hasOwn(LEVELS, next)) throw new Error('Invalid log level.');
  const previous = currentLevel;
  currentLevel = next;
  log('INFO', 'logs', `Log verbosity changed from ${previous} to ${next}.`);
  return { level: currentLevel };
}

export function getLogLevel() {
  return currentLevel;
}
