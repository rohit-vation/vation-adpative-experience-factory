import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { emptyHTML } from '../src/views/workflow.js';
import { normalizeComponentRoot, componentResourceSuffix, normalizeClientlibResourceSuffix } from '../src/ui/live-implementation.js';

process.env.LOG_LEVEL = 'TRACE';
process.env.LOG_TO_FILE = 'false';
// Isolate the test process from developer credentials. API mode stays on, but missing keys must fail closed.
process.env.GEMINI_API_KEY = '';
process.env.OPENAI_API_KEY = '';
process.env.AEF_TEST_AEM_USER = 'test-admin';
process.env.AEF_TEST_AEM_PASSWORD = 'test-password';

const clientlibVerificationPath = '/apps/demo/components/content/heroBanner/clientlib';
const badClientlibPath = '/apps/demo/components/content/legacy/clientlib';
let clientlibNodeCreated = false;
let clientlibPrimaryType = null;
let clientlibProperties = {};
let clientlibCssTxtCreated = false;
let appsRootSelectorRequests = 0;
const existingClientlibParents = new Set([
  '/apps.0.json',
  '/apps/demo.0.json',
  '/apps/demo/components.0.json',
  '/apps/demo/components/content.0.json',
  '/apps/demo/components/content/heroBanner.0.json',
  '/apps/demo/components/content/legacy.0.json',
  `${badClientlibPath}.0.json`,
]);
const mockAem = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'GET' && requestUrl.pathname === '/bin/querybuilder.json') {
    const requestedPath = requestUrl.searchParams.get('path');
    const hits = requestedPath === '/apps/demo/components/content/querybuilderBanner'
      ? [{ path: requestedPath, 'jcr:primaryType': 'cq:Component', 'jcr:title': 'Query Builder Banner', componentGroup: 'Content' }]
      : [];
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: true, results: hits.length, hits }));
    return;
  }
  if (req.method === 'GET' && requestUrl.pathname === '/content/scotia/us/en/home.1.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 'jcr:primaryType': 'cq:Page', 'jcr:content': { 'jcr:primaryType': 'cq:PageContent' } }));
    return;
  }
  if (requestUrl.pathname === '/apps.3.json') {
    appsRootSelectorRequests += 1;
    res.writeHead(300, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ambiguous Sling JSON selector.' }));
    return;
  }
  if (req.method === 'GET' && requestUrl.pathname === '/apps/demo/components.infinity.json') {
    const hero = { 'jcr:primaryType': 'cq:Component' };
    if (clientlibNodeCreated) {
      hero.clientlib = { 'jcr:primaryType': clientlibPrimaryType, ...clientlibProperties };
      if (clientlibCssTxtCreated) hero.clientlib['css.txt'] = { 'jcr:primaryType': 'nt:file' };
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 'jcr:primaryType': 'nt:folder', content: { 'jcr:primaryType': 'sling:Folder', heroBanner: hero, legacy: { 'jcr:primaryType': 'sling:Folder' } } }));
    return;
  }
  if (req.method === 'GET' && requestUrl.pathname === `${clientlibVerificationPath}.1.json`) {
    // Reproduce AEM returning 404 for direct clientlib JSON selectors even though the node is listed by its parent.
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Direct clientlib JSON selector not available.' }));
    return;
  }
  if (req.method === 'GET' && requestUrl.pathname === '/apps/demo/components/content.1.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      'jcr:primaryType': 'sling:Folder',
      heroBanner: { 'jcr:primaryType': 'cq:Component' },
      legacy: { 'jcr:primaryType': 'sling:Folder' },
    }));
    return;
  }
  if (req.method === 'GET' && /^\/apps\/demo\/components\/content\/heroBanner\.(?:1|2|3)\.json$/.test(requestUrl.pathname)) {
    const data = { 'jcr:primaryType': 'cq:Component', 'jcr:title': 'Hero Banner' };
    if (clientlibNodeCreated) {
      data.clientlib = { 'jcr:primaryType': clientlibPrimaryType, ...clientlibProperties };
      if (clientlibCssTxtCreated) data.clientlib['css.txt'] = { 'jcr:primaryType': 'nt:file' };
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }
  if (req.method === 'GET' && requestUrl.pathname === `${badClientlibPath}.0.json`) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 'jcr:primaryType': 'sling:Folder', categories: ['stale.category'] }));
    return;
  }
  if (req.method === 'GET' && requestUrl.pathname === `${clientlibVerificationPath}.0.json`) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Direct clientlib JSON selector not available.' }));
    return;
  }
  if (req.method === 'GET' && requestUrl.pathname === `${clientlibVerificationPath}/css.txt.0.json`) {
    if (!clientlibCssTxtCreated) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 'jcr:primaryType': 'nt:file' }));
    return;
  }
  if (req.method === 'GET' && existingClientlibParents.has(requestUrl.pathname)) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 'jcr:primaryType': 'sling:Folder' }));
    return;
  }
  if (req.method === 'POST' && requestUrl.pathname === clientlibVerificationPath) {
    const contentType = String(req.headers['content-type'] || '');
    if (contentType.startsWith('application/x-www-form-urlencoded')) {
      let raw = '';
      req.setEncoding('utf8');
      for await (const chunk of req) raw += chunk;
      const form = new URLSearchParams(raw);
      if (form.has('jcr:primaryType')) clientlibPrimaryType = form.get('jcr:primaryType');
      const categories = form.getAll('categories');
      if (categories.length) clientlibProperties.categories = categories;
      if (form.has('allowProxy')) clientlibProperties.allowProxy = form.get('allowProxy') === 'true';
      clientlibNodeCreated = true;
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ msg: clientlibPrimaryType ? 'Created/updated clientlib node.' : 'Updated clientlib node.' }));
      return;
    }
    // Sling POST .create file upload to the clientlib parent (css.txt).
    let received = Buffer.alloc(0);
    for await (const chunk of req) received = Buffer.concat([received, Buffer.from(chunk)]);
    clientlibCssTxtCreated = received.includes(Buffer.from('css.txt'));
    res.writeHead(201, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ msg: 'Created clientlib file.' }));
    return;
  }
  if (req.url === '/system/console/status-productinfo.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ product: 'Adobe Experience Manager', version: 'SDK test mock' }));
    return;
  }
  if (req.url === '/apps.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 'jcr:primaryType': 'sling:Folder', components: { 'jcr:primaryType': 'sling:Folder' } }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});
await new Promise((resolve) => mockAem.listen(0, '127.0.0.1', resolve));
const mockPort = mockAem.address().port;

process.env.AEM_TARGETS_JSON = JSON.stringify([{
  id: 'test-cms-sdk-author',
  name: 'Test local SDK Author',
  platform: 'aemaacs-sdk',
  role: 'author',
  baseUrl: `http://127.0.0.1:${mockPort}`,
  authMode: 'basic',
  usernameEnv: 'AEF_TEST_AEM_USER',
  passwordEnv: 'AEF_TEST_AEM_PASSWORD',
  healthPath: '/system/console/status-productinfo.json',
}]);

const { createServer } = await import('../server/server.js');
const { validateConnectorInput } = await import('../server/connection-vault.js');
const { getAemAuthHeaders } = await import('../server/aem-client.js');
const { convertSourceProjectPlanToInstancePlan, validateInstanceOnlyPlan } = await import('../src/aem/instance-only-plan.js');
const { logger, queryLogs, setLogLevel } = await import('../server/logger.js');

const app = createServer();
await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
const appPort = app.address().port;
const base = `http://127.0.0.1:${appPort}`;
let failures = 0;
function check(name, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}${condition || !detail ? '' : ` - ${detail}`}`);
  if (!condition) failures += 1;
}
async function json(url, options = {}) {
  const response = await fetch(`${base}${url}`, options);
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

try {
  // Main app and Connections-only modal are delivered as normal app assets.
  const page = await fetch(`${base}/`);
  const pageText = await page.text();
  const main = await (await fetch(`${base}/src/main.js`)).text();
  const connectionsUi = await (await fetch(`${base}/src/ui/connections.js`)).text();
  check('Connections and Logs are wired into the application entry point', page.status === 200 && pageText.includes('src/styles/aem-forge.css') && main.includes('initLogPanel') && main.includes('initConnections'));
  check('Connections modal only contains connection management', connectionsUi.includes('Connect to a CMS') && connectionsUi.includes('Saved connections') && !connectionsUi.includes('Repository inspector') && !connectionsUi.includes('Connection troubleshooting'));
  const liveUi = await (await fetch(`${base}/src/ui/live-implementation.js`)).text();
  const createRenderer = await (await fetch(`${base}/src/workflows/create/render.js`)).text();
  const liveTemplate = await (await fetch(`${base}/src/ui/live-implementation-template.js`)).text();
  check('Create result includes reviewed direct-JCR actions without Package Manager UI', liveUi.includes('/api/aem/repository/write') && !liveUi.includes('/api/aem/packages') && !liveUi.includes('create-live-build') && createRenderer.includes('liveImplementationPanelHTML()') && createRenderer.includes('aemImplementationHTML(implementation)') && createRenderer.includes('CMS_IDS.filter'));
  const createEmptyState = emptyHTML({ id: 'create', outputs: ['Component files'] });
  check('Create initial state shows CMS connection/path controls before generation', createEmptyState.includes('id="create-live-target"') && createEmptyState.includes('id="create-live-component-path"') && createEmptyState.includes('Review and implement directly in CMS') && !createEmptyState.includes('Go to Generate'));
  check('Create initial state has no pre-generated Content Model/Files preview', !createEmptyState.includes('id="create-live-plan-preview"'));
  const forgeStyles = await (await fetch(`${base}/src/styles/aem-forge.css`)).text();
  const logUi = await (await fetch(`${base}/src/ui/log-panel.js`)).text();
  check('Live implementation and Connections use theme-aware styling', forgeStyles.includes('.live-aem-panel') && forgeStyles.includes('.aef-connections-panel') && forgeStyles.includes('.aef-status'));
  check('Prepared AEM preview styles distinguish plan files and fields', forgeStyles.includes('.live-aem-plan-table') && forgeStyles.includes('.live-aem-plan-file-tabs') && forgeStyles.includes('.live-aem-plan-file-code'));
  check('Hidden live review state stays hidden until prepared', forgeStyles.includes('.live-aem-review[hidden]') && forgeStyles.includes('display: none !important'));
  check('AEM Content Model and Files are derived from the prepared repository operation plan', liveUi.includes('deriveDialogFields(operations)') && liveUi.includes('renderPreparedPlanPreview(next)') && liveUi.includes('preflightCache') && liveUi.includes('skippedSourceFiles') && createRenderer.includes('create-live-plan-preview') && createRenderer.includes('Generate will validate the CMS path and prepare the implementation plan.'));
  check('Generate readiness is tied to a registered CMS connection and a valid non-placeholder component path', liveUi.includes('export function createLiveInputProblem') && liveUi.includes('refreshCreateLiveGenerateButton') && main.includes('createLiveInputProblem(input.cms)') && main.includes('mountCreateLiveImplementationScreen') && main.includes('validateCreatePathBeforeGenerate') && main.includes('await setCreateLiveContext(data, input)') && !liveTemplate.includes('create-live-prepare'));
  const preflightIndex = main.indexOf('await validateCreatePathBeforeGenerate()');
  const aiGenerationIndex = main.indexOf('await generate(workflow, input');
  check('Generate validates the CMS path before the AI call and reuses the preflight result', preflightIndex >= 0 && aiGenerationIndex > preflightIndex && liveUi.includes('preflightMatches') && liveUi.includes('preflightCache = null') && !liveUi.includes('/api/aem/test-connection'));
  check('All CMS source tabs remain available after generation', createRenderer.includes('const order = [selectedCms, ...CMS_IDS.filter') && createRenderer.includes('tabsHTML(order.map') && createRenderer.includes('aemImplementationHTML(implementation)'));
  check('Logs launcher opens/refreshes without toggling itself closed', logUi.includes('event.stopPropagation()') && logUi.includes('void show()') && !logUi.includes('open ? close() : show()'));
  check('Live implementation validates repository paths without a fixed project namespace', liveUi.includes("parts[2] === 'components'") && liveUi.includes('Invalid component repository path:') && !liveUi.includes('/apps/aef/components'));
  const acceptedComponentPaths = [
    normalizeComponentRoot('/apps/demo/components/hero-banner', 'Hero Banner') === '/apps/demo/components/hero-banner',
    normalizeComponentRoot('/apps/demo-site/components/content/hero-banner-aef', 'Hero Banner') === '/apps/demo-site/components/content/hero-banner-aef',
    normalizeComponentRoot('/apps/sample-site/components', 'Hero Banner') === '/apps/sample-site/components/heroBanner',
    normalizeComponentRoot('/apps/sample-site/components/content', 'Promo Banner') === '/apps/sample-site/components/content/promoBanner',
    normalizeComponentRoot('\\\\apps\\\\demo-site\\\\components\\\\content\\\\promo-banner', 'Promo Banner') === '/apps/demo-site/components/content/promo-banner',
    componentResourceSuffix('cq:dialog') === '_cq_dialog/.content.xml',
    componentResourceSuffix('cq:dialog/.content.xml') === '_cq_dialog/.content.xml',
    componentResourceSuffix('apps/sample-site/components/hero-banner/hero-banner.html') === 'hero-banner.html',
    componentResourceSuffix('apps/sample-site/components/hero-banner/_cq_dialog/.content.xml') === '_cq_dialog/.content.xml',
  ];
  let unsafePathRejected = false;
  try { normalizeComponentRoot('/apps/../etc/components/promo-banner'); } catch { unsafePathRejected = true; }
  check('Component path validation accepts namespaces/full paths and maps cq:dialog/generated HTL paths', acceptedComponentPaths.every(Boolean) && unsafePathRejected);
  let placeholderNamespaceRejected = false;
  try { normalizeComponentRoot('/apps/your-project/components/content/heroBanner', 'Hero Banner'); } catch (error) { placeholderNamespaceRejected = /replace the your-project placeholder/i.test(error.message); }
  check('neutral project placeholder must be replaced before writes', placeholderNamespaceRejected);
  check('component path inspector uses depth 1 and does not rely on the global /apps root', liveUi.includes('inspectRepositoryPath(target, requestedRoot, 1)') && liveUi.includes('validateCreatePathBeforeGenerate') && liveTemplate.includes('not auto-filled'));
  check('component path never auto-discovers or prints customer namespaces', !liveUi.includes('discoverComponentBase') && !liveUi.includes('candidateProjectNamespaces') && liveTemplate.includes('/apps/your-project/components/content/heroBanner') && liveTemplate.includes('not auto-filled'));
  check('clientlib assets are normalized into css/js subfolders and use base indexes', liveUi.includes('normalizeClientlibResourceSuffix') && liveUi.includes("const content = ['#base=' + kind") && liveUi.includes("ensureClientlibIndex('css')") && liveUi.includes("ensureClientlibIndex('js')") && normalizeClientlibResourceSuffix('clientlib/heroBanner.css') === 'clientlib/css/heroBanner.css' && normalizeClientlibResourceSuffix('clientlib/heroBanner.js') === 'clientlib/js/heroBanner.js');
  check('direct-JCR generation selects the separate model-free HTL and attaches JS clientlib when needed', liveUi.includes('aemImplementation.directJcrHtl') && liveUi.includes('hasJsAsset && isMainComponentHtl') && liveUi.includes('if (includeJs && !htl.includes'));
  check('partial write results are rendered by path with a one-shot write guard', liveUi.includes('function renderOperationResults(result)') && liveUi.includes('Repository write batch completed with failures.') && liveUi.includes('prepared.writeAttempted = true') && liveTemplate.includes('create-live-operation-results'));
  check('Live implementation status stays visible in a stable panel', liveTemplate.includes('id="create-live-output" class="live-aem-output is-info" aria-live="polite"') && !liveTemplate.includes('id="create-live-output" class="live-aem-output" hidden'));

  // A local SDK target must validate and get Basic auth, without pretending hosted cloud uses Basic.
  const sdk = validateConnectorInput({
    name: 'Local SDK Author Test',
    platform: 'aemaacs-sdk',
    role: 'author',
    baseUrl: 'http://localhost:4502',
    authMode: 'basic',
    username: 'admin',
    password: 'admin',
  });
  check('local SDK connection validates without package-manager configuration', sdk.platform === 'aemaacs-sdk' && !Object.hasOwn(sdk, 'allowPackageInstall'));
  check('Basic credentials are sent through an Authorization header', getAemAuthHeaders({ ...sdk }).authorization?.startsWith('Basic ') === true);
  let hostedBasicBlocked = false;
  try {
    validateConnectorInput({ name: 'Hosted Cloud', platform: 'aemaacs-cloud', role: 'author', baseUrl: 'https://author.example.adobeaemcloud.com', authMode: 'basic', username: 'admin', password: 'admin' });
  } catch (error) {
    hostedBasicBlocked = /bearer/i.test(error.message);
  }
  check('hosted AEMaaCS rejects local Basic auth', hostedBasicBlocked);
  const hosted = validateConnectorInput({ name: 'Hosted Cloud Token', platform: 'aemaacs-cloud', role: 'author', baseUrl: 'https://author.example.adobeaemcloud.com', authMode: 'bearer', token: 'placeholder-token' });
  check('hosted CMS connection has no package-manager capability flag', !Object.hasOwn(hosted, 'allowPackageInstall'));

  // Verify API-backed connector path can reach a local SDK-style target.
  const targetResp = await json('/api/aem/targets');
  const target = targetResp.body.targets?.find((item) => item.id === 'test-cms-sdk-author');
  check('CMS target registry publishes a connection without package capability flags', targetResp.status === 200 && target?.platform === 'aemaacs-sdk' && !Object.hasOwn(target, 'canInstallPackage'));
  const connectionTest = await json('/api/aem/test-connection', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetId: 'test-cms-sdk-author' }) });
  check('connection test reaches the SDK-style health endpoint', connectionTest.status === 200 && connectionTest.body.ok === true, JSON.stringify(connectionTest.body));

  // Write css.txt first to reproduce the dangerous ordering: its parent-creation path
  // must create clientlib as cq:ClientLibraryFolder, not a generic sling:Folder.
  const clientlibWrite = await json('/api/aem/repository/write', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetId: 'test-cms-sdk-author', confirmWrites: true, operations: [
    { type: 'file', path: clientlibVerificationPath + '/css.txt', mimeType: 'text/plain', content: '#base=css\nheroBanner.css\n' },
    { type: 'node', path: clientlibVerificationPath, primaryType: 'cq:ClientLibraryFolder', properties: { categories: ['site.components.heroBanner'], allowProxy: true } },
  ] }) });
  check('clientlib parent is created as cq:ClientLibraryFolder even when a child file is processed first', clientlibWrite.status === 200 && clientlibWrite.body.result?.ok === true && clientlibPrimaryType === 'cq:ClientLibraryFolder' && clientlibWrite.body.result?.applied?.some((entry) => entry.path === clientlibVerificationPath && entry.verified && entry.verificationDepth !== undefined) && clientlibWrite.body.result?.failed?.length === 0, JSON.stringify(clientlibWrite.body.result?.failed || []));

  const wrongClientlibWrite = await json('/api/aem/repository/write', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetId: 'test-cms-sdk-author', confirmWrites: true, operations: [{ type: 'file', path: badClientlibPath + '/css.txt', mimeType: 'text/plain', content: '#base=css\\nlegacy.css\\n' }] }) });
  const wrongClientlibFailure = wrongClientlibWrite.body.result?.failed?.[0];
  check('existing sling:Folder clientlib is rejected before writing child assets', wrongClientlibWrite.status === 200 && wrongClientlibFailure?.code === 'CLIENTLIB_PRIMARY_TYPE_MISMATCH' && /expected cq:ClientLibraryFolder/i.test(wrongClientlibFailure.message) && !wrongClientlibWrite.body.result?.applied?.length);

  // A narrow exact Query Builder fallback can verify a component when its own Sling JSON
  // selectors return 404, without querying the global /apps root.
  const queryBuilderRead = await json('/api/aem/repository/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetId: 'test-cms-sdk-author', path: '/apps/demo/components/content/querybuilderBanner', depth: 1 }) });
  check('repository read uses exact Query Builder fallback for an existing component', queryBuilderRead.status === 200 && queryBuilderRead.body.result?.verificationSource === 'querybuilder-exact' && queryBuilderRead.body.result?.data?.['jcr:primaryType'] === 'cq:Component');
  const contentHomeRead = await json('/api/aem/repository/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetId: 'test-cms-sdk-author', path: '/content/scotia/us/en/home', depth: 1 }) });
  check('repository read permits an ordinary content page named home', contentHomeRead.status === 200 && contentHomeRead.body.result?.data?.['jcr:primaryType'] === 'cq:Page', JSON.stringify(contentHomeRead.body));

  // A broad /apps.3.json selector can return HTTP 300. Component path inspection must
  // stop at the application namespace and report the exact path as unavailable, not fail on /apps.
  const missingComponentRead = await json('/api/aem/repository/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetId: 'test-cms-sdk-author', path: '/apps/demo/components/content/missingHeroBanner', depth: 0 }) });
  check('repository preflight avoids global /apps JSON and reports an absent child only under a visible content-group parent', missingComponentRead.status === 404 && missingComponentRead.body.code === 'REPOSITORY_PATH_NOT_FOUND' && missingComponentRead.body.safeToTreatAsMissing === true && !/Repository read failed for \/apps \(HTTP 300\)/i.test(missingComponentRead.body.error || '') && appsRootSelectorRequests === 0, JSON.stringify({ status: missingComponentRead.status, error: missingComponentRead.body.error, code: missingComponentRead.body.code, appsRootSelectorRequests }));
  const ambiguousRootRead = await json('/api/aem/repository/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetId: 'test-cms-sdk-author', path: '/apps/demo/components/hiddenComponent', depth: 0 }) });
  check('a missing component directly under the visible components collection is reported as an available path', ambiguousRootRead.status === 404 && ambiguousRootRead.body.code === 'REPOSITORY_PATH_NOT_FOUND' && ambiguousRootRead.body.safeToTreatAsMissing === true);

  // A failed JCR batch must return the exact path and log per-operation failure details.
  const failedOperationPath = '/content/write-log-test';
  const writeTest = await json('/api/aem/repository/write', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetId: 'test-cms-sdk-author', confirmWrites: true, operations: [{ type: 'node', path: failedOperationPath, primaryType: 'cq:Component', properties: { 'jcr:title': 'Log test' } }] }) });
  const failedOperation = writeTest.body.result?.failed?.[0];
  check('repository write returns exact per-operation failure path', writeTest.status === 200 && failedOperation?.path === failedOperationPath && typeof failedOperation?.message === 'string');
  const perOperationLogs = queryLogs({ level: 'TRACE', query: failedOperationPath, limit: 100 }).entries;
  check('per-operation failure path is recorded in runtime Logs', perOperationLogs.some((entry) => entry.scope === 'jcr-write' && entry.message === 'Repository operation failed.' && entry.details?.path === failedOperationPath));

  // Instance-only prompt and path converter preserve concrete JCR destinations.
  const converted = convertSourceProjectPlanToInstancePlan({
    title: 'Promo Banner',
    fileChanges: [
      { path: 'ui.apps/src/main/content/jcr_root/apps/demo/components/promo/.content.xml', action: 'create', content: '<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0" jcr:primaryType="cq:Component" jcr:title="Promo" componentGroup="Demo"/>' },
      { path: 'ui.apps/src/main/content/jcr_root/apps/demo/components/promo/promo.html', action: 'create', content: '<section>${properties.title}</section>' },
      { path: 'core/src/main/java/com/demo/Promo.java', action: 'create', content: 'class Promo {}' },
    ],
  });
  check('FileVault paths map to component JCR nodes/files', converted.plan.repositoryOperations.some((op) => op.path === '/apps/demo/components/promo' && op.type === 'node') && converted.plan.repositoryOperations.some((op) => op.path === '/apps/demo/components/promo/promo.html' && op.type === 'file'));
  const directGeneratedPaths = convertSourceProjectPlanToInstancePlan({ title: 'Direct generated paths', fileChanges: [
    { path: 'apps/demo/components/hero-banner/.content.xml', action: 'create', content: '<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0" jcr:primaryType="cq:Component" jcr:title="Hero Banner" componentGroup="Content"/>' },
    { path: 'apps/demo/components/hero-banner/_cq_dialog/.content.xml', action: 'create', content: '<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0" jcr:primaryType="nt:unstructured"><content jcr:primaryType="nt:unstructured"/></jcr:root>' },
    { path: 'apps/demo/components/hero-banner/hero-banner.html', action: 'create', content: '<section>${properties.title}</section>' },
  ] });
  check('generated component resource paths map to live JCR paths', directGeneratedPaths.plan.repositoryOperations.some((op) => op.path === '/apps/demo/components/hero-banner' && op.type === 'node') && directGeneratedPaths.plan.repositoryOperations.some((op) => op.path === '/apps/demo/components/hero-banner/cq:dialog' && op.type === 'node') && directGeneratedPaths.plan.repositoryOperations.some((op) => op.path === '/apps/demo/components/hero-banner/hero-banner.html' && op.type === 'file'));
  check('Java bundle is flagged rather than written to JCR', converted.modelBlocker && converted.requiresAcknowledgement && converted.skippedFiles.some((item) => item.path.includes('Promo.java')));
  check('direct JCR conversion validates without package lifecycle metadata', validateInstanceOnlyPlan(converted.plan).mode === 'instance-only' && !Object.hasOwn(converted.plan, 'packagePlan'));

  // Logging works at all requested levels and scrubs secret-like fields.
  setLogLevel('TRACE');
  logger.trace('test', 'trace event');
  logger.debug('test', 'debug event');
  logger.info('test', 'info event');
  logger.warn('test', 'warn event');
  logger.error('test', 'error event', { apiKey: 'sk-proj-DO_NOT_LEAK_1234567890123456789', password: 'do-not-leak-password' });
  const logs = queryLogs({ level: 'TRACE', query: 'test', limit: 100 }).entries;
  const levels = new Set(logs.map((item) => item.level));
  check('logger records TRACE/DEBUG/INFO/WARN/ERROR levels', ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR'].every((level) => levels.has(level)));
  const safeLogJson = JSON.stringify(logs);
  check('logger redacts password and API-key-looking values', !safeLogJson.includes('do-not-leak-password') && !safeLogJson.includes('DO_NOT_LEAK_1234567890123456789'));

  // Browser errors can be sent to the local logger, without credentials.
  const clientLog = await json('/api/logs/client', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ level: 'ERROR', scope: 'frontend-test', message: 'Synthetic browser error', details: { message: 'example safe test error' } }) });
  const afterClient = await json('/api/logs?level=TRACE&q=frontend-test');
  check('frontend browser events appear in the log panel API', clientLog.status === 200 && afterClient.body.entries?.some((item) => item.scope === 'frontend-test' && item.level === 'ERROR'));


  // Removed planning and package-management routes should not be reachable from the product.
  for (const route of ['/api/aem/packages', '/api/aem/context', '/api/aem/plan/prepare', '/api/aem/codebase/build-deploy']) {
    const response = await json(route);
    check('Legacy endpoint is removed: ' + route, response.status === 404);
  }

  // API mode is always on. Missing credentials must fail closed without demo data.
  const health = await json('/api/status');
  check('API mode is always on even without a provider key', health.status === 200 && health.body.apiEnabled === true && health.body.ai === false && health.body.providers?.every((provider) => provider.configured === false));
  const blockedApi = await json('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workflow: 'create', input: { name: 'Promo', cms: 'aem', description: 'test prompt' }, ai: { provider: 'gemini', model: 'gemini-3.1-flash-lite' } }) });
  check('generation fails closed with a missing-key error and no demo result', blockedApi.status === 503 && /GEMINI_API_KEY|provider key is configured/i.test(blockedApi.body.error || '') && !blockedApi.body.data);

} finally {
  await new Promise((resolve) => app.close(resolve));
  await new Promise((resolve) => mockAem.close(resolve));
}
console.log(failures ? `\n${failures} AEM Forge integration check(s) failed.` : '\nAll AEM Forge integration checks passed.');
process.exitCode = failures ? 1 : 0;

