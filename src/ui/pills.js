/** Small status pills used in several results. */

import { esc } from '../lib/dom.js';

const SEVERITY_STYLE = {
  critical: 'bad',
  serious: 'warn',
  moderate: 'neutral',
  minor: 'outline',
  passed: 'good'
};

/** Severity label such as "Critical" or "Minor". The word is always shown, never color alone. */
export function severityPill(severity) {
  const style = SEVERITY_STYLE[severity] || 'neutral';
  const label = severity[0].toUpperCase() + severity.slice(1);
  return `<span class="pill ${style}">${esc(label)}</span>`;
}

const CONFIDENCE = {
  high:   { style: 'good', label: 'Automatic' },
  medium: { style: 'warn', label: 'Review' },
  low:    { style: 'bad',  label: 'Manual' }
};

/** How sure the mapping is: Automatic, Review or Manual. */
export function confidencePill(confidence) {
  const { style, label } = CONFIDENCE[confidence];
  return `<span class="pill ${style}">${label}</span>`;
}

/** Says where a result came from: the hardcoded demo or the AI. */
export function sourcePill(data) {
  return data._source === 'ai'
    ? '<span class="pill accent">AI generated</span>'
    : '<span class="pill neutral">Sample output</span>';
}

/** Warning shown above AI results that the model could only estimate (see NOTICES in server/server.js). */
export function noticeHTML(data) {
  return data._notice ? `<p class="notice" role="note">${esc(data._notice)}</p>` : '';
}
