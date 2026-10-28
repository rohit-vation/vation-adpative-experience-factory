/**
 * Shared HTTP plumbing for every provider: timeout, network errors, JSON parsing and
 * readable error messages. Providers only describe WHAT to send and where the text is in the reply.
 */

import { AiError } from './errors.js';

/** Sends one request. Returns { ok, status, json, raw }. Throws AiError on timeout or network failure. */
export async function sendRequest(provider, { url, method = 'POST', headers = {}, body, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const raw = await response.text();
    let json = {};
    try { json = JSON.parse(raw); } catch (err) { /* keep {} */ }
    return { ok: response.ok, status: response.status, json, raw };
  } catch (err) {
    if (err.name === 'AbortError') throw new AiError(`${provider.label} took too long to answer. Try again.`, 504);
    throw new AiError(`Could not reach ${provider.label}. Check the network connection of the server.`, 502);
  } finally {
    clearTimeout(timer);
  }
}

/** Turns a failed reply into an AiError. `upstreamStatus` tells the retry logic what happened. */
export function upstreamError(provider, model, res) {
  const detail = res.json?.error?.message || res.raw.slice(0, 200);
  const e = new AiError(friendlyMessage(provider, model, res.status, detail), res.status === 429 ? 429 : 502);
  e.upstreamStatus = res.status;
  return e;
}

function friendlyMessage(provider, model, status, detail) {
  const name = provider.label;
  const key = provider.keyEnv;
  if (status === 401 || status === 403) return `${name} refused the key. Check ${key} in .env and that your account can use the API.`;
  if (status === 400 && /api key|incorrect api|invalid_api_key/i.test(detail)) return `${name} rejected the API key. Check ${key} in .env.`;
  if (status === 404) return `${name} does not know the model "${model}". Pick another model in the page header, or set a valid name in .env.`;
  if (status === 429) return `${name} rate limit or quota reached. Wait a minute and try again, or pick another model.`;
  if (status === 503 || status === 529) return `${name} is overloaded right now (high demand on this model). It usually clears within a few minutes. Try again, or pick another model or provider in the page header.`;
  return `${name} returned an error (${status}): ${detail.slice(0, 160)}`;
}
