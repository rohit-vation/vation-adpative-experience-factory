/**
 * Workflow 2: Map components
 *
 * Input   source CMS, target CMS, components to process, requirement
 * Output  field mapping + source implementation + mapped target implementation
 */

import { esc } from '../../lib/dom.js';
import { items } from '../../lib/text.js';
import { cmsOptions, val } from '../../ui/form.js';
import { demo } from './demo.js';
import { render } from './render.js';

const defaults = {
  source: 'aem',
  target: 'cf',
  components: 'Hero Banner, Teaser Card',
  requirement:
    'Keep authoring parity. Authors must still be able to choose left or center alignment, ' +
    'and images need alt text.'
};

export default {
  id: 'map',
  title: 'Map components',
  icon: 'route',
  desc: 'Map components between CMS platforms.',
  lead:
    'Pick a source and a target CMS, list the components to carry over and add any requirements. ' +
    'You get field mappings and both implementations.',
  meta: 'Inputs: source, target, components, requirement. Output: mapped code',
  outputs: [
    'Field by field mapping with transformation rules',
    'Source implementation and the mapped target implementation',
    'Notes on authoring differences between the two CMS platforms'
  ],
  steps: [
    'Reading the source components',
    'Matching fields to the target model',
    'Writing the target implementation',
    'Checking authoring parity'
  ],

  defaults,

  form: () => `
    <div class="field">
      <label for="f-src">Source CMS</label>
      <select id="f-src">${cmsOptions(defaults.source)}</select>
    </div>
    <div class="field">
      <label for="f-tgt">Target CMS</label>
      <select id="f-tgt">${cmsOptions(defaults.target)}</select>
    </div>
    <div class="field">
      <label for="f-comps">Components to process</label>
      <textarea id="f-comps" rows="3">${esc(defaults.components)}</textarea>
      <span class="hint">Separate with commas or new lines. Up to four.</span>
    </div>
    <div class="field">
      <label for="f-req">Requirement</label>
      <textarea id="f-req" rows="4">${esc(defaults.requirement)}</textarea>
    </div>`,

  read: () => ({
    source: val('f-src'),
    target: val('f-tgt'),
    components: val('f-comps'),
    requirement: val('f-req')
  }),

  check: (input) => {
    if (input.source === input.target) return 'Source and target must be different CMS platforms.';
    if (!items(input.components).length) return 'List at least one component.';
    return '';
  },

  demo,
  render
};
