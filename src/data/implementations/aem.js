/**
 * AEM codebase source files generated from the component's validated field schema.
 * The direct-JCR path later converts model-bound HTL to a model-free variant.
 */
import { context } from './helpers.js';
import { cssFor } from './css-template.js';

/**
 * No component-name catalog lives here. The validated recursive field schema and AI-authored
 * implementation files drive all component types; these templates only complete shared AEM
 * scaffolding (dialog, component metadata, Sling Model field bindings and clientlib structure).
 */
const xml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const javaString = (value) => String(value ?? '').replaceAll('\\', '\\\\').replaceAll('"', '\\"');
const cap = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const htlExpr = (name, contextName = '') => '$' + '{model.' + name + (contextName ? " @ context='" + contextName + "'" : '') + '}';

function graniteType(field) {
  return ({
    text: 'granite/ui/components/coral/foundation/form/textfield',
    textarea: 'granite/ui/components/coral/foundation/form/textarea',
    path: 'granite/ui/components/coral/foundation/form/pathfield',
    select: 'granite/ui/components/coral/foundation/form/select',
    checkbox: 'granite/ui/components/coral/foundation/form/checkbox',
    number: 'granite/ui/components/coral/foundation/form/numberfield',
    richtext: 'cq/gui/components/authoring/dialog/richtext',
    multifield: 'granite/ui/components/coral/foundation/form/multifield',
    date: 'granite/ui/components/coral/foundation/form/datepicker',
    hidden: 'granite/ui/components/coral/foundation/form/hidden'
  })[field.type] || 'granite/ui/components/coral/foundation/form/textfield';
}

