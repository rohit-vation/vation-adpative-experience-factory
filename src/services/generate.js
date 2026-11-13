/**
 * API-backed generation service.
 * Completes the shared AEM scaffolding while preserving the AI-authored implementation.
 * There is intentionally no per-component-name renderer here: the field schema and generated
 * HTL/CSS/JS/Java sources describe the requested component.
 */
import { aiState, generateWithAI, providerLabel } from '../ai/ai-client.js';
import { aemFiles } from '../data/implementations/aem.js';
import { camel } from '../lib/text.js';
import { defaultClientlibCategory } from '../ai/system-prompt.js';

function basename(path) {
  return String(path || '').replaceAll('\\', '/').split('/').filter(Boolean).pop() || '';
}

function safeRelativePath(rawPath) {
  const path = String(rawPath || '').replaceAll('\\', '/').replace(/^\/+/, '');
  const parts = path.split('/');
  if (!path || path.length > 240 || parts.some((part) => !part || part === '.' || part === '..') ||
      !/^[A-Za-z0-9._/-]+$/.test(path)) return '';
  return path;
}

function fileExtension(file) {
  const extension = basename(file?.name).split('.').pop()?.toLowerCase() || '';
  const lang = String(file?.lang || '').toLowerCase();
  if (['htl', 'html', 'xhtml'].includes(lang) || ['html', 'htm', 'htl'].includes(extension)) return 'html';
  if (lang === 'css' || extension === 'css') return 'css';
  if (['js', 'javascript', 'mjs'].includes(lang) || ['js', 'mjs'].includes(extension)) return 'js';
  if (lang === 'java' || extension === 'java') return 'java';
  return extension;
}

function isProxyOnly(implementation) {
  return implementation?.proxyComponent === true &&
    Array.isArray(implementation.fields) && implementation.fields.length === 0;
}

function normalizedGeneratedPath(file, component) {
  const sourcePath = safeRelativePath(file?.name);
  if (!sourcePath) return '';
  const extension = fileExtension(file);
  if (['css', 'js'].includes(extension)) {
    const assetFolder = extension === 'css' ? 'css' : 'js';
    return 'apps/site/components/' + component + '/clientlib/' + assetFolder + '/' + basename(sourcePath).replace(/\.(?:mjs|js|css)$/i, '') + (extension === 'css' ? '.css' : '.js');
  }
  if (extension === 'html') {
    if (sourcePath.startsWith('apps/site/components/' + component + '/')) return sourcePath;
    return 'apps/site/components/' + component + '/' + basename(sourcePath).replace(/\.(?:htm|html|htl)$/i, '') + '.html';
  }
  if (extension === 'java' && !sourcePath.includes('/')) return 'core/models/' + basename(sourcePath);
  return sourcePath;
}

