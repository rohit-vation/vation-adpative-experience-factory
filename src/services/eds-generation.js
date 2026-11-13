/** Generate an AEM Edge Delivery Services block from the same field contract used by AEM. */

const slugify = (value) => String(value || 'block')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .split(/[^A-Za-z0-9]+/)
  .filter(Boolean)
  .map((part) => part.toLowerCase())
  .join('-')
  .slice(0, 80) || 'block';

function flattenFields(fields, parent = '') {
  return (Array.isArray(fields) ? fields : []).flatMap((field) => {
    if (!field || field.type === 'hidden') return [];
    const name = parent ? parent + '.' + field.name : field.name;
    if (field.type === 'multifield' && field.composite === true) return flattenFields(field.children, name);
    return [{ ...field, name }];
  });
}

function edsComponent(field) {
  const name = String(field.name || '').toLowerCase();
  const label = String(field.label || '').toLowerCase();
  const type = String(field.type || '').toLowerCase();
  if (type === 'richtext') return 'richtext';
  if (type === 'checkbox') return 'checkbox';
  if (type === 'numberfield' || type === 'number') return 'number';
  if (type === 'select') return 'select';
  if (type === 'pathfield' && /image|asset|picture|photo|file|media/.test(name + ' ' + label)) return 'reference';
  if (type === 'pathfield' && /link|url|href/.test(name + ' ' + label)) return 'aem-content';
  if (/image|asset|picture|photo/.test(name + ' ' + label)) return 'reference';
  if (/link|url|href/.test(name + ' ' + label)) return 'aem-content';
  return 'text';
}

function modelField(field) {
  const component = edsComponent(field);
  const output = {
    component,
    name: String(field.name || 'field'),
    label: String(field.label || field.name || 'Field'),
  };
  if (component !== 'richtext') output.valueType = component === 'checkbox' ? 'boolean' : 'string';
  if (field.required === true) output.required = true;
  if (field.choices?.length && component === 'select') {
    output.options = field.choices.map((choice) => ({ name: String(choice), value: String(choice) }));
  }
  if (field.description) output.description = String(field.description);
  return output;
}

function definition(name, id, fields) {
  const template = { name, model: id };
  for (const field of fields) {
    const component = edsComponent(field);
    if (component === 'richtext') template[field.name] = '<p>Enter ' + String(field.label || field.name) + '</p>';
    else if (component === 'reference') template[field.name] = '';
    else if (component === 'aem-content') template[field.name] = '/';
    else if (component === 'checkbox') template[field.name] = false;
    else template[field.name] = '';
  }
  return {
    title: name,
    id,
    plugins: {
      xwalk: {
        page: {
          resourceType: 'core/franklin/components/block/v1/block',
          template,
        },
      },
    },
  };
}

function cssFor(id, fields) {
  const selectors = fields
    .map((field) => '.' + id + ' .' + id + '__' + slugify(field.name))
    .join(',\n');
  const lines = [
    '.' + id + ' {',
    '  box-sizing: border-box;',
    '  width: 100%;',
    '}',
    '',
    '.' + id + ' > div {',
    '  box-sizing: border-box;',
    '}',
  ];
  if (selectors) lines.push('', selectors + ' {', '  margin: 0;', '}');
  lines.push('', '@media (min-width: 768px) {', '  .' + id + ' {', '    display: block;', '  }', '}', '');
  return lines.join('\n');
}

function jsFor(id, fields) {
  const fieldNames = fields.map((field) => String(field.name || '').replace(/[^A-Za-z0-9_]/g, '_'));
  return [
    '/**',
    ' * ' + id + ' block.',
    ' * Generated from the reviewed AEM field contract.',
    ' */',
    'export default function decorate(block) {',
    '  block.classList.add(' + JSON.stringify(id) + ');',
    '  const fields = ' + JSON.stringify(fieldNames) + ';',
    '  block.querySelectorAll(\':scope > div\').forEach((row, index) => {',
    '    const field = fields[index];',
    '    if (field) row.dataset.field = field;',
    '  });',
    '}',
    '',
  ].join('\n');
}

export function generateEdsBlock(data, input) {
  const implementation = data?.implementations?.aem || {};
  const name = String(data?.component?.name || input?.name || 'Block').trim();
  const id = slugify(name);
  const fields = flattenFields(implementation.fields || implementation.model || []);
  const json = {
    definitions: [definition(name, id, fields)],
    models: [{ id, fields: fields.map(modelField) }],
    // Normal blocks are not containers, so their own filter is intentionally empty.
    // Add this block id to the target container (usually models/_section.json).
    filters: [],
  };
  return {
    id,
    name,
    files: [
      { name: '_' + id + '.json', lang: 'json', code: JSON.stringify(json, null, 2) + '\n' },
      { name: '_' + id + '.css', lang: 'css', code: cssFor(id, fields) },
      { name: '_' + id + '.js', lang: 'js', code: jsFor(id, fields) },
    ],
    json,
  };
}
