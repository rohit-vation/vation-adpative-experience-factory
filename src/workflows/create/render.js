/** Draw the Create Component result. CMS source previews are retained; AEM live data is plan-backed. */

import { CMS, CMS_IDS } from '../../config.js';
import { esc } from '../../lib/dom.js';
import { sourcePill } from '../../ui/pills.js';
import { tabsHTML } from '../../ui/tabs.js';
import { tableHTML } from '../../ui/table.js';
import { fileTabs } from '../../ui/code-block.js';
import { liveImplementationPanelHTML } from '../../ui/live-implementation-template.js';

function aemFieldRows(fields, parent = '') {
  return (Array.isArray(fields) ? fields : []).flatMap((field) => {
    const property = parent ? parent + '.' + field.name : field.name;
    const childParent = field.type === 'multifield' && field.composite === true ? property + '[]' : property;
    const row = [
      '<code>' + esc(field.label || field.name) + (field.required ? ' *' : '') + '</code>',
      esc(field.type || 'Field'),
      '<code>' + esc(property) + '</code>'
    ];
    return [row, ...aemFieldRows(field.children, childParent)];
  });
}
function aemImplementationHTML(implementation) {
  const fieldRows = aemFieldRows(implementation.fields);
  const mappedRows = (Array.isArray(implementation.model) ? implementation.model : []).map((model) => [
    '<code>' + esc(model.field) + '</code>',
    esc(model.type || 'Field'),
    '<code>' + esc(model.field) + '</code>'
  ]);
  const draftRows = fieldRows.length ? fieldRows : mappedRows;
  const draftModel = draftRows.length ? tableHTML(['Field', 'Type', 'CMS property'], draftRows) : '';
  return `
    <section class="sec live-aem-plan-preview" id="create-live-plan-preview" data-state="waiting" aria-live="polite">
      <h4 class="sec-title">Content model</h4>
      <p id="create-live-model-placeholder" class="muted">${draftRows.length ? 'Generated field contract shown below. Generate will replace it with the verified dialog fields from the CMS plan.' : 'Generate will validate the CMS path and prepare the implementation plan. The verified dialog fields appear here.'}</p>
      <div id="create-live-model-table"${draftRows.length ? '' : ' hidden'}>${draftModel}</div>
    </section>
    <section class="sec live-aem-codebase-files">
      <h4 class="sec-title">Files</h4>
      <p class="muted">Source files for your codebase, generated from the same component field schema. The direct CMS write plan uses a model-free HTL version because JCR writes cannot compile or deploy Java.</p>
      ${fileTabs(implementation.files)}
    </section>`;
}
function cmsImplementationHTML(implementation, cmsId) {
  if (cmsId === 'aem') return aemImplementationHTML(implementation);
  const modelTable = tableHTML(
    ['Field', 'Type', 'Holds'],
    implementation.model.map((model) => [
      `<code>${esc(model.field)}</code>`,
      esc(model.type),
      esc(model.note)
    ])
  );
  const edsOutputSlot = cmsId === 'eds' ? '<div id="create-live-eds-output-slot"></div>' : '';
  return `
    <div class="sec"><h4 class="sec-title">Content model</h4>${modelTable}</div>
    <div class="sec"><h4 class="sec-title">Files</h4>${fileTabs(implementation.files)}</div>
    ${edsOutputSlot}`;
}

/** Keep every CMS implementation tab. Only the AEM live fields come from the checked JCR plan. */
function implementationsHTML(implementations, selectedCms) {
  const order = [selectedCms, ...CMS_IDS.filter((id) => id !== selectedCms)];
  return tabsHTML(order.map((cmsId) => ({
    label: CMS[cmsId].short,
    badge: cmsId === selectedCms ? 'Selected' : '',
    html: cmsImplementationHTML(implementations[cmsId], cmsId)
  })));
}

function ruleSuggestionsHTML(suggestions = []) {
  if (!Array.isArray(suggestions) || suggestions.length === 0) return '';
  return `
    <section class="sec aef-rule-suggestions">
      <h4 class="sec-title">Rulebook improvement proposals</h4>
      <p class="muted">The model identified reusable patterns that may deserve a rule in src/ai/system-prompt.js. Review, test and approve these manually; suggestions are never written into the source file automatically.</p>
      <ol class="notes">${suggestions.map((item) => `<li><strong>${esc(item.title)}</strong> <span class="muted">(${esc(item.appliesTo)})</span><p>${esc(item.rule)}</p><p><strong>Why:</strong> ${esc(item.reason)}</p><p><strong>Validation:</strong> ${esc(item.validation)}</p>${item.examplePattern ? `<pre class="code-preview">${esc(item.examplePattern)}</pre>` : ''}</li>`).join('')}</ol>
    </section>`;
}

export function render(data, input) {
  const fileCount = CMS_IDS.reduce((count, id) => count + data.implementations[id].files.length, 0);
  const aemSelected = input.cms === 'aem';
  const edsSelected = input.cms === 'eds';
  const livePanelSelected = aemSelected || edsSelected;

  return `
    <div class="res">
      <div class="res-head">
        <div>
          <h3>${esc(data.component.name)}</h3>
          <p class="sumline" id="create-live-result-meta">${aemSelected
            ? 'Preparing the CMS repository plan. The AEM tab will show the checked dialog fields and complete source files.'
            : edsSelected
              ? 'Preparing the EDS block files. Review and copy the generated block-specific JSON, CSS and JavaScript files below.'
              : `${CMS_IDS.length} CMS models, ${fileCount} generated files`}</p>
        </div>
        ${sourcePill(data)}
      </div>

      ${livePanelSelected ? liveImplementationPanelHTML() : ''}
      ${ruleSuggestionsHTML(data.ruleSuggestions)}
      <div class="sec">
        <h4 class="sec-title">Implementation by CMS</h4>
        ${implementationsHTML(data.implementations, input.cms)}
      </div>
      <div class="sec">
        <h4 class="sec-title">Accessibility notes</h4>
        <ul class="notes">${data.design.a11y.map((note) => `<li>${esc(note)}</li>`).join('')}</ul>
      </div>
    </div>`;
}