function dialogField(field, indent = 6, nestedField = false) {
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 2);
  const fieldPad = ' '.repeat(indent + 4);
  const childPad = ' '.repeat(indent + 6);
  const tag = field.name;
  const storedName = nestedField ? field.name : './' + field.name;
  const attrs = [
    'jcr:primaryType="nt:unstructured"',
    'sling:resourceType="' + graniteType(field) + '"',
    'fieldLabel="' + xml(field.label) + '"',
    'name="' + xml(storedName) + '"'
  ];
  if (field.required) attrs.push('required="{Boolean}true"');
  if (field.defaultValue != null && field.defaultValue !== '' && field.type !== 'multifield' && field.type !== 'checkbox') attrs.push('value="' + xml(field.defaultValue) + '"');
  if (field.type === 'path') attrs.push('rootPath="' + xml(field.rootPath || '/content') + '"');
  if (field.type === 'textarea') attrs.push('rows="{Long}5"');
  if (field.type === 'checkbox') {
    attrs.push('text="' + xml(field.label) + '"', 'value="{Boolean}true"', 'uncheckedValue="{Boolean}false"');
  }
  if (field.type === 'select') {
    const items = (field.options || []).map((option, index) =>
      childPad + '<option' + index + ' jcr:primaryType="nt:unstructured" text="' + xml(option.label) +
      '" value="' + xml(option.value) + '"' + (index === 0 ? ' selected="{Boolean}true"' : '') + '/>');
    return pad + '<' + tag + ' ' + attrs.join(' ') + '>\n' +
      inner + '<items jcr:primaryType="nt:unstructured">\n' + items.join('\n') + '\n' +
      inner + '</items>\n' + pad + '</' + tag + '>';
  }

  if (field.type === 'multifield') {
    const composite = field.composite === true && Array.isArray(field.children) && field.children.length > 0;
    const multifieldAttrs = [
      'jcr:primaryType="nt:unstructured"',
      'sling:resourceType="granite/ui/components/coral/foundation/form/multifield"',
      'fieldLabel="' + xml(field.label) + '"',
      'composite="{Boolean}' + String(composite) + '"'
    ];
    if (field.required) multifieldAttrs.push('required="{Boolean}true"');
    if (field.maxItems && field.maxItems < 20) multifieldAttrs.push('maxItems="' + field.maxItems + '"');
    if (!composite) {
      const leafType = 'granite/ui/components/coral/foundation/form/textfield';
      return pad + '<' + tag + ' ' + multifieldAttrs.join(' ') + '>\n' +
        inner + '<field jcr:primaryType="nt:unstructured" sling:resourceType="' + leafType +
        '" name="' + xml(storedName) + '"/>\n' + pad + '</' + tag + '>';
    }
    const children = field.children.map((child) => dialogField(child, indent + 8, true)).join('\n');
    return pad + '<' + tag + ' ' + multifieldAttrs.join(' ') + '>\n' +
      inner + '<field jcr:primaryType="nt:unstructured" sling:resourceType="granite/ui/components/coral/foundation/container" name="' + xml(storedName) + '">\n' +
      fieldPad + '<items jcr:primaryType="nt:unstructured">\n' + children + '\n' +
      fieldPad + '</items>\n' + inner + '</field>\n' + pad + '</' + tag + '>';
  }

  if (field.type === 'richtext') attrs.push('useFixedInlineToolbar="{Boolean}true"');
  return pad + '<' + tag + ' ' + attrs.join(' ') + '/>';
}
function genericSourceHtl(K, P, C, fields, clientlibCategory) {
  const title = fields.find((field) => field.role === 'title') || fields.find((field) => field.type !== 'hidden' && field.type !== 'multifield');
  const image = fields.find((field) => field.role === 'image');
  const imageAlt = fields.find((field) => field.role === 'imageAlt');
  const ctaLabel = fields.find((field) => field.role === 'ctaLabel');
  const ctaLink = fields.find((field) => field.role === 'ctaLink');
  const alignment = fields.find((field) => field.role === 'alignment');
  const content = [];

  if (image) {
    content.push('  <img data-sly-test="' + htlExpr(image.name) + '" class="cmp-{{K}}__image" src="' + htlExpr(image.name, 'uri') +
      '" alt="' + (imageAlt ? htlExpr(imageAlt.name, 'attribute') : '') + '" loading="lazy"/>');
  }
  if (title) {
    content.push('  <h2 id="' + htlExpr('id', 'attribute') + '" class="cmp-{{K}}__title">' + htlExpr(title.name) + '</h2>');
  }
  for (const field of fields) {
    if (field === title || ['title', 'image', 'imageAlt', 'ctaLabel', 'ctaLink', 'alignment'].includes(field.role) || field.type === 'hidden' || field.type === 'multifield') continue;
    if (field.type === 'richtext') {
      content.push('  <div data-sly-test="' + htlExpr(field.name) + '" class="cmp-{{K}}__field cmp-{{K}}__field--' + field.name + '">' + htlExpr(field.name, 'html') + '</div>');
    } else if (field.type !== 'checkbox') {
      content.push('  <p data-sly-test="' + htlExpr(field.name) + '" class="cmp-{{K}}__field cmp-{{K}}__field--' + field.name + '">' + htlExpr(field.name) + '</p>');
    } else {
      content.push('  <p data-sly-test="' + htlExpr(field.name) + '" class="cmp-{{K}}__field cmp-{{K}}__field--' + field.name + '">' + xml(field.label) + ': ' + htlExpr(field.name) + '</p>');
    }
  }
  for (const field of fields.filter((candidate) => candidate.type === 'multifield' && candidate.composite === true)) {
    content.push(...renderCompositeMarkup(field, 'resource', 0));
  }
  if (ctaLabel && ctaLink) {
    const ctaTest = '$' + '{model.' + ctaLabel.name + ' && model.' + ctaLink.name + '}';
    content.push('  <a class="cmp-{{K}}__cta" data-sly-test="' + ctaTest + '" href="' +
      htlExpr(ctaLink.name, 'uri') + '">' + htlExpr(ctaLabel.name) + '</a>');
  }
  const sectionClass = alignment
    ? 'cmp-{{K}} cmp-{{K}}--' + htlExpr(alignment.name, 'attribute')
    : 'cmp-{{K}}';
  const nonHidden = fields.filter((field) => field.type !== 'hidden');
  const contentFields = nonHidden.length ? nonHidden : fields.slice(0, 1);
  const hasContentParts = contentFields.map((field) => field.type === 'multifield' && field.composite ? 'resource.hasChildren' : 'model.' + field.name);
  const hasContent = hasContentParts.length ? '$' + '{' + hasContentParts.join(' || ') + '}' : 'true';
  const markup = [
    '<sly data-sly-use.clientlib="/libs/granite/sightly/templates/clientlib.html"/>',
    '<sly data-sly-use.model="com.example.site.core.models.{{P}}Model" data-sly-test.hasContent="' + hasContent + '"></sly>',
    '<sly data-sly-call="' + '$' + "{clientlib.css @ categories='" + xml(clientlibCategory) + "'}" + '"></sly>',
    '<section class="' + sectionClass + '"' + (title ? ' aria-labelledby="' + htlExpr('id', 'attribute') + '"' : '') + '>',
    '  <div class="cmp-{{K}}__content">',
    content.join('\n'),
    '  </div>',
    '</section>'
  ];
  return markup.join('\n');
}

