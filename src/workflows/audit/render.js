/** Draws the "Audit experience" result. */

import { esc } from '../../lib/dom.js';
import { severityPill, sourcePill, noticeHTML } from '../../ui/pills.js';

const SEVERITY_ORDER = ['critical', 'serious', 'moderate', 'minor'];
const RING_RADIUS = 52;

/** good at 85 and above, warn from 70, bad below. */
const scoreClass = (n) => (n >= 85 ? 'good' : n >= 70 ? 'warn' : 'bad');

function ringHTML(score) {
  const circumference = 2 * Math.PI * RING_RADIUS;
  const filled = ((circumference * score) / 100).toFixed(1);

  return `
    <div class="ring ${scoreClass(score)}" role="img" aria-label="Overall score ${score} out of 100">
      <svg viewBox="0 0 120 120">
        <circle class="trk" cx="60" cy="60" r="${RING_RADIUS}" fill="none" stroke-width="10"/>
        <circle class="val" cx="60" cy="60" r="${RING_RADIUS}" fill="none" stroke-width="10"
                stroke-linecap="round" stroke-dasharray="${filled} ${circumference.toFixed(1)}"/>
      </svg>
      <div class="num"><b>${score}</b><span>out of 100</span></div>
    </div>`;
}

function categoriesHTML(categories, issueCounts) {
  return categories
    .map(
      (c) => `
      <div class="cat">
        <div class="cat-h"><b>${esc(c.label)}</b><span class="sc ${scoreClass(c.score)}">${c.score}</span></div>
        <div class="bar"><i class="${scoreClass(c.score)}" style="width:${c.score}%"></i></div>
        <p>${c.passed} passed, ${issueCounts[c.id] || 0} to fix</p>
      </div>`
    )
    .join('');
}

function metricsHTML(metrics) {
  if (!metrics.length) return '';

  const tiles = metrics
    .map(
      (m) => `
      <div class="metric">
        <span class="k">${esc(m.label)}</span>
        <span class="v">${esc(m.value)}</span>
        <span class="t">${esc(m.target)}</span>
        <span><span class="pill ${m.status}">${m.status === 'bad' ? 'Fails' : 'Needs work'}</span></span>
      </div>`
    )
    .join('');

  return `<div class="sec"><h4 class="sec-title">Performance measurements</h4><div class="metrics">${tiles}</div></div>`;
}

function findingsHTML(categories, findings, issueCounts) {
  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );

  const chips = [
    `<button type="button" class="chip" data-filter="all" aria-pressed="true">All ${findings.length}</button>`,
    ...categories.map(
      (c) =>
        `<button type="button" class="chip" data-filter="${c.id}" aria-pressed="false">` +
        `${esc(c.label)} ${issueCounts[c.id] || 0}</button>`
    )
  ].join('');

  const cards = sorted
    .map(
      (f) => `
      <article class="finding" data-cat="${f.category}">
        <div class="finding-h">${severityPill(f.severity)}<b>${esc(f.title)}</b></div>
        <div class="hint">${esc(f.rule)}</div>
        <div class="where">${esc(f.where)}</div>
        <p class="fix"><span>Fix:</span> ${esc(f.fix)}</p>
      </article>`
    )
    .join('');

  return `
    <div class="sec">
      <h4 class="sec-title">Findings</h4>
      <div class="chips" role="group" aria-label="Filter findings">${chips}</div>
      <div class="findings">${cards}</div>
    </div>`;
}

export function render(data) {
  const overall = Math.round(data.categories.reduce((sum, c) => sum + c.score, 0) / data.categories.length);
  const passed = data.categories.reduce((sum, c) => sum + c.passed, 0);

  const issueCounts = {};
  data.findings.forEach((f) => { issueCounts[f.category] = (issueCounts[f.category] || 0) + 1; });

  return `
    <div class="res audit">
      <div class="res-head">
        <div>
          <h3>Quality report for ${esc(data.subject)}</h3>
          <p class="sumline">${data.categories.length} checks, ${data.findings.length} issues, ${passed} rules passed</p>
        </div>
        ${sourcePill(data)}
      </div>

      ${noticeHTML(data)}

      <div class="audit-top">
        ${ringHTML(overall)}
        <div class="cats">${categoriesHTML(data.categories, issueCounts)}</div>
      </div>

      ${metricsHTML(data.metrics)}
      ${findingsHTML(data.categories, data.findings, issueCounts)}
    </div>`;
}

/** Category filter chips above the findings list. Returns true if it handled the click. */
export function handleClick(target) {
  const chip = target.closest('[data-filter]');
  if (!chip) return false;

  const report = chip.closest('.audit');
  const filter = chip.getAttribute('data-filter');

  report.querySelectorAll('[data-filter]').forEach((c) => {
    c.setAttribute('aria-pressed', String(c === chip));
  });
  report.querySelectorAll('.finding').forEach((card) => {
    card.hidden = !(filter === 'all' || card.getAttribute('data-cat') === filter);
  });
  return true;
}
