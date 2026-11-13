
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function normalizeHost(hostname) {
  return String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
}

function isLoopback(hostname) {
  const host = normalizeHost(hostname);
  return LOCAL_HOSTS.has(host) || host.endsWith('.localhost');
}

export function getAemAuthHeaders(target) {
  const headers = { accept: 'application/json, text/plain, */*' };
  if (target.authMode === 'basic') {
    const username = target.credentials?.username || process.env[target.usernameEnv];
    const password = target.credentials?.password || process.env[target.passwordEnv];
    if (!username || !password) {
      const missing = [!username ? target.usernameEnv : '', !password ? target.passwordEnv : ''].filter(Boolean).join(' and ');
      const error = new Error(`Missing AEM credentials. Set ${missing} in the server .env file.`);
      error.status = 400;
      throw error;
    }
    headers.authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  } else if (target.authMode === 'bearer') {
    const token = target.credentials?.token || process.env[target.tokenEnv];
    if (!token) {
      const error = new Error(`Missing token. Set ${target.tokenEnv} in the server .env file.`);
      error.status = 400;
      throw error;
    }
    headers.authorization = `Bearer ${token}`;
  }
  return headers;
}

export function assertSafeTargetUrl(target) {
  let baseUrl;
  try {
    baseUrl = new URL(target.baseUrl);
  } catch {
    const error = new Error('Target URL is invalid.');
    error.status = 400;
    throw error;
  }
  if (baseUrl.username || baseUrl.password) {
    const error = new Error('Do not embed credentials in the target URL. Enter credentials through the connection form.');
    error.status = 400;
    throw error;
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol)) {
    const error = new Error('Only HTTP and HTTPS endpoints are supported.');
    error.status = 400;
    throw error;
  }
  if (baseUrl.protocol === 'http:' && !isLoopback(baseUrl.hostname) && target.allowInsecureHttp !== true) {
    const error = new Error('Refusing to send credentials over plain HTTP to a non-local host. Use HTTPS.');
    error.status = 400;
    throw error;
  }
  return baseUrl;
}

async function getResponseBody(response) {
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* AEM can return HTML or plain text. */ }
  return { text: text.slice(0, 5000), parsed };
}

function isExplicitFailure(parsed, bodyText) {
  if (parsed && typeof parsed === 'object') {
    if (parsed.success === false || parsed.ok === false || parsed.status === 'error') return true;
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) return true;
  }
  return /(?:^|[\s:])(?:error|failed|failure)\s*[:!]/i.test(bodyText || '');
}

function assertHttpSuccess(response, body, stage) {
  if (!response.ok || isExplicitFailure(body.parsed, body.text)) {
    const message = body.parsed?.msg || body.parsed?.message || body.parsed?.error || body.text || response.statusText;
    const error = new Error(stage + ' failed (HTTP ' + response.status + '): ' + String(message).slice(0, 1200));
    error.aemStatus = response.status;
    error.status = response.status >= 500 ? 502 : response.status;
    throw error;
  }
}
export async function testAemConnection(target) {
  const baseUrl = assertSafeTargetUrl(target);
  const healthUrl = new URL(target.healthPath || '/system/console/status-productinfo.json', baseUrl);
  if (healthUrl.origin !== baseUrl.origin) {
    const error = new Error('The health path must remain on the same origin as the registered target.'); error.status = 400; throw error;
  }
  const headers = getAemAuthHeaders(target);
  try {
    const response = await fetch(healthUrl, { method: 'GET', headers, signal: AbortSignal.timeout(9000), redirect: 'manual' });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.statusText,
      checkedUrl: `${healthUrl.origin}${healthUrl.pathname}`,
      note: response.status === 401 || response.status === 403
        ? 'The endpoint was reached, but the request was unauthorized or forbidden.'
        : (response.status >= 200 && response.status < 300 ? 'The configured AEM health endpoint responded.' : 'The AEM endpoint returned a non-success status.'),
    };
  } catch (error) {
    const kind = error.name === 'TimeoutError' || error.name === 'AbortError' ? 'timeout' : 'unreachable';
    const wrapped = new Error(`Connection ${kind}: ${error.message}`); wrapped.status = 502; throw wrapped;
  }
}

function assertLocalAuthorReadTarget(target) {
  const baseUrl = assertSafeTargetUrl(target);
  if (!['aem65', 'aemaacs-sdk'].includes(target.platform) || target.role !== 'author' || target.authMode === 'none' || !isLoopback(baseUrl.hostname)) {
    const error = new Error('Repository access requires an authenticated AEM 6.5 or local SDK Author connection.');
    error.status = 403; throw error;
  }
  return baseUrl;
}

function assertLocalAuthorOperationsTarget(target) {
  const baseUrl = assertSafeTargetUrl(target);
  if (!['aem65', 'aemaacs-sdk'].includes(target.platform) ||
      target.role !== 'author' ||
      target.authMode === 'none' ||
      !isLoopback(baseUrl.hostname)) {
    const error = new Error('Direct JCR writes require an authenticated local AEM 6.5 or local SDK Author connection.');
    error.status = 403;
    throw error;
  }
  return baseUrl;
}

