/** Active workflow registry. Runtime results are generated only by the configured provider API. */

import create from './create/index.js';
import map from './map/index.js';
import audit from './audit/index.js';
import migrate from './migrate/index.js';
import designToAem from './design-to-aem/index.js';

export const WORKFLOWS = { create, map, audit, migrate, 'design-to-aem': designToAem };

/** Order of the cards on the home dashboard. */
export const ORDER = ['create', 'map', 'audit', 'migrate', 'design-to-aem'];
