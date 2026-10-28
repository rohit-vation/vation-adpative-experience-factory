/** Draws the "Create component" result. */

import { CMS, CMS_IDS } from '../../config.js';
import { FIELDS } from '../../data/fields.js';
import { esc } from '../../lib/dom.js';
import { sourcePill } from '../../ui/pills.js';
import { tabsHTML } from '../../ui/tabs.js';
import { tableHTML } from '../../ui/table.js';
import { fileTabs } from '../../ui/code-block.js';

/** One tab per CMS, the selected one first. Each holds a content model table and file tabs. */
function implementationsHTML(implementations, selectedCms) {
  const order = [selectedCms, ...CMS_IDS.filter((id) => id !== selectedCms)];

  return tabsHTML(
    order.map((cmsId) => {
      const impl = implementations[cmsId];
      const modelTable = tableHTML(
        ['Field', 'Type', 'Holds'],
        impl.model.map((m) => [`<code>${esc(m.field)}</code>`, esc(m.type), esc(m.note)])
      );

      return {
        label: CMS[cmsId].short,
        badge: cmsId === selectedCms ? 'Selected' : '',
        html:
          `<div class="sec"><h4 class="sec-title">Content model</h4>${modelTable}</div>` +
          `<div class="sec"><h4 class="sec-title">Files</h4>${fileTabs(impl.files)}</div>`
      };
    })
  );
}

export function render(data, input) {
  const fileCount = CMS_IDS.reduce((n, id) => n + data.implementations[id].files.length, 0);

  return `
    <div class="res">
      <div class="res-head">
        <div>
          <h3>${esc(data.component.name)}</h3>
          <p class="sumline">${CMS_IDS.length} implementations, ${fileCount} files, ${FIELDS.length} content fields</p>
        </div>
        ${sourcePill(data)}
      </div>

      <div class="sec">
        <h4 class="sec-title">Implementation by CMS</h4>
        ${implementationsHTML(data.implementations, input.cms)}
      </div>

      <div class="sec">
        <h4 class="sec-title">Accessibility notes</h4>
        <ul class="notes">${data.design.a11y.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
      </div>
    </div>`;
}