function normalizeRepositoryPath(value, { allowEtc = true } = {}) {
  if (typeof value !== 'string') throw new Error('Repository path must be a string.');
  const normalized = value.trim().replace(/\/+$/, '');
  if (!normalized.startsWith('/') || normalized.startsWith('//') || normalized.length > 500 || normalized.includes('\\') || /[\u0000-\u001f?#]/.test(normalized)) {
    throw new Error('Repository path must be an absolute JCR path without query, fragment, traversal or control characters.');
  }
  const segments = normalized.split('/').filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === '.' || segment === '..' || segment.length > 120)) throw new Error('Repository path contains an invalid segment.');
  const lower = normalized.toLowerCase();
  const allowed = ['/apps', '/content', '/conf', ...(allowEtc ? ['/etc/tags', '/etc/clientlibs', '/etc/designs'] : [])];
  if (!allowed.some((root) => lower === root || lower.startsWith(`${root}/`))) {
    throw new Error('This operation is limited to /apps, /content, /conf and selected legacy /etc subtrees. /libs and system/security paths are not writable by Forge.');
  }
  const protectedRoot = /^(?:home|users|groups|security|system)$/i;
  const protectedDescendant = /^(?:rep:policy|acl|tokens?|credentials?|secrets?)$/i;
  if (lower.startsWith('/etc/packages') || protectedRoot.test(segments[0]) || segments.some((segment) => protectedDescendant.test(segment))) {
    throw new Error('Protected repository paths are not available for direct operations.');
  }
  return normalized;
}

function localTargetFetchOptions(target, options = {}) {
  return { ...options, headers: { ...getAemAuthHeaders(target), ...(options.headers || {}) }, redirect: 'manual' };
}

async function getRepositoryResourceDirect(target, repositoryPath, depth = 2) {
  const baseUrl = assertLocalAuthorReadTarget(target);
  const pathValue = normalizeRepositoryPath(repositoryPath);
  const parsedDepth = Number.parseInt(depth, 10);
  const safeDepth = Number.isFinite(parsedDepth) ? Math.max(0, Math.min(3, parsedDepth)) : 2;
  const url = new URL(`${pathValue}.${safeDepth}.json`, baseUrl);
  if (url.origin !== baseUrl.origin) throw new Error('Cross-origin repository read blocked.');
  const response = await fetch(url, localTargetFetchOptions(target, { method: 'GET', signal: AbortSignal.timeout(12000) }));
  const body = await response.text();
  let parsed = null;
  try { parsed = body ? JSON.parse(body) : null; } catch { /* Non-JSON responses are reported below. */ }
  if (!response.ok) {
    const error = new Error(`Repository read failed for ${pathValue} (HTTP ${response.status}).`);
    // A 404 is meaningful for read-only existence discovery, not a gateway failure.
    // Keep it as 404 so callers can try the next project namespace without treating it as a crash.
    error.aemStatus = response.status;
    error.status = [401, 403, 404].includes(response.status) ? response.status : 502;
    if (response.status === 404) error.code = 'REPOSITORY_PATH_NOT_FOUND';
    throw error;
  }
  if (parsed === null) {
    const error = new Error(`AEM returned HTTP ${response.status}, but ${pathValue} did not return JSON repository data.`);
    error.status = 502; throw error;
  }
  return { path: pathValue, status: response.status, depth: safeDepth, data: parsed, bytes: Buffer.byteLength(body), checkedAt: new Date().toISOString() };
}

async function getRepositoryResourceInfinity(target, repositoryPath) {
  const baseUrl = assertLocalAuthorReadTarget(target);
  const pathValue = normalizeRepositoryPath(repositoryPath);
  const parts = pathValue.split('/').filter(Boolean);
  // Only use infinity JSON on an explicitly scoped component subtree, never on /apps
  // or an application root, to avoid large repository responses.
  if (!(parts[0] === 'apps' && parts.length >= 4 && parts[2] === 'components')) {
    const error = new Error('Infinity JSON is restricted to an explicit component path.');
    error.status = 400;
    throw error;
  }
  const url = new URL(`${pathValue}.infinity.json`, baseUrl);
  if (url.origin !== baseUrl.origin) throw new Error('Cross-origin repository read blocked.');
  const response = await fetch(url, localTargetFetchOptions(target, { method: 'GET', signal: AbortSignal.timeout(12000) }));
  const body = await response.text();
  if (Buffer.byteLength(body) > 2 * 1024 * 1024) {
    const error = new Error(`Repository response for ${pathValue} exceeded the 2 MB read limit.`);
    error.status = 413;
    throw error;
  }
  let parsed = null;
  try { parsed = body ? JSON.parse(body) : null; } catch { /* Non-JSON responses are reported below. */ }
  if (!response.ok || parsed === null) {
    const error = new Error(`Repository infinity read failed for ${pathValue} (HTTP ${response.status}).`);
    error.aemStatus = response.status;
    error.status = [401, 403, 404, 300].includes(response.status) ? response.status : 502;
    throw error;
  }
  return { path: pathValue, status: response.status, depth: 'infinity', data: parsed, bytes: Buffer.byteLength(body), checkedAt: new Date().toISOString(), verificationSource: 'direct-infinity-json' };
}

