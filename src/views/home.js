/** Home dashboard: five action cards. */

import { CMS, CMS_IDS } from '../config.js';
import { esc } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { WORKFLOWS, ORDER } from '../workflows/index.js';

function cardHTML(id) {
  const w = WORKFLOWS[id];
  return `
    <button type="button" class="card-action" data-open="${id}">
      <span class="ci">${icon(w.icon, 24)}</span>
      <span class="ct">${esc(w.title)}</span>
      <span class="cd">${esc(w.desc)}</span>
      <span class="cm">${esc(w.meta)}</span>
    </button>`;
}

export function homeHTML() {
  const platforms = CMS_IDS.map((id) => `<span class="pill outline">${esc(CMS[id].label)}</span>`).join('');

  return `
    <section class="home">
      <h2 class="home-q">What do you want to do?</h2>
      <div class="cards">${ORDER.map(cardHTML).join('')}</div>
      <div class="platforms"><span>Works across</span>${platforms}</div>
    </section>`;
}
