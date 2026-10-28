/**
 * App entry point.
 *
 * Responsibilities:
 *   - decide which screen is showing (home or one workflow)
 *   - run the form -> generate -> render cycle
 *   - wire DOM events (see src/ui/events.js)
 */

import { $ } from './lib/dom.js';
import { icon } from './lib/icons.js';
import { WORKFLOWS } from './workflows/index.js';
import { generate } from './services/generate.js';
import { homeHTML } from './views/home.js';
import { workflowHTML, loadingHTML, errorHTML } from './views/workflow.js';
import { bindGlobalEvents } from './ui/events.js';
import { aiState, loadAiStatus, providerLabel } from './ai/ai-client.js';
import { renderAiPicker } from './ui/ai-picker.js';

const app = $('#app');

/** id of the workflow on screen, or null for the home dashboard. */
let currentId = null;

const hashId = () => (location.hash || '').replace('#', '');

/* ---------------- Screens ---------------- */

function showScreen(id) {
  currentId = WORKFLOWS[id] ? id : null;
  app.innerHTML = currentId ? workflowHTML(WORKFLOWS[currentId]) : homeHTML();
  window.scrollTo(0, 0);

  // Keep the URL hash in step so a screen can be linked to. Optional, so errors are ignored.
  try {
    if (hashId() !== (currentId || '')) location.hash = currentId || '';
  } catch (e) { /* ignore */ }
}

function syncFromHash() {
  const id = hashId() || null;
  if (id !== currentId) showScreen(id);
}

/* ---------------- Generate ---------------- */

async function submit(event) {
  event.preventDefault();

  const id = currentId;
  const workflow = WORKFLOWS[id];
  const input = workflow.read();

  const errorEl = $('#form-error');
  const button = $('#go');
  const result = $('#result');

  const problem = workflow.check(input);
  errorEl.hidden = !problem;
  errorEl.textContent = problem;
  if (problem) return;

  button.disabled = true;
  button.textContent = 'Generating';
  result.innerHTML = loadingHTML();

  try {
    const data = await generate(workflow, input, (step) => {
      const stepEl = $('#step');
      if (stepEl) stepEl.textContent = step;
    });

    if (currentId !== id) return; // person left this screen while waiting

    result.innerHTML = workflow.render(data, input);

    // On narrow screens the result sits below the form, so bring it into view.
    if (window.innerWidth < 900) {
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      result.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    }
  } catch (err) {
    console.error(err);
    result.innerHTML = errorHTML(err.message);
  } finally {
    const goButton = $('#go');
    if (goButton) {
      goButton.disabled = false;
      goButton.textContent = 'Generate';
    }
  }
}

/* ---------------- AI status in the page header ---------------- */

function showAiStatus() {
  const pill = $('#ai-pill');
  const note = $('#note-text');
  const dot = $('#note-dot');

  renderAiPicker(showAiStatus);

  if (aiState.enabled) {
    pill.hidden = true; // the picker in the header says which AI is in use
    note.textContent = `Results are generated live by ${providerLabel()} (${aiState.model}). Review generated code before you use it.`;
    dot.style.background = 'var(--good)';
  } else {
    pill.hidden = false;
    pill.className = 'pill outline';
    pill.textContent = 'AI: off';
    note.textContent = 'Demo mode: every result is sample data. Add an API key (GEMINI_API_KEY or OPENAI_API_KEY) to .env to switch on live AI.';
    dot.style.background = '';
  }
}

/* ---------------- Boot ---------------- */

$('#logo').innerHTML = icon('layers', 22);

bindGlobalEvents({
  openWorkflow: showScreen,
  goHome: () => showScreen(null),
  submit,
  syncFromHash,
  getWorkflow: () => (currentId ? WORKFLOWS[currentId] : null)
});

showScreen(hashId() || null);
loadAiStatus().then(showAiStatus);
