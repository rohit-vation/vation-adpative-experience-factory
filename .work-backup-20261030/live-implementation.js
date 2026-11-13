import { convertSourceProjectPlanToInstancePlan, validateInstanceOnlyPlan } from '../aem/instance-only-plan.js';
import { reportBrowserLog } from './log-panel.js';

let initialized = false;
let currentContext = null;
let targets = [];
let prepared = null;
let applied = false;
let busy = false;
let generationInProgress = false;
let selectedTargetId = '';
let componentPathValue = '';
let preflightCache = null;

const $ = (selector) => document.querySelector(selector);
const words = (value) => String(value || 'component').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
const camelCase = (value) => {
  const parts = words(value);
  if (!parts.length) return 'component';
  return parts[0].toLowerCase() + parts.slice(1).map((part) => part[0].toUpperCase() + part.slice(1)).join('');
};
const slugify = (value) => words(value).map((part) => part.toLowerCase()).join('-').slice(0, 80) || 'component';
const escapeXmlAttribute = (value) => String(value || '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

async function request(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'Request failed (HTTP ' + response.status + ').');
    error.status = response.status;
    error.code = body.code || null;
    error.safeToTreatAsMissing = body.safeToTreatAsMissing === true;
    error.retryable = body.retryable === true;
    throw error;
  }
  return body;
}
const postJson = (url, body) => request(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

function showOutput(message, kind = 'info', detail = null) {
  const node = $('#create-live-output');
  if (!node) return;
  node.hidden = false;
  node.className = 'live-aem-output is-' + kind;
  node.textContent = typeof message === 'string' ? message : JSON.stringify(message, null, 2);
  if (detail) node.textContent += '\n\n' + JSON.stringify(detail, null, 2);
}

function notify(title, message, kind = 'success') {
  let stack = document.getElementById('aef-notification-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'aef-notification-stack';
    stack.className = 'aef-notification-stack';
    stack.setAttribute('aria-live', 'polite');
    stack.setAttribute('aria-relevant', 'additions');
    document.body.append(stack);
  }
  const item = document.createElement('section');
  item.className = 'aef-notification aef-notification-' + kind;
  item.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  const copy = document.createElement('div');
  const heading = document.createElement('strong');
  heading.textContent = title;
  const body = document.createElement('p');
  body.textContent = message;
  copy.append(heading, body);
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'aef-notification-dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss notification');
  dismiss.textContent = 'x';
  dismiss.addEventListener('click', () => item.remove());
  item.append(copy, dismiss);
  stack.prepend(item);
  while (stack.children.length > 3) stack.lastElementChild.remove();
  item.focus({ preventScroll: true });
}

export function createLiveInputProblem(cmsOverride = null) {
  const cms = cmsOverride || $('#f-cms')?.value || 'aem';
  if (cms !== 'aem') return '';
  const connectionSelect = $('#create-live-target');
  const selectedId = connectionSelect ? connectionSelect.value : selectedTargetId;
  if (!targetById(selectedId)) return 'Choose an available CMS connection before generating.';
  const pathValue = $('#create-live-component-path')?.value ?? componentPathValue;
  const componentName = $('#f-name')?.value || currentContext?.input?.name || 'Component';
  try {
    normalizeComponentRoot(pathValue, componentName);
  } catch (error) {
    return error.message || 'Enter a valid component repository path before generating.';
  }
  return '';
}

export function refreshCreateLiveGenerateButton() {
  const button = $('#go');
  if (!button) return;
  const problem = createLiveInputProblem();
  button.disabled = generationInProgress || Boolean(problem);
}

export function setCreateGenerateBusy(value) {
  generationInProgress = Boolean(value);
  refreshCreateLiveGenerateButton();
}

/** Preflight the chosen CMS path before spending an AI generation call. One repository read checks auth/path availability. */
export async function validateCreatePathBeforeGenerate() {
  if (($('#f-cms')?.value || 'aem') !== 'aem') return;
  preflightCache = null;
  const targetId = $('#create-live-target')?.value || selectedTargetId;
  const target = targetById(targetId);
  if (!target) throw new Error('Choose an available CMS connection before generating.');
  const componentName = $('#f-name')?.value || currentContext?.input?.name || 'Component';
  const inputPath = String($('#create-live-component-path')?.value ?? componentPathValue).trim();
  const componentRoot = normalizeComponentRoot(inputPath, componentName);
  componentPathValue = componentRoot;
  const pathInput = $('#create-live-component-path');
  if (pathInput) pathInput.value = componentRoot;
  const summary = $('#create-live-summary');
  if (summary) summary.textContent = 'Checking the CMS connection and component path before generating...';
  showOutput('Checking the selected CMS repository and ensuring the component path is unused. No writes will happen.', 'info');
  let existing;
  try {
    existing = await inspectRepositoryPath(target, componentRoot, 1);
  } catch (error) {
    if (error.code === 'REPOSITORY_PATH_UNVERIFIABLE') {
      throw new Error('Could not confirm whether ' + componentRoot + ' is available in this AEM Author. Check the full CRX/DE path and connection, then retry. No AI request or repository write was started.');
    }
    throw error;
  }
  if (existing) throw new Error('This component path already exists: ' + componentRoot + '. Choose a new component name or path. Existing resources will not be overwritten.');
  preflightCache = { targetId: target.id, componentRoot };
  if (summary) summary.textContent = 'CMS connection and unused component path verified. Component generation is starting.';
  showOutput('CMS connection and component path verified. AI generation can proceed; the reviewed plan will be prepared automatically afterward.', 'success');
}

function renderWaitingPlanPreview() {
  const preview = $('#create-live-plan-preview');
  if (preview) preview.dataset.state = 'waiting';
  const model = $('#create-live-model-table');
  if (model) { model.replaceChildren(); model.hidden = true; }
  const modelPlaceholder = $('#create-live-model-placeholder');
  if (modelPlaceholder) {
    modelPlaceholder.textContent = 'Content fields will appear after Generate validates the connection and prepares the CMS plan.';
    modelPlaceholder.hidden = false;
  }
  const files = $('#create-live-files-list');
  if (files) { files.replaceChildren(); files.hidden = true; }
  const content = $('#create-live-file-content');
  if (content) { content.replaceChildren(); content.hidden = true; }
  const filesPlaceholder = $('#create-live-files-placeholder');
  if (filesPlaceholder) {
    filesPlaceholder.textContent = 'Repository files and their contents will appear from the validated operation plan.';
    filesPlaceholder.hidden = false;
  }
}

