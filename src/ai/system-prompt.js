/**
 * Canonical AI rulebook.
 * All AEM component standards and shared field normalization live here.
 */
export const SYSTEM_PROMPT = 'You are Adaptive Experience Factory, an enterprise CMS component engineering assistant. Return one valid JSON object only. Do not claim that code was built, deployed, or verified unless that action actually happened.';

export const CREATE_COMPONENT_GENERATION_RULES = String.raw`
CANONICAL COMPONENT GENERATION RULES
Apply these rules to every component description, not just Hero Banner examples.
1. Derive fields, interactions, authoring, empty states, responsive layout, accessibility and data sources from the actual description.
2. Treat the user's description as a compact feature brief, not a complete technical specification. Support arbitrary component types and combinations, not only examples named in this rulebook. Infer the authorable fields, child-resource structure, rendering, states, interactions, responsive behavior, accessibility semantics, and required source assets from the component's intended purpose. The examples elsewhere in this file are reference patterns, never an allowlist or a set of hardcoded implementations.
3. Prefer an appropriate AEM Core Component or proxy component when it covers the requirement. Do not duplicate all OOTB source. Verify/flag unknown resource supertype and Core Component version.
4. Return unique lowerCamelCase field names, user-facing labels, supported types, required flags, options, defaults, roles and nested multifield child schemas.
5. Granite dialog names, JCR property names, Sling Model injection/getters, HTL bindings, component.json and examples must use exactly the same property names.
6. Client libraries must use cq:ClientLibraryFolder, not nt:folder or sling:Folder. css.txt/js.txt live at the clientlib root, with CSS in css/ and JS in js/. HTL category and clientlib metadata must match. Always include the CSS asset and css.txt index for every custom component; do not omit CSS just because it is minimal. If component fields reference DAM images, use the Granite pathbrowser with rootPath=/content/dam and a dedicated image/fileReference field; HTL must render the stored DAM path as an escaped URI and include the matching authored alt text. Do not output a JSON manifest/resource (component.json) as part of direct JCR operations.
7. Source codebase files should include component metadata, dialog source, model-bound HTL, Sling Model Java source where needed, component.json, clientlib definition and indexed CSS/optional JS. Do not write Java or component.json into a direct JCR batch. Direct JCR HTL must be model-free and use properties.*.
8. Use safe HTL contexts, semantic markup, keyboard focus, WCAG 2.2 AA patterns, responsive CSS, reduced-motion support and scoped selectors/JS. Do not expose secrets, customer/project namespaces, connection IDs or localhost URLs in generic source output.
9. Composite multifields must follow Granite UI's composite pattern: the outer multifield uses composite=true, its inner field is a container with the exact stored node name, and child controls use relative property names (for example, name="image", not name="./image") inside each item. Nested multifields must keep every child schema and saved JCR child-node level. The values are child resources, not a flat String[] or a component ValueMap property; model-bound Sling Models can use @ChildResource List<Resource>, but the direct-JCR-compatible HTL path must iterate resource.children, locate the composite container by its exact node name, then iterate container.children and read each child's valueMap. Do not render a composite collection as model.slides or properties.slides on the direct-JCR path, and do not flatten it into String[]. Tabs require tablist/tab/tabpanel semantics, keyboard operation, correct focus and unique IDs. Carousels need controls, accessible status, reduced motion, explicit autoplay policy and reliable image/video empty/error states. Videos must not autoplay with sound.
10. Before returning JSON, validate field parity across dialog, Sling Model, HTL, manifest and operation paths. Never invent endpoints, dependencies or OOTB versions. Distinguish verified absent, occupied and unverifiable repository paths.
11. If a request introduces an uncovered reusable pattern, implement it from first principles and return a ruleSuggestions array with title, appliesTo, rule, reason, validation and examplePattern.
12. Rule suggestions are proposals only. Never auto-append untrusted model output to this file, and do not let model output weaken validation/write safeguards. Maintainers review a proposed rule, merge it into this same file, and add a regression test. This is prompt-backed guidance and deterministic validation, not model-weight training.
13. Reference the official Adobe guides when designing AEM output: Granite composite Multifield API (https://experienceleague.adobe.com/en/tools/aem-api-documentation/6-5/granite-ui/api/jcr_root/libs/granite/ui/components/coral/foundation/form/multifield/index.html), Core Components Carousel (https://experienceleague.adobe.com/en/docs/experience-manager-core-components/using/wcm-components/carousel), proxy components and resourceSuperType (https://experienceleague.adobe.com/en/docs/experience-manager-core-components/using/get-started/using), and AEM client libraries (https://experienceleague.adobe.com/en/docs/experience-manager-65/content/implementing/developing/introduction/clientlibs). Treat the selected AEM/Core Components version as a compatibility constraint, not an assumption.
14. Short descriptions must be sufficient. Do not ask the user to restate obvious implementation details in a long prompt. Infer them from the requested component and features; choose conservative, accessible defaults for unspecified options and note important assumptions in the result. For example, a request mentioning a multifield image carousel implies authorable repeatable slide data, correct nested JCR storage, HTL rendering of each slide and JavaScript/CSS when required by the requested carousel behavior. This is an illustration of the general inference rule, not a dedicated carousel implementation.
15. Generate component-specific implementation code, not just a generic fallback template. AEM field schema, Granite dialog, Sling Model, HTL, CSS, JavaScript, clientlib metadata/indexes and any helper/source files must agree on the actual component behavior. Never claim a requested behavior is implemented unless the generated markup, model/data structure, and required client-side code implement and connect that behavior. If the first response omits or contradicts any required part, correct/retry the response or fail clearly rather than silently substitute an unrelated template.
16. Never return an empty AEM fields schema for a data-driven component. Every content field referenced by model.*, properties.*, or a child resource's valueMap.* in the HTL must be declared in the recursive fields schema, including nested composite-multifield children. Any literal child-group check such as child.name == 'tabs' or child.name == 'slides' must map to a composite multifield with that exact name. Fieldless output is valid only for intentionally structural/static components whose HTL does not bind authored properties or iterate named authored child groups. Do not infer completeness from the presence of an HTML, CSS, or JS file alone.
17. For interactive components, prove the JS is connected to real markup hooks and implements a meaningful state transition—not merely a placeholder click handler or a flag such as dataset.interacted=true. Carousel scripts must identify rendered slides, update which slide is active/visible, and wire actual controls; navigation scripts must wire the emitted toggle hooks, keep aria-expanded synchronized with the open state, and close nested/open panels predictably. The emitted CSS selectors and clientlib indexes must reference the same component and assets.
18. Treat direct-JCR HTL, source HTL, and the recursive authoring schema as three parts of one contract. Validate them before accepting the response; a repair retry must fix the mismatch, not bypass validation by dropping fields or returning generic markup.
`;

