/**
 * Workflow 3: Audit experience
 *
 * Input   website URL or component, plus which checks to run
 * Output  scores, measurements and findings for accessibility, SEO,
 *         performance, design system and content integrity
 */

import { esc, $, $$ } from '../../lib/dom.js';
import { val } from '../../ui/form.js';
import { CHECKS } from './sample-data.js';
import { demo } from './demo.js';
import { render, handleClick } from './render.js';

const defaults = {
  url: 'https://www.nokia.com',
  component: 'Hero Banner'
};

const checkboxes = CHECKS.map(
  (c) => `<label><input type="checkbox" name="check" value="${c.id}" checked>${esc(c.label)}</label>`
).join('');

export default {
  id: 'audit',
  title: 'Audit experience',
  icon: 'shield',
  desc: 'Check a website or component against quality rules.',
  lead:
    'Enter a website URL or a component and choose the checks to run. ' +
    'You get scores, measurements and fixes ranked by severity.',
  meta: 'Inputs: URL or component, checks. Output: scored report',
  outputs: [
    'Overall score and a score for each check',
    'Core Web Vitals measurements when performance is selected',
    'Findings with the rule, the location and a recommended fix'
  ],
  steps: [
    'Loading the page',
    'Running accessibility rules',
    'Measuring performance',
    'Comparing against the design system',
    'Checking links and content'
  ],

  defaults,

  form: () => `
    <div class="field">
      <span class="lbl" id="l-mode">What to audit</span>
      <div class="seg" role="radiogroup" aria-labelledby="l-mode">
        <label><input type="radio" name="mode" value="url" checked>Website URL</label>
        <label><input type="radio" name="mode" value="component">Component</label>
      </div>
    </div>
    <div class="field">
      <label for="f-target" id="l-target">Website URL</label>
      <input type="text" id="f-target" value="${esc(defaults.url)}" autocomplete="off">
    </div>
    <div class="field">
      <span class="lbl">Checks to run</span>
      <div class="checks">${checkboxes}</div>
    </div>`,

  read: () => {
    const mode = $('input[name="mode"]:checked');
    return {
      mode: mode ? mode.value : 'url',
      target: val('f-target'),
      checks: $$('input[name="check"]:checked').map((c) => c.value)
    };
  },

  check: (input) => {
    if (!input.target.trim()) return input.mode === 'url' ? 'Enter a website URL.' : 'Enter a component name.';
    if (!input.checks.length) return 'Select at least one check.';
    return '';
  },

  demo,
  render,
  onClick: handleClick,

  /** Switching between "Website URL" and "Component" swaps the label and the example value. */
  onChange(target) {
    if (target.name !== 'mode') return;
    const isUrl = target.value === 'url';
    $('#l-target').textContent = isUrl ? 'Website URL' : 'Component name or markup';
    $('#f-target').value = isUrl ? defaults.url : defaults.component;
  }
};