function invalidatePreparedPlan() {
  preflightCache = null;
  prepared = null;
  applied = false;
  if ($('#create-live-review')) $('#create-live-review').hidden = true;
  if ($('#create-live-confirm-write')) $('#create-live-confirm-write').checked = false;
  if ($('#create-live-operations')) $('#create-live-operations').textContent = '';
  if ($('#create-live-operation-results')) {
    $('#create-live-operation-results').replaceChildren();
    $('#create-live-operation-results').hidden = true;
  }
  renderWaitingPlanPreview();
  const meta = $('#create-live-result-meta');
  if (meta && currentContext) meta.textContent = 'Draft updated. Generate again to validate the current inputs and prepare the CMS resources.';
  refreshButtons();
}

function fieldTypeFromResourceType(resourceType) {
  const type = String(resourceType || '').split('/').filter(Boolean).at(-1) || '';
  const labels = {
    textfield: 'Text',
    textarea: 'Text area',
    pathfield: 'Repository path',
    select: 'Dropdown',
    checkbox: 'Checkbox',
    numberfield: 'Number',
    multifield: 'Multifield',
    hidden: 'Hidden',
    datepicker: 'Date',
    password: 'Password',
    richtext: 'Rich text',
  };
  return labels[type] || (type ? type.replace(/[-_]/g, ' ') : 'Field');
}

function deriveDialogFields(operations) {
  const allNodes = operations.filter((operation) => operation.type === 'node');
  const marker = '/cq:dialog/content/items/';
  return allNodes.flatMap((operation) => {
    const markerIndex = operation.path.indexOf(marker);
    if (markerIndex < 0) return [];
    const fieldId = operation.path.slice(markerIndex + marker.length);
    if (!fieldId || fieldId.includes('/')) return [];
    const properties = operation.properties || {};
    const resourceType = String(properties['sling:resourceType'] || '');
    const isFormField = resourceType.includes('/form/') || /\/richtext$/.test(resourceType) || /\/datepicker$/.test(resourceType);
    if (!isFormField || !properties.name || !properties.fieldLabel) return [];
    const childPrefix = operation.path + '/items/';
    const choices = allNodes
      .filter((candidate) => candidate.path.startsWith(childPrefix) && !candidate.path.slice(childPrefix.length).includes('/'))
      .map((candidate) => {
        const choice = candidate.properties || {};
        return choice.text ?? choice.value;
      })
      .filter((value) => value !== undefined && value !== null && String(value).trim());
    return [{
      id: fieldId,
      name: String(properties.name || './' + fieldId).replace(/^\.\//, ''),
      label: String(properties.fieldLabel || properties.text || fieldId),
      type: fieldTypeFromResourceType(resourceType),
      required: properties.required === true || String(properties.required).toLowerCase() === 'true',
      choices,
    }];
  });
}

function renderPreparedPlanPreview(next) {
  const operations = next?.plan?.repositoryOperations || [];
  const fields = deriveDialogFields(operations);
  const fileOperations = operations.filter((operation) => operation.type === 'file');
  const nodeOperations = operations.filter((operation) => operation.type === 'node');
  const modelHost = $('#create-live-model-table');
  const modelPlaceholder = $('#create-live-model-placeholder');
  const preview = $('#create-live-plan-preview');

  if (modelHost) {
    modelHost.replaceChildren();
    if (fields.length) {
      const table = document.createElement('table');
      table.className = 'live-aem-plan-table';
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      for (const label of ['Field', 'Type', 'CMS property']) {
        const th = document.createElement('th');
        th.textContent = label;
        headRow.append(th);
      }
      thead.append(headRow);
      const tbody = document.createElement('tbody');
      for (const field of fields) {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        const nameCode = document.createElement('code');
        nameCode.textContent = field.label + (field.required ? ' *' : '');
        nameCell.append(nameCode);
        const typeCell = document.createElement('td');
        typeCell.textContent = field.type + (field.choices.length ? ' (' + field.choices.join(' / ') + ')' : '');
        const propertyCell = document.createElement('td');
        propertyCell.textContent = field.name;
        row.append(nameCell, typeCell, propertyCell);
        tbody.append(row);
      }
      table.append(thead, tbody);
      modelHost.append(table);
      modelHost.hidden = false;
      if (modelPlaceholder) modelPlaceholder.hidden = true;
    } else {
      if (modelPlaceholder) {
        modelPlaceholder.textContent = 'The reviewed plan contains no recognized Granite dialog fields. Inspect the operation JSON to review the exact dialog resources.';
        modelPlaceholder.hidden = false;
      }
      modelHost.hidden = true;
    }
  }

  const listHost = $('#create-live-files-list');
  const fileContentHost = $('#create-live-file-content');
  const filePlaceholder = $('#create-live-files-placeholder');
  if (listHost) {
    listHost.replaceChildren();
    if (fileOperations.length) {
      const tabs = document.createElement('div');
      tabs.className = 'live-aem-plan-file-tabs';
      const showFile = (operation, selectedButton) => {
        for (const button of tabs.querySelectorAll('button')) {
          button.classList.toggle('is-active', button === selectedButton);
          button.setAttribute('aria-pressed', button === selectedButton ? 'true' : 'false');
        }
        if (!fileContentHost) return;
        fileContentHost.replaceChildren();
        const header = document.createElement('div');
        header.className = 'live-aem-plan-file-header';
        const path = document.createElement('code');
        path.textContent = operation.path;
        const mime = document.createElement('span');
        mime.textContent = operation.mimeType || 'text/plain';
        header.append(path, mime);
        const code = document.createElement('pre');
        code.className = 'live-aem-plan-file-code';
        code.textContent = operation.content || '';
        fileContentHost.append(header, code);
        fileContentHost.hidden = false;
      };
      fileOperations.forEach((operation, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'live-aem-plan-file-tab';
        button.textContent = operation.path.split('/').at(-1) || operation.path;
        button.title = operation.path;
        button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
        button.addEventListener('click', () => showFile(operation, button));
        tabs.append(button);
      });
      listHost.append(tabs);
      listHost.hidden = false;
      if (filePlaceholder) filePlaceholder.hidden = true;
      showFile(fileOperations[0], tabs.querySelector('button'));
    } else {
      listHost.hidden = true;
      if (fileContentHost) { fileContentHost.replaceChildren(); fileContentHost.hidden = true; }
      if (filePlaceholder) {
        filePlaceholder.textContent = 'The reviewed plan contains no file-write operations. Review the repository node operations in the JSON above.';
        filePlaceholder.hidden = false;
      }
    }
  }

  if (preview) preview.dataset.state = 'prepared';
  const meta = $('#create-live-result-meta');
  if (meta) meta.textContent = 'Prepared CMS plan: ' + fields.length + ' dialog fields, ' + fileOperations.length + ' files, ' + nodeOperations.length + ' repository nodes. Pending your approval.';
}
function refreshButtons() {
  if (!$('#create-live-aem-panel')) return;
  const hasPlan = Boolean(prepared);
  const writeConfirmed = Boolean($('#create-live-confirm-write')?.checked);
  $('#create-live-copy').disabled = busy || !hasPlan;
  $('#create-live-apply').disabled = busy || !hasPlan || applied || Boolean(prepared?.writeAttempted) || !writeConfirmed;
}
function targetById(id) {
  return targets.find((target) => target.id === id) || null;
}
function isEligibleCmsTarget(target) {
  return target && target.role === 'author' &&
    ['aem65', 'aemaacs-sdk'].includes(target.platform) &&
    target.hasCredentials;
}


async function inspectRepositoryPath(target, repositoryPath, depth = 1) {
  try {
    return await postJson('/api/aem/repository/read', {
      targetId: target.id,
      path: repositoryPath,
      depth,
    });
  } catch (error) {
    if (error.status === 404 && error.code === 'REPOSITORY_PATH_NOT_FOUND' && error.safeToTreatAsMissing === true) return null;
    throw error;
  }
}

async function loadEligibleConnections() {
  const firstSelect = $('#create-live-target');
  if (!firstSelect) return;
  firstSelect.replaceChildren(new Option('Loading CMS connections...', ''));
  try {
    const response = await request('/api/aem/targets');
    targets = (response.targets || []).filter(isEligibleCmsTarget);
    const select = $('#create-live-target');
    if (!select) return;
    select.replaceChildren(new Option('Choose a CMS connection...', ''));
    targets.forEach((target) => select.add(new Option(target.name + ' - ' + target.baseUrl, target.id)));

    const preferred = targets.some((target) => target.id === selectedTargetId)
      ? selectedTargetId
      : (targets.length === 1 ? targets[0].id : '');
    select.value = preferred;
    selectedTargetId = select.value || '';

    const pathInput = $('#create-live-component-path');
    if (pathInput) pathInput.value = componentPathValue;

    const summary = $('#create-live-summary');
    if (summary) {
      if (!targets.length) summary.textContent = 'No eligible CMS connection is registered. Open Connections to add and test a supported Author connection.';
      else if (!selectedTargetId) summary.textContent = 'Choose a CMS connection and enter a component path.';
      else if (!componentPathValue.trim()) summary.textContent = 'CMS connection selected. Enter your component repository path.';
      else summary.textContent = currentContext ? 'Ready to check the selected component path and prepare the CMS plan.' : 'Connection selected. Enter a path, then Generate the component.';
    }
  } catch (error) {
    const select = $('#create-live-target');
    if (select) select.replaceChildren(new Option('Could not load CMS connections', ''));
    const summary = $('#create-live-summary');
    if (summary) summary.textContent = error.message;
    selectedTargetId = '';
  }
  refreshButtons();
  refreshCreateLiveGenerateButton();
}
export function normalizeComponentRoot(value, componentName = 'component') {
  const raw = String(value ?? '');
  // Accept an application components namespace or an exact component path. Namespace
  // placeholders must be replaced by the user before any repository write is prepared.
  let root = raw.trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/+$/, '');
  const parts = root.split('/').filter(Boolean);
  const validSegments = parts.every((part) => /^[A-Za-z0-9._-]+$/.test(part) && part !== '.' && part !== '..');
  const hasComponentNamespace = root.startsWith('/') &&
    parts[0] === 'apps' &&
    parts.length >= 3 &&
    parts[2] === 'components';
  if ((parts[1] || '').toLowerCase() === 'your-project') {
    throw new Error('Replace the your-project placeholder with your own AEM application namespace before preparing writes.');
  }
  if (!root || !validSegments || !hasComponentNamespace) {
    const received = root ? root.slice(0, 180) : '(empty)';
    throw new Error('Invalid component repository path: "' + received + '". Use /apps/<project>/components or a full component path under the selected application repository.');
  }

  const lastSegment = parts.at(-1);
  const namespaceSegments = new Set(['components', 'content', 'structure', 'experiencefragment', 'experience-fragment', 'experience-fragments', 'blocks', 'block', 'containers', 'container', 'page', 'pages', 'navigation', 'forms', 'form', 'layout', 'responsivegrid']);
  if (lastSegment === 'components') {
    root += '/' + camelCase(componentName);
  } else if (namespaceSegments.has(lastSegment)) {
    root += '/' + camelCase(componentName);
  }
  return root;
}

