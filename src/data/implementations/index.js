/**
 * implementationFiles(cmsId, componentName) -> [{ name, lang, code }]
 *
 * One entry point for the sample code of every CMS.
 * To add a CMS: add a file next to this one, register it below,
 * then add it to CMS in src/config.js and to FIELDS in src/data/fields.js.
 */

import { aemFiles } from './aem.js';
import { edsFiles } from './eds.js';
import { contentfulFiles } from './contentful.js';
import { optimizelyFiles } from './optimizely.js';

const BUILDERS = {
  aem: aemFiles,
  eds: edsFiles,
  cf: contentfulFiles,
  opti: optimizelyFiles
};

export function implementationFiles(cmsId, name) {
  return BUILDERS[cmsId](name);
}
