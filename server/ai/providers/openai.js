/**
 * Provider: OpenAI, or any service that speaks the same "chat completions" format
 * (Azure OpenAI, OpenRouter, Groq, Together, a local Ollama or LM Studio server, and so on).
 * For those, set OPENAI_BASE_URL and use that service's key and model names.
 *
 * .env settings (all optional except the key):
 *   OPENAI_API_KEY         your key
 *   OPENAI_MODEL           default model
 *   OPENAI_MODELS          comma list shown in the model picker (a live list is fetched too)
 *   OPENAI_FALLBACK_MODEL  tried once if the model stays overloaded after retries
 *   OPENAI_BASE_URL        default https://api.openai.com/v1
 *   OPENAI_TOKEN_PARAM     "max_completion_tokens" (default) or "max_tokens" for older compatible servers
 *   OPENAI_TIMEOUT_MS      default 180000
 */

import { AiError } from '../errors.js';
import { sendRequest, upstreamError } from '../http.js';

const MAX_OUTPUT_TOKENS = 32768;
const DEFAULT_BASE = 'https://api.openai.com/v1';
const list = (value, fallback) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : fallback);

export const openai = {
  id: 'openai',
  label: 'OpenAI',
  keyEnv: 'OPENAI_API_KEY',

  config: () => ({
    key: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-5-mini',
    suggested: list(process.env.OPENAI_MODELS, ['gpt-5-mini', 'gpt-5', 'gpt-4.1']),
    fallbackModel: process.env.OPENAI_FALLBACK_MODEL || '',
    base: (process.env.OPENAI_BASE_URL || DEFAULT_BASE).replace(/\/$/, ''),
    tokenParam: process.env.OPENAI_TOKEN_PARAM === 'max_tokens' ? 'max_tokens' : 'max_completion_tokens',
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS) || 180000
  }),

  async generate(c, model, system, prompt) {
    // JSON mode requires the word "JSON" to appear in the messages
    const sys = /json/i.test(system) ? system : `${system}\n\nRespond with JSON only.`;
    const res = await sendRequest(this, {
      url: `${c.base}/chat/completions`,
      headers: { Authorization: `Bearer ${c.key}` },
      body: {
        model,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        [c.tokenParam]: MAX_OUTPUT_TOKENS
      },
      timeoutMs: c.timeoutMs
    });
    if (!res.ok) throw upstreamError(this, model, res);

    const message = res.json?.choices?.[0]?.message;
    if (message?.refusal) throw new AiError('OpenAI declined this request.', 422);
    const text = typeof message?.content === 'string' ? message.content : '';
    if (!text.trim()) throw new AiError('OpenAI returned an empty answer. Try again.', 502);
    if (res.json.choices[0].finish_reason === 'length') throw new AiError('OpenAI cut the answer off because it was too long. Try a model with a larger output limit.', 502);
    return text;
  },

  async listModels(c) {
    const res = await sendRequest(this, { url: `${c.base}/models`, method: 'GET', headers: { Authorization: `Bearer ${c.key}` }, timeoutMs: 15000 });
    if (!res.ok) throw upstreamError(this, c.model, res);
    const ids = (res.json.data || []).map((m) => m.id);
    // On OpenAI itself, keep only chat models. On other services, show everything they list.
    if (c.base !== DEFAULT_BASE) return ids;
    return ids.filter((id) => /^(gpt|o\d|chatgpt)/i.test(id) && !/embedding|tts|whisper|dall-e|image|audio|realtime|transcribe|moderation|search|computer-use/i.test(id));
  }
};
