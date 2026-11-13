/** Available audit categories used by the form and API-response validator. */

/**
 * Hardcoded audit data. Edit the numbers and text here to change the demo report.
 *
 * Check ids: a11y, seo, perf, ds, content
 * Severity:  critical, serious, moderate, minor
 */

export const CHECKS = [
  { id: 'a11y',    label: 'Accessibility' },
  { id: 'seo',     label: 'SEO' },
  { id: 'perf',    label: 'Performance' },
  { id: 'ds',      label: 'Design system' },
  { id: 'content', label: 'Content integrity' }
];