async function getRepositoryResourceFromComponentTreeInfinity(target, repositoryPath) {
  const baseUrl = assertLocalAuthorReadTarget(target);
  const pathValue = normalizeRepositoryPath(repositoryPath);
  const parts = pathValue.split('/').filter(Boolean);
  if (!(parts[0] === 'apps' && parts.length >= 4 && parts[2] === 'components')) {
    const error = new Error('Component-tree infinity read is restricted to an explicit application component path.');
    error.status = 400;
    throw error;
  }
  const componentTreePath = '/' + parts.slice(0, 3).join('/');
  const url = new URL(`${componentTreePath}.infinity.json`, baseUrl);
  if (url.origin !== baseUrl.origin) throw new Error('Cross-origin repository read blocked.');
  const response = await fetch(url, localTargetFetchOptions(target, { method: 'GET', signal: AbortSignal.timeout(12000) }));
  const body = await response.text();
  if (Buffer.byteLength(body) > 2 * 1024 * 1024) {
    const error = new Error(`Component-tree JSON for ${componentTreePath} exceeded the 2 MB read limit.`);
    error.status = 413;
    throw error;
  }
  let parsed = null;
  try { parsed = body ? JSON.parse(body) : null; } catch { /* Report non-JSON response below. */ }
  if (!response.ok || !parsed || typeof parsed !== 'object') {
    const error = new Error(`Component-tree JSON read failed for ${componentTreePath} (HTTP ${response.status}).`);
    error.aemStatus = response.status;
    error.status = [300, 401, 403, 404].includes(response.status) ? response.status : 502;
    throw error;
  }
  let child = parsed;
  const relativeSegments = parts.slice(3);
  for (let index = 0; index < relativeSegments.length; index += 1) {
    const segment = relativeSegments[index];
    const parent = child;
    const next = parent && typeof parent === 'object' ? parent[segment] : undefined;
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      const isFinalSegment = index === relativeSegments.length - 1;
      const parentType = String(parent?.['jcr:primaryType'] || '').toLowerCase();
      // A missing child can be treated as unused only when AEM returned its scoped
      // parent tree successfully and the immediate parent is visible. Direct children
      // of the /components collection can be absent there; nested resources also require
      // a visible parent. If the parent tree itself is unreadable, fail closed.
      const isDirectChildOfComponentCollection =
        componentTreePath === '/' + parts.slice(0, 3).join('/') &&
        componentTreePath.endsWith('/components') &&
        relativeSegments.length === 1 &&
        ['sling:folder', 'nt:folder'].includes(parentType);
      const safelyMissing = isFinalSegment && Boolean(parent && typeof parent === 'object') && (
        parentType === 'cq:component' || parentType === 'cq:clientlibraryfolder' ||
        isDirectChildOfComponentCollection ||
        (relativeSegments.length >= 2 && ['sling:folder', 'nt:folder', 'nt:unstructured'].includes(parentType))
      );
      const error = new Error(safelyMissing
        ? `AEM read confirmed that ${pathValue} is not present in the visible component tree under ${componentTreePath}/${relativeSegments.slice(0, index).join('/')}.`
        : `AEM returned the scoped component tree for ${componentTreePath}, but it did not expose ${pathValue}. This does not prove the path is unused; the entered path may differ from the CRX/DE tree, or the connection may not have visibility to that resource. No write has been attempted. Verify the exact repository path and that this connection points to the same AEM Author instance.`);
      error.status = safelyMissing ? 404 : 409;
      error.aemStatus = safelyMissing ? 404 : null;
      error.code = safelyMissing ? 'REPOSITORY_PATH_NOT_FOUND' : 'REPOSITORY_PATH_UNVERIFIABLE';
      error.safeToTreatAsMissing = safelyMissing;
      error.componentTreeReadCompleted = true;
      throw error;
    }
    child = next;
  }
  if (!child || typeof child !== 'object' || Array.isArray(child)) {
    const error = new Error(`AEM could not verify ${pathValue} in the scoped component tree. No write has been attempted.`);
    error.status = 409;
    error.code = 'REPOSITORY_PATH_UNVERIFIABLE';
    error.safeToTreatAsMissing = false;
    error.componentTreeReadCompleted = true;
    throw error;
  }
  return { path: pathValue, status: response.status, depth: 'infinity', data: child, bytes: Buffer.byteLength(JSON.stringify(child)), checkedAt: new Date().toISOString(), verificationSource: 'component-tree-infinity-json', ancestorPath: componentTreePath };
}

async function getRepositoryResourceViaQueryBuilder(target, repositoryPath) {
  const baseUrl = assertLocalAuthorReadTarget(target);
  const pathValue = normalizeRepositoryPath(repositoryPath);
  const segments = pathValue.split('/').filter(Boolean);
  if (!(segments[0] === 'apps' && segments.length >= 4 && segments[2] === 'components')) {
    const error = new Error('Query Builder fallback is restricted to explicit component resources.');
    error.status = 400;
    throw error;
  }
  const url = new URL('/bin/querybuilder.json', baseUrl);
  url.search = new URLSearchParams({ path: pathValue, 'path.exact': 'true', 'p.limit': '1', 'p.hits': 'full', 'p.nodedepth': '0' }).toString();
  const response = await fetch(url, localTargetFetchOptions(target, { method: 'GET', signal: AbortSignal.timeout(12000) }));
  const body = await response.text();
  if (Buffer.byteLength(body) > 2 * 1024 * 1024) {
    const error = new Error(`Query Builder response for ${pathValue} exceeded the 2 MB read limit.`);
    error.status = 413;
    throw error;
  }
  let parsed = null;
  try { parsed = body ? JSON.parse(body) : null; } catch { /* Report non-JSON response below. */ }
  if (!response.ok || !parsed || !Array.isArray(parsed.hits)) {
    const error = new Error(`AEM Query Builder could not verify ${pathValue} (HTTP ${response.status}).`);
    error.aemStatus = response.status;
    error.status = [300, 401, 403, 404].includes(response.status) ? response.status : 502;
    throw error;
  }
  const hit = parsed.hits.find((item) => item && item.path === pathValue);
  if (!hit) {
    const error = new Error(`AEM Query Builder returned no exact hit for ${pathValue}; this alone is not enough to prove the resource is absent because read permissions and query visibility can filter results.`);
    error.status = 404;
    error.aemStatus = 404;
    error.code = 'QUERY_BUILDER_NO_EXACT_HIT';
    error.queryBuilderConfirmedMissing = true;
    throw error;
  }
  const data = hit.properties && typeof hit.properties === 'object'
    ? { ...hit.properties, path: hit.path }
    : { ...hit };
  return { path: pathValue, status: response.status, depth: 0, data, bytes: Buffer.byteLength(JSON.stringify(data)), checkedAt: new Date().toISOString(), verificationSource: 'querybuilder-exact' };
}