export const CREATE_FIELD_TYPES = Object.freeze(['text','textarea','path','select','checkbox','number','richtext','multifield','date','hidden']);
export const CREATE_FIELD_ROLES = Object.freeze(['title','body','image','imageAlt','ctaLabel','ctaLink','alignment','other']);
const TYPE_ALIASES = new Map([['string','text'],['textfield','text'],['text area','textarea'],['pathfield','path'],['dropdown','select'],['boolean','checkbox'],['integer','number'],['rich text','richtext'],['array','multifield']]);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const cleanString = (value) => typeof value === 'string' ? value.trim() : '';
function humanize(value) {
  return cleanString(value).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\w/, (letter) => letter.toUpperCase());
}
export function normalizePropertyName(value) {
  let name = cleanString(value).replace(/^\.\//, '').replace(/[^A-Za-z0-9]+(.)?/g, (_m, next) => next ? next.toUpperCase() : '');
  if (!name) return '';
  name = name[0].toLowerCase() + name.slice(1);
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(name) ? name : '';
}
function inferredRole(name, label, type) {
  const text = (name + ' ' + label).toLowerCase();
  if (/alignment|align/.test(text)) return 'alignment';
  if (/alt text|imagealt/.test(text)) return 'imageAlt';
  if (/(cta|button|link).*(label|text)/.test(text)) return 'ctaLabel';
  if (/(cta|button|link).*(url|href|target)/.test(text)) return 'ctaLink';
  if (type === 'path' && /image|background|asset|media|video/.test(text)) return 'image';
  if (/title|headline|heading/.test(text)) return 'title';
  if (/description|body|copy|content/.test(text) || type === 'textarea' || type === 'richtext') return 'body';
  return 'other';
}
function normalizedOptions(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === 'string'
    ? (item.trim() ? {label:item.trim(),value:item.trim()} : null)
    : (isObject(item) && cleanString(item.label ?? item.text ?? item.value) && cleanString(item.value ?? item.name ?? item.label)
      ? {label:cleanString(item.label ?? item.text ?? item.value),value:cleanString(item.value ?? item.name ?? item.label)} : null)).filter(Boolean);
}
export function normalizeComponentFields(fields, modelRows = []) {
  const explicit = Array.isArray(fields) && fields.length > 0;
  const source = explicit ? fields : (Array.isArray(modelRows) ? modelRows.map((row) => {
    if (!isObject(row)) return row;
    return {
      name: row.name || row.property || row.field,
      label: row.label || row.fieldLabel || row.note || row.field,
      type: row.type, required: row.required, role: row.role, options: row.options,
      children: row.children || row.fields, composite: row.composite,
      minItems: row.minItems, maxItems: row.maxItems, rootPath: row.rootPath,
      defaultValue: row.defaultValue, description: row.description
    };
  }).filter(isObject) : []);

  let total = 0;
  function normalizeList(list, depth = 0) {
    if (!Array.isArray(list)) return [];
    if (depth > 4) throw new Error('Composite multifields can be nested at most four levels deep.');
    const seen = new Set();
    return list.map((field, index) => {
      total++;
      if (total > 80) throw new Error('A component can define at most 80 fields including nested multifield children.');
      if (!isObject(field)) throw new Error('Invalid CMS field at position ' + (index + 1) + '.');
      const name = normalizePropertyName(field.name ?? field.property ?? field.field);
      if (!name) throw new Error('CMS field names must be valid lowerCamelCase properties.');
      if (seen.has(name)) throw new Error('Duplicate CMS field property "' + name + '" in the same field group.');
      seen.add(name);

      const label = cleanString(field.label ?? field.fieldLabel ?? field.title) || humanize(name);
      const rawType = cleanString(field.type).toLowerCase();
      const type = CREATE_FIELD_TYPES.includes(TYPE_ALIASES.get(rawType) || rawType)
        ? (TYPE_ALIASES.get(rawType) || rawType) : 'text';
      const options = normalizedOptions(field.options ?? field.choices);
      if (type === 'select' && options.length === 0) {
        if (/alignment|align/i.test(name)) options.push({ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' });
        else throw new Error('Select field "' + name + '" must define at least one option with a label and value.');
      }

      const childSource = Array.isArray(field.children) ? field.children
        : (Array.isArray(field.fields) ? field.fields : []);
      const children = type === 'multifield' ? normalizeList(childSource, depth + 1) : [];
      const composite = type === 'multifield' && (field.composite === true || children.length > 0);
      if (type === 'multifield' && field.composite === true && children.length === 0) {
        throw new Error('Composite multifield "' + name + '" must define its child fields.');
      }

      const required = field.required === true || String(field.required).toLowerCase() === 'true';
      const requestedRole = cleanString(field.role);
      const role = CREATE_FIELD_ROLES.includes(requestedRole) ? requestedRole : inferredRole(name, label, type);
      const rootPath = type === 'path'
        ? cleanString(field.rootPath) || (/image|asset|file|photo|video|media/i.test(name + ' ' + label) ? '/content/dam' : '/content')
        : '';
      const minRaw = Number(field.minItems);
      const maxRaw = Number(field.maxItems);
      const minItems = type === 'multifield' && Number.isFinite(minRaw) ? Math.max(0, Math.min(100, Math.trunc(minRaw))) : 0;
      const maxItems = type === 'multifield' && Number.isFinite(maxRaw) && maxRaw > 0 ? Math.min(100, Math.trunc(maxRaw)) : 20;
      if (type === 'multifield' && minItems > maxItems) throw new Error('Multifield "' + name + '" has minItems greater than maxItems.');

      return {
        name, label, type, required, role, options, rootPath,
        composite, children, minItems, maxItems,
        defaultValue: field.defaultValue == null ? '' : String(field.defaultValue),
        description: cleanString(field.description)
      };
    });
  }

  const normalized = normalizeList(source);
  if (normalized.length === 0) throw new Error('The component must define at least one content field.');
  return normalized;
}
export function normalizeComponentGroup(value) {
  const group = cleanString(value).replace(/\s+/g, ' ');
  return /^[A-Za-z0-9][A-Za-z0-9 .&()/_-]{0,98}$/.test(group) ? group : 'Content';
}

/** Extract only an explicitly requested component group from the user's brief. */
export function normalizeClientlibCategory(value) {
  const category = cleanString(value);
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(category) ? category : '';
}

/** Extract an explicitly supplied clientlib category from ordinary requirement language. */
export function extractRequestedClientlibCategory(description) {
  const text = cleanString(description);
  const patterns = [
    /\bclient[ -]?lib(?:rary)?(?:\s+category)?\s*(?::|=|\bis\b|\bshould\s+be\b)\s*([A-Za-z0-9][A-Za-z0-9._-]{0,199})/i,
    /\buse\s+([A-Za-z0-9][A-Za-z0-9._-]{0,199})\s+as\s+(?:the\s+)?client[ -]?lib(?:rary)?\s+category\b/i,
    /\b(?:keep|preserve|use|set)\s+(?:the\s+)?client[ -]?lib(?:rary)?\s+category\s+(?:exactly\s+)?(?:as\s+)?([A-Za-z0-9][A-Za-z0-9._-]{0,199})\b/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return normalizeClientlibCategory(match[1].replace(/[.,;]+$/, ''));
  }
  return '';
}

export function isAccordionBrief(description) {
  const text = cleanString(description);
  const namedAccordion = /\baccordion\b/i.test(text);
  const interactiveFaq = /\b(?:faq|frequently asked questions)\b/i.test(text) &&
    /\b(?:click|expand|collapse|toggle|show|hide|open|close)\b/i.test(text);
  return namedAccordion || interactiveFaq;
}

export function isRepeatableTabsBrief(description) {
  const text = cleanString(description);
  const mentionsTabs = /\btabs?\b/i.test(text);
  const explicitRepeatable = /\b(?:multi[\s-]?field|multifiled|composite|repeatable)\b/i.test(text);
  const asksForMultiple = /\b(?:multiple|many|several|as many|add|remove|reorder|rearrange|manage)\b.{0,40}\btabs?\b|\btabs?\b.{0,40}\b(?:multiple|many|several|as many|add|remove|reorder|rearrange|manage)\b/i.test(text);
  return mentionsTabs && (explicitRepeatable || asksForMultiple);
}

export function defaultClientlibCategory(componentName) {
  const component = cleanString(componentName)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'component';
  return 'site.components.' + component.replace(/-([a-z0-9])/g, (_match, letter) => letter.toUpperCase());
}

export function extractRequestedComponentGroup(description) {
  const text = cleanString(description);
  const patterns = [
    /\bcomponent\s+group\s*(?::|=|\bis\b|\bshould\s+be\b|\bto\b)\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9][A-Za-z0-9 .&()/_-]{0,98}?))(?=\s*(?:[.;,\n]|$))/i,
    /\b(?:put|place|add|assign|move)\b.{0,60}\b(?:in|into|under|to)\s+(?:the\s+)?["']?([A-Za-z0-9][A-Za-z0-9 .&()/_-]{0,98}?)["']?\s+(?:component\s+)?group\b/i,
    /\bgroup\s+(?:should\s+be|is|to)\s+(?:the\s+)?["']?([A-Za-z0-9][A-Za-z0-9 .&()/_-]{0,98}?)["']?(?=\s*(?:[.;,\n]|$))/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const requested = match[1] || match[2] || match[3] || '';
    if (requested) return normalizeComponentGroup(requested);
  }
  return '';
}

export function normalizeRuleSuggestions(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.slice(0,8).flatMap((item) => {
    if (!isObject(item)) return [];
    const suggestion = {title:cleanString(item.title),appliesTo:cleanString(item.appliesTo),rule:cleanString(item.rule),
      reason:cleanString(item.reason),validation:cleanString(item.validation),examplePattern:cleanString(item.examplePattern)};
    if (!suggestion.title || !suggestion.appliesTo || !suggestion.rule || !suggestion.validation) return [];
    const key=(suggestion.title+'|'+suggestion.rule).toLowerCase();
    if(seen.has(key)) return [];
    seen.add(key); return [suggestion];
  });
}


/** Canonical safe Sling resource-type normalizer for requested proxy components. */
export function normalizeResourceSuperType(value) {
  let resourceType = cleanString(value).replaceAll('\\', '/').replace(/^\/+/, '');
  if (resourceType.startsWith('apps/')) resourceType = resourceType.slice('apps/'.length);
  const segments = resourceType.split('/');
  if (!resourceType || resourceType.length > 240 || segments.length < 2 ||
      segments.some((segment) => !/^[A-Za-z0-9._-]+$/.test(segment) || segment === '.' || segment === '..')) {
    return '';
  }
  return resourceType;
}
