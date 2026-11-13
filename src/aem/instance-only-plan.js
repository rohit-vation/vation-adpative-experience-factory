export function validateInstanceOnlyPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || plan.mode !== 'instance-only') {
    throw new Error('The response must be an instance-only plan with mode: "instance-only".');
  }
  if (typeof plan.title !== 'string' || !plan.title.trim() ||
      typeof plan.summary !== 'string' || !plan.summary.trim()) {
    throw new Error('The plan must include a title and summary.');
  }
  if (typeof plan.needsClarification !== 'boolean') {
    throw new Error('The plan must include needsClarification as true or false.');
  }
  const arrayFields = ['clarificationQuestions', 'steps', 'assumptions', 'risks', 'validationChecks'];
  if (arrayFields.some((key) => !Array.isArray(plan[key]) || plan[key].length > 40 ||
      plan[key].some((item) => typeof item !== 'string' || item.length > 1500))) {
    throw new Error('The plan is missing a required array or contains an invalid entry.');
  }
  if (plan.needsClarification) {
    if (!plan.clarificationQuestions.length) {
      throw new Error('A clarification-only plan must include at least one precise clarification question.');
    }
    if (!Array.isArray(plan.repositoryOperations) || plan.repositoryOperations.length !== 0) {
      throw new Error('A clarification-only plan must have repositoryOperations: []. Nothing should be written before clarification.');
    }
    return plan;
  }
  if (!Array.isArray(plan.repositoryOperations) || plan.repositoryOperations.length < 1 ||
      plan.repositoryOperations.length > 40) {
    throw new Error('repositoryOperations must contain 1–40 reviewed node/file operations.');
  }
  const seen = new Set();
  for (const [index, operation] of plan.repositoryOperations.entries()) {
    if (!operation || !['node', 'file'].includes(operation.type)) {
      throw new Error('Operation ' + (index + 1) + ' must use type node or file.');
    }
    if (typeof operation.path !== 'string' || !operation.path.startsWith('/') ||
        operation.path.split('/').some((part) => part === '..') ||
        !/^\/(?:apps|content|conf)(?:\/|$)/.test(operation.path)) {
      throw new Error('Operation ' + (index + 1) + ' has an invalid or unsupported repository path: ' + (operation.path || '(missing)'));
    }
    if (seen.has(operation.path)) throw new Error('Duplicate repository operation path: ' + operation.path);
    seen.add(operation.path);
    if (operation.type === 'node') {
      if (typeof operation.primaryType !== 'string' || !operation.primaryType.trim() ||
          !operation.properties || typeof operation.properties !== 'object' || Array.isArray(operation.properties)) {
        throw new Error('Node operation ' + operation.path + ' needs primaryType and a flat properties object.');
      }
      const validScalar = (value) => ['string', 'number', 'boolean'].includes(typeof value) ||
        (Array.isArray(value) && value.every((item) => ['string', 'number', 'boolean'].includes(typeof item)));
      if (Object.values(operation.properties).some((value) => !validScalar(value))) {
        throw new Error('Node properties must be flat scalar values or arrays of scalars: ' + operation.path);
      }
    } else if (typeof operation.content !== 'string' || typeof operation.mimeType !== 'string' ||
        !/^[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+$/.test(operation.mimeType) ||
        new TextEncoder().encode(operation.content).length > 1_048_576) {
      throw new Error('File operation ' + operation.path + ' needs a valid mimeType and complete content under 1 MB.');
    }
    const serialized = JSON.stringify(operation);
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-[A-Za-z0-9]{24,}\b/.test(serialized)) {
      throw new Error('Potential secret or private key detected in ' + operation.path + '; remove secrets before importing.');
    }
    if (serialized.length > 1_100_000) throw new Error('Operation ' + operation.path + ' is too large.');
  }
  return plan;
}

function decodeXmlEntity(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)));
}

function parseVaultProperty(value) {
  const typed = value.match(/^\{(Boolean|Long|Integer|Double|Decimal|String)\}([\s\S]*)$/);
  if (typed) {
    const type = typed[1];
    const raw = typed[2];
    if (type === 'Boolean') return raw.toLowerCase() === 'true';
    if (['Long', 'Integer', 'Double', 'Decimal'].includes(type)) {
      const number = Number(raw);
      return Number.isFinite(number) ? number : raw;
    }
    value = raw;
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    const body = value.slice(1, -1);
    return body ? body.split(',').map(item => item.trim()) : [];
  }
  return value;
}