async function getRepositoryResource(target, repositoryPath, depth = 2) {
  try {
    return await getRepositoryResourceDirect(target, repositoryPath, depth);
  } catch (directError) {
    if (![300, 404].includes(directError.aemStatus) && ![300, 404].includes(directError.status)) throw directError;
    const normalizedPath = normalizeRepositoryPath(repositoryPath);
    const segments = normalizedPath.split('/').filter(Boolean);
    if (segments.length < 2) throw directError;

    try {
      const infinity = await getRepositoryResourceInfinity(target, normalizedPath);
      return infinity;
    } catch (infinityError) {
      if (![300, 404].includes(infinityError.aemStatus) && ![300, 404].includes(infinityError.status)) throw infinityError;
    }

    let queryBuilderReturnedNoHit = false;
    try {
      return await getRepositoryResourceViaQueryBuilder(target, normalizedPath);
    } catch (queryBuilderError) {
      queryBuilderReturnedNoHit = queryBuilderError.queryBuilderConfirmedMissing === true;
      if (![300, 404].includes(queryBuilderError.aemStatus) && ![300, 404].includes(queryBuilderError.status)) throw queryBuilderError;
    }

    try {
      const componentTree = await getRepositoryResourceFromComponentTreeInfinity(target, normalizedPath);
      return componentTree;
    } catch (componentTreeError) {
      // If the bounded tree positively proves the final child is absent under a visible
      // parent, preserve that result. If the tree is incomplete/ambiguous, continue to
      // the existing ancestor walk: a more-specific ancestor selector may expose the
      // exact child even when the broad component tree omits it.
      if (componentTreeError.safeToTreatAsMissing === true && componentTreeError.status === 404) throw componentTreeError;
      if (![300, 404, 409].includes(componentTreeError.aemStatus) && ![300, 404, 409].includes(componentTreeError.status)) throw componentTreeError;
    }

    let readableAncestor = false;

    // Walk outward through ancestors. AEM can 404 a resource's own JSON URL,
    // including clientlib.0.json/clientlib.1.json, while exposing it under an
    // ancestor's JSON tree. Use a selector depth equal to the path distance and
    // traverse the returned child objects instead of treating that 404 as absence.
    // Never fall back to the global /apps root: AEM may answer /apps.3.json with HTTP 300
    // because the root is ambiguous/too broad. The app namespace is the safe boundary.
    for (let ancestorLength = segments.length - 1; ancestorLength >= 2; ancestorLength -= 1) {
      const ancestorPath = '/' + segments.slice(0, ancestorLength).join('/');
      const relativeSegments = segments.slice(ancestorLength);
      let ancestor;
      try {
        ancestor = await getRepositoryResourceDirect(target, ancestorPath, relativeSegments.length);
      } catch (ancestorError) {
        // 404 means the ancestor selector is unavailable; 300 means AEM considers
        // this ancestor selector ambiguous. Neither proves the requested child exists.
        // Skip both and continue with a more specific ancestor, never treating either as success.
        if ([300, 404].includes(ancestorError.aemStatus) || ancestorError.status === 404) continue;
        throw ancestorError;
      }

      readableAncestor = true;
      let child = ancestor.data;
      for (const segment of relativeSegments) {
        child = child && typeof child === 'object' ? child[segment] : undefined;
        if (!child || typeof child !== 'object' || Array.isArray(child)) break;
      }
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        return {
          path: normalizedPath,
          status: ancestor.status,
          depth: 0,
          data: child,
          bytes: Buffer.byteLength(JSON.stringify(child)),
          checkedAt: new Date().toISOString(),
          verificationSource: 'ancestor-json',
          ancestorPath,
          requestedDepth: depth,
        };
      }
    }
    const detail = readableAncestor
      ? 'A readable ancestor did not expose the exact child resource'
      : 'Direct JSON reads and the available parent selectors were unavailable or ambiguous';
    const queryDetail = queryBuilderReturnedNoHit ? ' Query Builder returned no exact hit, which can also reflect read permissions or query visibility.' : '';
    const error = new Error(
      'AEM could not verify whether ' + normalizedPath + ' exists. ' + detail + '.' + queryDetail +
      ' Forge has not written anything and will not assume this path is unused. Confirm the resource and read permissions in CRX/DE or use an AEM connection that can read the exact component tree.'
    );
    error.status = 409;
    error.code = 'REPOSITORY_PATH_UNVERIFIABLE';
    error.retryable = false;
    throw error;
  }
}

async function resourceExists(target, repositoryPath) {
  const baseUrl = assertLocalAuthorReadTarget(target);
  const url = new URL(repositoryPath + '.0.json', baseUrl);
  const response = await fetch(url, localTargetFetchOptions(target, { method: 'GET', signal: AbortSignal.timeout(8000) }));
  if (response.status === 404) {
    try {
      await getRepositoryResource(target, repositoryPath, 0);
      return true;
    } catch (readError) {
      if (readError.aemStatus === 404 || readError.status === 404) return false;
      throw readError;
    }
  }
  // AEM sometimes returns HTML with 200 for paths that are not JSON-renderable.
  if (response.ok) return true;
  const error = new Error('Unable to inspect ' + repositoryPath + ' (HTTP ' + response.status + ').');
  error.aemStatus = response.status;
  error.status = response.status >= 500 ? 502 : response.status;
  error.retryable = response.status >= 500 || [408, 425, 429].includes(response.status);
  if (response.status === 401 || response.status === 403) {
    error.message = 'AEM denied access while checking ' + repositoryPath + ' (HTTP ' + response.status + ').';
  }
  throw error;
}
async function postJcrProperties(target, repositoryPath, fields, stage) {
  const baseUrl = assertLocalAuthorOperationsTarget(target);
  const url = new URL(repositoryPath, baseUrl);
  if (url.origin !== baseUrl.origin) throw new Error('Cross-origin repository write blocked.');
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      for (const item of value) form.append(key, String(item));
      if (key !== 'jcr:primaryType') form.set(`${key}@TypeHint`, 'String[]');
    } else if (value !== undefined && value !== null) {
      form.set(key, String(value));
      if (key !== 'jcr:primaryType') {
        if (typeof value === 'boolean') form.set(`${key}@TypeHint`, 'Boolean');
        else if (typeof value === 'number') form.set(`${key}@TypeHint`, Number.isInteger(value) ? 'Long' : 'Double');
      }
    }
  }
  const response = await fetch(url, localTargetFetchOptions(target, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: form,
    signal: AbortSignal.timeout(20000),
  }));
  const body = await getResponseBody(response);
  assertHttpSuccess(response, body, stage);
  return { status: response.status, response: (body.parsed?.msg || body.parsed?.message || body.text || 'AEM accepted the repository write.').slice(0, 500) };
}

