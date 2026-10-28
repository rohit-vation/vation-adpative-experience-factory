/**
 * Hardcoded personalization data. Edit here to change the demo result.
 */

/** Goal id -> [label shown to people, metric key sent to the personalization system]. */
export const GOALS = {
  cta:       ['Increase CTA clicks', 'ctaClick'],
  lead:      ['Lead conversion',     'leadSubmit'],
  discovery: ['Product discovery',   'productView'],
  retention: ['Retention',           'returnVisit']
};

/** Personalization system id -> display name. */
export const SYSTEMS = {
  target: 'Adobe Target',
  opt:    'Optimizely Web Experimentation',
  cfp:    'Contentful Personalization',
  dy:     'Dynamic Yield'
};

/** The fallback shown to everyone who matches no audience. */
export const CONTROL_VARIANT = {
  id: 'default',
  name: 'Default (control)',
  audience: 'Everyone else',
  headline: 'Build once, publish anywhere',
  body: 'Reuse one component across every site and channel.',
  cta: 'Explore the platform',
  rule: null
};

/** Ready-made copy and rules for known segment names (lowercase keys). */
export const SEGMENT_COPY = {
  'first-time visitors': {
    headline: 'New here? Start with the 3 minute tour',
    body: 'See how teams launch their first site in a week.',
    cta: 'Take the tour',
    rule: { attribute: 'visit.count', operator: 'eq', value: 1 }
  },
  'returning customers': {
    headline: 'Welcome back. Pick up where you left off',
    body: 'Your saved projects and recent components are ready.',
    cta: 'Continue',
    rule: { attribute: 'customer.status', operator: 'eq', value: 'active' }
  },
  'enterprise decision makers': {
    headline: 'One experience layer for every brand and CMS',
    body: 'Cut duplicate builds and keep governance in one place.',
    cta: 'Book an architecture review',
    rule: { attribute: 'firmographic.employeeBand', operator: 'gte', value: 1000 }
  }
};
