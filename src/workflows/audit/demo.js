/**
 * Hardcoded result for "Audit experience".
 *
 * {
 *   mode:       "url" | "component",
 *   subject:    string,
 *   categories: [{ id, label, score, passed }],
 *   metrics:    [{ label, value, target, status }],      // empty unless "perf" is selected
 *   findings:   [{ category, severity, title, rule, where, fix }]
 * }
 */

import { hostOf } from '../../lib/text.js';
import { CATEGORIES, METRICS, FINDINGS } from './sample-data.js';

export function demo(input) {
  const selected = input.checks;

  return {
    mode: input.mode,
    subject: input.mode === 'url' ? hostOf(input.target) : input.target.trim().slice(0, 40) || 'Component',
    categories: CATEGORIES.filter((c) => selected.includes(c.id)),
    metrics: selected.includes('perf') ? METRICS : [],
    findings: FINDINGS.filter((f) => selected.includes(f.category))
  };
}