export function normalizeClientlibCategoryReferences(source, category) {
  const resolvedCategory = String(category || '').trim();
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(resolvedCategory)) throw new Error('The component client-library category is invalid.');
  return String(source || '').replace(
    /(clientlib\.(?:css|js)\s*@\s*categories\s*=\s*['"])[^'"]*(['"])/g,
    (_match, prefix, suffix) => prefix + resolvedCategory + suffix,
  );
}

export function htlOnly(source, category, componentFields = [], includeJs = false) {
  let htl = String(source || '');
  const fields = Array.isArray(componentFields) ? componentFields : [];
  const hasCompositeMultifield = fields.some((field) => field && field.type === 'multifield' && field.composite === true);
  const propertyNames = fields.filter((field) => field && field.type !== 'hidden' && !(field.type === 'multifield' && field.composite === true))
    .map((field) => field.name)
    .filter((name) => /^[A-Za-z][A-Za-z0-9_]*$/.test(String(name || '')));
  const contentNames = propertyNames.length ? propertyNames.map((name) => 'properties.' + name) : [];
  if (hasCompositeMultifield) contentNames.push('resource.hasChildren');
  const hasContentExpression = contentNames.length ? contentNames.join(' || ') : 'resource.hasChildren';
  const fallbackOpening = '<sly data-sly-use.clientlib="/libs/granite/sightly/templates/clientlib.html" data-sly-test.hasContent="' +
    '$' + '{' + hasContentExpression + '}">';

  const modelOpening = /<sly\s+data-sly-use\.model="[^"]+"[\s\S]*?data-sly-test\.hasContent="[^"]*"\s*>/m;
  if (modelOpening.test(htl)) htl = htl.replace(modelOpening, fallbackOpening);

  htl = htl.replace(/\$\{([^{}]*\bmodel\.[^{}]+)\}/g,
    (_match, expression) => '$' + '{' + expression.replace(/\bmodel\.([A-Za-z][A-Za-z0-9_]*)/g,
      (_fieldMatch, property) => property === 'id' ? 'resource.name' : 'properties.' + property) + '}');

  if (/data-sly-use\.model|\$\{model\./.test(htl)) {
    throw new Error('Could not safely convert the generated HTL to a model-free direct-JCR fallback. Review source HTL and Sling Model field bindings.');
  }
  if (!htl.includes('data-sly-use.clientlib')) {
    // Declare clientlib in its own outer scope so css/js calls inserted before the component
    // do not accidentally reference a variable declared inside a later data-sly-list block.
    htl = '<sly data-sly-use.clientlib="/libs/granite/sightly/templates/clientlib.html"/>\n' + htl;
  }
  if (!htl.includes('clientlib.css')) {
    const clientlibCall = '<sly data-sly-call="' + '$' + "{clientlib.css @ categories='" + category + "'}" + '"></sly>';
    htl = htl.replace(/<section\b/, clientlibCall + '\n  <section');
  }
  if (includeJs && !htl.includes('clientlib.js')) {
    const clientlibCall = '<sly data-sly-call="' + '$' + "{clientlib.js @ categories='" + category + "'}" + '"></sly>';
    htl = /<\/section\s*>/i.test(htl)
      ? htl.replace(/<\/section\s*>/i, clientlibCall + '\n</section>')
      : htl + '\n' + clientlibCall;
  }
  return normalizeClientlibCategoryReferences(htl, category);
}
export function componentResourceSuffix(sourcePath) {
  let normalized = String(sourcePath || '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) ||
      normalized.split('/').some((part) => part === '..')) {
    throw new Error('Unsafe generated path: ' + (sourcePath || '(empty)'));
  }

  // AEM-generated responses vary: some return FileVault source paths, while others
  // use JCR names (notably "cq:dialog") or component-relative filenames.
  normalized = normalized.replace(/^.*?src\/main\/content\/jcr_root\//, '');
  const parts = normalized.split('/').filter(Boolean);
  const componentsIndex = parts.indexOf('components');
  let suffix;
  if (parts[0] === 'apps' && componentsIndex >= 1) {
    if (parts.length === componentsIndex + 2 && ['cq:dialog', '_cq_dialog', 'cq:editConfig', '_cq_editConfig'].includes(parts.at(-1))) {
      suffix = parts.at(-1);
    } else if (parts.length <= componentsIndex + 2) {
      throw new Error('Generated AEM path does not identify a file beneath a component folder: ' + sourcePath);
    } else {
      suffix = parts.slice(componentsIndex + 2).join('/');
    }
  } else {
    suffix = normalized;
  }

  if (suffix === 'cq:dialog' || suffix === '_cq_dialog') suffix = '_cq_dialog/.content.xml';
  else if (suffix === 'cq:editConfig' || suffix === '_cq_editConfig') suffix = '_cq_editConfig/.content.xml';
  else if (suffix.startsWith('cq:dialog/')) suffix = '_cq_dialog/' + suffix.slice('cq:dialog/'.length);
  else if (suffix.startsWith('cq:editConfig/')) suffix = '_cq_editConfig/' + suffix.slice('cq:editConfig/'.length);

  const suffixParts = suffix.split('/').filter(Boolean);
  const validSuffix = suffixParts.length > 0 && suffixParts.every((part) =>
    /^[A-Za-z0-9._-]+$/.test(part) && part !== '.' && part !== '..'
  );
  if (!validSuffix) throw new Error('Unsupported generated component resource name: ' + sourcePath);
  return suffixParts.join('/');
}

function fallbackDialogXml(componentName) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<jcr:root xmlns:sling="http://sling.apache.org/jcr/sling/1.0" xmlns:cq="http://www.day.com/jcr/cq/1.0" xmlns:jcr="http://www.jcp.org/jcr/1.0" xmlns:nt="http://www.jcp.org/jcr/nt/1.0" jcr:primaryType="nt:unstructured" jcr:title="' + escapeXmlAttribute(componentName) + '" sling:resourceType="cq/gui/components/authoring/dialog">\n' +
    '  <content jcr:primaryType="nt:unstructured" sling:resourceType="granite/ui/components/coral/foundation/container">\n' +
    '    <items jcr:primaryType="nt:unstructured">\n' +
    '      <title jcr:primaryType="nt:unstructured" sling:resourceType="granite/ui/components/coral/foundation/form/textfield" fieldLabel="Title" name="./title"/>\n' +
    '      <description jcr:primaryType="nt:unstructured" sling:resourceType="granite/ui/components/coral/foundation/form/textarea" fieldLabel="Description" name="./description" rows="{Long}5"/>\n' +
    '      <fileReference jcr:primaryType="nt:unstructured" sling:resourceType="granite/ui/components/coral/foundation/form/pathfield" fieldLabel="Background image" name="./fileReference" rootPath="/content/dam"/>\n' +
    '      <imageAlt jcr:primaryType="nt:unstructured" sling:resourceType="granite/ui/components/coral/foundation/form/textfield" fieldLabel="Image alt text" name="./imageAlt"/>\n' +
    '      <linkText jcr:primaryType="nt:unstructured" sling:resourceType="granite/ui/components/coral/foundation/form/textfield" fieldLabel="CTA label" name="./linkText"/>\n' +
    '      <linkURL jcr:primaryType="nt:unstructured" sling:resourceType="granite/ui/components/coral/foundation/form/pathfield" fieldLabel="CTA URL" name="./linkURL" rootPath="/content"/>\n' +
    '    </items>\n  </content>\n</jcr:root>';
}

export function normalizeClientlibResourceSuffix(suffix) {
  const value = String(suffix || '').replaceAll('\\', '/');
  const match = value.match(/^clientlib\/(?:(css|js)\/)?([^/]+\.(?:css|js))$/i);
  if (!match) return value;
  const fileName = match[2];
  const folder = /\.css$/i.test(fileName) ? 'css' : 'js';
  if (match[1] && match[1].toLowerCase() === folder) return value;
  return `clientlib/${folder}/${fileName}`;
}

function buildPlan(componentRootOverride = null) {
  if (!currentContext || currentContext.input?.cms !== 'aem') {
    throw new Error('Generate an AEM component result first.');
  }
  const target = targetById($('#create-live-target')?.value || '');
  if (!target) {
    throw new Error('Choose a tested CMS connection supported for direct repository writes.');
  }
  const componentName = currentContext.data?.component?.name || currentContext.input?.name || 'Component';
  const componentRoot = componentRootOverride || normalizeComponentRoot($('#create-live-component-path')?.value, componentName);
  $('#create-live-component-path').value = componentRoot;
  const componentKey = camelCase(componentName);
  const namespace = (componentRoot.split('/')[2] || 'site').toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  const category = namespace + '.components.' + componentKey;
  const aemImplementation = currentContext.data?.implementations?.aem || {};
  const proxyOnly = aemImplementation.proxyComponent === true && Array.isArray(aemImplementation.fields) && aemImplementation.fields.length === 0;
  const generatedFiles = aemImplementation.files;
  if (!Array.isArray(generatedFiles)) throw new Error('The result does not contain generated AEM resources.');
  const directJcrHtl = String(aemImplementation.directJcrHtl || '').trim();
  const hasJsAsset = generatedFiles.some((file) => String(file?.lang || '').toLowerCase() === 'js' || /\.m?js$/i.test(String(file?.name || '')));

  const fileChanges = [];
  const skippedJavaFiles = [];
  const skippedSourceFiles = [];
  for (const file of generatedFiles) {
    const sourcePath = String(file?.name || '');
    if (String(file?.lang || '').toLowerCase() === 'java' || /\.java$/i.test(sourcePath)) {
      skippedJavaFiles.push({
        path: sourcePath,
        reason: 'Java source cannot be compiled or activated by direct JCR writes. The direct route uses an HTL-only fallback.',
      });
      continue;
    }
    if (/\/component\.json$/i.test(sourcePath)) {
      skippedSourceFiles.push({ path: sourcePath, reason: 'Codebase manifest only. It is available in the Files preview but is not an AEM JCR resource.' });
      continue;
    }
    const suffix = normalizeClientlibResourceSuffix(componentResourceSuffix(sourcePath));
    const isHtlFile = /\.html?$/i.test(suffix) || String(file?.lang || '').toLowerCase() === 'htl';
    const isMainComponentHtl = isHtlFile && (sourcePath.toLowerCase().endsWith('/' + componentKey.toLowerCase() + '.html') || sourcePath.toLowerCase().endsWith('/' + componentKey.toLowerCase() + '.htl'));
    const markup = isMainComponentHtl && directJcrHtl ? directJcrHtl : file.code;
    let content = isHtlFile
      ? htlOnly(markup, category, aemImplementation.fields, hasJsAsset && isMainComponentHtl)
      : String(file.code ?? '');
    if (/\/clientlib\/\.content\.xml$/i.test(suffix)) {
      content = content.replace(/categories="\[[^"]*\]"/, 'categories="[' + category + ']"');
    }
    fileChanges.push({
      path: componentRoot.slice(1) + '/' + suffix,
      action: 'create',
      content,
    });
  }

  const componentRelativePath = componentRoot.slice(1) + '/';
  const ensureClientlibIndex = (kind) => {
    const indexPath = componentRelativePath + 'clientlib/' + kind + '.txt';
    const assetPrefix = componentRelativePath + 'clientlib/' + kind + '/';
    const extension = kind === 'css' ? /\.css$/i : /\.js$/i;
    const assetNames = fileChanges
      .filter((item) => item.path.startsWith(assetPrefix) && extension.test(item.path))
      .map((item) => item.path.slice(assetPrefix.length))
      .sort((a, b) => a.localeCompare(b));
    const existing = fileChanges.find((item) => item.path === indexPath);
    if (kind === 'js' && assetNames.length === 0 && !existing) return;
    const content = ['#base=' + kind, ...assetNames].join('\n') + '\n';
    if (existing) existing.content = content;
    else fileChanges.push({ path: indexPath, action: 'create', content });
  };
  if (!proxyOnly) {
    ensureClientlibIndex('css');
    ensureClientlibIndex('js');
  }

  const hasSuffix = (suffix) => fileChanges.some((item) => item.path === componentRoot.slice(1) + '/' + suffix);
  if (!proxyOnly) {
  const dialogChange = fileChanges.find((item) => item.path === componentRoot.slice(1) + '/_cq_dialog/.content.xml');
  if (!dialogChange) {
    fileChanges.push({
      path: componentRoot.slice(1) + '/_cq_dialog/.content.xml',
      action: 'create',
      content: fallbackDialogXml(componentName),
    });
  } else if (!/<jcr:root\b/.test(dialogChange.content)) {
    // Some models label the dialog resource as "cq:dialog" but return content without
    // valid FileVault XML. Recover with a known-good Granite dialog instead of crashing.
    dialogChange.content = fallbackDialogXml(componentName);
  }
  if (!hasSuffix('.content.xml')) {
    fileChanges.unshift({
      path: componentRoot.slice(1) + '/.content.xml',
      action: 'create',
      content: '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0" jcr:primaryType="cq:Component" jcr:title="' +
        escapeXmlAttribute(componentName) + '" componentGroup="Content"/>',
    });
  }
  if (!hasSuffix('clientlib/.content.xml')) {
    fileChanges.push({
      path: componentRoot.slice(1) + '/clientlib/.content.xml',
      action: 'create',
      content: '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0" jcr:primaryType="cq:ClientLibraryFolder" categories="[' +
        category + ']" allowProxy="{Boolean}true"/>',
    });
  }
  if (!hasSuffix('clientlib/css.txt')) {
    fileChanges.push({
      path: componentRoot.slice(1) + '/clientlib/css.txt',
      action: 'create',
      content: componentKey + '.css\n',
    });
  }
  }

  const converted = convertSourceProjectPlanToInstancePlan({
    title: componentName + ' - direct AEM implementation',
    summary: 'Create component metadata, dialog, HTL markup and client-library resources in the selected repository. The direct JCR route does not compile Java source.',
    steps: [
      'Test the selected CMS connection.',
      'Review the exact JCR paths and primary types.',
      'Apply only explicitly approved repository operations.',
    ],
    assumptions: [
      'The target is an authenticated Author connection supported for direct repository writes.',
      'The component path has been inspected for existing resources and collisions.',
      'This direct implementation route uses HTL-only rendering.',
    ],
    risks: skippedJavaFiles.map((item) => item.path + ': ' + item.reason),
    validationChecks: [
      'Read component, dialog and client-library paths after writing.',
      'Confirm the component group appears in the component browser.',
      'Check dialog persistence and rendered output on a test page.',
      'Confirm the client-library category loads the CSS.',
    ],
    fileChanges,
  });
  const validatedPlan = validateInstanceOnlyPlan(converted.plan);
  return { target, componentRoot, plan: validatedPlan, skippedJavaFiles, skippedSourceFiles, warnings: converted.warnings };
}

