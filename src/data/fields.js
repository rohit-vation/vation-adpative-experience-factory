/**
 * The canonical field list for the sample "Hero Banner" style component.
 *
 * Each field says what it is called, and what it is called and typed in each CMS.
 * Format of the CMS entries: [field name, field type].
 *
 * Used by Create (content model tables) and Map (source and target columns).
 */

export const FIELDS = [
  {
    key: 'title',
    label: 'Headline',
    aem:  ['title', 'textfield'],
    eds:  ['Row 2: heading', 'heading'],
    cf:   ['title', 'Symbol'],
    opti: ['Heading', 'string']
  },
  {
    key: 'description',
    label: 'Supporting copy',
    aem:  ['description', 'richtext'],
    eds:  ['Row 2: paragraph', 'text'],
    cf:   ['description', 'RichText'],
    opti: ['Description', 'XhtmlString']
  },
  {
    key: 'image',
    label: 'Background image',
    aem:  ['fileReference', 'DAM path'],
    eds:  ['Row 1: picture', 'image'],
    cf:   ['image', 'Asset link'],
    opti: ['Image', 'ContentReference']
  },
  {
    key: 'ctaLabel',
    label: 'Button label',
    aem:  ['linkText', 'textfield'],
    eds:  ['Row 2: link text', 'link'],
    cf:   ['ctaLabel', 'Symbol'],
    opti: ['CtaLabel', 'string']
  },
  {
    key: 'ctaUrl',
    label: 'Button link',
    aem:  ['linkURL', 'pathfield'],
    eds:  ['Row 2: link href', 'link'],
    cf:   ['ctaUrl', 'Symbol (URL pattern)'],
    opti: ['CtaUrl', 'Url']
  },
  {
    key: 'alignment',
    label: 'Text alignment',
    aem:  ['alignment', 'select'],
    eds:  ['Block variant', 'class: center'],
    cf:   ['alignment', 'Symbol (left, center)'],
    opti: ['Alignment', 'SelectOne']
  }
];

/** Rows for a "Content model" table for one CMS. */
export const modelRows = (cmsId) =>
  FIELDS.map((f) => ({ field: f[cmsId][0], type: f[cmsId][1], note: f.label }));