function parseVaultXml(xml) {
  if (typeof xml !== 'string' || !xml.trim()) throw new Error('FileVault .content.xml is empty.');
  if (/<!DOCTYPE/i.test(xml) || /<!ENTITY/i.test(xml)) throw new Error('DTD/entity declarations are not supported in FileVault metadata.');
  let index = 0;
  let root = null;
  const stack = [];

  const findTagEnd = start => {
    let quote = null;
    for (let pos = start; pos < xml.length; pos += 1) {
      const char = xml[pos];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '>') return pos;
    }
    throw new Error('Unterminated XML tag in FileVault metadata.');
  };

  const parseStartTag = raw => {
    const body = raw.slice(1, raw.length - 1).replace(/\/\s*$/, '').trim();
    const nameMatch = body.match(/^([A-Za-z_][A-Za-z0-9_.:-]*)/);
    if (!nameMatch) throw new Error('Unsupported XML element in FileVault metadata.');
    const name = nameMatch[1];
    const rest = body.slice(name.length);
    const properties = {};
    let cursor = 0;
    const attributePattern = /\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*("[^"]*"|'[^']*')/gy;
    while (cursor < rest.length) {
      if (!rest.slice(cursor).trim()) break;
      attributePattern.lastIndex = cursor;
      const match = attributePattern.exec(rest);
      if (!match) throw new Error('Could not safely parse XML attributes on <' + name + '>.');
      cursor = attributePattern.lastIndex;
      const attrName = match[1];
      if (attrName === 'xmlns' || attrName.startsWith('xmlns:')) continue;
      properties[attrName] = parseVaultProperty(decodeXmlEntity(match[2].slice(1, -1)));
    }
    return { name, properties, children: [] };
  };

  while (index < xml.length) {
    if (xml[index] !== '<') {
      const end = xml.indexOf('<', index);
      const text = xml.slice(index, end < 0 ? xml.length : end);
      if (text.trim()) throw new Error('Non-whitespace XML text is not valid component .content.xml node metadata.');
      index = end < 0 ? xml.length : end;
      continue;
    }
    if (xml.startsWith('<!--', index)) {
      const end = xml.indexOf('-->', index + 4);
      if (end < 0) throw new Error('Unterminated XML comment.');
      index = end + 3;
      continue;
    }
    if (xml.startsWith('<?', index)) {
      const end = xml.indexOf('?>', index + 2);
      if (end < 0) throw new Error('Unterminated XML processing instruction.');
      index = end + 2;
      continue;
    }
    if (xml.startsWith('<!', index)) throw new Error('Unsupported XML declaration in FileVault metadata.');
    const end = findTagEnd(index + 1);
    const raw = xml.slice(index, end + 1);
    index = end + 1;

    if (raw.startsWith('</')) {
      const closeName = raw.slice(2, -1).trim();
      const current = stack.pop();
      if (!current || current.name !== closeName) throw new Error('Mismatched XML closing tag: ' + closeName + '.');
      continue;
    }

    const selfClosing = /\/\s*>$/.test(raw);
    const node = parseStartTag(raw);
    if (stack.length) stack[stack.length - 1].children.push(node);
    else if (root) throw new Error('FileVault metadata must contain exactly one root element.');
    else root = node;
    if (!selfClosing) stack.push(node);
  }

  if (stack.length) throw new Error('Unclosed XML element: ' + stack[stack.length - 1].name + '.');
  if (!root || root.name !== 'jcr:root') throw new Error('FileVault metadata must use a <jcr:root> element.');
  return root;
}

const FILEVAULT_SEGMENT_MAP = new Map([
  ['_cq_dialog', 'cq:dialog'],
  ['_cq_editConfig', 'cq:editConfig'],
  ['_cq_design_dialog', 'cq:design_dialog'],
  ['_cq_htmlTag', 'cq:htmlTag'],
  ['_cq_template', 'cq:template'],
  ['_jcr_content', 'jcr:content'],
  ['_rep_policy', 'rep:policy'],
]);

