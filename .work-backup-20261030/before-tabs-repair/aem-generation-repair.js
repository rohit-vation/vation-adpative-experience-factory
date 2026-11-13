/**
 * Deterministic repair for AEM component contracts before strict validation.
 * The model remains responsible for authored behavior; this repairs schema-derived structure.
 */
import { aemFiles } from '../data/implementations/aem.js';
import {
  extractRequestedComponentGroup,
  normalizeComponentFields,
  normalizeComponentGroup,
} from '../ai/system-prompt.js';

const CMS_IDS = ['aem', 'eds', 'cf', 'opti'];

function flattenFields(fields, parent = '') {
  return (Array.isArray(fields) ? fields : []).flatMap((field) => {
    const property = parent ? parent + '.' + field.name : field.name;
    const entry = { ...field, property };
    const childParent = field.type === 'multifield' && field.composite === true ? property + '[]' : property;
    return [entry, ...flattenFields(field.children, childParent)];
  });
}

function pascalPropertyPath(value) {
  return String(value).split('.').map((segment) => {
    const arraySuffix = segment.endsWith('[]') ? '[]' : '';
    const name = arraySuffix ? segment.slice(0, -2) : segment;
    return name.charAt(0).toUpperCase() + name.slice(1) + arraySuffix;
  }).join('.');
}

function nativeFieldType(cms, field) {
  const isImage = field.role === 'image' || /image|asset|photo|media|video/i.test(field.name + ' ' + field.label);
  const isLink = field.role === 'ctaLink' || /url|href|link/i.test(field.name + ' ' + field.label);
  const type = field.type;
  const mappings = {
    aem: {
      text: 'String', textarea: 'String', path: isImage ? 'DAM path' : 'Repository path',
      select: 'String', checkbox: 'Boolean', number: 'Long', richtext: 'Rich Text',
      multifield: field.composite ? 'List<Resource>' : 'String[]', date: 'Date', hidden: 'String',
    },
    eds: {
      text: 'text', textarea: 'text', path: isImage ? 'image' : isLink ? 'link' : 'path',
      select: 'select', checkbox: 'boolean', number: 'number', richtext: 'richtext',
      multifield: field.composite ? 'Array of objects' : 'Array', date: 'date', hidden: 'hidden',
    },
    cf: {
      text: 'Symbol', textarea: 'Text', path: isImage ? 'Asset link' : isLink ? 'Symbol (URL)' : 'Symbol',
      select: 'Symbol', checkbox: 'Boolean', number: 'Number', richtext: 'RichText',
      multifield: field.composite ? 'Array of objects' : 'Array', date: 'Date', hidden: 'Symbol',
    },
    opti: {
      text: 'string', textarea: 'XhtmlString', path: isImage ? 'ContentReference' : isLink ? 'Url' : 'string',
      select: 'SelectOne', checkbox: 'bool', number: 'int', richtext: 'XhtmlString',
      multifield: field.composite ? 'ContentArea list' : 'string[]', date: 'DateTime', hidden: 'string',
    },
  };
  return mappings[cms]?.[type] || 'string';
}

function modelRowsFor(cms, fields) {
  return fields.map((field) => ({
    field: cms === 'opti' ? pascalPropertyPath(field.property) : field.property,
    type: nativeFieldType(cms, field),
    note: field.label || field.name,
  }));
}

function canonicalHtlFile(canonicalFiles) {
  return canonicalFiles.find((file) => file.lang === 'htl' || /\.html?$/i.test(file.name));
}

