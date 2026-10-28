/**
 * Hardcoded result for "Prepare personalization blocks".
 *
 * {
 *   block, system, goal,
 *   variants: [{ id, name, audience, headline, body, cta, rule: { attribute, operator, value } | null }],
 *   metadata: string,       // the JSON document to import, as text
 *   notes:    [string]
 * }
 *
 * The first variant is always the control (rule: null).
 */

import { items, kebab } from '../../lib/text.js';
import { GOALS, SYSTEMS, CONTROL_VARIANT, SEGMENT_COPY } from './sample-data.js';

/** Copy for a segment we have no ready-made text for. */
function genericCopy(segment) {
  const lower = segment.toLowerCase();
  return {
    headline: `Made for ${lower}`,
    body: `Content chosen for ${lower}.`,
    cta: 'See what is new',
    rule: { attribute: 'segment.id', operator: 'in', value: [kebab(segment)] }
  };
}

function variantFor(segment) {
  const copy = SEGMENT_COPY[segment.toLowerCase()] || genericCopy(segment);
  return { id: kebab(segment), name: segment, audience: segment, ...copy };
}

/** The file loaded into the personalization system. */
function buildMetadata(block, systemName, goalKey, variants) {
  return JSON.stringify(
    {
      block: kebab(block),
      version: '1.0.0',
      personalization: {
        system: systemName,
        goal: goalKey,
        decisionScope: `${kebab(block)}-home`,
        fallbackVariant: 'default'
      },
      variants: variants.map((v) => ({
        id: v.id,
        audience: v.rule ? { segment: v.audience, rules: [v.rule] } : null,
        fields: { headline: v.headline, body: v.body, ctaLabel: v.cta }
      }))
    },
    null,
    2
  );
}

export function demo(input) {
  const block = input.base.trim() || 'Hero Banner';
  const [goalLabel, goalKey] = GOALS[input.goal];
  const systemName = SYSTEMS[input.system];

  const variants = [CONTROL_VARIANT, ...items(input.segments).slice(0, 4).map(variantFor)];

  return {
    block,
    system: systemName,
    goal: goalLabel,
    variants,
    metadata: buildMetadata(block, systemName, goalKey, variants),
    notes: [
      `The default variant renders when no audience rule matches or ${systemName} cannot be reached.`,
      'Variants change content fields only. Layout and styling stay in the base component so the design system does not fork.',
      `Set ${goalKey} as the primary goal in ${systemName} before launch.`,
      'Wait for about 1,000 sessions per variant before reading results.'
    ]
  };
}
