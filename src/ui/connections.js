import { icon } from '../lib/icons.js';
import { reportBrowserLog } from './log-panel.js';

const PLATFORM_OPTIONS = [
  ['aem65', 'AEM 6.5'],
  ['aemaacs-sdk', 'AEMaaCS SDK - Local'],
  ['aemaacs-cloud', 'AEMaaCS - Hosted'],
  ['eds', 'Edge Delivery Services'],
];
const ROLE_OPTIONS = [
  ['author', 'Author'],
  ['publisher', 'Publisher (read-only)'],
  ['preview', 'Preview'],
  ['eds-authoring', 'EDS authoring'],
];

let mounted = false;
let targets = [];
const connectionChecks = new Map();

const $ = (selector, root = document) => root.querySelector(selector);
const make = (tag, className, text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
};

async function request(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (HTTP ${response.status}).`);
  return body;
}

const postJson = (url, body) => request(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

function status(message, kind = 'info') {
  const node = $('#connections-status');
  if (!node) return;
  node.hidden = false;
  node.className = `aef-status aef-status-${kind}`;
  node.textContent = message;
}

function showOutput(value) {
  const node = $('#connection-test-output');
  if (!node) return;
  node.hidden = false;
  node.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function platformLabel(id) {
  return PLATFORM_OPTIONS.find(([value]) => value === id)?.[1] || id || 'CMS';
}

function roleLabel(id) {
  return ROLE_OPTIONS.find(([value]) => value === id)?.[1] || id || 'Role not set';
}

function showPanel() {
  $('#connections-overlay').classList.add('is-open');
  $('#connections-panel').classList.add('is-open');
  $('#connections-overlay').setAttribute('aria-hidden', 'false');
  $('#open-connections').setAttribute('aria-expanded', 'true');
  void refreshConnections();
}

function closePanel() {
  $('#connections-overlay')?.classList.remove('is-open');
  $('#connections-panel')?.classList.remove('is-open');
  $('#connections-overlay')?.setAttribute('aria-hidden', 'true');
  $('#open-connections')?.setAttribute('aria-expanded', 'false');
}

function targetCard(target) {
  const card = make('article', 'aef-card aef-connection-row');
  const header = make('div', 'aef-panel-title');
  const heading = make('div');
  heading.append(make('h4', '', target.name), make('p', 'aef-muted', `${platformLabel(target.platform)} - ${roleLabel(target.role)}`));
  const health = connectionChecks.get(target.id);
  const chip = make('span', 'aef-chip', health ? (health.ok ? 'Connected' : 'Check failed') : (target.hasCredentials ? 'Credentials saved' : 'Credentials missing'));
  header.append(heading, chip);
  card.append(header);
  card.append(make('p', 'aef-muted aef-connection-url', target.baseUrl || 'No URL reported'));
  const actions = make('div', 'aef-inline-actions');
  const test = make('button', 'aef-secondary', 'Test connection');
  test.type = 'button';
  test.addEventListener('click', () => void testConnection(target));
  actions.append(test);
  if (target.canRemove) {
    const remove = make('button', 'aef-secondary', 'Remove');
    remove.type = 'button';
    remove.addEventListener('click', () => void removeConnection(target));
    actions.append(remove);
  }
  card.append(actions);
  if (health) {
    card.append(make('p', health.ok ? 'aef-connection-result is-success' : 'aef-connection-result is-error',
      health.ok ? `Connection succeeded (HTTP ${health.status}).` : (health.note || `Connection failed${health.status ? ` (HTTP ${health.status})` : ''}.`)));
  }
  return card;
}

async function refreshConnections() {
  const list = $('#saved-connections');
  if (!list) return;
  list.replaceChildren(make('p', 'aef-muted', 'Loading connections...'));
  try {
    const result = await request('/api/aem/targets');
    targets = Array.isArray(result.targets) ? result.targets : [];
    const credentialed = targets.filter((target) => target.hasCredentials).length;
    $('#aem-connection-summary').textContent = `${targets.length} connection${targets.length === 1 ? '' : 's'} - ${credentialed} credentialed`;
    list.replaceChildren();
    if (!targets.length) {
      list.append(make('p', 'aef-muted', 'No CMS connections are configured yet. Add your own environment using the form. No project-specific environments are preloaded.'));
      return;
    }
    targets.forEach((target) => list.append(targetCard(target)));
  } catch (error) {
    list.replaceChildren(make('p', 'aef-connection-result is-error', error.message || 'Could not load CMS connections.'));
    status(error.message || 'Could not load CMS connections.', 'error');
  }
}

async function saveConnection() {
  const name = $('#connection-name').value.trim();
  const platform = $('#connection-platform').value;
  const authMode = $('#connection-auth').value;
  const body = {
    name,
    platform,
    role: $('#connection-role').value,
    baseUrl: $('#connection-url').value.trim(),
    authMode,
    username: $('#connection-username').value,
    password: $('#connection-password').value,
    token: $('#connection-token').value.trim(),
  };
  const button = $('#save-connection-btn');
  button.disabled = true;
  button.textContent = 'Saving...';
  try {
    const result = await postJson('/api/aem/connections', body);
    $('#connection-password').value = '';
    $('#connection-token').value = '';
    if (result.target?.id && result.test) connectionChecks.set(result.target.id, result.test);
    showOutput(result.test || result.note || result);
    await refreshConnections();
    if (result.test?.ok) {
      status('CMS connection saved and tested successfully.', 'success');
      reportBrowserLog('INFO', 'connections', 'A CMS connection was saved and tested.', { platform, ok: true });
    } else {
      status(result.note || 'Connection saved, but the health check failed. Check the URL, authentication and credentials.', 'warn');
      reportBrowserLog('WARN', 'connections', 'A CMS connection was saved but its health check failed.', { platform, status: result.test?.status || null });
    }
  } catch (error) {
    status(error.message || 'Could not save this CMS connection.', 'error');
    showOutput(error.message || 'Could not save this CMS connection.');
    reportBrowserLog('ERROR', 'connections', 'Saving a CMS connection failed.', { platform, message: error.message || 'Unknown connection error' });
  } finally {
    button.disabled = false;
    button.textContent = 'Save & test connection';
  }
}

async function testConnection(target) {
  status(`Testing ${target.name}...`, 'info');
  try {
    const result = await postJson('/api/aem/test-connection', { targetId: target.id });
    connectionChecks.set(target.id, result);
    showOutput(result);
    await refreshConnections();
    status(result.ok ? `${target.name}: connection succeeded.` : `${target.name}: connection failed. ${result.note || ''}`, result.ok ? 'success' : 'error');
    reportBrowserLog(result.ok ? 'INFO' : 'WARN', 'connections', 'CMS connection health check completed.', { platform: target.platform, ok: result.ok, status: result.status || null });
  } catch (error) {
    const result = { ok: false, note: error.message || 'Connection test failed.' };
    connectionChecks.set(target.id, result);
    showOutput(result);
    await refreshConnections();
    status(result.note, 'error');
    reportBrowserLog('ERROR', 'connections', 'CMS connection health check failed.', { platform: target.platform, message: result.note });
  }
}

async function removeConnection(target) {
  if (!target.canRemove) return;
  if (!window.confirm(`Remove the saved connection "${target.name}"? This does not change the CMS itself.`)) return;
  try {
    await request(`/api/aem/connections/${encodeURIComponent(target.id)}`, { method: 'DELETE' });
    connectionChecks.delete(target.id);
    status('CMS connection removed.', 'success');
    await refreshConnections();
  } catch (error) {
    status(error.message || 'Could not remove this connection.', 'error');
  }
}

function syncAuthenticationFields() {
  const bearer = $('#connection-auth').value === 'bearer';
  $('#connection-basic-fields').hidden = bearer;
  $('#connection-token-fields').hidden = !bearer;
}

function syncPlatformDefaults() {
  const platform = $('#connection-platform').value;
  const hosted = platform === 'aemaacs-cloud' || platform === 'eds';
  if (hosted) $('#connection-auth').value = 'bearer';
  else if ($('#connection-auth').value === 'bearer') $('#connection-auth').value = 'basic';
  syncAuthenticationFields();
  $('#connection-url').placeholder = platform === 'aem65' || platform === 'aemaacs-sdk'
    ? 'http://localhost:4502'
    : 'https://your-cms.example.com';
}

function renderPanel() {
  const overlay = make('div', 'aef-connections-overlay');
  overlay.id = 'connections-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  const panel = make('section', 'aef-connections-panel');
  panel.id = 'connections-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'connections-title');
  panel.innerHTML = `
    <header class="aef-connections-header">
      <div class="aef-connections-brand">${icon('layers', 24)}<div><h2 id="connections-title">Connections</h2><p>Connect, test, and manage CMS environments</p></div></div>
      <div class="aef-connections-header-actions"><span id="aem-connection-summary" class="aef-chip">Loading connections...</span><button type="button" id="close-connections" class="aef-icon-button" aria-label="Close Connections">x</button></div>
    </header>
    <div class="aef-connections-scroll">
      <div class="aef-status aef-status-info" id="connections-status" role="status">Add a CMS connection, then test that its endpoint and credentials are valid.</div>
      <div class="aef-two-column aef-connections-layout">
        <section class="aef-card">
          <div class="aef-kicker">NEW CONNECTION</div>
          <h3>Connect to a CMS</h3>
          <p class="aef-muted">Connection credentials are stored by this local application in an encrypted vault. Use a dedicated service account with only the permissions required for your work.</p>
          <label class="aef-label" for="connection-name">Connection name</label>
          <input id="connection-name" class="aef-input" placeholder="e.g. Development CMS Author" autocomplete="off">
          <div class="aef-form-grid">
            <div><label class="aef-label" for="connection-platform">CMS platform</label><select id="connection-platform" class="aef-input">${PLATFORM_OPTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div>
            <div><label class="aef-label" for="connection-role">Role</label><select id="connection-role" class="aef-input">${ROLE_OPTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div>
          </div>
          <label class="aef-label" for="connection-url">Base URL</label><input id="connection-url" class="aef-input" type="url" placeholder="http://localhost:4502" autocomplete="url">
          <label class="aef-label" for="connection-auth">Authentication</label>
          <select id="connection-auth" class="aef-input"><option value="basic">Username & password</option><option value="bearer">Bearer access token</option></select>
          <div id="connection-basic-fields">
            <label class="aef-label" for="connection-username">Username</label><input id="connection-username" class="aef-input" autocomplete="off">
            <label class="aef-label" for="connection-password">Password</label><input id="connection-password" class="aef-input" type="password" autocomplete="new-password">
          </div>
          <div id="connection-token-fields" hidden><label class="aef-label" for="connection-token">Bearer access token</label><input id="connection-token" class="aef-input" type="password" autocomplete="off"></div>
          <div class="aef-inline-actions"><button type="button" class="aef-primary" id="save-connection-btn">Save & test connection</button></div>
          <pre id="connection-test-output" class="aef-output" hidden></pre>
        </section>
        <section class="aef-card">
          <div class="aef-kicker">YOUR ENVIRONMENTS</div>
          <h3>Saved connections</h3>
          <p class="aef-muted">Only environments you register are listed here. Secrets are never shown in this list.</p>
          <div id="saved-connections" class="aef-connection-list"><p class="aef-muted">Loading connections...</p></div>
          <div class="aef-inline-actions"><button type="button" class="aef-secondary" id="refresh-connections-btn">Refresh connections</button></div>
        </section>
      </div>
      <div class="aef-connections-footer"><span>Connection settings stay on this device.</span><span>Generation requires a configured AI provider API key.</span></div>
    </div>`;
  document.body.append(overlay, panel);
  $('#open-connections')?.addEventListener('click', showPanel);
  $('#close-connections').addEventListener('click', closePanel);
  overlay.addEventListener('click', closePanel);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePanel(); });
  $('#save-connection-btn').addEventListener('click', () => void saveConnection());
  $('#refresh-connections-btn').addEventListener('click', () => void refreshConnections());
  $('#connection-auth').addEventListener('change', syncAuthenticationFields);
  $('#connection-platform').addEventListener('change', syncPlatformDefaults);
  syncPlatformDefaults();
}

export function initConnections() {
  if (mounted) return;
  mounted = true;
  const tags = document.querySelector('.appbar-tags');
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = 'open-connections';
  trigger.className = 'connections-launcher';
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = `${icon('layers', 16)} <span>Connections</span>`;
  if (tags) tags.prepend(trigger);
  renderPanel();
  void refreshConnections();
}

