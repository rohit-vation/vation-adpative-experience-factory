/**
 * Hardcoded migration data. Edit here to change the demo result.
 */

/** The six source patterns found on the sample site, with their target component name per CMS. */
export const MAPPING_ROWS = [
  { source: '.hero-slider',       fields: 'title, image, button', confidence: 'high',   target: { aem: 'aef/hero-banner',    eds: 'hero-banner',     cf: 'heroBanner',   opti: 'HeroBannerBlock' } },
  { source: '.card-grid > .card', fields: 'title, image, link',   confidence: 'high',   target: { aem: 'aef/teaser-card',    eds: 'cards',           cf: 'teaserCard',   opti: 'TeaserCardBlock' } },
  { source: '.faq-list details',  fields: 'question, answer',     confidence: 'medium', target: { aem: 'aef/accordion',      eds: 'accordion',       cf: 'accordion',    opti: 'AccordionBlock' } },
  { source: '.rte',               fields: 'body',                 confidence: 'high',   target: { aem: 'aef/text',           eds: 'default content', cf: 'richText',     opti: 'RichTextBlock' } },
  { source: '.cta-strip',         fields: 'label, url',           confidence: 'high',   target: { aem: 'aef/call-to-action', eds: 'cta',             cf: 'callToAction', opti: 'CallToActionBlock' } },
  { source: '.video-embed',       fields: 'provider, video id',   confidence: 'medium', target: { aem: 'aef/video',          eds: 'video',           cf: 'videoEmbed',   opti: 'VideoBlock' } }
];

export const TEMPLATES = [
  { name: 'Article',        pages: 96, components: 'Hero, Text, Video, CTA' },
  { name: 'Product detail', pages: 38, components: 'Hero, Cards, Accordion, CTA' },
  { name: 'Landing page',   pages: 22, components: 'Hero, Cards, CTA' },
  { name: 'Event',          pages: 14, components: 'Hero, Text, Accordion' },
  { name: 'Listing',        pages: 9,  components: 'Cards, CTA' },
  { name: 'Utility',        pages: 5,  components: 'Text' }
];

export const STATS = [
  { label: 'Pages found',          value: '184' },
  { label: 'Templates',            value: '6' },
  { label: 'Assets',               value: '1,240' },
  { label: 'Mapped automatically', value: '91%' },
  { label: 'URLs kept',            value: '96%' }
];

export const SITE_TOTALS = { pages: 184, assets: 1240 };

/** Items a person should look at before go-live. */
export const REVIEW_ITEMS = [
  { severity: 'serious',  title: '9 pages embed third-party iframes',   detail: 'Booking widgets cannot be converted. Keep them as embed components and test them on the new domain.' },
  { severity: 'moderate', title: '17 pages have no meta description',   detail: 'Carried over empty. Add descriptions before launch to avoid an SEO drop.' },
  { severity: 'moderate', title: '8 FAQ lists mix HTML in answers',     detail: 'Answers with tables need a manual check after conversion.' },
  { severity: 'minor',    title: '7 URLs change because of duplicate slugs', detail: 'Redirects are generated in redirects.csv, review before go-live.' }
];
