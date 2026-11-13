/**
 * Deterministic repair for AEM component contracts before strict validation.
 * The model remains responsible for authored behavior; this repairs schema-derived structure.
 */
import { aemFiles } from '../data/implementations/aem.js';
import {
  extractRequestedComponentGroup,
  extractRequestedClientlibCategory,
  defaultClientlibCategory,
  normalizeComponentFields,
  normalizeComponentGroup,
  normalizeClientlibCategory,
  isRepeatableTabsBrief,
  isAccordionBrief,
} from '../ai/system-prompt.js';

const CMS_IDS = ['aem', 'eds', 'cf', 'opti'];

function compositesMissingFromMarkup(fields, markup) {
  const source = String(markup || '');
  const composites = (Array.isArray(fields) ? fields : []).flatMap((field) => [
    ...(field?.type === 'multifield' && field.composite === true ? [field.name] : []),
    ...compositesFromChildren(field?.children),
  ]);
  return composites.some((name) => !source.includes("'" + name + "'") && !source.includes('"' + name + '"') &&
    !source.includes('model.' + name) && !source.includes('resource.children'));
}
function compositesFromChildren(fields) {
  return (Array.isArray(fields) ? fields : []).flatMap((field) => [
    ...(field?.type === 'multifield' && field.composite === true ? [field.name] : []),
    ...compositesFromChildren(field?.children),
  ]);
}

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


function isTabsBrief(input) {
  const brief = String(input?.name || '') + ' ' + String(input?.description || '');
  return /\btabbed\b/i.test(brief) || isRepeatableTabsBrief(brief);
}

function defaultTabsField() {
  return {
    name: 'tabs', label: 'Tabs', type: 'multifield', required: true,
    role: 'other', composite: true,
    children: [
      { name: 'tabTitle', label: 'Tab Title', type: 'text', required: true, role: 'title' },
      { name: 'tabContent', label: 'Tab Content', type: 'richtext', required: true, role: 'body' }
    ]
  };
}

function resolveTabsFields(fields) {
  const candidates = (Array.isArray(fields) ? fields : []).filter((field) =>
    field?.type === 'multifield' && field.composite === true);
  const tabs = candidates.find((field) => /\btabs?\b/i.test(field.name + ' ' + field.label)) || candidates[0];
  if (!tabs) return null;
  const children = Array.isArray(tabs.children) ? tabs.children : [];
  const title = children.find((field) => field.role === 'title') ||
    children.find((field) => /\b(?:tab)?(?:title|label|heading|name)\b/i.test(field.name + ' ' + field.label));
  const content = children.find((field) => field.role === 'body') ||
    children.find((field) => field.type === 'richtext') ||
    children.find((field) => /\b(?:content|body|description|text)\b/i.test(field.name + ' ' + field.label));
  return title && content ? { group: tabs.name, title: title.name, content: content.name, contentType: content.type } : null;
}

