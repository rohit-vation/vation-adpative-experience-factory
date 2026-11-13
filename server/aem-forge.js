import {
  getAemAuthHeaders,
  testAemConnection,
  readLocalRepositoryPath,
  applyLocalRepositoryOperations,
} from './aem-client.js';
import { loadEncryptedConnections, saveEncryptedConnections, validateConnectorInput } from './connection-vault.js';
import { logger, queryLogs, clearLogs, setLogLevel, getLogLevel } from './logger.js';

let localConnections = [];

export async function initAemForge() {
  localConnections = await loadEncryptedConnections();
  logger.info('cms-connections', 'CMS connection service initialized.', { storedConnections: localConnections.length });
}

function parseTargets() {
  let parsed = [];
  const raw = process.env.AEM_TARGETS_JSON;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('AEM_TARGETS_JSON must be an array.');
    } catch (error) {
      logger.error('config', 'Unable to parse AEM_TARGETS_JSON.', { error: error.message });
      parsed = [];
    }
  }

  const environmentTargets = parsed
    .filter((target) => target && typeof target === 'object' &&
      typeof target.id === 'string' && typeof target.name === 'string' &&
      (typeof target.baseUrl === 'string' || typeof target.baseUrlEnv === 'string'))
    .map((target) => ({
      id: target.id,
      name: target.name,
      platform: target.platform === 'aemaacs' ? 'aemaacs-cloud' :
        (['aem65', 'aemaacs-sdk', 'aemaacs-cloud', 'eds'].includes(target.platform) ? target.platform : 'aem65'),
      role: ['author', 'publisher', 'workspace', 'eds-authoring', 'preview'].includes(target.role) ? target.role : 'author',
      baseUrl: typeof target.baseUrlEnv === 'string'
        ? String(process.env[target.baseUrlEnv] || '').trim()
        : String(target.baseUrl || '').trim(),
      authMode: ['basic', 'bearer', 'none'].includes(target.authMode) ? target.authMode : 'none',
      usernameEnv: typeof target.usernameEnv === 'string' ? target.usernameEnv : '',
      passwordEnv: typeof target.passwordEnv === 'string' ? target.passwordEnv : '',
      tokenEnv: typeof target.tokenEnv === 'string' ? target.tokenEnv : '',
      healthPath: typeof target.healthPath === 'string'
        ? target.healthPath
        : (['aem65', 'aemaacs-sdk'].includes(target.platform) ? '/system/console/status-productinfo.json' : '/'),
      allowInsecureHttp: target.allowInsecureHttp === true,
      managedByUi: false,
    }))
    .filter((target) => target.baseUrl);

  const environmentIds = new Set(environmentTargets.map((target) => target.id));
  return [
    ...environmentTargets,
    ...localConnections.filter((target) => target && typeof target.id === 'string' && !environmentIds.has(target.id)),
  ];
}

function publicTarget(target) {
  let baseUrl = target.baseUrl;
  try {
    const parsed = new URL(target.baseUrl);
    baseUrl = parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname);
  } catch {
    baseUrl = '[invalid URL]';
  }

  let hasCredentials = false;
  try {
    getAemAuthHeaders(target);
    hasCredentials = target.authMode !== 'none';
  } catch {
    hasCredentials = false;
  }

  return {
    id: target.id,
    name: target.name,
    platform: target.platform,
    role: target.role,
    baseUrl,
    authMode: target.authMode,
    hasCredentials,
    healthPath: target.healthPath,
    managedByUi: target.managedByUi === true,
    canRemove: target.managedByUi === true,
  };
}

function resolveTarget(id) {
  return parseTargets().find((target) => target.id === id) || null;
}

function statusFor(error, fallback = 400) {
  return Number.isInteger(error && error.status) && error.status >= 400 && error.status <= 599
    ? error.status
    : fallback;
}

function parseTargetId(body) {
  const id = typeof body?.targetId === 'string' ? body.targetId.trim() : '';
  if (!id) throw new Error('Choose a CMS connection.');
  return id;
}