async function chooseUnusedComponentRoot(target, requestedRoot, componentName) {
  // One authenticated repository read checks both connectivity and path occupancy.
  // Do not probe numbered sibling paths: every additional GET adds latency and can hide collisions.
  const existing = await inspectRepositoryPath(target, requestedRoot, 1);
  if (existing) {
    throw new Error('The component path already exists: ' + requestedRoot + '. Choose a new unused component path, then leave the field to retry validation. No resources were written.');
  }
  return { path: requestedRoot, adjusted: false };
}
async function prepareReview() {
  prepared = null;
  applied = false;

  $('#create-live-review').hidden = true;
  $('#create-live-confirm-write').checked = false;
  if ($('#create-live-operation-results')) { $('#create-live-operation-results').replaceChildren(); $('#create-live-operation-results').hidden = true; }
  const target = targetById($('#create-live-target')?.value || '');
  if (!target) throw new Error('Choose a tested CMS connection supported for direct repository writes.');
  const componentName = currentContext?.data?.component?.name || currentContext?.input?.name || 'Component';
  const inputPath = String($('#create-live-component-path')?.value || '').trim();
  if (!inputPath) throw new Error('Enter your application repository path, for example /apps/your-project/components/content/heroBanner. Replace your-project with your own namespace.');
  const requestedRoot = normalizeComponentRoot(inputPath, componentName);
  $('#create-live-component-path').value = requestedRoot;
  componentPathValue = requestedRoot;
  $('#create-live-summary').textContent = 'Preparing the repository plan from the validated CMS connection and component path...';
  showOutput('Preparing the exact CMS resources for review. No repository writes will happen in this step.', 'info');
  renderWaitingPlanPreview();
  const preflightMatches = preflightCache && preflightCache.targetId === target.id && preflightCache.componentRoot === requestedRoot;
  const resolved = preflightMatches
    ? { path: requestedRoot, adjusted: false }
    : await chooseUnusedComponentRoot(target, requestedRoot, componentName);
  const aemImplementation = currentContext.data?.implementations?.aem || {};
  const pureProxy = aemImplementation.proxyComponent === true && Array.isArray(aemImplementation.fields) && aemImplementation.fields.length === 0;
  if (pureProxy) {
    const superType = String(aemImplementation.resourceSuperType || '');
    if (!superType || superType.split('/').some((segment) => !/^[A-Za-z0-9._-]+$/.test(segment) || segment === '.' || segment === '..')) {
      throw new Error('The proxy component has no valid Sling resourceSuperType. Regenerate it with the exact Core Component resource type.');
    }
    const superTypePath = '/apps/' + superType;
    const existingSuperType = await inspectRepositoryPath(target, superTypePath, 1);
    if (!existingSuperType) {
      throw new Error('The requested Core Component supertype could not be found in this AEM Author: ' + superTypePath + '. Verify that the Core Components version providing this resource type is installed before creating the proxy.');
    }
  }
  preflightCache = null;
  if (resolved.adjusted) {
    $('#create-live-component-path').value = resolved.path;
    componentPathValue = resolved.path;
    $('#create-live-summary').textContent = 'That component already exists. A new unused component path has been selected: ' + resolved.path;
    showOutput('The requested component path is already occupied. Forge selected a new sibling path for this new component; the existing component will not be overwritten.', 'warn', {
      existingPath: resolved.requestedRoot,
      newComponentPath: resolved.path,
    });
  }
  const next = buildPlan(resolved.path);

  prepared = next;
  renderPreparedPlanPreview(next);
  $('#create-live-operations').textContent = JSON.stringify({
    target: {
      name: next.target.name,
      platform: next.target.platform,
      role: next.target.role,
      baseUrl: next.target.baseUrl,
    },
    componentRoot: next.componentRoot,
    operations: next.plan.repositoryOperations,
    skippedJavaFiles: next.skippedJavaFiles,
    sourceOnlyFiles: next.skippedSourceFiles,
    warnings: next.warnings,
    note: 'Plan only. Nothing has been written yet.',
  }, null, 2);
  $('#create-live-operation-count').textContent = next.plan.repositoryOperations.length + ' repository operations · ' + (next.skippedJavaFiles.length + next.skippedSourceFiles.length) + ' source-only files excluded';
  $('#create-live-review').hidden = false;
  $('#create-live-summary').textContent = resolved.adjusted
    ? 'Existing path detected; new component path selected: ' + next.componentRoot + '. Review the paths before writing.'
    : 'CMS connection and unused component path verified - ' + next.target.name + '. Review the exact resources before writing.';
  showOutput(
    resolved.adjusted
      ? 'Plan prepared with a new unused component path. Existing resources will not be overwritten.'
      : 'CMS connection and path verified. No repository operation has run; approve the reviewed plan to write resources.',
    resolved.adjusted ? 'warn' : 'success',
    { requestedPath: resolved.requestedRoot || null, componentRoot: next.componentRoot, skippedJavaFiles: next.skippedJavaFiles }
  );
  reportBrowserLog('INFO', 'live-implementation', 'AEM component plan prepared for review.', {
    targetId: next.target.id,
    operationCount: next.plan.repositoryOperations.length,
    componentRoot: next.componentRoot,
  });
}

