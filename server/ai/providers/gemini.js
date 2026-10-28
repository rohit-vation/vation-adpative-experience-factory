/**
 * Provider: Google Gemini.
 *
 * .env settings (all optional except the key):
 *   GEMINI_API_KEY         key from Google AI Studio
 *   GEMINI_MODEL           default model
 *   GEMINI_MODELS          comma list shown in the model picker (a live list is fetched too)
 *   GEMINI_FALLBACK_MODEL  tried once if the model stays overloaded after retries
 *   GEMINI_API_STYLE       "generateContent" (default) or "interactions"
 *   GEMINI_BASE_URL        default https://generativelanguage.googleapis.com/v1beta
 *   GEMINI_TIMEOUT_MS      default 180000
 *
 * If one API style answers 404, the other is tried once automatically.
 */

import { AiError } from '../errors.js';
import { sendRequest, upstreamError } from '../http.js';

const MAX_OUTPUT_TOKENS = 32768;
const list = (value, fallback) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : fallback);

const STYLES = {
  generateContent: {
    url: (c, model) => `${c.base}/models/${encodeURIComponent(model)}:generateContent`,
    body: (model, system, prompt) => ({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: MAX_OUTPUT_TOKENS }
    }),
    text: (json) => (json?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(''),
    blocked: (json) => json?.promptFeedback?.blockReason || ''
  },
  interactions: {
    url: (c) => `${c.base}/interactions`,
    body: (model, system, prompt) => ({
      model,
      system_instruction: system,
      input: prompt,
      response_format: { type: 'text', mime_type: 'application/json' },
      generation_config: { max_output_tokens: MAX_OUTPUT_TOKENS }
    }),
    text: (json) => {
      const steps = json?.steps || [];
      return (steps[steps.length - 1]?.content || []).map((c) => c.text || '').join('');
    },
    blocked: () => ''
  }
};

async function requestStyle(provider, styleName, c, model, system, prompt) {
  const style = STYLES[styleName];
  const res = await sendRequest(provider, {
    url: style.url(c, model),
    headers: { 'x-goog-api-key': c.key },
    body: style.body(model, system, prompt),
    timeoutMs: c.timeoutMs
  });
  if (!res.ok) throw upstreamError(provider, model, res);

  const blocked = style.blocked(res.json);
  if (blocked) throw new AiError(`Gemini declined this request (${blocked}).`, 422);

  const text = style.text(res.json);
  if (!text.trim()) throw new AiError('Gemini returned an empty answer. Try again.', 502);
  return text;
}

export const gemini = {
  id: 'gemini',
  label: 'Gemini',
  keyEnv: 'GEMINI_API_KEY',

  config: () => ({
    key: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    suggested: list(process.env.GEMINI_MODELS, ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash']),
    fallbackModel: process.env.GEMINI_FALLBACK_MODEL || '',
    style: process.env.GEMINI_API_STYLE === 'interactions' ? 'interactions' : 'generateContent',
    base: (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, ''),
    timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || 180000
  }),

  /** One request. Returns the model's reply text. */
  async generate(c, model, system, prompt) {
    try {
      return await requestStyle(this, c.style, c, model, system, prompt);
    } catch (err) {
      if (err.upstreamStatus !== 404) throw err;
      const other = c.style === 'generateContent' ? 'interactions' : 'generateContent';
      try {
        return await requestStyle(this, other, c, model, system, prompt);
      } catch (second) {
        throw err; // report the first error, it names the model
      }
    }
  },

  /** Model names this key can use for text generation. */
  async listModels(c) {
    const res = await sendRequest(this, { url: `${c.base}/models?pageSize=1000`, method: 'GET', headers: { 'x-goog-api-key': c.key }, timeoutMs: 15000 });
    if (!res.ok) throw upstreamError(this, c.model, res);
    return (res.json.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name))
      .map((m) => m.name.replace(/^models\//, ''));
  }
};