function slingModel(fields) {
  const properties = fields.map((field) => {
    const composite = field.type === 'multifield' && field.composite === true;
    const type = composite ? 'List<Resource>' : field.type === 'multifield' ? 'String[]' : field.type === 'checkbox' ? 'Boolean' : 'String';
    const init = field.type === 'select' && field.options?.length ? ' = "' + javaString(field.options[0].value) + '"' : '';
    const annotation = composite ? '@ChildResource(name = "' + javaString(field.name) + '")' : '@ValueMapValue(name = "' + javaString(field.name) + '")';
    return '    ' + annotation + '\n    private ' + type + ' ' + field.name + init + ';';
  });
  const getters = fields.map((field) => {
    const composite = field.type === 'multifield' && field.composite === true;
    const type = composite ? 'List<Resource>' : field.type === 'multifield' ? 'String[]' : field.type === 'checkbox' ? 'Boolean' : 'String';
    if (field.role === 'imageAlt') {
      return '    public ' + type + ' get' + cap(field.name) + '() { return ' + field.name + ' != null ? ' + field.name + ' : ""; }';
    }
    return '    public ' + type + ' get' + cap(field.name) + '() { return ' + field.name + '; }';
  });
  return [
    'package com.example.site.core.models;',
    '',
    'import java.util.List;',
    'import org.apache.sling.api.SlingHttpServletRequest;',
    'import org.apache.sling.api.resource.Resource;',
    'import org.apache.sling.models.annotations.DefaultInjectionStrategy;',
    'import org.apache.sling.models.annotations.Model;',
    'import org.apache.sling.models.annotations.injectorspecific.ValueMapValue;',
    'import org.apache.sling.models.annotations.injectorspecific.ChildResource;',
    '',
    '@Model(adaptables = SlingHttpServletRequest.class, defaultInjectionStrategy = DefaultInjectionStrategy.OPTIONAL)',
    'public class {{P}}Model {',
    '',
    ...properties,
    '',
    '    public String getId() { return "{{C}}-" + Math.abs(hashCode()); }',
    ...getters,
    '}'
  ].join('\n');
}

function manifest(name, C, fields, options = {}) {
  const serializeField = (field) => ({
    name: field.name, label: field.label, type: field.type, required: field.required,
    role: field.role, options: field.options, rootPath: field.rootPath,
    composite: field.composite, minItems: field.minItems, maxItems: field.maxItems,
    defaultValue: field.defaultValue, description: field.description,
    ...(Array.isArray(field.children) && field.children.length ? { children: field.children.map(serializeField) } : {})
  });
  return JSON.stringify({
    component: {
      name, resourceType: 'site/components/' + C, group: options.componentGroup || 'Content', clientlibCategory: options.clientlibCategory || 'site.components.' + C,
      ...(options.proxyComponent ? { proxyComponent: true, resourceSuperType: options.resourceSuperType } : {})
    },
    fields: fields.map(serializeField)
  }, null, 2) + '\n';
}

