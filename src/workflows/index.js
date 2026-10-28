/**
 * Workflow registry.
 *
 * Every workflow is a folder in this directory with the same shape:
 *
 *   index.js          the definition (texts, form, how to read it, validation)
 *   demo.js           hardcoded result, input -> data
 *   render.js         data -> HTML
 *   sample-data.js    (optional) the hardcoded numbers and text used by demo.js
 *
 * A workflow definition looks like this:
 *
 *   {
 *     id, title, icon, desc, lead, meta,   texts and icon name
 *     outputs: [string],                   shown before the first run
 *     steps:   [string],                   shown as progress while generating
 *     defaults: {...},                     initial form values
 *     form():   string                     form fields as HTML
 *     read():   input                      collects the values from the form
 *     check(input): string                 returns an error message or ''
 *     demo(input): data                    hardcoded generator
 *     render(data, input): string          data to HTML
 *     onClick?(target), onChange?(target)  optional event hooks
 *   }
 *
 * To add a workflow: create a folder, then add it here and to ORDER.
 */

import create from './create/index.js';
import map from './map/index.js';
import audit from './audit/index.js';
import migrate from './migrate/index.js';

export const WORKFLOWS = { create, map, audit, migrate };

/** Order of the cards on the home dashboard. */
export const ORDER = ['create', 'map', 'audit', 'migrate'];
