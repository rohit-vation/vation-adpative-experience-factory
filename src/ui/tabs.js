/**
 * Tabs.
 *
 *   tabsHTML([{ label, badge?, html }], activeIndex)  ->  HTML string
 *   handleTabClick(target)                            ->  true if the click was on a tab
 *
 * Tabs can be nested. Click handling only touches the panels that belong
 * to the clicked tab's own tab group.
 */

import { esc } from '../lib/dom.js';

let groupCounter = 0;

export function tabsHTML(list, active = 0) {
  const group = 't' + ++groupCounter;

  const buttons = list
    .map((tab, i) => {
      const badge = tab.badge ? ` <span class="pill accent">${esc(tab.badge)}</span>` : '';
      return (
        `<button type="button" role="tab" class="tab" data-tab="${group}-${i}" ` +
        `aria-selected="${i === active}">${esc(tab.label)}${badge}</button>`
      );
    })
    .join('');

  const panels = list
    .map(
      (tab, i) =>
        `<div class="tabpanel" role="tabpanel" data-panel="${group}-${i}"${i === active ? '' : ' hidden'}>${tab.html}</div>`
    )
    .join('');

  return `<div class="tabs" data-tabs><div class="tablist" role="tablist">${buttons}</div>${panels}</div>`;
}

export function handleTabClick(target) {
  const tab = target.closest('[data-tab]');
  if (!tab) return false;

  const group = tab.closest('[data-tabs]');
  const id = tab.getAttribute('data-tab');

  group.querySelectorAll(':scope > .tablist > .tab').forEach((button) => {
    button.setAttribute('aria-selected', String(button === tab));
  });
  group.querySelectorAll(':scope > .tabpanel').forEach((panel) => {
    panel.hidden = panel.getAttribute('data-panel') !== id;
  });
  return true;
}