function kebabCase(value) {
  return String(value || '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function buildTabsSources(fields, canonicalFiles, clientlibCategory) {
  const contract = resolveTabsFields(fields);
  if (!contract) return null;
  const E = '$' + '{';
  const X = '}';
  const H = (expression) => E + expression + X;
  const canonicalHtml = canonicalHtlFile(canonicalFiles);
  const componentKey = String(canonicalHtml?.name || '').split('/').pop().replace(/\.(?:html?|htl)$/i, '') || 'dynamicTabs';
  const cssKey = kebabCase(componentKey);
  const modelClass = canonicalHtml?.code?.match(/data-sly-use\.model\s*=\s*["']([^"']+)["']/i)?.[1] ||
    'com.example.site.core.models.' + componentKey.charAt(0).toUpperCase() + componentKey.slice(1) + 'Model';
  const category = clientlibCategory;
  const group = contract.group;
  const title = contract.title;
  const content = contract.content;
  const contentContext = contract.contentType === 'richtext' ? " @ context='html'" : '';
  const sourceHtl = [
    '<sly data-sly-use.clientlib="/libs/granite/sightly/templates/clientlib.html"/>',
    '<sly data-sly-use.model="' + modelClass + '"/>',
    '<sly data-sly-call="' + H("clientlib.css @ categories='" + category + "'") + '"></sly>',
    '<sly data-sly-call="' + H("clientlib.js @ categories='" + category + "'") + '"></sly>',
    '<div class="cmp-' + cssKey + '" data-cmp-is="tabs" data-sly-test="' + H('model.' + group) + '">',
    '  <div class="cmp-' + cssKey + '__tablist" role="tablist" aria-label="Content tabs">',
    '    <sly data-sly-list.tab="' + H('model.' + group) + '">',
    '      <button type="button" class="cmp-' + cssKey + '__tab" role="tab" id="' + H('resource.path') + '-tab-' + H('tabList.index') + '" aria-controls="' + H('resource.path') + '-panel-' + H('tabList.index') + '" aria-selected="' + H("tabList.first ? 'true' : 'false'") + '" tabindex="' + H("tabList.first ? '0' : '-1'") + '">' + H('tab.valueMap.' + title) + '</button>',
    '    </sly>',
    '  </div>',
    '  <div class="cmp-' + cssKey + '__panels">',
    '    <sly data-sly-list.tab="' + H('model.' + group) + '">',
    '      <section class="cmp-' + cssKey + '__tabpanel" role="tabpanel" id="' + H('resource.path') + '-panel-' + H('tabList.index') + '" aria-labelledby="' + H('resource.path') + '-tab-' + H('tabList.index') + '" tabindex="0" data-sly-attribute.hidden="' + H('!tabList.first') + '">',
    '        <div class="cmp-' + cssKey + '__panel-content">' + H('tab.valueMap.' + content + contentContext) + '</div>',
    '      </section>',
    '    </sly>',
    '  </div>',
    '</div>'
  ].join('\n');

  const directJcrHtl = [
    '<sly data-sly-use.clientlib="/libs/granite/sightly/templates/clientlib.html"/>',
    '<sly data-sly-call="' + H("clientlib.css @ categories='" + category + "'") + '"></sly>',
    '<sly data-sly-call="' + H("clientlib.js @ categories='" + category + "'") + '"></sly>',
    '<sly data-sly-list.tabsGroup="' + H('resource.children') + '">',
    '  <sly data-sly-test="' + H("tabsGroup.name == '" + group + "'") + '">',
    '    <div class="cmp-' + cssKey + '" data-cmp-is="tabs">',
    '      <div class="cmp-' + cssKey + '__tablist" role="tablist" aria-label="Content tabs">',
    '        <sly data-sly-list.tab="' + H('tabsGroup.children') + '">',
    '          <button type="button" class="cmp-' + cssKey + '__tab" role="tab" id="' + H('resource.path') + '-tab-' + H('tabList.index') + '" aria-controls="' + H('resource.path') + '-panel-' + H('tabList.index') + '" aria-selected="' + H("tabList.first ? 'true' : 'false'") + '" tabindex="' + H("tabList.first ? '0' : '-1'") + '">' + H('tab.valueMap.' + title) + '</button>',
    '        </sly>',
    '      </div>',
    '      <div class="cmp-' + cssKey + '__panels">',
    '        <sly data-sly-list.panelTab="' + H('tabsGroup.children') + '">',
    '          <section class="cmp-' + cssKey + '__tabpanel" role="tabpanel" id="' + H('resource.path') + '-panel-' + H('panelTabList.index') + '" aria-labelledby="' + H('resource.path') + '-tab-' + H('panelTabList.index') + '" tabindex="0" data-sly-attribute.hidden="' + H('!panelTabList.first') + '">',
    '            <div class="cmp-' + cssKey + '__panel-content">' + H('panelTab.valueMap.' + content + contentContext) + '</div>',
    '          </section>',
    '        </sly>',
    '      </div>',
    '    </div>',
    '  </sly>',
    '</sly>'
  ].join('\n');

  const js = [
    '(function () {',
    "  'use strict';",
    '  var selector = \'[data-cmp-is="tabs"]\';',
    '  function owned(root, childSelector) {',
    '    return Array.prototype.filter.call(root.querySelectorAll(childSelector), function (node) {',
    '      return node.closest(selector) === root;',
    '    });',
    '  }',
    '  function initialize(root) {',
    '    if (root.getAttribute("data-tabs-initialized") === "true") return;',
    '    root.setAttribute("data-tabs-initialized", "true");',
    '    var tabs = owned(root, \'[role="tab"]\');',
    '    var panels = owned(root, \'[role="tabpanel"]\');',
    '    if (!tabs.length || !panels.length) return;',
    '    function activate(tab, moveFocus) {',
    '      var panelId = tab.getAttribute("aria-controls");',
    '      tabs.forEach(function (item) {',
    '        var selected = item === tab;',
    '        item.setAttribute("aria-selected", selected ? "true" : "false");',
    '        item.tabIndex = selected ? 0 : -1;',
    '      });',
    '      panels.forEach(function (panel) { panel.hidden = panel.id !== panelId; });',
    '      if (moveFocus) tab.focus();',
    '    }',
    '    tabs.forEach(function (tab, index) {',
    '      tab.addEventListener("click", function () { activate(tab, false); });',
    '      tab.addEventListener("keydown", function (event) {',
    '        var next = index;',
    '        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;',
    '        else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;',
    '        else if (event.key === "Home") next = 0;',
    '        else if (event.key === "End") next = tabs.length - 1;',
    '        else return;',
    '        event.preventDefault();',
    '        activate(tabs[next], true);',
    '      });',
    '    });',
    '    var initiallySelected = tabs.find(function (tab) { return tab.getAttribute("aria-selected") === "true"; }) || tabs[0];',
    '    activate(initiallySelected, false);',
    '  }',
    '  function initializeAll() { document.querySelectorAll(selector).forEach(initialize); }',
    '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeAll);',
    '  else initializeAll();',
    '})();'
  ].join('\n');

  const css = [
    '.cmp-' + cssKey + ' { width: 100%; }',
    '.cmp-' + cssKey + '__tablist { display: flex; flex-wrap: wrap; gap: var(--tabs-gap, 0.5rem); margin: 0; padding: 0; border-bottom: 1px solid var(--tabs-border-color, currentColor); }',
    '.cmp-' + cssKey + '__tab { appearance: none; border: 0; border-bottom: 3px solid transparent; margin: 0 0 -1px; padding: 0.75rem 1rem; background: transparent; color: inherit; font: inherit; cursor: pointer; }',
    '.cmp-' + cssKey + '__tab[aria-selected="true"] { border-bottom-color: var(--tabs-active-color, currentColor); font-weight: 700; }',
    '.cmp-' + cssKey + '__tab:focus-visible, .cmp-' + cssKey + '__tabpanel:focus-visible { outline: 2px solid var(--tabs-focus-color, currentColor); outline-offset: 3px; }',
    '.cmp-' + cssKey + '__tabpanel[hidden] { display: none !important; }',
    '.cmp-' + cssKey + '__tabpanel { padding: 1rem 0; }',
    '@media (max-width: 40rem) { .cmp-' + cssKey + '__tablist { flex-wrap: nowrap; overflow-x: auto; } .cmp-' + cssKey + '__tab { flex: 0 0 auto; } }'
  ].join('\n');

  return {
    sourceHtl, directJcrHtl, js, css,
    htmlName: canonicalHtml?.name || componentKey + '.html',
    jsName: 'clientlib/js/' + componentKey + '.js',
    cssName: 'clientlib/css/' + componentKey + '.css'
  };
}

function applyTabsRepair(implementation, input, fields, canonicalFiles) {
  if (!isTabsBrief(input)) return;
  const sources = buildTabsSources(fields, canonicalFiles, implementation.clientlibCategory);
  if (!sources) return;
  const files = Array.isArray(implementation.files) ? implementation.files : [];
  let htmlFile = files.find((file) => file && (file.lang === 'htl' || /\.(?:html?|htl)$/i.test(file.name || '')));
  if (!htmlFile) {
    htmlFile = { name: sources.htmlName, lang: 'htl', code: sources.sourceHtl };
    files.push(htmlFile);
  } else {
    htmlFile.code = sources.sourceHtl;
    htmlFile.lang = 'htl';
  }
  const upsertAsset = (extension, name, code) => {
    const file = files.find((file) => file && (file.lang === extension || new RegExp('\\.' + extension + '$', 'i').test(file.name || '')));
    if (file) {
      file.name = name;
      file.lang = extension;
      file.code = code;
    } else files.push({ name, lang: extension, code });
  };
  upsertAsset('js', sources.jsName, sources.js);
  upsertAsset('css', sources.cssName, sources.css);
  implementation.files = files;
  implementation.directJcrHtl = sources.directJcrHtl;
}


function defaultAccordionField() {
  return {
    name: 'questions', label: 'Questions', type: 'multifield', required: true,
    role: 'other', composite: true,
    children: [
      { name: 'question', label: 'Question', type: 'text', required: true, role: 'title' },
      { name: 'answer', label: 'Answer', type: 'richtext', required: true, role: 'body' }
    ]
  };
}


function resolveAccordionFields(fields) {
  const groups = (Array.isArray(fields) ? fields : []).filter((field) =>
    field?.type === 'multifield' && field.composite === true);
  const group = groups.find((field) => /\b(?:faq|items|questions|accordion|entries)\b/i.test(field.name + ' ' + field.label)) || groups[0];
  if (!group) return null;
  const children = Array.isArray(group.children) ? group.children : [];
  const question = children.find((field) => field.role === 'title') ||
    children.find((field) => /\b(?:question|prompt|title|heading|label)\b/i.test(field.name + ' ' + field.label));
  const answer = children.find((field) => field.role === 'body') ||
    children.find((field) => field.type === 'richtext') ||
    children.find((field) => /\b(?:answer|response|content|body|description)\b/i.test(field.name + ' ' + field.label));
  return question && answer
    ? { group: group.name, question: question.name, answer: answer.name, answerType: answer.type }
    : null;
}

function ensureAccordionSchema(implementation) {
  const fields = Array.isArray(implementation.fields) ? [...implementation.fields] : [];
  let groups = fields.filter((field) => field?.type === 'multifield' && field.composite === true);
  if (!groups.length) fields.push(defaultAccordionField());
  const mode = fields.find((field) => field?.name === 'accordionMode');
  if (!mode) fields.push({ name: 'accordionMode', label: 'Accordion Behavior', type: 'select', required: true, defaultValue: 'multiple', options: [{ text: 'Multiple Open', value: 'multiple' }, { text: 'Single Open', value: 'single' }] });
  if (!groups.length) { implementation.fields = fields; return; }
  const group = groups.find((field) => /\b(?:faq|items|questions|accordion|entries)\b/i.test(field.name + ' ' + field.label)) || groups[0];
  const children = Array.isArray(group.children) ? [...group.children] : [];
  const hasQuestion = children.some((field) => field.role === 'title' || /\b(?:question|prompt|title|heading|label)\b/i.test(field.name + ' ' + field.label));
  const hasAnswer = children.some((field) => field.role === 'body' || field.type === 'richtext' || /\b(?:answer|response|content|body|description)\b/i.test(field.name + ' ' + field.label));
  if (!hasQuestion) children.push({ name: 'question', label: 'Question', type: 'text', required: true, role: 'title' });
  if (!hasAnswer) children.push({ name: 'answer', label: 'Answer', type: 'richtext', required: true, role: 'body' });
  group.children = children;
  group.composite = true;
  implementation.fields = fields;
}

function buildAccordionSources(fields, canonicalFiles, clientlibCategory) {
  const contract = resolveAccordionFields(fields);
  if (!contract) return null;
  const E = '$' + '{';
  const X = '}';
  const H = (expression) => E + expression + X;
  const canonicalHtml = canonicalHtlFile(canonicalFiles);
  const componentKey = String(canonicalHtml?.name || '').split('/').pop().replace(/\.(?:html?|htl)$/i, '') || 'faqAccordion';
  const cssKey = kebabCase(componentKey);
  const modelClass = canonicalHtml?.code?.match(/data-sly-use\.model\s*=\s*["']([^"']+)["']/i)?.[1] ||
    'com.example.site.core.models.' + componentKey.charAt(0).toUpperCase() + componentKey.slice(1) + 'Model';
  const group = contract.group;
  const question = contract.question;
  const answer = contract.answer;
  const context = contract.answerType === 'richtext' ? " @ context='html'" : '';
  const category = clientlibCategory;
  const rootClass = 'cmp-' + cssKey;
  const sourceHtl = [
    '<sly data-sly-use.clientlib="/libs/granite/sightly/templates/clientlib.html"/>',
    '<sly data-sly-call="' + H("clientlib.css @ categories='" + category + "'") + '"></sly>',
    '<sly data-sly-call="' + H("clientlib.js @ categories='" + category + "'") + '"></sly>',
    '<div class="' + rootClass + '" data-cmp-is="accordion" data-accordion-mode="${properties.allowMultipleOpen ? \'multiple\' : \'single\'}">',
    '  <div class="' + rootClass + '__items" data-sly-list.item="${resource.getChildren.questions}">',
    '    <div class="' + rootClass + '__item">',
    '      <h3 class="' + rootClass + '__heading">',
    '        <button type="button" class="' + rootClass + '__trigger" id="' + H('resource.path') + '-accordion-trigger-' + H('itemList.index') + '" aria-controls="' + H('resource.path') + '-accordion-panel-' + H('itemList.index') + '" aria-expanded="false">' + H('item.valueMap.' + question) + '</button>',
    '      </h3>',
    '      <div class="' + rootClass + '__panel" id="' + H('resource.path') + '-accordion-panel-' + H('itemList.index') + '" role="region" aria-labelledby="' + H('resource.path') + '-accordion-trigger-' + H('itemList.index') + '" hidden>',
    '        <div class="' + rootClass + '__answer">' + H('item.valueMap.' + answer + context) + '</div>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('\n');

  const directJcrHtl = [
    '<sly data-sly-use.clientlib="/libs/granite/sightly/templates/clientlib.html"/>',
    '<sly data-sly-call="' + H("clientlib.css @ categories='" + category + "'") + '"></sly>',
    '<sly data-sly-call="' + H("clientlib.js @ categories='" + category + "'") + '"></sly>',
    '<sly data-sly-list.group="' + H('resource.children') + '">',
    '  <sly data-sly-test="' + H("group.name == '" + group + "'") + '">',
    '    <div class="' + rootClass + '" data-cmp-is="accordion" data-accordion-mode="' + H("properties.accordionMode || 'multiple'") + '">',
    '      <div class="' + rootClass + '__items" data-sly-list.item="' + H('group.children') + '">',
    '        <div class="' + rootClass + '__item">',
    '          <h3 class="' + rootClass + '__heading">',
    '            <button type="button" class="' + rootClass + '__trigger" id="' + H('resource.path') + '-accordion-trigger-' + H('itemList.index') + '" aria-controls="' + H('resource.path') + '-accordion-panel-' + H('itemList.index') + '" aria-expanded="false">' + H('item.valueMap.' + question) + '</button>',
    '          </h3>',
    '          <div class="' + rootClass + '__panel" id="' + H('resource.path') + '-accordion-panel-' + H('itemList.index') + '" role="region" aria-labelledby="' + H('resource.path') + '-accordion-trigger-' + H('itemList.index') + '" hidden>',
    '            <div class="' + rootClass + '__answer">' + H('item.valueMap.' + answer + context) + '</div>',
    '          </div>',
    '        </div>',
    '      </div>',
    '    </div>',
    '  </sly>',
    '</sly>'
  ].join('\n');

  const js = [
    '(function () {',
    "  'use strict';",
    '  var selector = \'[data-cmp-is="accordion"]\';',
    '  function owned(root, childSelector) {',
    '    return Array.prototype.filter.call(root.querySelectorAll(childSelector), function (node) { return node.closest(selector) === root; });',
    '  }',
    '  function initialize(root) {',
    '    if (root.getAttribute("data-accordion-initialized") === "true") return;',
    '    root.setAttribute("data-accordion-initialized", "true");',
    '    var triggers = owned(root, \'[aria-controls]\');',
    '    var panels = owned(root, \'[role="region"]\');',
    '    if (!triggers.length || !panels.length) return;',
    '    function panelFor(trigger) {',
    '      var id = trigger.getAttribute("aria-controls");',
    '      return panels.find(function (panel) { return panel.id === id; });',
    '    }',
    '    function close(trigger) {',
    '      var panel = panelFor(trigger);',
    '      trigger.setAttribute("aria-expanded", "false");',
    '      if (panel) panel.hidden = true;',
    '    }',
    '    triggers.forEach(function (trigger) {',
    '      trigger.addEventListener("click", function () {',
    '        var wasExpanded = trigger.getAttribute("aria-expanded") === "true";',
    '        if (root.getAttribute("data-accordion-mode") !== "multiple" || wasExpanded) triggers.forEach(close);',
    '        if (!wasExpanded) {',
    '          var panel = panelFor(trigger);',
    '          trigger.setAttribute("aria-expanded", "true");',
    '          if (panel) panel.hidden = false;',
    '        }',
    '      });',
    '    });',
    '  }',
    '  function initializeAll() { document.querySelectorAll(selector).forEach(initialize); }',
    '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeAll); else initializeAll();',
    '})();'
  ].join('\n');

  const css = [
    '.' + rootClass + ' { width: 100%; }',
    '.' + rootClass + '__item { border-bottom: 1px solid var(--accordion-border-color, currentColor); }',
    '.' + rootClass + '__heading { margin: 0; }',
    '.' + rootClass + '__trigger { display: flex; width: 100%; align-items: center; justify-content: space-between; padding: 1rem; border: 0; background: transparent; color: inherit; font: inherit; font-weight: 600; text-align: left; cursor: pointer; }',
    '.' + rootClass + '__trigger[aria-expanded="true"] { color: var(--accordion-active-color, currentColor); }',
    '.' + rootClass + '__trigger:focus-visible { outline: 2px solid var(--accordion-focus-color, currentColor); outline-offset: 3px; }',
    '.' + rootClass + '__panel[hidden] { display: none !important; }',
    '.' + rootClass + '__panel { padding: 0 1rem 1rem; }'
  ].join('\n');

  return {
    sourceHtl, directJcrHtl, js, css,
    htmlName: canonicalHtml?.name || componentKey + '.html',
    jsName: 'clientlib/js/' + componentKey + '.js',
    cssName: 'clientlib/css/' + componentKey + '.css'
  };
}

function normalizeAemClientlibCalls(htl, category) {
  const source = String(htl || '');
  const normalizedCategory = String(category || '').trim();
  if (!normalizedCategory) return source;
  // Keep exactly one canonical clientlib template binding and one CSS + JS include.
  const body = source
    .replace(/<sly\s+data-sly-use\.(?:clientlib|clientLib)=[\"'][^\"']*clientlib\.html[\"'][^>]*\/?>(?:\s*<\/sly>)?/gi, '')
    .replace(/<sly\s+data-sly-call=[\"'][^\"']*clientlib\.(?:css|js)[^\"']*[\"'][^>]*\/?>(?:\s*<\/sly>)?/gi, '');
  const binding = '<sly data-sly-use.clientlib="/libs/granite/sightly/templates/clientlib.html"/>';
  const css = '<sly data-sly-call="${clientlib.css @ categories=\'' + normalizedCategory + '\'}"></sly>';
  const js = '<sly data-sly-call="${clientlib.js @ categories=\'' + normalizedCategory + '\'}"></sly>';
  return [binding, css, js, body.trim()].filter(Boolean).join('\n');
}

function applyAccordionRepair(implementation, input, fields, canonicalFiles) {
  if (!isAccordionBrief(String(input?.name || '') + ' ' + String(input?.description || ''))) return;
  const sources = buildAccordionSources(fields, canonicalFiles, implementation.clientlibCategory);
  if (!sources) return;
  // A component has exactly one canonical HTL script. Direct-JCR rendering is
  // the canonical source for API-only implementation; never emit a second HTL.
  const files = (Array.isArray(implementation.files) ? implementation.files : [])
    .filter((file) => !/(?:^|\/)direct[-_]?jcr\.html?$/i.test(String(file?.name || '')));
  let htmlFile = files.find((file) => file && (file.lang === 'htl' || /\.(?:html?|htl)$/i.test(file.name || '')));
  if (!htmlFile) {
    htmlFile = { name: sources.htmlName, lang: 'htl', code: sources.directJcrHtl };
    files.push(htmlFile);
  } else {
    htmlFile.code = sources.directJcrHtl;
    htmlFile.lang = 'htl';
    htmlFile.name = sources.htmlName;
  }
  const upsertAsset = (extension, name, code) => {
    const file = files.find((item) => item && (item.lang === extension || new RegExp('\\.' + extension + '$', 'i').test(item.name || '')));
    if (file) { file.name = name; file.lang = extension; file.code = code; }
    else files.push({ name, lang: extension, code });
  };
  upsertAsset('js', sources.jsName, sources.js);
  upsertAsset('css', sources.cssName, sources.css);
  implementation.files = files;
  // Keep model-free direct-JCR markup as an internal fallback contract, not as a second HTL file.
  implementation.directJcrHtl = sources.directJcrHtl;
}

export function repairAemGenerationResponse(data, input) {
  if (input?.cms !== 'aem' || !data?.implementations || typeof data.implementations !== 'object') return data;

  const implementations = { ...data.implementations };
  const implementation = { ...(implementations.aem || {}) };
  // Never let model output create a second HTL resource beside the component script.
  if (Array.isArray(implementation.files)) {
    implementation.files = implementation.files.filter((file) => !/(?:^|\/)direct[-_]?jcr\.html?$/i.test(String(file?.name || '')));
  }
  const requestedGroup = extractRequestedComponentGroup(input.description);
  implementation.componentGroup = requestedGroup || normalizeComponentGroup('');
  const requestedCategory = extractRequestedClientlibCategory(input.description);
  implementation.clientlibCategory = requestedCategory || defaultClientlibCategory(input.name);

  const requestedTabs = isTabsBrief(input);
  const requestedAccordion = isAccordionBrief(String(input?.name || '') + ' ' + String(input?.description || ''));
  if (requestedAccordion && implementation.proxyComponent !== true) ensureAccordionSchema(implementation);
  if (requestedTabs) {
    const existingFields = Array.isArray(implementation.fields) ? implementation.fields : [];
    const hasComposite = existingFields.some((field) => field?.type === 'multifield' && field.composite === true);
    if (!hasComposite) {
      implementation.fields = [...existingFields.filter((field) => String(field?.name || '').toLowerCase() !== 'tabs'), defaultTabsField()];
    }
  }

  if (implementation.proxyComponent === true && Array.isArray(implementation.fields) && implementation.fields.length === 0) {
    implementations.aem = implementation;
    for (const cms of CMS_IDS.filter((id) => id !== 'aem')) {
      implementations[cms] = { ...(implementations[cms] || {}), files: [] };
    }
    return { ...data, implementations };
  }

  if (!requestedTabs && !requestedAccordion && (!Array.isArray(implementation.fields) || implementation.fields.length === 0) &&
      (!Array.isArray(implementation.model) || implementation.model.length === 0)) {
    implementations.aem = implementation;
    for (const cms of CMS_IDS.filter((id) => id !== 'aem')) {
      implementations[cms] = { ...(implementations[cms] || {}), files: [] };
    }
    return { ...data, implementations };
  }

  const fields = normalizeComponentFields(implementation.fields, implementation.model);
  implementation.fields = fields;
  implementation.files = (Array.isArray(implementation.files) ? implementation.files : [])
    .filter((file) => !/(?:^|\/)direct[-_]?jcr\.html?$/i.test(String(file?.name || '')))
    .map((file) => ({ ...file }));
  const flatFields = flattenFields(fields);
  const canonicalFiles = aemFiles(input.name, fields, input.description, {
    componentGroup: implementation.componentGroup,
    clientlibCategory: implementation.clientlibCategory,
    proxyComponent: false,
  });
  const requiresCanonicalModel = flatFields.some((field) => field.type === 'multifield' && field.composite === true) ||
    /\bsling[\s-]*model\b|\bbackend logic\b|\bservice integration\b|\bexternal api\b|\bcomputed field\b|\bderived data\b/i.test(String(input.description || ''));
  if (requiresCanonicalModel && !implementation.files.some((file) => file.lang === 'java' || /\.java$/i.test(String(file.name || '')))) {
    const canonicalJava = canonicalFiles.find((file) => file.lang === 'java' || /\.java$/i.test(String(file.name || '')));
    if (canonicalJava) implementation.files.push({ ...canonicalJava });
  }
  ensureSourceHtlModelUse(implementation, canonicalFiles);
  // AI often emits a source HTL that binds composite groups as flat model properties or omits
  // nested loops entirely. If it does not render every authored composite group, replace only
  // that HTL with the schema-derived recursive source template; preserve the AI CSS/JS/dialog.
  const canonicalSourceHtl = canonicalFiles.find((file) => /\\.(?:html?|htl)$/i.test(String(file.name || '')) || /^(?:html?|htl)$/i.test(String(file.lang || '')));
  const currentSourceHtl = implementation.files.find((file) => /\\.(?:html?|htl)$/i.test(String(file.name || '')) || /^(?:html?|htl)$/i.test(String(file.lang || '')));
  const sourceMarkup = String(currentSourceHtl?.code || '');
  const sourceCompositeMissing = compositesMissingFromMarkup(fields, sourceMarkup);
  if (sourceCompositeMissing && canonicalSourceHtl) {
    if (currentSourceHtl) {
      currentSourceHtl.code = canonicalSourceHtl.code;
      currentSourceHtl.repairNote = 'Rebuilt source HTL from recursive AEM field schema because AI markup omitted composite child-resource rendering.';
    } else {
      implementation.files.push({ ...canonicalSourceHtl, repairNote: 'Added schema-derived source HTL because AI omitted composite child-resource rendering.' });
    }
  }
  applyTabsRepair(implementation, input, fields, canonicalFiles);
  applyAccordionRepair(implementation, input, fields, canonicalFiles);
  implementation.files = implementation.files.map((file) => {
    const copy = { ...file };
    if (/\.(?:html?|htl)$/i.test(String(copy.name || '')) || /^(?:html?|htl)$/i.test(String(copy.lang || ''))) {
      copy.code = normalizeAemClientlibCalls(copy.code, implementation.clientlibCategory);
    }
    if (/(?:^|\/)clientlib\/\.content\.xml$/i.test(String(copy.name || ''))) {
      copy.code = String(copy.code || '').replace(/categories="\[[^\]]*\]"/, 'categories="[' + implementation.clientlibCategory + ']"');
    }
    return copy;
  });
  if (implementation.directJcrHtl) {
    implementation.directJcrHtl = normalizeAemClientlibCalls(implementation.directJcrHtl, implementation.clientlibCategory);
  }

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
