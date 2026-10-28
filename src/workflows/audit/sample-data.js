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

export const CATEGORIES = [
  { id: 'a11y',    label: 'Accessibility',     score: 78, passed: 41 },
  { id: 'seo',     label: 'SEO',               score: 86, passed: 27 },
  { id: 'perf',    label: 'Performance',       score: 64, passed: 18 },
  { id: 'ds',      label: 'Design system',     score: 71, passed: 33 },
  { id: 'content', label: 'Content integrity', score: 90, passed: 52 }
];

/** Only shown when the Performance check is selected. */
export const METRICS = [
  { label: 'LCP',                 value: '4.1 s',  target: 'Target 2.5 s or less', status: 'bad' },
  { label: 'INP',                 value: '210 ms', target: 'Target 200 ms or less', status: 'warn' },
  { label: 'CLS',                 value: '0.19',   target: 'Target 0.1 or less',    status: 'bad' },
  { label: 'Total blocking time', value: '380 ms', target: 'Target 200 ms or less', status: 'warn' },
  { label: 'Page weight',         value: '3.4 MB', target: 'Budget 2 MB',           status: 'bad' }
];

export const FINDINGS = [
  // Performance
  {
    category: 'perf', severity: 'critical',
    title: 'Largest Contentful Paint is 4.1 s',
    rule: 'Core Web Vitals: LCP target 2.5 s',
    where: 'img.hero__image (1.8 MB, not preloaded)',
    fix: 'Serve AVIF or WebP at 1600px, add fetchpriority="high" and preload the hero image.'
  },
  {
    category: 'perf', severity: 'serious',
    title: 'Layout shift of 0.19 from the promo banner',
    rule: 'Core Web Vitals: CLS target 0.1',
    where: '.promo-banner',
    fix: 'Reserve space with width and height attributes or aspect-ratio.'
  },
  {
    category: 'perf', severity: 'moderate',
    title: '312 KB of unused JavaScript',
    rule: 'Performance budget: 170 KB script',
    where: 'carousel.bundle.js',
    fix: 'Load the carousel only on pages that include it.'
  },
  {
    category: 'perf', severity: 'minor',
    title: 'Web fonts are not preloaded',
    rule: 'Performance: font loading',
    where: 'Instrument Sans 600',
    fix: 'Preload the primary font file and use font-display: swap.'
  },

  // Accessibility
  {
    category: 'a11y', severity: 'serious',
    title: '3 images have no alternative text',
    rule: 'WCAG 2.2 SC 1.1.1 Non-text Content',
    where: '.teaser__image (3 instances)',
    fix: 'Require alt text or a decorative flag in the component dialog and read it from the asset description.'
  },
  {
    category: 'a11y', severity: 'serious',
    title: 'Eyebrow text contrast is 3.2:1',
    rule: 'WCAG 2.2 SC 1.4.3 Contrast (Minimum)',
    where: '.teaser__eyebrow',
    fix: 'Use the text-muted token at its AA-safe value (4.5:1 on the surface color).'
  },
  {
    category: 'a11y', severity: 'moderate',
    title: 'Heading level skips from h2 to h4',
    rule: 'WCAG 2.2 SC 1.3.1 Info and Relationships',
    where: 'footer .nav-group',
    fix: 'Use h3 or style the heading with a class.'
  },
  {
    category: 'a11y', severity: 'minor',
    title: 'Link text "Read more" repeats 6 times',
    rule: 'WCAG 2.2 SC 2.4.4 Link Purpose',
    where: '.card__link',
    fix: 'Add visually hidden text with the card title.'
  },

  // SEO
  {
    category: 'seo', severity: 'moderate',
    title: 'Meta description missing on 4 templates',
    rule: 'SEO: page metadata',
    where: '/products, /events, /stories, /support',
    fix: 'Add a metaDescription field to the page template and make it required.'
  },
  {
    category: 'seo', severity: 'moderate',
    title: 'Two h1 elements on /products',
    rule: 'SEO: heading structure',
    where: 'main > .hero h1, .promo h1',
    fix: 'Demote the promo heading to h2.'
  },
  {
    category: 'seo', severity: 'minor',
    title: 'Page title is 78 characters',
    rule: 'SEO: title length',
    where: 'head > title',
    fix: 'Keep titles under 60 characters.'
  },

  // Design system
  {
    category: 'ds', severity: 'serious',
    title: '7 hardcoded colors outside the token set',
    rule: 'Design system: color tokens',
    where: '#1A73E8, #F4F4F4, #333 and 4 more',
    fix: 'Replace with --color-accent, --color-surface and --color-text.'
  },
  {
    category: 'ds', severity: 'moderate',
    title: '3 button styles are not in the design system',
    rule: 'Design system: component variants',
    where: '.btn--pill, .btn--ghost-dark, .cta-alt',
    fix: 'Map them to the primary, secondary and text button variants.'
  },
  {
    category: 'ds', severity: 'minor',
    title: 'Spacing values off the 4px grid',
    rule: 'Design system: spacing scale',
    where: '13px, 22px in .teaser',
    fix: 'Use --space-3 and --space-5.'
  },

  // Content integrity
  {
    category: 'content', severity: 'moderate',
    title: '5 internal links return 404',
    rule: 'Content integrity: link health',
    where: '/about/team-2019, /press/archive and 3 more',
    fix: 'Add redirects or update the links in the source content.'
  },
  {
    category: 'content', severity: 'minor',
    title: '2 teasers have empty required fields',
    rule: 'Content integrity: required fields',
    where: '/stories/spring-2026 (teaser 2, 4)',
    fix: 'Fill the link label or hide the component.'
  },
  {
    category: 'content', severity: 'minor',
    title: '3 content fragments are referenced but unpublished',
    rule: 'Content integrity: references',
    where: 'cf-faq-04, cf-faq-07, cf-legal-02',
    fix: 'Publish them or remove the references.'
  }
];
