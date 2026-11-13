import { icon } from '../lib/icons.js';

const LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR'];
const esc = (value) => String(value ?? '');
let mounted = false;
let open = false;
let paused = false;
let polling = null;
let latestId = 0;
let cachedEntries = [];
let captureLevelSynced = false;

function element(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else node.setAttribute(key, value);
  }
  if (text !== '') node.textContent = text;
  return node;
}

function downloadFile(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function makeRow(entry) {
  const row = element('article', { class: `log-entry log-${String(entry.level).toLowerCase()}` });
  const top = element('div', { class: 'log-entry-top' });
  const time = element('time', { class: 'log-time', datetime: entry.timestamp }, new Date(entry.timestamp).toLocaleTimeString());
  const level = element('span', { class: `log-level log-level-${String(entry.level).toLowerCase()}` }, entry.level);
  const scope = element('span', { class: 'log-scope' }, entry.scope || 'app');
  const id = element('span', { class: 'log-id' }, `#${entry.id}`);
  top.append(time, level, scope, id);
  const message = element('div', { class: 'log-message' }, entry.message || '');
  row.append(top, message);
  if (entry.details !== undefined && entry.details !== null && Object.keys(entry.details).length) {
    const details = element('details', { class: 'log-details' });
    const summary = element('summary', {}, 'Details');
    const pre = element('pre', {}, JSON.stringify(entry.details, null, 2));
    details.append(summary, pre);
    row.append(details);
  }
  return row;
}

async function api(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Log API failed (HTTP ${response.status}).`);
  return data;
}

export function initLogPanel() {
  if (mounted) return;
  mounted = true;

  const tags = document.querySelector('.appbar-tags');
  const trigger = element('button', { type: 'button', class: 'log-launcher', id: 'open-logs', 'aria-expanded': 'false', title: 'Open runtime logs' });
  trigger.innerHTML = `${icon('terminal-square', 16)} <span>Logs</span><b id="log-error-count" class="log-error-count" hidden>0</b>`;
  if (tags) tags.prepend(trigger);

  const overlay = element('div', { class: 'log-overlay', id: 'log-overlay', 'aria-hidden': 'true' });
  const panel = element('aside', { class: 'log-drawer', id: 'log-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'log-drawer-title' });
  panel.innerHTML = `
    <header class="log-drawer-header">
      <div class="log-drawer-title-wrap">
        <span class="log-terminal-mark">${icon('terminal-square', 20)}</span>
        <div><h2 id="log-drawer-title">Runtime logs</h2><p id="log-summary">Application events, AEM requests and build activity</p></div>
      </div>
      <button type="button" class="log-close" id="close-logs" aria-label="Close logs">×</button>
    </header>
    <div class="log-capture-controls">
      <label>Capture from <select id="log-capture-level"><option>TRACE</option><option>DEBUG</option><option selected>INFO</option><option>WARN</option><option>ERROR</option></select></label>
      <label>Show <select id="log-display-level"><option selected>TRACE</option><option>DEBUG</option><option>INFO</option><option>WARN</option><option>ERROR</option></select></label>
      <label class="log-live-toggle"><input type="checkbox" id="log-live" checked> Live</label>
    </div>
    <div class="log-search-row">
      <input id="log-search" type="search" placeholder="Filter message, scope, details…" aria-label="Filter logs">
      <button type="button" class="log-tool-btn" id="refresh-logs" title="Refresh logs">${icon('refresh-cw', 15)}</button>
    </div>
    <div class="log-toolbar">
      <span id="log-entry-count">0 entries</span>
      <div>
        <button type="button" class="log-tool-btn" id="copy-logs">Copy</button>
        <button type="button" class="log-tool-btn" id="export-logs">Export JSON</button>
        <button type="button" class="log-tool-btn danger" id="clear-logs">Clear</button>
      </div>
    </div>
    <div class="log-feed" id="log-feed" aria-live="polite"><div class="log-empty">Loading runtime events…</div></div>
    <footer class="log-footer"><span class="log-status-dot"></span><span id="log-status">Connected to local AEF logger</span><code>JSONL · local</code></footer>`;
  document.body.append(overlay, panel);

  const close = () => {
    open = false;
    panel.classList.remove('is-open');
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.classList.remove('is-floating');
    if (tags && trigger.parentElement !== tags) tags.prepend(trigger);
  };
  const show = async () => {
    // Idempotent by design: opening/refreshing Logs must never toggle it closed.
    open = true;
    // Reparent the launcher above the overlay while open. This avoids stacking-context
    // bugs where the full-screen overlay intercepts the launcher click and closes itself.
    if (trigger.parentElement !== document.body) document.body.append(trigger);
    trigger.classList.add('is-floating');
    panel.classList.add('is-open');
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    trigger.setAttribute('aria-expanded', 'true');
    await refresh(true);
    if (open) $('#log-search')?.focus({ preventScroll: true });
  };
  const $ = (selector) => panel.querySelector(selector);
  const displayLevel = () => $('#log-display-level').value;
  const search = () => $('#log-search').value.trim().toLowerCase();

  function render(entries, append = false) {
    const feed = $('#log-feed');
    if (!append) {
      feed.replaceChildren();
      cachedEntries = [];
    }
    const existingIds = new Set(cachedEntries.map((item) => item.id));
    const fresh = entries.filter((item) => !existingIds.has(item.id));
    cachedEntries.push(...fresh);
    cachedEntries = cachedEntries.slice(-800);
    const shown = cachedEntries.filter((item) => LEVELS.indexOf(item.level) >= LEVELS.indexOf(displayLevel()))
      .filter((item) => !search() || `${item.scope} ${item.message} ${JSON.stringify(item.details || {})}`.toLowerCase().includes(search()));
    if (!shown.length) {
      feed.replaceChildren(element('div', { class: 'log-empty' }, 'No events match the current filters.'));
    } else {
      feed.replaceChildren(...shown.map(makeRow));
      feed.scrollTop = feed.scrollHeight;
    }
    $('#log-entry-count').textContent = `${shown.length} entries${search() ? ' · filtered' : ''}`;
    const errors = cachedEntries.filter((item) => item.level === 'ERROR').length;
    const errorBadge = document.querySelector('#log-error-count');
    if (errorBadge) {
      errorBadge.hidden = errors === 0;
      errorBadge.textContent = errors > 99 ? '99+' : String(errors);
    }
    $('#log-summary').textContent = `${shown.length} visible · ${cachedEntries.length} buffered`;
  }

  async function refresh(full = false) {
    try {
      const params = new URLSearchParams({ level: displayLevel(), limit: '1200' });
      if (!full && latestId > 0) params.set('after', String(latestId));
      const data = await api(`/api/logs?${params.toString()}`);
      if (!captureLevelSynced && LEVELS.includes(String(data.level || '').toUpperCase())) {
        $('#log-capture-level').value = String(data.level).toUpperCase();
        captureLevelSynced = true;
      }
      latestId = Math.max(latestId, data.latestId || 0);
      render(data.entries || [], !full);
      $('#log-status').textContent = `Live logger · capture ${$('#log-capture-level').value}`;
    } catch (error) {
      $('#log-status').textContent = error.message;
    }
  }

  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void show();
  });
  panel.addEventListener('click', (event) => event.stopPropagation());
  $('#close-logs').addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); close(); });
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && open) close(); });

  $('#refresh-logs').addEventListener('click', () => refresh(true));
  $('#log-display-level').addEventListener('change', () => refresh(true));
  $('#log-search').addEventListener('input', () => render([], true));
  $('#log-live').addEventListener('change', (event) => {
    paused = !event.target.checked;
    $('#log-status').textContent = paused ? 'Live updates paused' : 'Live updates enabled';
    if (!paused) refresh(true);
  });
  $('#log-capture-level').addEventListener('change', async (event) => {
    try {
      await api('/api/logs/level', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ level: event.target.value }) });
      $('#log-status').textContent = `Capture level set to ${event.target.value}`;
      await refresh(true);
    } catch (error) { $('#log-status').textContent = error.message; }
  });
  $('#copy-logs').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(cachedEntries, null, 2));
      $('#log-status').textContent = 'Logs copied to clipboard.';
    } catch {
      $('#log-status').textContent = 'Clipboard access denied by the browser.';
    }
  });
  $('#export-logs').addEventListener('click', () => {
    downloadFile(`aef-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(cachedEntries, null, 2));
    $('#log-status').textContent = 'Log export prepared.';
  });
  $('#clear-logs').addEventListener('click', async () => {
    if (!confirm('Clear the in-memory log panel? The rotated log files on disk are not deleted.')) return;
    try {
      await api('/api/logs/clear', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      cachedEntries = [];
      latestId = 0;
      await refresh(true);
      $('#log-status').textContent = 'In-memory logs cleared.';
    } catch (error) { $('#log-status').textContent = error.message; }
  });

  polling = setInterval(() => { if (open && !paused) refresh(false); }, 1800);
  void refresh(true);
  loggerBrowser('ui', 'Log panel initialized.', 'DEBUG');
  window.addEventListener('error', (event) => {
    loggerBrowser('frontend', 'Unhandled browser error.', 'ERROR', {
      message: event.message || 'Unknown browser error',
      source: event.filename ? event.filename.split('/').pop() : '',
      line: Number(event.lineno) || 0,
      column: Number(event.colno) || 0,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    loggerBrowser('frontend', 'Unhandled promise rejection.', 'ERROR', {
      message: reason instanceof Error ? reason.message : String(reason ?? 'Unknown rejection'),
    });
  });
}

function loggerBrowser(scope, message, level = 'WARN', details = undefined) {
  // Send only a short event description; server-side logger performs a second secret scrub.
  const safeDetails = details && typeof details === 'object' ? {
    message: typeof details.message === 'string' ? details.message.slice(0, 1200) : undefined,
    source: typeof details.source === 'string' ? details.source.slice(0, 120) : undefined,
    line: Number.isFinite(details.line) ? details.line : undefined,
    column: Number.isFinite(details.column) ? details.column : undefined,
  } : undefined;
  void fetch('/api/logs/client', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope, message, level, details: safeDetails }),
    keepalive: true,
  }).catch(() => {});
  return { scope, message, level };
}

export function reportBrowserLog(level, scope, message, details = undefined) {
  return loggerBrowser(scope, message, level, details);
}
