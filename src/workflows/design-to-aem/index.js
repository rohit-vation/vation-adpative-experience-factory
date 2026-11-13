import { esc } from '../../lib/dom.js';
import { render } from './render.js';

const defaults = {
  sourceType: 'figma',
  designUrl: 'https://www.figma.com/design/your-file/home-page',
  site: 'my-site',
  pageName: 'Home',
  pagePath: '/content/my-site/en/home',
  templateStrategy: 'reuse',
  requirements: 'Analyze sections and repeated patterns, reuse suitable AEM components, generate only missing components, map images to DAM references, and create the page with sample authored content.'
};

const value = (id) => document.getElementById(id)?.value || '';

export default {
  id: 'design-to-aem',
  title: 'Design to AEM Page',
  icon: 'layers',
  desc: 'Generate an AEM page from a Figma design or wireframe.',
  lead: 'Analyze the design reference, select or plan the template, map visual blocks to components, build the page hierarchy and author the page in AEM.',
  meta: 'Inputs: Figma/wireframe URL, site, page path, template strategy, requirements.',
  outputs: ['Design analysis', 'Template plan', 'Component mapping', 'AEM page hierarchy', 'Authored content plan', 'Approved AEM page write'],
  steps: ['Read design reference', 'Analyze design', 'Select template', 'Map components', 'Build page structure', 'Author content', 'Review and generate'],
  defaults,
  form: () => `
    <div class="field"><label for="f-source-type">Design source</label><select id="f-source-type"><option value="figma">Figma Design</option><option value="wireframe">Wireframe</option></select></div>
    <div class="field"><label for="f-design-url">Figma / Wireframe URL</label><input type="url" id="f-design-url" value="${esc(defaults.designUrl)}"><span class="hint">The URL is retained as the design source. Private Figma inspection requires a Figma API/token integration.</span></div>
    <div class="field"><label for="f-site">AEM project / site</label><input id="f-site" value="${esc(defaults.site)}"></div>
    <div class="field"><label for="f-page-name">Page name</label><input id="f-page-name" value="${esc(defaults.pageName)}"></div>
    <div class="field"><label for="f-page-path">AEM page path</label><input id="f-page-path" value="${esc(defaults.pagePath)}"></div>
    <div class="field"><label for="f-template-strategy">Template strategy</label><select id="f-template-strategy"><option value="reuse">Reuse matching editable template</option><option value="generate">Generate new editable template plan</option></select></div>
    <div class="field"><label for="f-requirements">Implementation requirements</label><textarea id="f-requirements" rows="6">${esc(defaults.requirements)}</textarea></div>`,
  read: () => ({ sourceType: value('f-source-type'), designUrl: value('f-design-url'), site: value('f-site'), pageName: value('f-page-name'), pagePath: value('f-page-path'), templateStrategy: value('f-template-strategy'), requirements: value('f-requirements') }),
  check: (input) => {
    if (!/^https?:\/\//i.test(input.designUrl.trim())) return 'Enter a valid Figma or wireframe URL.';
    if (!input.site.trim()) return 'Enter the AEM project/site.';
    if (!input.pageName.trim()) return 'Enter a page name.';
    if (!input.pagePath.trim().startsWith('/content/')) return 'The AEM page path must start with /content/.';
    if (!input.requirements.trim()) return 'Add implementation requirements.';
    return '';
  },
  render,
  onMount() {
    document.addEventListener('change', (event) => {
      if (event.target.id === 'design-aem-confirm') {
        const button = document.getElementById('design-aem-generate-page');
        if (button) button.disabled = !event.target.checked || !document.getElementById('design-aem-target')?.value;
      }
      if (event.target.id === 'design-aem-target') {
        const button = document.getElementById('design-aem-generate-page');
        if (button) button.disabled = !event.target.value || !document.getElementById('design-aem-confirm')?.checked;
      }
    });
    loadTargets();
  },
  onClick(target) {
    if (target.id === 'design-aem-load-targets') return loadTargets();
    if (target.id === 'design-aem-generate-page') return writePage();
  }
};

async function loadTargets() {
  const select = document.getElementById('design-aem-target');
  if (!select) return;
  try {
    const response = await fetch('/api/aem/targets', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Unable to load AEM connections.');
    select.replaceChildren(new Option('Choose an AEM connection...', ''));
    for (const target of Array.isArray(body.targets) ? body.targets : []) {
      select.add(new Option(target.name + ' - ' + target.baseUrl, target.id));
    }
    if (!body.targets?.length) select.add(new Option('No AEM connections configured', ''));
  } catch (error) {
    const result = document.getElementById('design-aem-result');
    if (result) { result.hidden = false; result.textContent = error.message || 'Unable to load AEM connections.'; }
  }
}

async function writePage() {
  const select = document.getElementById('design-aem-target');
  const confirm = document.getElementById('design-aem-confirm');
  const result = document.getElementById('design-aem-result');
  const operationsNode = document.getElementById('design-aem-operations');
  if (!select?.value || !confirm?.checked) return;
  const operations = JSON.parse(document.getElementById('design-aem-ops')?.textContent || '[]');
  operationsNode.hidden = false;
  operationsNode.textContent = JSON.stringify(operations, null, 2);
  try {
    const response = await fetch('/api/aem/repository/write', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetId: select.value, confirmWrites: true, operations })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'AEM page generation failed.');
    result.hidden = false;
    result.textContent = JSON.stringify(body.result || body, null, 2);
    const failed = Number(body.result?.summary?.failed || 0);
    result.textContent = failed ? 'Page write completed with failures.\\n\\n' + result.textContent : 'AEM page generated successfully.\\n\\n' + result.textContent;
  } catch (error) {
    result.hidden = false;
    result.textContent = error.message || 'AEM page generation failed.';
  }
}