/**
 * One prompt per workflow, built on the SERVER from the form input.
 *
 * Each prompt asks the model for the SAME JSON shape that the workflow's demo.js returns,
 * so render.js works unchanged with live output. If you change a shape in demo.js,
 * change it here and in src/ai/validate.js too.
 */

import { CMS } from '../config.js';
import { items } from '../lib/text.js';

const FILE_SHAPE = '{ "name": string (path), "lang": string, "code": string }';
const IMPL_SHAPE = `{ "model": [{ "field": string, "type": string, "note": string }], "files": [${FILE_SHAPE}] }`;

export const PROMPT_BUILDERS = {
  create: (i) => `Create a reusable component.
Component name: ${i.name}
Primary CMS: ${CMS[i.cms].label}
Description: ${i.description}

Return this JSON shape:
{
  "component": { "name": string, "cms": "${i.cms}", "summary": string },
  "design": {
    "a11y": [string]
  },
  "implementations": { "aem": ${IMPL_SHAPE}, "eds": ${IMPL_SHAPE}, "cf": ${IMPL_SHAPE}, "opti": ${IMPL_SHAPE} }
}
Rules: the four implementations must expose equivalent fields. Use design tokens (CSS custom properties) instead of fixed colors.
Include dialog or content model, rendering code and styles for every CMS.`,

  map: (i) => `Map components from one CMS to another.
Source CMS: ${CMS[i.source].label}
Target CMS: ${CMS[i.target].label}
Components: ${items(i.components).join(', ')}
Requirement: ${i.requirement}

For each component write the source implementation and the equivalent target implementation.
Return this JSON shape:
{
  "summary": { "components": number, "fields": number, "auto": number (percent), "review": number },
  "requirement": string,
  "source": "${i.source}", "target": "${i.target}",
  "components": [{
    "name": string,
    "status": "Ready to migrate" | "Review suggested",
    "mapping": [{ "field": string, "source": string, "target": string, "transform": string, "confidence": "high" | "medium" | "low" }],
    "sourceFiles": [${FILE_SHAPE}],
    "targetFiles": [${FILE_SHAPE}]
  }],
  "notes": [string]
}
Rules: you only have the component names, not their real code, so write plausible source implementations. Never drop a field silently. Mark a field "medium" when content must be converted and "low" when a person must decide.`,

  audit: (i) => `Audit a ${i.mode === 'url' ? 'website' : 'component'} for quality.
Subject: ${i.target}
Checks to run: ${i.checks.join(', ')}  (a11y, seo, perf, ds, content)

Return this JSON shape:
{
  "mode": "${i.mode}",
  "subject": string,
  "categories": [{ "id": string, "label": string, "score": number (0-100), "passed": number }],
  "metrics": [{ "label": string, "value": string, "target": string, "status": "good" | "warn" | "bad" }],
  "findings": [{ "category": string, "severity": "critical" | "serious" | "moderate" | "minor",
                 "title": string, "rule": string (for example WCAG 2.2 SC 1.1.1), "where": string, "fix": string }]
}
Rules: you cannot open the URL or measure anything. Give estimates based on typical issues for this kind of site, and say "Estimated" in each metric "target". Cite the specific rule for every finding. Leave "metrics" empty unless perf is selected. Return an empty "findings" list for checks that were not requested.`,

  migrate: (i) => `Plan a content migration.
Source site: ${i.url}
Target CMS: ${CMS[i.target].label}

Return this JSON shape:
{
  "site": { "host": string, "pages": number, "assets": number },
  "target": "${i.target}",
  "stats": [{ "label": string, "value": string }],
  "templates": [{ "name": string, "pages": number, "components": string }],
  "mapping": [{ "source": string (CSS selector), "target": string (target component), "fields": string, "confidence": "high" | "medium" | "low" }],
  "output": ${FILE_SHAPE},
  "review": [{ "severity": "critical" | "serious" | "moderate" | "minor", "title": string, "detail": string }]
}
Rules: you cannot crawl the site, so counts are estimates. "output" is one converted example page in the native import format of the target CMS. "confidence" in each mapping is "high", "medium" or "low".`
};