function renderOperationResults(result) {
  const host = $('#create-live-operation-results');
  if (!host) return;
  const appliedEntries = Array.isArray(result && result.applied) ? result.applied : [];
  const failedEntries = Array.isArray(result && result.failed) ? result.failed : [];
  const summary = result && result.summary ? result.summary : {};
  const succeeded = Number(summary.succeeded !== undefined ? summary.succeeded : appliedEntries.length);
  const failed = Number(summary.failed !== undefined ? summary.failed : failedEntries.length);
  host.replaceChildren();

  const heading = document.createElement('div');
  heading.className = 'live-aem-operation-results-heading';
  const title = document.createElement('strong');
  title.textContent = succeeded + ' succeeded - ' + failed + ' failed';
  const total = Number(summary.totalOperations !== undefined ? summary.totalOperations : succeeded + failed);
  const note = document.createElement('span');
  note.textContent = total + ' operations requested';
  heading.append(title, note);
  host.append(heading);

  const addGroup = (label, entries, kind) => {
    if (!entries.length) return;
    const group = document.createElement('section');
    group.className = 'live-aem-operation-group is-' + kind;
    const groupHeading = document.createElement('h5');
    groupHeading.textContent = label;
    const list = document.createElement('ol');
    for (const entry of entries) {
      const item = document.createElement('li');
      item.className = 'live-aem-operation-item is-' + kind;
      const status = document.createElement('span');
      status.className = 'live-aem-operation-status';
      status.textContent = kind === 'success' ? 'OK' : 'FAILED';
      const body = document.createElement('div');
      body.className = 'live-aem-operation-body';
      const path = document.createElement('code');
      path.textContent = entry.path || '(missing repository path)';
      const meta = document.createElement('p');
      meta.textContent = (entry.type || 'operation') + ' - ' + (kind === 'success' ? (entry.action || 'written and verified') : (entry.code || 'operation failed'));
      body.append(path, meta);
      item.append(status, body);
      if (kind === 'failure') {
        const reason = document.createElement('p');
        reason.className = 'live-aem-operation-error';
        const details = [];
        if (entry.httpStatus) details.push('HTTP ' + entry.httpStatus);
        if (Number.isFinite(entry.attempts)) details.push(entry.attempts + ' attempts');
        if (entry.retryable === true) details.push('retryable');
        reason.textContent = [entry.message || 'No error message was returned.', details.join(' - ')].filter(Boolean).join(' - ');
        item.append(reason);
      }
      list.append(item);
    }
    group.append(groupHeading, list);
    host.append(group);
  };
  addGroup('Successful operations', appliedEntries, 'success');
  addGroup('Failed operations', failedEntries, 'failure');
  host.hidden = false;
}

