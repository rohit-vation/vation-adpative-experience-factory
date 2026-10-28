/**
 * Browser side of the AI integration. Knows nothing about any one AI company.
 *
 *   loadAiStatus()                       asks the server which providers have a key
 *   setProvider(id) / setModel(name)     the person's choice, remembered in this browser
 *   loadModels(id)                       model names for the picker (live list, else suggestions)
 *   generateWithAI(workflowId, input)    sends the form values + the choice, returns data
 *
 * The browser never sees an API key or builds a prompt. It sends the workflow name, the form
 * values and { provider, model } to /api/generate, and server/server.js does the rest.
 */

const TIMEOUT_MS = 200000; // slightly above the server's own timeout
const STORE_KEY = 'aef-ai-choice';

/** Shared state, read by generate.js, main.js and ui/ai-picker.js. */
export const aiState = {
  enabled: false,
  providers: [],   // [{ id, label, configured, defaultModel, models }]
  provider: '',    // chosen provider id
  model: '',       // chosen model name
  models: [],      // names offered for the chosen provider
  live: false      // true when `models` came from the provider itself
};

export const currentProvider = () => aiState.providers.find((p) => p.id === aiState.provider);
export const providerLabel = () => currentProvider()?.label || '';

/* ---------- Remembered choice (optional convenience, never required) ---------- */

function saveChoice() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ provider: aiState.provider, model: aiState.model })); } catch (err) { /* ignore */ }
}

function savedChoice() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (err) { return {}; }
}

/* ---------- Status and models ---------- */

export async function loadAiStatus() {
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    if (!response.ok) throw new Error('no status');
    const status = await response.json();

    aiState.providers = Array.isArray(status.providers) ? status.providers : [];
    aiState.enabled = Boolean(status.ai) && aiState.providers.some((p) => p.configured);

    if (aiState.enabled) {
      const saved = savedChoice();
      const usable = (id) => aiState.providers.find((p) => p.id === id && p.configured);
      const provider = usable(saved.provider) || usable(status.defaultProvider) || aiState.providers.find((p) => p.configured);
      aiState.provider = provider.id;
      aiState.model = saved.provider === provider.id && saved.model ? saved.model : provider.defaultModel;
      aiState.models = provider.models;
      await loadModels(provider.id);
    }
  } catch (err) {
    // Static hosting or no server: stay in demo mode
    aiState.enabled = false;
  }
  return aiState;
}

/** Fills aiState.models for a provider. Uses the provider's real list when it answers. */
export async function loadModels(id) {
  const provider = aiState.providers.find((p) => p.id === id);
  if (!provider) return;
  aiState.models = provider.models;
  aiState.live = false;
  try {
    const response = await fetch(`/api/models?provider=${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (response.ok) {
      const body = await response.json();
      if (Array.isArray(body.models) && body.models.length && aiState.provider === id) {
        aiState.models = body.models;
        aiState.live = Boolean(body.live);
      }
    }
  } catch (err) { /* keep the suggestions */ }
}

export async function setProvider(id) {
  const provider = aiState.providers.find((p) => p.id === id && p.configured);
  if (!provider) return;
  aiState.provider = id;
  aiState.model = provider.defaultModel;
  aiState.models = provider.models;
  saveChoice();
  await loadModels(id);
}

export function setModel(name) {
  aiState.model = String(name || '').trim() || currentProvider()?.defaultModel || '';
  saveChoice();
}

/* ---------- Generate ---------- */

export async function generateWithAI(workflowId, input) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow: workflowId, input, ai: { provider: aiState.provider, model: aiState.model } }),
      signal: controller.signal
    });

    let body = {};
    try { body = await response.json(); } catch (err) { /* keep {} */ }

    if (!response.ok) throw new Error(body.error || `Generation failed (status ${response.status}).`);
    if (!body.data) throw new Error('The server sent an empty answer.');
    return body.data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('This is taking too long. Try again.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
