/**
 * Hardcoded result for "Migrate content".
 *
 * {
 *   site:      { host, pages, assets },
 *   target:    cmsId,
 *   stats:     [{ label, value }],
 *   templates: [{ name, pages, components }],
 *   mapping:   [{ source, target, fields, confidence }],
 *   output:    { name, lang, code },            // one converted example page
 *   review:    [{ severity, title, detail }]
 * }
 */

import { hostOf } from '../../lib/text.js';
import { MAPPING_ROWS, TEMPLATES, STATS, SITE_TOTALS, REVIEW_ITEMS } from './sample-data.js';
import { examplePage } from './page-output.js';

export function demo(input) {
  const host = hostOf(input.url);
  const target = input.target;

  return {
    site: { host, ...SITE_TOTALS },
    target,
    stats: STATS,
    templates: TEMPLATES,
    mapping: MAPPING_ROWS.map((row) => ({
      source: row.source,
      target: row.target[target],
      fields: row.fields,
      confidence: row.confidence
    })),
    output: examplePage(target, host),
    review: REVIEW_ITEMS
  };
}