async function applyReviewedResources() {
  if (!prepared) throw new Error('Prepare and review the operation list first.');
  if (!$('#create-live-confirm-write').checked) throw new Error('Explicit write approval is required.');
  if (prepared.writeAttempted) throw new Error('This operation batch has already been submitted. Prepare a fresh component path before another write attempt.');

  // A network failure can happen after CMS has accepted some writes. Never blindly repost
  // the same batch; a new attempt requires a freshly reviewed unused component path.
  prepared.writeAttempted = true;
  refreshButtons();
  let response;
  try {
    response = await postJson('/api/aem/repository/write', {
      targetId: prepared.target.id,
      confirmWrites: true,
      operations: prepared.plan.repositoryOperations,
    });
  } catch (error) {
    const message = 'The CMS did not return a verified result. Some resources may have been written. Review Logs and prepare a fresh component path before retrying. Details: ' + (error.message || 'Unknown request error');
    $('#create-live-summary').textContent = 'Write outcome unknown. Do not resubmit this batch.';
    showOutput(message, 'error');
    notify('Write outcome unknown', 'Check Logs and prepare a fresh component path before retrying.', 'error');
    reportBrowserLog('ERROR', 'live-implementation', 'CMS write request returned no verified batch result.', {
      targetId: prepared.target.id,
      componentRoot: prepared.componentRoot,
      message: error.message || 'Unknown request error',
    });
    return;
  }

  const result = response.result || {};
  const hasDetailedResult = Array.isArray(result.applied) && Array.isArray(result.failed);
  if (hasDetailedResult) renderOperationResults(result);
  const succeeded = Number(result.summary && result.summary.succeeded !== undefined ? result.summary.succeeded : (result.applied || []).length || 0);
  const failedCount = Number(result.summary && result.summary.failed !== undefined ? result.summary.failed : (result.failed || []).length || 0);
  const failedEntries = Array.isArray(result.failed) ? result.failed : [];

  if (!response.ok || !hasDetailedResult || result.ok !== true || failedCount > 0) {
    const failedSummary = failedEntries.map((entry) => ({
      index: entry.index,
      type: entry.type,
      path: entry.path,
      code: entry.code,
      httpStatus: entry.httpStatus,
      message: entry.message,
      attempts: entry.attempts,
      retryable: entry.retryable,
    }));
    $('#create-live-summary').textContent = 'Partial result: ' + succeeded + ' succeeded - ' + failedCount + ' failed. Review each path below. Prepare a fresh component path before another write.';
    showOutput(
      hasDetailedResult
        ? 'Repository write partially completed: ' + succeeded + ' succeeded and ' + failedCount + ' failed. Successful writes were not rolled back. See the operation list below and Logs for per-path details.'
        : 'The CMS response did not include verifiable per-operation results. Check Logs before proceeding.',
      'error',
      { targetId: prepared.target.id, componentPath: prepared.componentRoot, failed: failedSummary }
    );
    notify('Component implementation partially completed', succeeded + ' succeeded - ' + failedCount + ' failed. See the operation results below.', 'error');
    reportBrowserLog('ERROR', 'live-implementation', 'Repository write batch completed with failures.', {
      targetId: prepared.target.id,
      componentRoot: prepared.componentRoot,
      succeeded,
      failed: failedCount,
      failedOperations: failedSummary,
    });
    return;
  }

  applied = true;
  $('#create-live-summary').textContent = 'CMS resources created and verified: ' + succeeded + ' operations.';
  showOutput('Component resources were created and verified. ' + succeeded + ' operations succeeded with no failures.', 'success', {
    component: currentContext.data && currentContext.data.component ? currentContext.data.component.name : currentContext.input.name,
    componentPath: prepared.componentRoot,
    operationsSucceeded: succeeded,
    operationsFailed: 0,
  });
  notify('Component created successfully', succeeded + ' repository operations succeeded. Review the operation list below, then test the component on an AEM page.', 'success');
  reportBrowserLog('INFO', 'live-implementation', 'Approved generated CMS resources were applied and verified.', {
    targetId: prepared.target.id,
    componentRoot: prepared.componentRoot,
    operationCount: prepared.plan.repositoryOperations.length,
    succeeded,
    failed: 0,
  });
}
function resetContext() {
  prepared = null;
  applied = false;
  if ($('#create-live-review')) $('#create-live-review').hidden = true;
  if ($('#create-live-confirm-write')) $('#create-live-confirm-write').checked = false;
  if ($('#create-live-operation-results')) {
    $('#create-live-operation-results').replaceChildren();
    $('#create-live-operation-results').hidden = true;
  }
  renderWaitingPlanPreview();
  if ($('#create-live-output')) showOutput('Generate validates the CMS path and prepares the repository plan. Nothing is written until you explicitly approve it.', 'info');
  refreshButtons();
}
async function populateConnectionSelect() {
  const select = $('#create-live-target');
  if (!select) return;
  const previous = targets.some((target) => target.id === selectedTargetId) ? selectedTargetId : '';
  select.replaceChildren(new Option('Choose a CMS connection...', ''));
  targets.forEach((target) => select.add(new Option(target.name + ' - ' + target.baseUrl, target.id)));
  select.value = previous;
  selectedTargetId = select.value || '';
}

