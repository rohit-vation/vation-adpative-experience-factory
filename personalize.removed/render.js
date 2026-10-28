/** Draws the "Prepare personalization blocks" result. */

import { esc } from '../../lib/dom.js';
import { kebab } from '../../lib/text.js';
import { sourcePill } from '../../ui/pills.js';
import { codeHTML } from '../../ui/code-block.js';

function ruleText(rule) {
  if (!rule) return 'No rule, used when nothing else matches';
  return `${rule.attribute} ${rule.operator} ${JSON.stringify(rule.value)}`;
}

function variantHTML(variant, index) {
  const isControl = index === 0;

  return `
    <div class="variant${isControl ? ' ctrl' : ''}">
      <div class="variant-h">
        <b>${esc(variant.name)}</b>
        <span class="pill ${isControl ? 'neutral' : 'accent'}">${isControl ? 'Fallback' : 'Audience'}</span>
      </div>
      <div class="vprev">
        <b>${esc(variant.headline)}</b>
        <p>${esc(variant.body)}</p>
        <span>${esc(variant.cta)}</span>
      </div>
      <div class="rule">${esc(ruleText(variant.rule))}</div>
    </div>`;
}

export function render(data) {
  return `
    <div class="res">
      <div class="res-head">
        <div>
          <h3>${esc(data.block)} personalization blocks</h3>
          <p class="sumline">${data.variants.length} variants for ${esc(data.system)}, goal: ${esc(data.goal)}</p>
        </div>
        ${sourcePill(data)}
      </div>

      <div class="sec">
        <h4 class="sec-title">Variants</h4>
        <div class="variants">${data.variants.map(variantHTML).join('')}</div>
      </div>

      <div class="sec">
        <h4 class="sec-title">Audience metadata</h4>
        ${codeHTML({ name: `${kebab(data.block)}.personalization.json`, lang: 'json', code: data.metadata })}
      </div>

      <div class="sec">
        <h4 class="sec-title">Implementation notes</h4>
        <ul class="notes">${data.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      </div>
    </div>`;
}