function sanitizeRepositoryPath(raw) {
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value || !value.startsWith('/') || value.startsWith('//') ||
      value.includes('\\') || /[?#\u0000-\u001f]/.test(value) || value.includes('..')) return '';
  const roots = ['/apps', '/content', '/conf', '/etc/tags', '/etc/clientlibs', '/etc/designs'];
  if (!roots.some((root) => value === root || value.startsWith(root + '/'))) return '';
  if (value.startsWith('/etc/packages')) return '';
  return value;
}

export async function handleAemForgeApi(req, res, pathname, { readJson, sendJson }) {
  const method = req.method || 'GET';
  const url = new URL(req.url, 'http://aef.local');
  const json = (limit) => readJson(req, limit);
  const answer = (status, body) => sendJson(res, status, body);
  const route = async (fn) => {
    try {
      answer(200, await fn());
    } catch (error) {
      const isExpectedMissingPath = pathname === '/api/aem/repository/read' &&
        (error.status === 404 || error.aemStatus === 404);
      if (isExpectedMissingPath) {
        logger.debug('jcr-read', 'Repository path does not exist.', { status: 404 });
      } else {
        logger.error('cms-api', method + ' ' + pathname + ' failed.', {
          message: error.message,
          status: error.status || null,
        });
      }
      answer(statusFor(error), {
        error: error.message || 'CMS request failed.',
        code: error.code || null,
        retryable: error.retryable === true,
        safeToTreatAsMissing: error.safeToTreatAsMissing === true,
      });
    }
  };

  if (pathname === '/api/logs' && method === 'GET') {
    return answer(200, queryLogs({
      after: url.searchParams.get('after') || 0,
      level: url.searchParams.get('level') || 'TRACE',
      query: url.searchParams.get('q') || '',
      limit: url.searchParams.get('limit') || 500,
    }));
  }

  if (pathname === '/api/logs/client' && method === 'POST') {
    return route(async () => {
      const body = await json(8000);
      const level = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR'].includes(String(body?.level || '').toUpperCase())
        ? String(body.level).toLowerCase()
        : 'warn';
      const scope = typeof body?.scope === 'string' ? body.scope.slice(0, 80) : 'frontend';
      const message = typeof body?.message === 'string' ? body.message.slice(0, 1200) : 'Browser event without message.';
      const details = body?.details && typeof body.details === 'object' && !Array.isArray(body.details)
        ? body.details
        : undefined;
      logger[level](scope, message, details);
      return { ok: true };
    });
  }

  if (pathname === '/api/logs/level' && method === 'POST') {
    return route(async () => {
      const body = await json();
      return setLogLevel(body.level);
    });
  }

  if (pathname === '/api/logs/clear' && method === 'POST') {
    return route(async () => {
      await json();
      return clearLogs();
    });
  }

  if (pathname === '/api/aem/targets' && method === 'GET') {
    return answer(200, { targets: parseTargets().map(publicTarget), logLevel: getLogLevel() });
  }

  if (pathname === '/api/aem/connections' && method === 'POST') {
    return route(async () => {
      const body = await json();
      const target = validateConnectorInput(body);
      if (parseTargets().some((item) => item.name.toLowerCase() === target.name.toLowerCase())) {
        const error = new Error('A connection with that name already exists. Choose a unique name.');
        error.status = 409;
        throw error;
      }

      localConnections.push(target);
      await saveEncryptedConnections(localConnections);

      let test;
      try {
        test = await testAemConnection(target);
      } catch (error) {
        test = { ok: false, status: error.status || null, note: error.message };
      }

      logger.info('cms-connection', 'Connection saved and tested.', {
        targetId: target.id,
        platform: target.platform,
        ok: test.ok,
      });
      return {
        ok: true,
        target: publicTarget(target),
        test,
        note: test.ok
          ? 'Connection saved and its health endpoint responded.'
          : 'Connection saved securely, but the health check failed. Confirm URL, authentication, credentials and health path.',
      };
    });
  }

  if (pathname.startsWith('/api/aem/connections/') && method === 'DELETE') {
    return route(async () => {
      let id;
      try {
        id = decodeURIComponent(pathname.slice('/api/aem/connections/'.length));
      } catch {
        const error = new Error('The connection identifier is invalid.');
        error.status = 400;
        throw error;
      }
      const target = localConnections.find((item) => item.id === id);
      if (!target) {
        const error = new Error('Only dashboard-managed connections can be removed here.');
        error.status = 404;
        throw error;
      }
      localConnections = localConnections.filter((item) => item.id !== id);
      await saveEncryptedConnections(localConnections);
      logger.info('cms-connection', 'Connection removed.', { targetId: id, platform: target.platform });
      return { ok: true, removedId: id };
    });
  }

  if (pathname === '/api/aem/test-connection' && method === 'POST') {
    return route(async () => {
      const body = await json();
      const target = resolveTarget(parseTargetId(body));
      if (!target) {
        const error = new Error('The selected CMS connection is not registered.');
        error.status = 404;
        throw error;
      }
      const result = await testAemConnection(target);
      logger.info('cms-connection', 'Connection health check completed.', {
        targetId: target.id,
        ok: result.ok,
        status: result.status,
      });
      return { ...result, target: publicTarget(target) };
    });
  }

  if (pathname === '/api/aem/repository/read' && method === 'POST') {
    return route(async () => {
      const body = await json();
      const target = resolveTarget(parseTargetId(body));
      if (!target) {
        const error = new Error('The selected CMS connection is not registered.');
        error.status = 404;
        throw error;
      }
      const repositoryPath = sanitizeRepositoryPath(body.path);
      if (!repositoryPath) throw new Error('Repository path is outside the read allowlist or is unsafe.');
      const result = await readLocalRepositoryPath({ target, repositoryPath, depth: body.depth });
      logger.debug('jcr-read', 'Repository path read.', { targetId: target.id, repositoryPath });
      return { ok: true, target: publicTarget(target), result };
    });
  }

  if (pathname === '/api/aem/repository/write' && method === 'POST') {
    return route(async () => {
      const body = await json();
      const target = resolveTarget(parseTargetId(body));
      if (!target) {
        const error = new Error('The selected CMS connection is not registered.');
        error.status = 404;
        throw error;
      }
      if (body.confirmWrites !== true) {
        const error = new Error('Explicit approval is required before writing repository resources.');
        error.status = 400;
        throw error;
      }
      const result = await applyLocalRepositoryOperations({ target, operations: body.operations });
      for (const operation of Array.isArray(result.applied) ? result.applied : []) {
        logger.info('jcr-write', 'Repository operation succeeded.', {
          targetId: target.id,
          index: operation.index,
          type: operation.type,
          path: operation.path,
          action: operation.action,
          verified: operation.verified === true,
          attempts: operation.attempts,
          retriesUsed: operation.retriesUsed,
        });
      }
      for (const failure of Array.isArray(result.failed) ? result.failed : []) {
        logger.error('jcr-write', 'Repository operation failed.', {
          targetId: target.id,
          index: failure.index,
          type: failure.type,
          path: failure.path,
          phase: failure.phase,
          code: failure.code,
          httpStatus: failure.httpStatus,
          message: failure.message,
          attempts: failure.attempts,
          retriesUsed: failure.retriesUsed,
          retryable: failure.retryable,
          history: failure.history,
        });
      }
      logger.info('jcr-write', 'Approved repository operation batch completed.', {
        targetId: target.id,
        succeeded: result.summary?.succeeded ?? result.applied?.length ?? 0,
        failed: result.summary?.failed ?? 0,
      });
      return { ok: true, target: publicTarget(target), result };
    });
  }

  return false;
}

export async function getAemTargetsPublic() {
  return parseTargets().map(publicTarget);
}