async function prepareAfterGenerate() {
  try {
    await prepareReview();
  } catch (error) {
    prepared = null;
    applied = false;
    if ($('#create-live-review')) $('#create-live-review').hidden = true;
    if ($('#create-live-confirm-write')) $('#create-live-confirm-write').checked = false;
    const message = error.message || 'The CMS implementation plan could not be prepared.';
    if ($('#create-live-summary')) $('#create-live-summary').textContent = message;
    showOutput(message, 'error');
    reportBrowserLog('ERROR', 'live-implementation', 'CMS operation plan preparation failed after generation.', {
      targetId: selectedTargetId || null,
      componentPath: componentPathValue || null,
      message,
    });
    refreshButtons();
  }
}

export async function setCreateLiveContext(data, input) {
  currentContext = { data, input };
  resetContext();
  if (input?.cms !== 'aem' || !$('#create-live-aem-panel')) {
    refreshCreateLiveGenerateButton();
    return;
  }
  await populateConnectionSelect();
  const pathInput = $('#create-live-component-path');
  if (pathInput) pathInput.value = componentPathValue;
  refreshButtons();
  await prepareAfterGenerate();
  refreshCreateLiveGenerateButton();
}
export function mountCreateLiveImplementationScreen() {
  const panel = $('#create-live-aem-panel');
  if (!panel) {
    refreshCreateLiveGenerateButton();
    return;
  }
  panel.hidden = ($('#f-cms')?.value || 'aem') !== 'aem';
  const pathInput = $('#create-live-component-path');
  if (pathInput) pathInput.value = componentPathValue;
  const targetSelect = $('#create-live-target');
  if (targetSelect && selectedTargetId) targetSelect.value = selectedTargetId;
  loadEligibleConnections();
  refreshCreateLiveGenerateButton();
}