export function aemFiles(name, componentFields = [], description = '', options = {}) {
  const { K, P, C, file } = context(name);
  const proxyComponent = options.proxyComponent === true;
  const resourceSuperType = proxyComponent ? String(options.resourceSuperType || '').replace(/^\/+/, '') : '';
  const componentGroup = String(options.componentGroup || 'Content').trim() || 'Content';
  const clientlibCategory = String(options.clientlibCategory || 'site.components.' + C).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(clientlibCategory)) throw new Error('AEM clientlib category must be a valid single category token.');
  if (proxyComponent && (!resourceSuperType || resourceSuperType.split('/').some((segment) => !/^[A-Za-z0-9._-]+$/.test(segment) || segment === '.' || segment === '..'))) {
    throw new Error('A proxy component requires a safe, exact Sling resourceSuperType.');
  }
  const fields = Array.isArray(componentFields) ? componentFields : [];
  const pureProxy = proxyComponent && fields.length === 0;
  const dialog = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0"',
    '    xmlns:cq="http://www.day.com/jcr/cq/1.0"',
    '    xmlns:jcr="http://www.jcp.org/jcr/1.0"',
    '    xmlns:nt="http://www.jcp.org/jcr/nt/1.0"',
    '    jcr:primaryType="nt:unstructured"',
    '    jcr:title="{{T}}"',
    '    sling:resourceType="cq/gui/components/authoring/dialog">',
    '  <content jcr:primaryType="nt:unstructured" sling:resourceType="granite/ui/components/coral/foundation/container">',
    '    <items jcr:primaryType="nt:unstructured">',
    fields.map((field) => dialogField(field)).join('\n'),
    '    </items>',
    '  </content>',
    '</jcr:root>'
  ].join('\n');
  const componentMetadata = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0" xmlns:jcr="http://www.jcp.org/jcr/1.0" xmlns:sling="http://sling.apache.org/jcr/sling/1.0"',
    '    jcr:primaryType="cq:Component"',
    '    jcr:title="{{T}}"',
    ...(proxyComponent ? ['    sling:resourceSuperType="' + xml(resourceSuperType) + '"'] : []),
    '    componentGroup="' + xml(componentGroup) + '"/>'
  ].join('\n');
  const clientlibMetadata = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0"',
    '    jcr:primaryType="cq:ClientLibraryFolder"',
    '    categories="[' + xml(clientlibCategory) + ']"',
    '    allowProxy="{Boolean}true"/>'
  ].join('\n');

  if (pureProxy) {
    return [
      file('apps/site/components/{{C}}/.content.xml', 'xml', componentMetadata),
    ];
  }

  const outputs = [
    file('apps/site/components/{{C}}/.content.xml', 'xml', componentMetadata),
    file('apps/site/components/{{C}}/_cq_dialog/.content.xml', 'xml', dialog),
    file('apps/site/components/{{C}}/{{C}}.html', 'htl', genericSourceHtl(K, P, C, fields, clientlibCategory)),
    file('core/models/{{P}}Model.java', 'java', slingModel(fields)),
    file('apps/site/components/{{C}}/clientlib/.content.xml', 'xml', clientlibMetadata),
    file('apps/site/components/{{C}}/clientlib/css.txt', 'txt', '#base=css\n{{C}}.css\n'),
    file('apps/site/components/{{C}}/clientlib/css/{{C}}.css', 'css', cssFor('cmp-' + K, '.cmp-' + K + '--center'))
  ];
  return outputs;
}

function htlExpression(expression, contextName = '') {
  return '$' + '{' + expression + (contextName ? " @ context='" + contextName + "'" : '') + '}';
}

