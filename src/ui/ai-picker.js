/**
 * The provider + model picker in the page header.
 *
 *   renderAiPicker(onChange)   draws it into #ai-picker (once the status is loaded)
 *
 * It is rendered into the header, outside the screens, so it has its own listeners.
 * Every name goes through esc() before it reaches the page.
 */

import { $, esc } from '../lib/dom.js';
import { aiState, setProvider, setModel } from '../ai/ai-client.js';

const OTHER = '__other__';

function providerOptions() {
  return aiState.providers
    .map((p) => `<option value="${esc(p.id)}" ${p.id === aiState.provider ? 'selected' : ''} ${p.configured ? '' : 'disabled'}>${esc(p.label)}${p.configured ? '' : ' (no key)'}</option>`)
    .join('');
}

function modelOptions() {
  const known = aiState.models.includes(aiState.model);
  const names = known ? aiState.models : [aiState.model, ...aiState.models];
  return names
    .map((m) => `<option value="${esc(m)}" ${m === aiState.model ? 'selected' : ''}>${esc(m)}</option>`)
    .join('') + `<option value="${OTHER}">Other model name...</option>`;
}

export function renderAiPicker(onChange = () => {}) {
  const box = $('#ai-picker');
  if (!box) return;
  if (!aiState.enabled) { box.hidden = true; return; }

  box.hidden = false;
  box.innerHTML = `
    <label class="ai-pick"><span>AI</span><select id="ai-provider" aria-label="AI provider">${providerOptions()}</select></label>
    <label class="ai-pick"><span>Model</span><select id="ai-model" aria-label="Model">${modelOptions()}</select></label>
    <input type="text" id="ai-model-custom" aria-label="Model name" placeholder="model name" hidden>
  `;

  const providerEl = $('#ai-provider');
  const modelEl = $('#ai-model');
  const customEl = $('#ai-model-custom');

  providerEl.addEventListener('change', async () => {
    providerEl.disabled = modelEl.disabled = true;
    await setProvider(providerEl.value);
    renderAiPicker(onChange);
    onChange();
  });

  modelEl.addEventListener('change', () => {
    if (modelEl.value === OTHER) {
      customEl.hidden = false;
      customEl.focus();
      return;
    }
    customEl.hidden = true;
    setModel(modelEl.value);
    onChange();
  });

  const commitCustom = () => {
    if (!customEl.value.trim()) return;
    setModel(customEl.value);
    renderAiPicker(onChange);
    onChange();
  };
  customEl.addEventListener('change', commitCustom);
  customEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitCustom(); } });
}
