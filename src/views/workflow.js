/** A workflow screen: heading, input form on the left, result canvas on the right. */

import { esc } from '../lib/dom.js';
import { icon } from '../lib/icons.js';

/** Shown in the result canvas before the first run. */
export function emptyHTML(workflow) {
  return `
    <div class="empty">
      <h3>What you will get</h3>
      <ul>${workflow.outputs.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
    </div>`;
}

/** Shown while a result is being generated. The text inside #step is updated per step. */
export function loadingHTML() {
  return `
    <div class="loading">
      <div class="spin" aria-hidden="true"></div>
      <div><b>Working on it</b><p class="muted" id="step">Starting</p></div>
    </div>`;
}

export function errorHTML(message) {
  return `
    <div class="empty">
      <h3>Generation failed</h3>
      <p class="muted">${esc(message || 'Check the inputs and try again.')}</p>
    </div>`;
}

export function workflowHTML(workflow) {
  return `
    <section>
      <div class="wf-top">
        <button type="button" class="back" data-back>${icon('back', 16)}All workflows</button>
        <div class="wf-title"><span class="ci">${icon(workflow.icon, 26)}</span><h2>${esc(workflow.title)}</h2></div>
        <p class="wf-lead">${esc(workflow.lead)}</p>
      </div>

      <div class="wf-grid">
        <aside class="panel rail">
          <form id="wf-form" novalidate>
            <h3>Inputs</h3>
            ${workflow.form()}
            <p class="form-error" id="form-error" role="alert" hidden></p>
            <button type="submit" class="btn-primary" id="go">Generate</button>
          </form>
        </aside>

        <div id="result" tabindex="-1" aria-live="polite">${emptyHTML(workflow)}</div>
      </div>
    </section>`;
}
