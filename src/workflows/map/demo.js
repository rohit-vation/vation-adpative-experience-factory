/**
 * Hardcoded result for "Map components".
 *
 * {
 *   summary:     { components, fields, auto (percent), review },
 *   requirement: string,
 *   source, target,
 *   components:  [{ name, status, mapping: [{ field, source, target, transform, confidence }],
 *                   sourceFiles: [file], targetFiles: [file] }],
 *   notes:       [string]
 * }
 *
 * confidence is "high" (automatic), "medium" (review) or "low" (manual).
 */

import { FIELDS } from '../../data/fields.js';
import { implementationFiles } from '../../data/implementations/index.js';
import { items } from '../../lib/text.js';

/** How each field is transformed on the way into the target CMS. */
const TRANSFORMS = {
  title: 'Copy as plain text and trim to 80 characters',
  link: 'Copy as is and check internal paths against the redirect map',
  description: {
    aem: 'Keep as AEM rich text HTML',
    eds: 'Flatten to default content paragraphs',
    cf: 'Convert HTML to a Contentful Rich Text document',
    opti: 'Store as XhtmlString and sanitize inline styles'
  },
  image: {
    aem: 'Upload to DAM and store the path',
    eds: 'Place picture in row 1, renditions are generated',
    cf: 'Create an Asset and link it by sys.id',
    opti: 'Import to the media folder and store a ContentReference'
  },
  alignment: {
    aem: 'Map to the dialog select value',
    eds: 'Map to the block variant class "center"',
    cf: 'Map to a validated Symbol value',
    opti: 'Map to a SelectOne value'
  }
};

/** Authoring differences worth telling the team about, by target CMS. */
const NOTES = {
  aem: [
    'Dialog fields become Granite dialog nodes. Add them to the component policy so template authors can restrict them.',
    'Keep the Sling Model as the single place that reads authored values.'
  ],
  eds: [
    'Fields are positional. Row order in the authoring table is the content model, so document it for authors.',
    'Variants replace select fields. Use class names such as "center" in the block name.'
  ],
  cf: [
    'Create the content type before importing entries, and publish it so the delivery API can see it.',
    'Rich text needs the renderer package on the front end.'
  ],
  opti: [
    'Register the block GUID once per environment and keep it stable across deployments.',
    'Selection factories need to be registered before the block shows alignment options.'
  ]
};

function transformFor(field, target) {
  if (field.key === 'title') return TRANSFORMS.title;
  if (field.key === 'ctaLabel' || field.key === 'ctaUrl') return TRANSFORMS.link;
  return TRANSFORMS[field.key][target];
}

/** Descriptions of hero banners hold rich text, so they need a human look. Alignment is always reviewed. */
function confidenceFor(field, isHero) {
  if (field.key === 'alignment') return 'medium';
  if (field.key === 'description' && isHero) return 'medium';
  return 'high';
}

export function demo(input) {
  const { source, target } = input;
  const names = items(input.components).slice(0, 4);

  let fieldTotal = 0;
  let automatic = 0;
  let review = 0;

  const components = names.map((name) => {
    const isHero = /hero|banner/i.test(name);
    // Only hero-style components have an alignment field
    const fields = FIELDS.filter((f) => isHero || f.key !== 'alignment');

    const mapping = fields.map((f) => {
      const confidence = confidenceFor(f, isHero);
      fieldTotal++;
      if (confidence === 'high') automatic++;
      else review++;

      return {
        field: f.label,
        source: `${f[source][0]} (${f[source][1]})`,
        target: `${f[target][0]} (${f[target][1]})`,
        transform: transformFor(f, target),
        confidence
      };
    });

    return {
      name,
      status: mapping.some((m) => m.confidence !== 'high') ? 'Review suggested' : 'Ready to migrate',
      mapping,
      sourceFiles: implementationFiles(source, name),
      targetFiles: implementationFiles(target, name)
    };
  });

  return {
    summary: {
      components: components.length,
      fields: fieldTotal,
      auto: fieldTotal ? Math.round((100 * automatic) / fieldTotal) : 0,
      review
    },
    requirement: input.requirement,
    source,
    target,
    components,
    notes: NOTES[target]
  };
}
