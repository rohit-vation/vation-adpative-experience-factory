/**
 * Hardcoded result for "Create component".
 *
 * The returned object is the contract between the generator and render.js.
 * The AI prompt in src/ai/prompts.js asks for exactly this shape.
 *
 * {
 *   component:       { name, cms, summary },
 *   design:          { a11y: [string] },
 *   implementations: { aem|eds|cf|opti: { model: [{ field, type, note }], files: [{ name, lang, code }] } }
 * }
 */

import { CMS_IDS } from '../../config.js';
import { modelRows } from '../../data/fields.js';
import { implementationFiles } from '../../data/implementations/index.js';

export function demo(input) {
  const name = input.name.trim() || 'Hero Banner';

  const implementations = {};
  CMS_IDS.forEach((cmsId) => {
    implementations[cmsId] = {
      model: modelRows(cmsId),
      files: implementationFiles(cmsId, name)
    };
  });

  return {
    component: { name, cms: input.cms, summary: input.description },

    design: {
      a11y: [
        'One h1 per page, labelled by the section',
        'Alt text comes from the asset description',
        'Visible keyboard focus on the button'
      ]
    },

    implementations
  };
}
