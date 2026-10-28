/**
 * App-wide configuration.
 * Anything that several modules need to agree on lives here.
 */

/** Supported CMS platforms. `short` is used in tabs and table headers. */
export const CMS = {
  aem:  { label: 'Adobe Experience Manager', short: 'AEM' },
  eds:  { label: 'Edge Delivery Services',   short: 'Edge Delivery' },
  cf:   { label: 'Contentful',               short: 'Contentful' },
  opti: { label: 'Optimizely CMS',           short: 'Optimizely' }
};

/** Display order for every CMS list in the UI. */
export const CMS_IDS = ['aem', 'eds', 'cf', 'opti'];

/** How long each fake "progress step" is shown in demo mode (ms). */
export const DEMO_STEP_DELAY = 380;
