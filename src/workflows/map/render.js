/** Draws the "Map components" result. */

import { CMS } from '../../config.js';
import { esc } from '../../lib/dom.js';
import { confidencePill, sourcePill, noticeHTML } from '../../ui/pills.js';
import { tableHTML } from '../../ui/table.js';
import { fileTabs } from '../../ui/code-block.js';

function statsHTML(summary) {
  return `
    <div class="stats">
      <div><b>${summary.components}</b><span>Components</span></div>
      <div><b>${summary.fields}</b><span>Fields mapped</span></div>
      <div><b>${summary.auto}%</b><span>Automatic</span></div>
      <div><b>${summary.review}</b><span>Need review</span></div>
    </div>`;
}

/** One collapsible block per component: mapping table, then source and target code side by side. */
function componentHTML(component, index, sourceName, targetName) {
  const ready = component.status === 'Ready to migrate';

  const table = tableHTML(
    ['Field', `Source: ${sourceName}`, `Target: ${targetName}`, 'Transformation', 'Mapping'],
    component.mapping.map((m) => [
      esc(m.field),
      `<code>${esc(m.source)}</code>`,
      `<code>${esc(m.target)}</code>`,
      esc(m.transform),
      confidencePill(m.confidence)
    ])
  );

  return `
    <details class="comp"${index === 0 ? ' open' : ''}>
      <summary>
        <span>${esc(component.name)}</span>
        <span class="pill ${ready ? 'good' : 'warn'}">${esc(component.status)}</span>
        <span class="hint">${component.mapping.length} fields</span>
      </summary>
      <div class="comp-body">
        ${table}
        <div class="split">
          <div><h4>Source implementation: ${esc(sourceName)}</h4>${fileTabs(component.sourceFiles)}</div>
          <div><h4>Mapped implementation: ${esc(targetName)}</h4>${fileTabs(component.targetFiles)}</div>
        </div>
      </div>
    </details>`;
}

export function render(data) {
  const sourceName = CMS[data.source].short;
  const targetName = CMS[data.target].short;
  const hasRequirement = data.requirement && data.requirement.trim();

  return `
    <div class="res">
      <div class="res-head">
        <div>
          <h3>${esc(sourceName)} to ${esc(targetName)}</h3>
          <p class="sumline">${data.summary.components} components, ${data.summary.fields} fields mapped</p>
        </div>
        ${sourcePill(data)}
      </div>

      ${noticeHTML(data)}

      ${statsHTML(data.summary)}

      ${hasRequirement ? `<div class="sec"><h4 class="sec-title">Requirement applied</h4><p>${esc(data.requirement)}</p></div>` : ''}

      <div class="sec">
        <h4 class="sec-title">Components</h4>
        ${data.components.map((c, i) => componentHTML(c, i, sourceName, targetName)).join('')}
      </div>

      <div class="sec">
        <h4 class="sec-title">Migration notes</h4>
        <ul class="notes">${data.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      </div>
    </div>`;
}