export function initCreateLiveImplementation() {
  if (initialized) return;
  initialized = true;

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('#create-live-apply, #create-live-copy');
    if (!button) return;
    event.preventDefault();
    if (busy) return;
    busy = true;
    refreshButtons();
    try {
      if (button.id === 'create-live-apply') await applyReviewedResources();
      else if (button.id === 'create-live-copy') {
        if (!prepared) throw new Error('Prepare the operation list first.');
        await navigator.clipboard.writeText(JSON.stringify(prepared.plan, null, 2));
        showOutput('Reviewed operation JSON copied to the clipboard.', 'success');
      }
    } catch (error) {
      const message = error.message || 'The CMS action failed.';
      showOutput(message, 'error');
      const title = button.id === 'create-live-apply' ? 'Component creation failed' : 'CMS action failed';
      notify(title, message, 'error');
      reportBrowserLog('ERROR', 'live-implementation', 'CMS implementation action failed.', {
        action: button.id,
        message,
      });
    } finally {
      busy = false;
      refreshButtons();
      refreshCreateLiveGenerateButton();
    }
  });

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target.id === 'create-live-component-path') {
      componentPathValue = target.value;
      const formError = $('#form-error');
      if (formError) { formError.hidden = true; formError.textContent = ''; }
      showOutput('Path edited. Click Generate to validate the new path and prepare the CMS plan. No repository check is running while you type.', 'info');
      if (prepared || $('#create-live-plan-preview')?.dataset.state === 'prepared') invalidatePreparedPlan();
      const summary = $('#create-live-summary');
      if (summary) {
        const problem = createLiveInputProblem('aem');
        summary.textContent = problem
          ? problem
          : (currentContext ? 'Path changed. Generate to validate the new path and prepare an updated plan.' : 'Path entered. Generate the component to continue.');
      }
      refreshButtons();
      refreshCreateLiveGenerateButton();
      return;
    }

    if (target.id === 'f-name' || target.id === 'f-desc') {
      refreshCreateLiveGenerateButton();
      if (currentContext) {
        currentContext = null;
        invalidatePreparedPlan();
        const summary = $('#create-live-summary');
        if (summary) summary.textContent = 'Component inputs changed. Generate again to prepare a matching CMS plan.';
      }
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.id === 'create-live-component-path') {
      componentPathValue = event.target.value;
      // Changing the path only updates local form state. Repository validation runs once on Generate.
      return;
    }
    if (event.target.id === 'f-cms') {
      const panel = $('#create-live-aem-panel');
      if (panel) panel.hidden = event.target.value !== 'aem';
      if (currentContext && currentContext.input?.cms !== event.target.value) {
        currentContext = null;
        invalidatePreparedPlan();
      }
      refreshCreateLiveGenerateButton();
      refreshButtons();
      return;
    }

    if (event.target.id === 'create-live-confirm-write') {
      refreshButtons();
      return;
    }

    if (event.target.id === 'create-live-target') {
      selectedTargetId = event.target.value || '';
      const formError = $('#form-error');
      if (formError) { formError.hidden = true; formError.textContent = ''; }
      showOutput('CMS connection changed. Click Generate to validate this connection and prepare the updated plan. No write has been attempted.', 'info');
      invalidatePreparedPlan();
      const summary = $('#create-live-summary');
      if (summary) summary.textContent = selectedTargetId
        ? 'CMS connection selected. Generate to validate the path and prepare the implementation plan.'
        : 'Choose a CMS connection and enter a component path.';
      // Changing the connection invalidates any prepared plan. Generate performs the next repository preflight.
      refreshButtons();
      refreshCreateLiveGenerateButton();
    }
  });
}
