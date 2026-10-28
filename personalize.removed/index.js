/**
 * Workflow 5: Prepare personalization blocks
 *
 * Input   base component, audience segments, goal, personalization system
 * Output  a fallback variant, one variant per audience and the metadata to import
 */

import { esc } from '../../lib/dom.js';
import { items } from '../../lib/text.js';
import { val } from '../../ui/form.js';
import { GOALS, SYSTEMS } from './sample-data.js';
import { demo } from './demo.js';
import { render } from './render.js';

const defaults = {
  base: 'Hero Banner',
  segments: 'First-time visitors\nReturning customers\nEnterprise decision makers',
  goal: 'cta',
  system: 'target'
};

const options = (map, selected, label = (v) => v) =>
  Object.entries(map)
    .map(([id, v]) => `<option value="${id}"${id === selected ? ' selected' : ''}>${esc(label(v))}</option>`)
    .join('');

export default {
  id: 'personalize',
  title: 'Prepare personalization blocks',
  icon: 'users',
  desc: 'Define reusable variants and audience metadata for connected personalization systems.',
  lead:
    'Choose a base component, list your audiences and pick the system you connect to. ' +
    'You get one variant per audience and the metadata to load into the system.',
  meta: 'Inputs: component, audiences, goal, system. Output: variants + metadata',
  outputs: [
    'A fallback variant and one variant per audience',
    'Audience rules in the format the system reads',
    'Notes on fallbacks, goals and test size'
  ],
  steps: [
    'Reading the base component',
    'Writing variant copy',
    'Building audience rules',
    'Preparing the metadata file'
  ],

  defaults,

  form: () => `
    <div class="field">
      <label for="f-base">Base component</label>
      <input type="text" id="f-base" value="${esc(defaults.base)}" autocomplete="off">
    </div>
    <div class="field">
      <label for="f-seg">Audience segments</label>
      <textarea id="f-seg" rows="4">${esc(defaults.segments)}</textarea>
      <span class="hint">One per line. Up to four.</span>
    </div>
    <div class="field">
      <label for="f-goal">Goal</label>
      <select id="f-goal">${options(GOALS, defaults.goal, (g) => g[0])}</select>
    </div>
    <div class="field">
      <label for="f-sys">Personalization system</label>
      <select id="f-sys">${options(SYSTEMS, defaults.system)}</select>
    </div>`,

  read: () => ({
    base: val('f-base'),
    segments: val('f-seg'),
    goal: val('f-goal'),
    system: val('f-sys')
  }),

  check: (input) => {
    if (!input.base.trim()) return 'Enter a base component.';
    if (!items(input.segments).length) return 'List at least one audience.';
    return '';
  },

  demo,
  render
};