function primaryTypeForRepositoryFolder(repositoryPath) {
  const name = String(repositoryPath || '').split('/').filter(Boolean).at(-1) || '';
  // Clientlib roots must be cq:ClientLibraryFolder. Generic sling:Folder nodes
  // can hold files, but AEM will not treat them as client libraries.
  if (/^clientlib(?:[-_].*)?$/i.test(name)) return 'cq:ClientLibraryFolder';
  return 'sling:Folder';
}

async function ensureRepositoryParents(target, repositoryPath) {
  const parts = repositoryPath.split('/').filter(Boolean);
  const parentParts = parts.slice(0, -1);
  for (let index = 1; index <= parentParts.length; index += 1) {
    const current = `/${parentParts.slice(0, index).join('/')}`;
    normalizeRepositoryPath(current);
    const primaryType = primaryTypeForRepositoryFolder(current);
    if (await resourceExists(target, current)) {
      if (primaryType === 'cq:ClientLibraryFolder') {
        let existingResource;
        try {
          existingResource = await getRepositoryResource(target, current, 0);
        } catch (error) {
          const mismatch = new Error(`Existing client library parent ${current} could not be read back to verify its primary type. It must be cq:ClientLibraryFolder, not a generic folder. Back up and correct it in CRX/DE or use a fresh component path. Read-back error: ${error.message}`);
          mismatch.status = 409;
          mismatch.code = 'CLIENTLIB_PRIMARY_TYPE_UNVERIFIED';
          mismatch.retryable = false;
          throw mismatch;
        }
        const actualType = existingResource?.data?.['jcr:primaryType'];
        if (actualType !== primaryType) {
          const mismatch = new Error(`Existing client library parent ${current} has primary type ${actualType || 'unknown'}; expected cq:ClientLibraryFolder. Forge will not create clientlib assets under this incorrectly typed node. Back up and correct it in CRX/DE or use a fresh component path.`);
          mismatch.status = 409;
          mismatch.code = 'CLIENTLIB_PRIMARY_TYPE_MISMATCH';
          mismatch.retryable = false;
          throw mismatch;
        }
      }
      continue;
    }
    await postJcrProperties(target, current, { 'jcr:primaryType': primaryType }, `Create ${primaryType} parent ${current}`);
    // Verify that AEM exposes the resource before proceeding to child writes.
    if (!(await resourceExists(target, current))) throw new Error(`AEM accepted creation of ${primaryType} at ${current}, but the resource could not be verified afterward.`);
    if (primaryType === 'cq:ClientLibraryFolder') {
      let resource;
      try {
        resource = await getRepositoryResource(target, current, 0);
      } catch (error) {
        const verificationError = new Error(`AEM accepted creation of client library folder ${current}, but its primary type could not be verified. The folder must be cq:ClientLibraryFolder, not sling:Folder. Read-back error: ${error.message}`);
        verificationError.status = error.status;
        verificationError.aemStatus = error.aemStatus;
        verificationError.code = 'CLIENTLIB_PRIMARY_TYPE_UNVERIFIED';
        verificationError.retryable = false;
        throw verificationError;
      }
      const actualType = resource?.data?.['jcr:primaryType'];
      if (actualType !== 'cq:ClientLibraryFolder') {
        const verificationError = new Error(`AEM created ${current} with primary type ${actualType || 'unknown'}; expected cq:ClientLibraryFolder. Forge will not continue creating clientlib assets under a wrongly typed node.`);
        verificationError.status = 409;
        verificationError.code = 'CLIENTLIB_PRIMARY_TYPE_MISMATCH';
        verificationError.retryable = false;
        throw verificationError;
      }
    }
  }
}

function validateNodeOperation(operation) {
  const repositoryPath = normalizeRepositoryPath(operation.path, { allowEtc: false });
  if (repositoryPath === '/apps' || repositoryPath === '/content' || repositoryPath === '/conf') throw new Error('A node operation must target a child below its repository root.');
  const primaryType = String(operation.primaryType || 'nt:unstructured').trim();
  if (!/^[A-Za-z][A-Za-z0-9:_-]{0,100}$/.test(primaryType) || /^(?:rep:|sling:ResourceResolver|rep:ACL)$/i.test(primaryType)) throw new Error('The requested node type is not permitted.');
  if (/^clientlib(?:[-_].*)?$/i.test(repositoryPath.split('/').filter(Boolean).at(-1) || '') && primaryType !== 'cq:ClientLibraryFolder') {
    const error = new Error(`Client library root ${repositoryPath} must use primaryType cq:ClientLibraryFolder, not ${primaryType}.`);
    error.code = 'INVALID_CLIENTLIB_PRIMARY_TYPE';
    error.retryable = false;
    throw error;
  }
  const properties = operation.properties ?? {};
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) throw new Error('Node properties must be an object.');
  const keys = Object.keys(properties);
  if (keys.length > 60) throw new Error('A node can set at most 60 properties per operation.');
  for (const key of keys) {
    if (!/^[A-Za-z][A-Za-z0-9:_-]{0,150}$/.test(key) || /^(?:jcr:primaryType|jcr:uuid|rep:policy|rep:principalName|rep:password|rep:authorizableId)$/i.test(key) || /password|secret|token|credential/i.test(key)) {
      throw new Error(`Property name is blocked or invalid: ${key}`);
    }
    const value = properties[key];
    if (!(typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || (Array.isArray(value) && value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))))) {
      throw new Error(`Property ${key} must be a scalar or an array of scalar values.`);
    }
    if (JSON.stringify(value).length > 12000) throw new Error(`Property ${key} is larger than the 12 KB limit.`);
  }
  return { path: repositoryPath, primaryType, properties };
}