function renderCompositeMarkup(field, parentAlias = 'resource', depth = 0, classPrefix = 'cmp-{{K}}') {
  const groupAlias = 'group' + depth + field.name;
  const itemAlias = 'item' + depth + field.name;
  const parentChildren = parentAlias + '.children';
  const rows = [];
  const pad = '  '.repeat(depth + 1);
  rows.push(pad + '<sly data-sly-list.' + groupAlias + '="' + htlExpression(parentChildren) + '">');
  rows.push(pad + '  <sly data-sly-test="' + htlExpression(groupAlias + ".name == '" + field.name + "'") + '">');
  rows.push(pad + '    <sly data-sly-list.' + itemAlias + '="' + htlExpression(groupAlias + '.children') + '">');
  rows.push(pad + '      <div class="' + classPrefix + '__' + field.name + '-item">');

  const children = field.children || [];
  const image = children.find((child) => child.role === 'image' || (child.type === 'path' && /image|asset|photo|media|video/i.test(child.name + ' ' + child.label)));
  const alt = children.find((child) => child.role === 'imageAlt' || /^(?:alt|altText|imageAlt)$/i.test(child.name));
  const title = children.find((child) => child.role === 'title' || /^(?:title|heading|name)$/i.test(child.name));
  const body = children.find((child) => child.role === 'body' || /description|caption|summary|body/i.test(child.name + ' ' + child.label));
  const link = children.find((child) => child.role === 'ctaLink' || ((child.type === 'path' || /url|href|link/i.test(child.name)) && /url|href|link/i.test(child.name + ' ' + child.label)));
  const linkLabel = children.find((child) => child.role === 'ctaLabel' || /^(?:label|linkText|anchorText)$/i.test(child.name));

  if (image) {
    rows.push(pad + '        <img loading="lazy" src="' + htlExpression(itemAlias + '.valueMap.' + image.name, 'uri') +
      '" alt="' + (alt ? htlExpression(itemAlias + '.valueMap.' + alt.name, 'attribute') : '') + '"/>');
  }
  if (link && (title || linkLabel)) {
    const labelField = title || linkLabel;
    rows.push(pad + '        <a data-sly-test="' + htlExpression(itemAlias + '.valueMap.' + link.name) +
      '" href="' + htlExpression(itemAlias + '.valueMap.' + link.name, 'uri') + '">' +
      htlExpression(itemAlias + '.valueMap.' + labelField.name) + '</a>');
  }
  if (title && !(link && title)) rows.push(pad + '        <h3 data-sly-test="' + htlExpression(itemAlias + '.valueMap.' + title.name) + '">' +
    htlExpression(itemAlias + '.valueMap.' + title.name) + '</h3>');
  if (body) rows.push(pad + '        <p data-sly-test="' + htlExpression(itemAlias + '.valueMap.' + body.name) + '">' +
    htlExpression(itemAlias + '.valueMap.' + body.name) + '</p>');

  for (const child of children.filter((candidate) =>
    candidate.type !== 'multifield' && candidate.type !== 'hidden' &&
    candidate !== image && candidate !== alt && candidate !== title && candidate !== body &&
    candidate !== link && candidate !== linkLabel)) {
    rows.push(pad + '        <span data-sly-test="' + htlExpression(itemAlias + '.valueMap.' + child.name) +
      '" class="' + classPrefix + '__' + field.name + '-' + child.name + '">' +
      htlExpression(itemAlias + '.valueMap.' + child.name) + '</span>');
  }
  for (const nested of children.filter((child) => child.type === 'multifield' && child.composite)) {
    rows.push(...renderCompositeMarkup(nested, itemAlias, depth + 1, classPrefix + '__' + field.name));
  }

  rows.push(pad + '      </div>');
  rows.push(pad + '    </sly>');
  rows.push(pad + '  </sly>');
  rows.push(pad + '</sly>');
  return rows;
}
