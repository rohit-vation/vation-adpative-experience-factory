/**
 * One place where DOM events are wired.
 *
 * Handlers are delegated from `document`, so they keep working when the
 * screen is re-rendered. Generic handlers (tabs, copy buttons) are handled
 * here. Workflow-specific ones are optional hooks on the workflow object:
 *
 *   workflow.onClick(target)   e.g. the desktop/mobile preview switch
 *   workflow.onChange(target)  e.g. the website/component switch in Audit
 */

import { handleTabClick } from './tabs.js';
import { handleCopyClick } from './code-block.js';

export function bindGlobalEvents({ openWorkflow, goHome, submit, syncFromHash, getWorkflow }) {
  document.addEventListener('click', async (e) => {
    const target = e.target;

    const open = target.closest('[data-open]');
    if (open) return openWorkflow(open.getAttribute('data-open'));
    if (target.closest('[data-back]')) return goHome();

    if (handleTabClick(target)) return;
    if (await handleCopyClick(target)) return;

    const workflow = getWorkflow();
    if (workflow && workflow.onClick) workflow.onClick(target);
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id === 'wf-form') submit(e);
  });

  document.addEventListener('change', (e) => {
    const workflow = getWorkflow();
    if (workflow && workflow.onChange) workflow.onChange(e.target);
  });

  window.addEventListener('hashchange', syncFromHash);
}