function validateFileOperation(operation) {
  const repositoryPath = normalizeRepositoryPath(operation.path, { allowEtc: false });
  if (repositoryPath === '/apps' || repositoryPath === '/content' || repositoryPath === '/conf') throw new Error('A file operation must target a file below a repository root.');
  if (typeof operation.content !== 'string') throw new Error(`File content is required for ${repositoryPath}.`);
  if (Buffer.byteLength(operation.content, 'utf8') > 1024 * 1024) throw new Error(`File ${repositoryPath} exceeds the 1 MB per-file limit.`);
  const mimeType = typeof operation.mimeType === 'string' && /^[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+$/.test(operation.mimeType) ? operation.mimeType : 'text/plain';
  return { path: repositoryPath, content: operation.content, mimeType };
}

async function createRepositoryFile(target, operation, attemptState = {}) {
  const baseUrl = assertLocalAuthorOperationsTarget(target);
  const repositoryPath = operation.path;
  await ensureRepositoryParents(target, repositoryPath);
  if (await resourceExists(target, repositoryPath)) {
    // A previous upload may have succeeded even if its response or verification was lost.
    // Never overwrite a file. Recover only when this same operation previously observed
    // the path as absent and had already started its upload.
    if (attemptState.initiallyAbsent === true && attemptState.writeAttempted === true) {
      return {
        path: repositoryPath,
        action: 'recovered-file-after-ambiguous-write',
        verified: true,
        verification: 'The JCR resource exists after an earlier upload attempt; file bytes were not read back or compared.'
      };
    }
    const error = new Error(repositoryPath + ' already exists. Direct file overwrite is blocked. Prepare a fresh component path instead of overwriting an existing resource.');
    error.status = 409;
    error.aemStatus = 409;
    error.code = 'RESOURCE_ALREADY_EXISTS';
    error.retryable = false;
    throw error;
  }
  attemptState.initiallyAbsent = true;
  const parentPath = repositoryPath.slice(0, repositoryPath.lastIndexOf('/')) || '/';
  const fileName = repositoryPath.split('/').pop();
  const url = new URL(parentPath, baseUrl);
  const form = new FormData();
  form.set('*', new Blob([operation.content], { type: operation.mimeType }), fileName);
  form.set('*@TypeHint', 'nt:file');
  attemptState.writeAttempted = true;
  const response = await fetch(url, localTargetFetchOptions(target, { method: 'POST', body: form, signal: AbortSignal.timeout(30000) }));
  const body = await getResponseBody(response);
  assertHttpSuccess(response, body, 'Create repository file ' + repositoryPath);
  const verified = await resourceExists(target, repositoryPath);
  if (!verified) {
    const error = new Error('AEM accepted the file upload, but ' + repositoryPath + ' could not be verified afterward.');
    error.retryable = true;
    throw error;
  }
  return {
    path: repositoryPath,
    action: 'created-file',
    verified: true,
    verification: 'JCR resource existence confirmed; file bytes were not read back or compared.',
    response: (body.parsed?.msg || body.parsed?.message || body.text || 'File created.').slice(0, 400)
  };
}
export async function readLocalRepositoryPath({ target, repositoryPath, depth = 2 }) {
  assertLocalAuthorReadTarget(target);
  return getRepositoryResource(target, repositoryPath, depth);
}

const MAX_REPOSITORY_OPERATION_RETRIES = 5;
const MAX_REPOSITORY_OPERATION_ATTEMPTS = MAX_REPOSITORY_OPERATION_RETRIES + 1;

function repositoryOperationErrorInfo(error, phase = 'write') {
  const message = String(error?.message || error || 'Unknown repository operation error').slice(0, 1600);
  const aemStatus = Number.isInteger(error?.aemStatus) ? error.aemStatus : null;
  const status = aemStatus ?? (Number.isInteger(error?.status) ? error.status : null);
  const conflict = status === 409 || /already exists|direct file overwrite|overwrite is blocked/i.test(message);
  const redirect = status !== null && status >= 300 && status < 400;
  const deterministic = phase === 'validation'
    || error?.retryable === false
    || conflict
    || redirect
    || [400, 401, 403, 404, 405, 410, 422].includes(status)
    || /invalid|blocked or invalid|not permitted|unsupported|protected repository path|duplicate repository path|must be a|must use|exceeds the/i.test(message);
  const retryable = !deterministic && (
    status === null
    || [408, 425, 429].includes(status)
    || status >= 500
    || /could not be verified|unable to inspect|timed out|timeout|fetch failed|network|socket|temporar/i.test(message)
  );
  let code = error?.code || '';
  if (!code) {
    if (phase === 'validation') code = 'VALIDATION_ERROR';
    else if (conflict) code = 'RESOURCE_ALREADY_EXISTS';
    else if (status === 401 || status === 403) code = 'AEM_ACCESS_DENIED';
    else if (status === 429) code = 'AEM_RATE_LIMITED';
    else if (/could not be verified|unable to inspect/i.test(message)) code = 'VERIFICATION_FAILED';
    else if (/timed out|timeout|fetch failed|network|socket/i.test(message)) code = 'NETWORK_OR_TIMEOUT';
    else if (status !== null && status >= 500) code = 'AEM_SERVER_ERROR';
    else if (status !== null && status >= 400) code = 'AEM_HTTP_ERROR';
    else code = 'OPERATION_FAILED';
  }
  return { code, message, httpStatus: status, retryable };
}

function repositoryOperationFailureRecord(entry, error, phase) {
  const info = repositoryOperationErrorInfo(error, phase);
  return {
    index: entry.index,
    type: entry.type,
    path: entry.path,
    phase,
    code: info.code,
    message: info.message,
    httpStatus: info.httpStatus,
    attempts: entry.attempts,
    retriesUsed: Math.max(0, entry.attempts - 1),
    maxAttempts: MAX_REPOSITORY_OPERATION_ATTEMPTS,
    retryable: info.retryable,
    history: entry.history.slice()
  };
}

export async function applyLocalRepositoryOperations({ target, operations }) {
  assertLocalAuthorOperationsTarget(target);
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > 40) {
    const error = new Error('Provide between 1 and 40 approved repository operations.');
    error.status = 400;
    throw error;
  }

  const validEntries = [];
  const failures = new Map();
  const seenPaths = new Set();

  for (const [zeroIndex, rawOperation] of operations.entries()) {
    const index = zeroIndex + 1;
    const rawPath = typeof rawOperation?.path === 'string' ? rawOperation.path.slice(0, 500) : '(missing path)';
    const rawType = typeof rawOperation?.type === 'string' ? rawOperation.type : 'unknown';
    const draftEntry = { index, type: rawType, path: rawPath, attempts: 0, history: [], fileState: {} };
    try {
      if (!rawOperation || typeof rawOperation !== 'object' || Array.isArray(rawOperation)) {
        throw new Error('Each repository operation must be an object.');
      }
      let operation;
      if (rawOperation.type === 'node') operation = { type: 'node', ...validateNodeOperation(rawOperation) };
      else if (rawOperation.type === 'file') operation = { type: 'file', ...validateFileOperation(rawOperation) };
      else throw new Error('Repository operation type must be node or file.');

      draftEntry.type = operation.type;
      draftEntry.path = operation.path;
      draftEntry.operation = operation;

      if (seenPaths.has(operation.path)) {
        const duplicateError = new Error('Duplicate repository operation path: ' + operation.path + '. Only the first operation for this path will be attempted.');
        duplicateError.code = 'DUPLICATE_PATH';
        duplicateError.retryable = false;
        throw duplicateError;
      }
      seenPaths.add(operation.path);
      validEntries.push(draftEntry);
    } catch (error) {
      const info = repositoryOperationErrorInfo(error, 'validation');
      const phase = error?.code === 'DUPLICATE_PATH' ? 'preflight' : 'validation';
      const history = [{
        attempt: 0,
        phase,
        code: error?.code || info.code,
        httpStatus: info.httpStatus,
        retryable: false,
        message: info.message
      }];
      failures.set(index, {
        entry: null,
        record: {
          index,
          type: draftEntry.type,
          path: draftEntry.path,
          phase,
          code: error?.code || info.code,
          message: info.message,
          httpStatus: info.httpStatus,
          attempts: 0,
          retriesUsed: 0,
          maxAttempts: MAX_REPOSITORY_OPERATION_ATTEMPTS,
          retryable: false,
          history
        }
      });
    }
  }

  const applied = [];
  async function attemptEntry(entry, phase) {
    entry.attempts += 1;
    try {
      let result;
      if (entry.operation.type === 'file') {
        result = await createRepositoryFile(target, entry.operation, entry.fileState);
      } else {
        await ensureRepositoryParents(target, entry.operation.path);
        const exists = await resourceExists(target, entry.operation.path);
        if (exists && entry.operation.primaryType === 'cq:ClientLibraryFolder') {
          let currentResource;
          try {
            currentResource = await getRepositoryResource(target, entry.operation.path, 0);
          } catch (error) {
            const mismatch = new Error(`Client library path ${entry.operation.path} already exists, but Forge cannot verify its primary type (read-back: ${error.message}). It must be cq:ClientLibraryFolder; a previous attempt may have created it as sling:Folder. Back up and correct that existing node in CRX/DE or use a fresh component path.`);
            mismatch.status = 409;
            mismatch.code = 'CLIENTLIB_PRIMARY_TYPE_UNVERIFIED';
            mismatch.retryable = false;
            throw mismatch;
          }
          const actualType = currentResource?.data?.['jcr:primaryType'];
          if (actualType !== 'cq:ClientLibraryFolder') {
            const mismatch = new Error(`Client library path ${entry.operation.path} already exists as ${actualType || 'an unknown node type'}, but it must be cq:ClientLibraryFolder. Forge will not silently reuse or attempt to change the primary type of an existing node. Back up and correct that node in CRX/DE or use a fresh component path.`);
            mismatch.status = 409;
            mismatch.code = 'CLIENTLIB_PRIMARY_TYPE_MISMATCH';
            mismatch.retryable = false;
            throw mismatch;
          }
        }
        const fields = { ...(exists ? {} : { 'jcr:primaryType': entry.operation.primaryType }), ...entry.operation.properties };
        const writeResult = await postJcrProperties(
          target,
          entry.operation.path,
          fields,
          (exists ? 'Update' : 'Create') + ' repository node ' + entry.operation.path
        );
        let verified;
        let verificationDepth = 1;
        try {
          verified = await getRepositoryResource(target, entry.operation.path, verificationDepth);
          verificationDepth = verified.depth;
        } catch (verificationError) {
          // Some AEM resource paths do not respond to the depth-1 JSON selector even
          // when the node exists. Fall back to the exact node's depth-0 JSON, which is
          // also used by resourceExists() and file-write verification.
          if (verificationError.aemStatus !== 404 && verificationError.status !== 404) throw verificationError;
          try {
            verificationDepth = 0;
            verified = await getRepositoryResource(target, entry.operation.path, verificationDepth);
            verificationDepth = verified.depth;
          } catch (fallbackError) {
            const wrapped = new Error(
              'AEM accepted the node write to ' + entry.operation.path +
              ', but verification failed at depth 1 (' + verificationError.message +
              ') and depth 0 (' + fallbackError.message + ').'
            );
            wrapped.status = fallbackError.status;
            wrapped.aemStatus = fallbackError.aemStatus;
            wrapped.retryable = fallbackError.retryable;
            throw wrapped;
          }
        }
        if (!verified || !verified.data || typeof verified.data !== 'object') {
          const verificationError = new Error('AEM accepted the node write to ' + entry.operation.path + ', but the node could not be verified afterward.');
          verificationError.retryable = true;
          throw verificationError;
        }

        const expectedProperties = {
          'jcr:primaryType': entry.operation.primaryType,
          ...entry.operation.properties,
        };
        for (const [propertyName, expectedValue] of Object.entries(expectedProperties)) {
          const actualValue = verified.data[propertyName];
          const expectedValues = (Array.isArray(expectedValue) ? expectedValue : [expectedValue]).map(String).sort();
          const actualValues = (Array.isArray(actualValue) ? actualValue : actualValue === undefined ? [] : [actualValue]).map(String).sort();
          if (expectedValues.length !== actualValues.length || expectedValues.some((value, index) => value !== actualValues[index])) {
            const verificationError = new Error(
              'AEM accepted the node write to ' + entry.operation.path +
              ', but verification found a missing or different value for property ' + propertyName +
              ' (read depth ' + verificationDepth + ').'
            );
            verificationError.code = 'NODE_PROPERTY_VERIFICATION_FAILED';
            verificationError.retryable = false;
            throw verificationError;
          }
        }
        result = {
          path: entry.operation.path,
          action: exists ? 'updated-node-properties' : 'created-node',
          verified: true,
          verificationDepth,
          status: writeResult.status,
          response: writeResult.response
        };
      }
      applied.push({
        index: entry.index,
        type: entry.operation.type,
        path: entry.operation.path,
        attempts: entry.attempts,
        retriesUsed: Math.max(0, entry.attempts - 1),
        ...result
      });
      failures.delete(entry.index);
      return true;
    } catch (error) {
      const info = repositoryOperationErrorInfo(error, phase);
      entry.history.push({
        attempt: entry.attempts,
        phase,
        code: info.code,
        httpStatus: info.httpStatus,
        retryable: info.retryable,
        message: info.message
      });
      failures.set(entry.index, {
        entry,
        record: repositoryOperationFailureRecord(entry, error, phase)
      });
      return false;
    }
  }

  // First pass: attempt every valid, unique operation once. One failure never aborts later operations.
  for (const entry of validEntries) {
    await attemptEntry(entry, 'initial');
  }

  const initialFailureCount = failures.size;
  const retryRounds = [];
  let retryAttempts = 0;
  let pending = [...failures.values()]
    .filter((item) => item.entry && item.record.retryable)
    .map((item) => item.entry);

  // Retry only transient failures. Deterministic errors such as an existing file are reported
  // without repeated writes that cannot succeed or could overwrite resources.
  for (let round = 1; round <= MAX_REPOSITORY_OPERATION_RETRIES && pending.length > 0; round += 1) {
    const waitMs = Math.min(200 * (2 ** (round - 1)), 1600);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    let recovered = 0;
    const nextPending = [];
    for (const entry of pending) {
      if (!failures.has(entry.index)) continue;
      retryAttempts += 1;
      const succeeded = await attemptEntry(entry, 'retry-' + round);
      if (succeeded) recovered += 1;
      else if (failures.get(entry.index)?.record.retryable) nextPending.push(entry);
    }
    retryRounds.push({
      round,
      attempted: pending.length,
      recovered,
      remainingRetryable: nextPending.length,
      delayMs: waitMs
    });
    pending = nextPending;
  }

  const failed = [...failures.values()]
    .map((item) => item.record)
    .sort((a, b) => a.index - b.index);
  applied.sort((a, b) => a.index - b.index);
  const summary = {
    totalOperations: operations.length,
    succeeded: applied.length,
    failed: failed.length,
    initialFailures: initialFailureCount,
    retryAttempts,
    maxRetriesPerOperation: MAX_REPOSITORY_OPERATION_RETRIES,
    maxAttemptsPerOperation: MAX_REPOSITORY_OPERATION_ATTEMPTS
  };

  return {
    ok: failed.length === 0,
    mode: 'instance-only',
    summary,
    retryPolicy: {
      behavior: 'Attempt every valid operation once, then retry retryable failures in rounds.',
      maxRetries: MAX_REPOSITORY_OPERATION_RETRIES,
      maxAttempts: MAX_REPOSITORY_OPERATION_ATTEMPTS,
      nonRetryableFailures: 'Validation errors, duplicate paths, access errors, redirects, and existing-file collisions are reported without retrying.'
    },
    failed,
    retryRounds,
    applied,
    note: failed.length === 0
      ? 'All repository operations completed and their repository paths were verified. File verification confirms resource existence; it does not compare uploaded file bytes.'
      : 'The batch continued after individual failures. Successful writes remain in the repository and are not rolled back. Review each failed operation message, HTTP status, retry history, and path before manually retrying or repairing it.'
  };
}
