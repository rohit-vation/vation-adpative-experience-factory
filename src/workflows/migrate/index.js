/**
 * Workflow 4: Migrate content
 *
 * Input   source website URL, target CMS
 * Output  inventory, content-to-component mapping and a converted example page
 */

import { esc } from '../../lib/dom.js';
import { cmsOptions, val } from '../../ui/form.js';
import { demo } from './demo.js';
import { render } from './render.js';

const defaults = {
  url: 'https://www.nokia.com',
  target: 'eds'
};

export default {
  id: 'migrate',
  title: 'Migrate content',
  icon: 'swap',
  desc: 'Transform content for a different CMS.',
  lead:
    'Enter the site to migrate and the CMS it is moving to. You get the content inventory, ' +
    'a content to component mapping and a converted example page.',
  meta: 'Inputs: site URL, target CMS. Output: target-ready content',
  outputs: [
    'Page and template inventory',
    'Content to component mapping for the target CMS',
    'A converted example page in the target format',
    'A list of items that need a human check'
  ],
  steps: [
    'Crawling the site',
    'Grouping pages into templates',
    'Mapping content to components',
    'Writing the target format'
  ],

  defaults,

  form: () => `
    <div class="field">
      <label for="f-url">Website URL</label>
      <input type="text" id="f-url" value="${esc(defaults.url)}" autocomplete="off">
    </div>
    <div class="field">
      <label for="f-mt">Target CMS</label>
      <select id="f-mt">${cmsOptions(defaults.target)}</select>
    </div>`,

  read: () => ({
    url: val('f-url'),
    target: val('f-mt')
  }),

  check: (input) => (!input.url.trim() ? 'Enter the website URL.' : ''),

  demo,
  render
};