function mapFileVaultSourcePath(sourcePath) {
  if (typeof sourcePath !== 'string' || !sourcePath.trim()) throw new Error('Source path is missing.');
  const normalized = sourcePath.replaceAll('\\', '/').replace(/^\.\//, '');
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.split('/').some(segment => segment === '..')) {
    throw new Error('Only safe workspace-relative FileVault paths can be mapped.');
  }
  // Accept normal Maven FileVault paths and generated AEM repository paths such as
  // apps/aef/components/hero-banner/hero-banner.html. Both are relative serializations
  // of JCR resources; build-only paths (core/, ui.frontend/, tests) still do not map.
  const match = normalized.match(/(?:^|\/)src\/main\/content\/jcr_root\/(.+)$/);
  const relativeJcrPath = match ? match[1] : (/^(?:apps|content|conf)\//.test(normalized) ? normalized : null);
  if (!relativeJcrPath) throw new Error('This is a source/build path, not an AEM FileVault resource under apps/, content/, conf/, or src/main/content/jcr_root.');
  const segments = relativeJcrPath.split('/').filter(Boolean);
  if (!segments.length || segments.some(segment => segment === '.' || segment === '..')) throw new Error('Unsafe FileVault resource path.');
  return '/' + segments.map(segment => FILEVAULT_SEGMENT_MAP.get(segment) || segment).join('/');
}

function xmlNodeOperations(node, path, output, warnings) {
  const properties = { ...node.properties };
  let primaryType = properties['jcr:primaryType'];
  delete properties['jcr:primaryType'];
  if (typeof primaryType !== 'string' || !primaryType.trim()) {
    primaryType = 'nt:unstructured';
    warnings.push('No jcr:primaryType was found for ' + path + '; mapped it as nt:unstructured for review.');
  }
  output.push({ type: 'node', path, primaryType, properties });
  for (const child of node.children) {
    xmlNodeOperations(child, path + '/' + child.name, output, warnings);
  }
}

function mimeTypeForPath(path) {
  const extension = path.toLowerCase().split('.').pop();
  return ({
    html: 'text/html',
    htm: 'text/html',
    htl: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    txt: 'text/plain',
    xml: 'application/xml',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  })[extension] || 'application/octet-stream';
}

export function convertSourceProjectPlanToInstancePlan(sourcePlan) {
  if (!sourcePlan || typeof sourcePlan !== 'object' || Array.isArray(sourcePlan) || !Array.isArray(sourcePlan.fileChanges)) {
    throw new Error('The response does not contain a source-project fileChanges array to convert.');
  }
  if (!sourcePlan.fileChanges.length || sourcePlan.fileChanges.length > 30) throw new Error('Source-plan conversion needs between 1 and 30 fileChanges.');
  const repositoryOperations = [];
  const warnings = [];
  const skippedFiles = [];
  const sourceToJcr = [];

  for (const change of sourcePlan.fileChanges) {
    if (!change || typeof change.path !== 'string' || typeof change.content !== 'string') {
      skippedFiles.push({ path: change?.path || '(missing path)', reason: 'Missing path or complete file content.' });
      continue;
    }
    let jcrPath;
    try { jcrPath = mapFileVaultSourcePath(change.path); }
    catch (error) {
      skippedFiles.push({ path: change.path, reason: error.message });
      continue;
    }

    if (change.path.replaceAll('\\', '/').endsWith('/.content.xml')) {
      const nodePath = jcrPath.slice(0, -'/.content.xml'.length) || '/';
      try {
        const xmlRoot = parseVaultXml(change.content);
        const start = repositoryOperations.length;
        xmlNodeOperations(xmlRoot, nodePath, repositoryOperations, warnings);
        for (const operation of repositoryOperations.slice(start)) sourceToJcr.push({ sourcePath: change.path, jcrPath: operation.path, type: 'node' });
      } catch (error) {
        skippedFiles.push({ path: change.path, reason: 'Could not convert FileVault XML: ' + error.message });
      }
      continue;
    }

    if (change.action === 'update') {
      skippedFiles.push({ path: change.path, reason: 'Maps to ' + jcrPath + ', but the instance-only direct writer does not overwrite existing file resources. Use an approved source deployment workflow or choose a new component path.' });
      continue;
    }
    if (change.action !== 'create') {
      skippedFiles.push({ path: change.path, reason: 'Unsupported source action: ' + (change.action || '(missing)') + '.' });
      continue;
    }
    if (!/^\/(?:apps|content|conf)(?:\/|$)/.test(jcrPath) || jcrPath.includes('..')) {
      skippedFiles.push({ path: change.path, reason: 'Mapped path ' + jcrPath + ' is outside the instance-only write boundary.' });
      continue;
    }
    const operation = { type: 'file', path: jcrPath, mimeType: mimeTypeForPath(jcrPath), content: change.content };
    if (new TextEncoder().encode(operation.content).length > 1_048_576) {
      skippedFiles.push({ path: change.path, reason: 'File is larger than the 1 MB direct-operation limit.' });
      continue;
    }
    repositoryOperations.push(operation);
    sourceToJcr.push({ sourcePath: change.path, jcrPath, type: 'file' });
  }

  const uniqueOperations = [];
  const byPath = new Map();
  for (const operation of repositoryOperations) {
    const existing = byPath.get(operation.path);
    if (!existing) {
      byPath.set(operation.path, operation);
      uniqueOperations.push(operation);
    } else if (existing.type === 'node' && operation.type === 'node') {
      if (existing.primaryType !== operation.primaryType) throw new Error('Conflicting primary types were generated for ' + operation.path + '.');
      Object.assign(existing.properties, operation.properties);
    } else {
      skippedFiles.push({ path: operation.path, reason: 'Multiple source files map to the same JCR resource; resolve this path collision manually.' });
    }
  }

  if (!uniqueOperations.length) {
    const reasons = skippedFiles.map(item => item.path + ': ' + item.reason).join('\n');
    throw new Error('No source files could be safely mapped to direct JCR operations.' + (reasons ? '\n' + reasons : ''));
  }

  const javaFiles = sourcePlan.fileChanges.filter(change => typeof change?.path === 'string' && /\.java$/i.test(change.path));
  const htlUsesModel = uniqueOperations.some(operation => operation.type === 'file' && /\.(?:html|htl)$/i.test(operation.path)
    && /data-sly-use(?:\.[\w-]+)?\s*=\s*["'][A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+["']/.test(operation.content));
  const modelBlocker = javaFiles.length > 0 || htlUsesModel;
  if (modelBlocker) warnings.push('A new or referenced Sling Model/Java source cannot be compiled by writing JCR resources. No .java, Maven POM, test source or OSGi bundle was deployed by this conversion. The HTL may not render until a compatible model bundle already exists or the HTL is deliberately rewritten for an HTL-only fallback.');
  for (const item of skippedFiles) warnings.push('Not converted: ' + item.path + ' — ' + item.reason);

  const instancePlan = {
    mode: 'instance-only',
    title: sourcePlan.title || 'Converted source plan',
    summary: (sourcePlan.summary || 'Source-project plan') + ' Converted ' + uniqueOperations.length + ' repository operation(s) from unambiguous FileVault paths; source/build-only files are not deployed.',
    steps: Array.isArray(sourcePlan.steps) ? sourcePlan.steps.filter(item => typeof item === 'string').slice(0, 40) : [],
    repositoryOperations: uniqueOperations,
    assumptions: Array.isArray(sourcePlan.assumptions) ? sourcePlan.assumptions.filter(item => typeof item === 'string').slice(0, 40) : [],
    risks: [...(Array.isArray(sourcePlan.risks) ? sourcePlan.risks.filter(item => typeof item === 'string').slice(0, 35) : []), ...warnings].slice(0, 40),
    validationChecks: Array.isArray(sourcePlan.validationChecks) ? sourcePlan.validationChecks.filter(item => typeof item === 'string').slice(0, 40) : [],
    needsClarification: false,
    clarificationQuestions: [],
  };
  return { plan: instancePlan, sourceToJcr, skippedFiles, warnings, requiresAcknowledgement: skippedFiles.length > 0 || modelBlocker, modelBlocker };
}