function normalizeClientlibTemplate(markup) {
  const templatePath = '/libs/granite/sightly/templates/clientlib.html';
  let output = String(markup || '');
  // Remove invented clientlib.all calls; use explicit CSS and JS includes only.
  output = output.replace(/<sly\b(?=[^>]*data-sly-call=["']\$\{clientlib\.all\b)[^>]*>(?:\s*<\/sly>)?/gi, '');
  // AI output may invent a helper path. Replace declarations with one canonical helper.
  output = output.replace(/data-sly-use\.clientlib\s*=\s*(["'])[^"']*\1/gi, '');
  if (!/data-sly-use\.clientlib\s*=/.test(output)) {
    output = '<sly data-sly-use.clientlib="' + templatePath + '"/>\n' + output.trimStart();
  }
  return output;
}

function insertClientlibInclude(markup, helper, category) {
  const escapedCategory = String(category).replaceAll("'", "\\'");
  const call = '<sly data-sly-call="' + '$' + "{clientlib." + helper + " @ categories='" + escapedCategory + "'}" + '"></sly>';
  let output = normalizeClientlibTemplate(markup);
  if (new RegExp('clientlib\\.' + helper + '\\s*@').test(output)) {
    return output.replace(/(clientlib\.(?:css|js)\s*@\s*categories\s*=\s*['"])[^'"]+(['"])/g, '$1' + category + '$2');
  }
  if (helper === 'css') {
    const openingTag = /<(?:section|div|article|main|ul|ol|form|nav|header|footer)\b/i;
    return openingTag.test(output) ? output.replace(openingTag, call + '\n$&') : output + '\n' + call;
  }
  return output + '\n' + call;
}
/**
 * Produce the full AEM source file set from the recursive field contract plus the AI-authored
 * implementation files. Shared scaffolding is generated deterministically; component behavior is
 * kept from the model rather than selected by a component-name switch.
 */
export function ensureCompleteAemFiles(data, input) {
  if (input?.cms !== 'aem' || !data?.implementations?.aem) return data;

  const implementation = data.implementations.aem;
  const aiFiles = Array.isArray(implementation.files) ? implementation.files : [];
  const requestedProxy = implementation.proxyComponent === true;
  const component = camel(input.name);
  const canonicalFiles = aemFiles(input.name, Array.isArray(implementation.fields) ? implementation.fields : [], input.description, {
    proxyComponent: requestedProxy,
    resourceSuperType: implementation.resourceSuperType,
    componentGroup: implementation.componentGroup,
    clientlibCategory: implementation.clientlibCategory
  });
  const manifestFile = canonicalFiles.find((file) => /\/component\.json$/i.test(file.name));
  const manifest = manifestFile ? JSON.parse(manifestFile.code) : null;
  const effectiveFields = Array.isArray(manifest?.fields) ? manifest.fields : (Array.isArray(implementation.fields) ? implementation.fields : []);

  if (isProxyOnly({ ...implementation, fields: effectiveFields })) {
    return {
      ...data,
      implementations: {
        ...data.implementations,
        aem: { ...implementation, fields: effectiveFields, files: canonicalFiles }
      }
    };
  }

  const html = canonicalFiles.find((file) => file.lang === 'htl' || /\.html?$/i.test(file.name));
  const css = canonicalFiles.find((file) => file.lang === 'css' || /\.css$/i.test(file.name));
  const java = canonicalFiles.find((file) => file.lang === 'java' || /\.java$/i.test(file.name));

  const htmlFiles = aiFiles.filter((file) => fileExtension(file) === 'html');
  const cssFiles = aiFiles.filter((file) => fileExtension(file) === 'css');
  const jsFiles = aiFiles.filter((file) => fileExtension(file) === 'js');
  const javaFiles = aiFiles.filter((file) => fileExtension(file) === 'java');

  const preferredHtml = htmlFiles.find((file) => basename(file.name).toLowerCase() === component.toLowerCase() + '.html' ||
    basename(file.name).toLowerCase() === component.toLowerCase() + '.htl') || htmlFiles[0];
  if (html && preferredHtml?.code?.trim()) html.code = preferredHtml.code;
  if (css && cssFiles[0]?.code?.trim()) css.code = cssFiles[0].code;

  // If the AI supplied the canonical Sling Model, preserve it. Additional models/helpers stay in
  // the output rather than being discarded just because the scaffold has a default model.
  if (java && javaFiles.length) {
    const matchingModel = javaFiles.find((file) => basename(file.name).toLowerCase() === basename(java.name).toLowerCase());
    if (matchingModel?.code?.trim()) java.code = matchingModel.code;
  }

  const usedNames = new Set(canonicalFiles.map((file) => file.name));
  const extras = [];
  const addExtra = (name, lang, code) => {
    const safeName = safeRelativePath(name);
    if (!safeName || usedNames.has(safeName) || !String(code || '').trim()) return;
    usedNames.add(safeName);
    extras.push({ name: safeName, lang: lang || fileExtension({ name: safeName }), code: String(code) });
  };

  // Preserve additional HTML fragments, CSS modules, JS modules, Sling Models, services and
  // supporting source files, mapping loose asset filenames into the expected clientlib folders.
  let firstHtmlUsed = false;
  for (const file of htmlFiles) {
    if (!firstHtmlUsed && file === preferredHtml) { firstHtmlUsed = true; continue; }
    const normalized = normalizedGeneratedPath(file, component);
    addExtra(normalized, 'htl', file.code);
  }
  cssFiles.slice(1).forEach((file) => addExtra(normalizedGeneratedPath(file, component), 'css', file.code));
  jsFiles.forEach((file, index) => {
    const desired = index === 0
      ? 'apps/site/components/' + component + '/clientlib/js/' + component + '.js'
      : normalizedGeneratedPath(file, component);
    addExtra(desired, 'js', file.code);
  });
  javaFiles.forEach((file) => {
    const matched = java && basename(file.name).toLowerCase() === basename(java.name).toLowerCase();
    if (matched) return;
    addExtra(normalizedGeneratedPath(file, component), 'java', file.code);
  });

  for (const file of aiFiles) {
    const extension = fileExtension(file);
    if (['html', 'css', 'js', 'java'].includes(extension) ||
        /\/component\.json$/i.test(String(file?.name || '')) ||
        /(^|\/)\.content\.xml$/i.test(String(file?.name || '')) ||
        /(^|\/)css\.txt$/i.test(String(file?.name || '')) ||
        /(^|\/)js\.txt$/i.test(String(file?.name || ''))) continue;
    addExtra(safeRelativePath(file.name), file.lang, file.code);
  }

  const category = implementation.clientlibCategory || defaultClientlibCategory(input.name);
  if (html) {
    html.code = insertClientlibInclude(html.code, 'css', category);
    if (jsFiles.length || extras.some((file) => /\/clientlib\/js\/[^/]+\.js$/i.test(file.name))) {
      html.code = insertClientlibInclude(html.code, 'js', category);
    }
  }

  const clientlibPrefix = 'apps/site/components/' + component + '/clientlib/';
  const cssIndex = canonicalFiles.find((file) => file.name === clientlibPrefix + 'css.txt');
  const cssAssets = canonicalFiles.concat(extras)
    .filter((file) => file.name.startsWith(clientlibPrefix + 'css/') && /\.css$/i.test(file.name))
    .map((file) => basename(file.name)).sort((a, b) => a.localeCompare(b));
  if (cssIndex) cssIndex.code = ['#base=css', ...cssAssets].join('\n') + '\n';

  const jsAssets = canonicalFiles.concat(extras)
    .filter((file) => file.name.startsWith(clientlibPrefix + 'js/') && /\.js$/i.test(file.name))
    .map((file) => basename(file.name)).sort((a, b) => a.localeCompare(b));
  const jsIndexPath = clientlibPrefix + 'js.txt';
  const existingJsIndex = canonicalFiles.find((file) => file.name === jsIndexPath);
  if (jsAssets.length) {
    if (existingJsIndex) existingJsIndex.code = ['#base=js', ...jsAssets].join('\n') + '\n';
    else canonicalFiles.push({ name: jsIndexPath, lang: 'txt', code: ['#base=js', ...jsAssets].join('\n') + '\n' });
  }

  return {
    ...data,
    implementations: {
      ...data.implementations,
      aem: { ...implementation, fields: effectiveFields, files: canonicalFiles.concat(extras) }
    }
  };
}

export async function generate(workflow, input, onStep) {
  if (!aiState.enabled) {
    throw new Error('AI API is required. Configure a valid provider API key on the server before generating.');
  }
  onStep('Requesting ' + providerLabel() + ' (' + aiState.model + ') through the provider API.');
  const data = await generateWithAI(workflow.id, input);
  return { ...ensureCompleteAemFiles(data, input), _source: 'ai' };
}
