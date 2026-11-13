/**
 * One prompt per workflow, built on the SERVER from the form input.
 *
 * Prompts define the API response shape consumed by workflow renderers and validated
 * by src/ai/validate.js. There is no runtime sample-result fallback.
 */

import { readFileSync } from 'node:fs';
import { CMS } from '../config.js';
import { items } from '../lib/text.js';
import { CREATE_COMPONENT_GENERATION_RULES } from './system-prompt.js';

const FILE_SHAPE = '{ "name": string (path), "lang": string, "code": string }';
const IMPL_SHAPE = `{ "model": [{ "field": string, "type": string, "note": string }], "files": [${FILE_SHAPE}] }`;
const AEM_FIELD_SHAPE = '{ "name": string, "label": string, "type": "text"|"textarea"|"path"|"select"|"checkbox"|"number"|"richtext"|"multifield"|"date"|"hidden", "required": boolean, "role": "title"|"body"|"image"|"imageAlt"|"ctaLabel"|"ctaLink"|"alignment"|"other", "options"?: [{ "label": string, "value": string }], "rootPath"?: string, "defaultValue"?: string, "description"?: string, "composite"?: boolean, "minItems"?: number, "maxItems"?: number, "children"?: [nestedFieldSchema] }';
const AEM_IMPL_SHAPE = `{ "model": [{ "field": string, "type": string, "note": string }], "fields": [${AEM_FIELD_SHAPE}], "componentGroup"?: string, "clientlibCategory"?: string, "proxyComponent"?: boolean, "resourceSuperType"?: string, "directJcrHtl"?: string, "files": [${FILE_SHAPE}] }`;
const AEM_COMPONENT_CONTRACT = readFileSync(new URL('./rules/aem-component-contract.md', import.meta.url), 'utf8').trim();
const CROSS_CMS_MODEL_CONTRACT = readFileSync(new URL('./rules/cross-cms-content-models.md', import.meta.url), 'utf8').trim();

export const PROMPT_BUILDERS = {
  'design-to-aem': (i) => `Convert a Figma design or wireframe into an AEM page implementation plan.
Source type: ${i.sourceType}
Design URL: ${i.designUrl}
AEM project/site: ${i.site}
Page name: ${i.pageName}
Page path: ${i.pagePath}
Template strategy: ${i.templateStrategy}
Requirements: ${i.requirements}

Important: the AI service cannot directly open or inspect the supplied URL. Treat the URL as the design source reference and clearly mark analysis that is inferred rather than measured. If the user supplies enough semantic information in the requirements, use it. Do not invent actual Figma pixels or DOM measurements.

Return this JSON shape:
{
  "source": { "type": "Figma"|"Wireframe", "url": string, "analysisStatus": "reference-only"|"semantic-input" },
  "template": { "strategy": "reuse"|"generate", "name": string, "path": string, "reason": string, "confidence": number },
  "components": [{ "name": string, "resourceType": string, "action": "reuse"|"generate", "confidence": number, "fields": [string] }],
  "sections": [{ "name": string, "layout": string, "components": [string] }],
  "page": { "name": string, "path": string, "title": string, "description": string },
  "authoring": [{ "component": string, "properties": { "key": string } }],
  "assets": [{ "source": string, "damPath": string, "action": "reference"|"upload-required" }],
  "review": [string]
}

Rules: identify the page hierarchy first, then map each visual block to an existing AEM component where a reasonable match exists. Generate only when reuse is not suitable. Use editable-template paths under /conf when generating a template. For page creation, resourceType values must be valid AEM component resource types or explicit placeholders ending in the component name; never use arbitrary executable code. Keep page and component paths repository-safe. Authoring properties should be concrete values derived from the semantic brief, not lorem ipsum. Preserve repeated cards as repeated component nodes. If images are referenced, use DAM paths and mark missing assets as upload-required. `,
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
  "ruleSuggestions": [{ "title": string, "appliesTo": string, "rule": string, "reason": string, "validation": string, "examplePattern": string }],
  "implementations": { "aem": ${AEM_IMPL_SHAPE}, "eds": ${IMPL_SHAPE}, "cf": ${IMPL_SHAPE}, "opti": ${IMPL_SHAPE} }
}
Rules: generate implementation files only for the selected CMS "${i.cms}", but generate a complete content-model mapping for all four CMS platforms. For every CMS, populate model with one row per logical authored field, using that platform's real field/property name and type; keep the same logical field coverage across AEM, EDS, Contentful and Optimizely. For unselected CMS targets, files must be [] but model must not be empty when the component has authored fields. For unselected AEM, include model rows even when fields is []; when AEM is selected, fields is the canonical recursive schema. Empty models are valid only for an intentionally fieldless/static component or pure proxy with no custom authored fields. Do not generate equivalent source files for unselected CMS targets. Use design tokens (CSS custom properties) instead of fixed colors.
Treat the description as a short feature brief. Do not assume a fixed component catalog and do not make users supply a long technical specification. Infer the actual component data, authoring fields, responsive layout, interactions, state, error/empty behavior, accessibility, and required implementation assets from the request. For missing details, choose safe conventional defaults and note material assumptions instead of asking for obvious details.
For AEM, return a recursive, complete authoring field schema whose fields match the implementation. Every AEM custom component must include its generated HTL source and component-specific CSS. Emit JavaScript and a clientlib JS index/include whenever the requested feature has behavior that needs JavaScript; the JS selectors/events must correspond to the actual generated HTL. Provide a complete Sling Model and any required helper source where the behavior needs server-side logic or the user explicitly asks for a Sling Model. Use correctly nested Granite composite multifields for repeatable objects and child resources. If any composite multifield is used, or the component requires a Sling Model/server-side binding, return directJcrHtl: a complete second HTL rendering for the direct-JCR write path, with no Sling Model dependency. The normal source HTL should use the proper Sling Model; directJcrHtl must render composite groups using this concrete HTL pattern (substitute the real group and child property names): <sly data-sly-list.group="\${resource.children}"><sly data-sly-test="\${group.name == 'slides'}"><div data-sly-list.item="\${group.children}"><img src="\${item.valueMap.image @ context='uri'}"/></div></sly></sly>. Keep the real quote and expression syntax; do not leave placeholder names or pseudocode. For nested multifields, repeat this container-node and item-child loop at each level. Never treat a composite group as model.slides, properties.slides, JSON, or a flat string array on the direct-JCR path. Preserve every useful source file; do not replace the requested component behavior with a generic example template.
For AEM, return componentGroup when the brief specifies a component group; use that exact group name in the component metadata and manifest. Return clientlibCategory when the brief specifies a clientlib category; use that exact value in clientlib metadata and every source/direct-JCR HTL CSS/JS reference. Component group and clientlib category are independent values. If either is omitted, use the configured default for that value. Never infer a clientlib category from component group.
For a pure OOTB Core Component proxy, set proxyComponent=true, provide the exact Sling resource type in resourceSuperType, return fields=[] unless a custom dialog extension is explicitly requested, and do not provide custom HTL/Java/clientlib that would override inherited behavior. Never invent a Core Component version; state the assumption and let the selected AEM Author preflight verify the resource type.
${CREATE_COMPONENT_GENERATION_RULES}
${AEM_COMPONENT_CONTRACT}
${CROSS_CMS_MODEL_CONTRACT}
If a reusable pattern is not covered adequately, include a ruleSuggestions entry following the exact schema above; otherwise return an empty array. Suggestions are for maintainer review, not automatic rulebook edits.`,

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
