/** Draws the "Migrate content" result. */

import { CMS } from '../../config.js';
import { esc } from '../../lib/dom.js';
import { confidencePill, severityPill, sourcePill, noticeHTML } from '../../ui/pills.js';
import { tabsHTML } from '../../ui/tabs.js';
import { tableHTML } from '../../ui/table.js';
import { codeHTML } from '../../ui/code-block.js';

export function render(data) {
  const targetShort = CMS[data.target].short;
  const targetLabel = CMS[data.target].label;

  const templatesTab = tableHTML(
    ['Template', 'Pages', 'Components used'],
    data.templates.map((t) => [esc(t.name), String(t.pages), esc(t.components)]),
    [1]
  );

  const mappingTab = tableHTML(
    ['Source pattern', `Target component (${targetShort})`, 'Fields', 'Mapping'],
    data.mapping.map((m) => [
      `<code>${esc(m.source)}</code>`,
      `<code>${esc(m.target)}</code>`,
      esc(m.fields),
      confidencePill(m.confidence)
    ])
  );

  const pageTab =
    `<p class="hint">Example of one converted page in ${esc(targetLabel)} format.</p>` + codeHTML(data.output);

  const reviewTab =
    '<div class="rows">' +
    data.review
      .map(
        (r) => `
        <div class="row">
          <div class="row-h">${severityPill(r.severity)}<b>${esc(r.title)}</b></div>
          <p>${esc(r.detail)}</p>
        </div>`
      )
      .join('') +
    '</div>';

  return `
    <div class="res">
      <div class="res-head">
        <div>
          <h3>${esc(data.site.host)} to ${esc(targetLabel)}</h3>
          <p class="sumline">${data._source === 'ai' ? 'Estimated from the URL' : 'Crawl complete, ready for a pilot batch'}</p>
        </div>
        ${sourcePill(data)}
      </div>

      ${noticeHTML(data)}

      <div class="stats">
        ${data.stats.map((s) => `<div><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join('')}
      </div>

      ${tabsHTML([
        { label: 'Templates', html: templatesTab },
        { label: 'Component mapping', html: mappingTab },
        { label: 'Migrated page', html: pageTab },
        { label: 'Needs review', badge: String(data.review.length), html: reviewTab }
      ])}
    </div>`;
}
