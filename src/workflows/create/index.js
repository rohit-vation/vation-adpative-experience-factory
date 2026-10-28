/**
 * Workflow 1: Create component
 *
 * Input   component name, primary CMS, description
 * Output  content model, code for every CMS, accessibility notes
 */

import { esc } from '../../lib/dom.js';
import { cmsOptions, val } from '../../ui/form.js';
import { demo } from './demo.js';
import { render } from './render.js';

const defaults = {
  name: 'Hero Banner',
  cms: 'aem',
  description:
    'A full-width hero with a background image, headline, supporting text and one primary button. ' +
    'Text can be left aligned or centered. Text must stay readable on any image.'
};

export default {
  id: 'create',
  title: 'Create component',
  icon: 'wand',
  desc: 'Generate a reusable component from a requirement.',
  lead:
    'Describe a component once. You get a working implementation for AEM, ' +
    'Edge Delivery Services, Contentful and Optimizely.',
  meta: 'Inputs: name, CMS, description. Output: code per CMS',
  outputs: [
    'Content model for each CMS',
    'Implementation files for AEM, Edge Delivery Services, Contentful and Optimizely'
  ],
  steps: [
    'Reading the requirement',
    'Drafting the component',
    'Writing the content models',
    'Generating code for four CMS platforms'
  ],

  defaults,

  form: () => `
    <div class="field">
      <label for="f-name">Component name</label>
      <input type="text" id="f-name" value="${esc(defaults.name)}" autocomplete="off">
    </div>
    <div class="field">
      <label for="f-cms">CMS</label>
      <select id="f-cms">${cmsOptions(defaults.cms)}</select>
      <span class="hint">The selected CMS is shown first. The others are generated as equivalents.</span>
    </div>
    <div class="field">
      <label for="f-desc">Component description</label>
      <textarea id="f-desc" rows="5">${esc(defaults.description)}</textarea>
    </div>`,

  read: () => ({
    name: val('f-name'),
    cms: val('f-cms'),
    description: val('f-desc')
  }),

  check: (input) => {
    if (!input.name.trim()) return 'Enter a component name.';
    if (!input.description.trim()) return 'Describe the component.';
    return '';
  },

  demo,
  render
};