function ensureSourceHtlModelUse(implementation, canonicalFiles) {
  const htmlFile = (implementation.files || []).find((file) =>
    file && (file.lang === 'htl' || /\.(?:html?|htl)$/i.test(file.name || '')));
  const canonicalHtml = canonicalHtlFile(canonicalFiles);
  const modelClass = canonicalHtml?.code?.match(/data-sly-use\.model\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!htmlFile || !modelClass || !/\$\{model\./.test(String(htmlFile.code || ''))) return;
  let source = String(htmlFile.code);
  const declaration = 'data-sly-use.model="' + modelClass + '"';
  source = source.replace(/data-sly-use\.model\s*=\s*(["'])[^"']*\1/gi, declaration);
  if (!/data-sly-use\.model\s*=/.test(source)) {
    source = '<sly ' + declaration + '/>\n' + source.trimStart();
  }
  htmlFile.code = source;
}

function directJcrMarkupFromCanonical(canonicalFiles) {
  const html = canonicalHtlFile(canonicalFiles);
  if (!html?.code) return '';
  return String(html.code)
    .replace(/data-sly-use\.model\s*=\s*(["'])[^"']*\1\s*/gi, '')
    .replace(/\$\{model\.([A-Za-z][A-Za-z0-9_]*)/g, (_match, name) => '$' + '{properties.' + name);
}

function hasValidDirectJcrMarkup(markup, composites) {
  const source = String(markup || '');
  return !/data-sly-use\.model|\bmodel\./.test(source) &&
    source.includes('resource.children') &&
    (source.includes('valueMap') || /\bproperties\./.test(source)) &&
    composites.every((field) => new RegExp("\\.name\\s*={2,3}\\s*['\"]" + field.name + "['\"]").test(source));
}

export function repairAemGenerationResponse(data, input) {
  if (input?.cms !== 'aem' || !data?.implementations || typeof data.implementations !== 'object') return data;

  const implementations = { ...data.implementations };
  const implementation = { ...(implementations.aem || {}) };
  const requestedGroup = extractRequestedComponentGroup(input.description);
  implementation.componentGroup = requestedGroup || normalizeComponentGroup(implementation.componentGroup);

  if (implementation.proxyComponent === true && Array.isArray(implementation.fields) && implementation.fields.length === 0) {
    implementations.aem = implementation;
    for (const cms of CMS_IDS.filter((id) => id !== 'aem')) {
      implementations[cms] = { ...(implementations[cms] || {}), files: [] };
    }
    return { ...data, implementations };
  }

  if ((!Array.isArray(implementation.fields) || implementation.fields.length === 0) &&
      (!Array.isArray(implementation.model) || implementation.model.length === 0)) {
    implementations.aem = implementation;
    for (const cms of CMS_IDS.filter((id) => id !== 'aem')) {
      implementations[cms] = { ...(implementations[cms] || {}), files: [] };
    }
    return { ...data, implementations };
  }

  const fields = normalizeComponentFields(implementation.fields, implementation.model);
  implementation.fields = fields;
  implementation.files = (Array.isArray(implementation.files) ? implementation.files : []).map((file) => ({ ...file }));
  const flatFields = flattenFields(fields);
  const canonicalFiles = aemFiles(input.name, fields, input.description, {
    componentGroup: implementation.componentGroup,
    proxyComponent: false,
  });
  ensureSourceHtlModelUse(implementation, canonicalFiles);

  // Cross-CMS content models are structural mappings, not duplicate implementations.
  // Preserve complete AI mappings; deterministically fill any missing or incomplete target.
  for (const cms of CMS_IDS) {
    const target = { ...(implementations[cms] || {}) };
    const expectedRows = modelRowsFor(cms, flatFields);
    const rows = Array.isArray(target.model) ? target.model.filter((row) => row && row.field && row.type) : [];
    const actualNames = new Set(rows.map((row) => String(row.field)));
    const hasCompleteCoverage = expectedRows.every((row) => actualNames.has(row.field));
    if (rows.length !== expectedRows.length || !hasCompleteCoverage) target.model = expectedRows;
    if (cms !== 'aem') target.files = [];
    else implementation.model = target.model;
    implementations[cms] = cms === 'aem' ? implementation : target;
  }

  const composites = flatFields.filter((field) => field.type === 'multifield' && field.composite === true);
  if (composites.length) {
    const currentDirect = String(implementation.directJcrHtl || '').trim();
    if (!hasValidDirectJcrMarkup(currentDirect, composites)) {
      implementation.directJcrHtl = directJcrMarkupFromCanonical(canonicalFiles);
    }
  }

  implementations.aem = implementation;
  return { ...data, implementations };
}
