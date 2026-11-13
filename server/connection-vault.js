import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const legacyVaultDir = path.resolve(__dirname, '../.aef-connections');
const keyDir = path.join(os.homedir(), '.adaptive-experience-factory');
const keyPath = path.join(keyDir, 'credentials.key');
const legacyKeyPath = path.join(legacyVaultDir, 'credentials.key');
const dataPath = path.join(keyDir, 'connections.enc');
const legacyDataPath = path.join(legacyVaultDir, 'connections.enc');
let cachedKey;

async function ensureVaultKey() {
  if (cachedKey) return cachedKey;
  await fs.mkdir(keyDir, { recursive: true, mode: 0o700 });
  try { await fs.chmod(keyDir, 0o700); } catch { /* Windows ACLs are handled by the current user profile. */ }
  try {
    cachedKey = await fs.readFile(keyPath);
    if (cachedKey.length !== 32) throw new Error('The local AEF credential key has an invalid length.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;

    // Migrate vaults created by v0.4, where the key lived beside connections.enc.
    // Copy first, verify the destination, and only then remove the legacy key.
    let legacyKey = null;
    try { legacyKey = await fs.readFile(legacyKeyPath); }
    catch (legacyError) { if (legacyError.code !== 'ENOENT') throw legacyError; }
    if (legacyKey) {
      if (legacyKey.length !== 32) throw new Error('The legacy AEM Forge credential key has an invalid length; saved connectors were not changed.');
      try { await fs.writeFile(keyPath, legacyKey, { flag: 'wx', mode: 0o600 }); }
      catch (writeError) {
        if (writeError.code !== 'EEXIST') throw writeError;
      }
      cachedKey = await fs.readFile(keyPath);
      if (cachedKey.length !== 32 || !crypto.timingSafeEqual(cachedKey, legacyKey)) throw new Error('Unable to safely migrate the local AEF credential key; saved connectors were not changed.');
      try { await fs.unlink(legacyKeyPath); } catch { /* Keep a legacy copy if the OS refuses removal. */ }
    } else {
      const key = crypto.randomBytes(32);
      try {
        await fs.writeFile(keyPath, key, { flag: 'wx', mode: 0o600 });
        cachedKey = key;
      } catch (writeError) {
        if (writeError.code !== 'EEXIST') throw writeError;
        cachedKey = await fs.readFile(keyPath);
      }
    }
  }
  try { await fs.chmod(keyPath, 0o600); } catch { /* Windows ACLs are handled by the current user profile. */ }
  return cachedKey;
}

async function decryptConnectionRecords(raw) {
  const envelope = JSON.parse(raw);
  if (envelope.version !== 1 || !envelope.iv || !envelope.tag || !envelope.data) {
    throw new Error('The local connector vault has an unsupported format.');
  }
  const key = await ensureVaultKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  const records = JSON.parse(decrypted);
  if (!Array.isArray(records)) throw new Error('The local connector vault does not contain a connection list.');
  return records;
}

export async function loadEncryptedConnections() {
  let raw;
  let fromLegacyLocation = false;
  try {
    raw = await fs.readFile(dataPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Unable to read the saved CMS connection vault.');
    try {
      raw = await fs.readFile(legacyDataPath, 'utf8');
      fromLegacyLocation = true;
    } catch (legacyError) {
      if (legacyError.code === 'ENOENT') return [];
      throw new Error('Unable to read the previous CMS connection vault; the file was not changed.');
    }
  }

  let records;
  try {
    records = await decryptConnectionRecords(raw);
  } catch (error) {
    console.error('[connection-vault] Unable to unlock local connection vault:', error.message);
    throw new Error('Unable to unlock saved CMS connections. Check the profile key and restore both key and vault from backup if needed; no connection data was overwritten.');
  }

  if (fromLegacyLocation) {
    // Migrate only after successful decryption. Verify the profile copy before removing
    // the old in-project vault so customer credentials are not lost during an interrupted move.
    await saveEncryptedConnections(records);
    const verification = await decryptConnectionRecords(await fs.readFile(dataPath, 'utf8'));
    if (JSON.stringify(verification) !== JSON.stringify(records)) {
      throw new Error('CMS connection vault migration verification failed; the previous vault was retained.');
    }
    await fs.unlink(legacyDataPath);
    try { await fs.unlink(legacyKeyPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await fs.rmdir(legacyVaultDir); } catch { /* Retain unrelated legacy files if present. */ }
  }
  return records;
}

export async function saveEncryptedConnections(records) {
  const key = await ensureVaultKey();
  await fs.mkdir(keyDir, { recursive: true, mode: 0o700 });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(records), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope = JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') }, null, 2);
  const tempPath = `${dataPath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, envelope, { flag: 'w', mode: 0o600 });
  await fs.rename(tempPath, dataPath);
  try { await fs.chmod(dataPath, 0o600); } catch { /* Windows ACLs are handled by the current user profile. */ }
}

export function validateConnectorInput(body) {
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
  if (!name) throw new Error('Give this connection a memorable name.');
  const platform = ['aem65', 'aemaacs-sdk', 'aemaacs-cloud', 'eds'].includes(body?.platform) ? body.platform : null;
  if (!platform) throw new Error('Choose a supported platform.');
  const role = ['author', 'publisher', 'preview', 'eds-authoring'].includes(body?.role) ? body.role : null;
  if (!role) throw new Error('Choose a supported instance role.');
  const rawUrl = typeof body?.baseUrl === 'string' ? body.baseUrl.trim() : '';
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new Error('Enter a valid instance URL, including http:// or https://.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP and HTTPS instance URLs are supported.');
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Do not put credentials, query parameters or fragments in the instance URL.');
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(host) || host.endsWith('.localhost');
  if (parsed.protocol === 'http:' && !isLoopback) throw new Error('Remote instances must use HTTPS. HTTP is allowed only for localhost development instances.');
  const authMode = ['basic', 'bearer'].includes(body?.authMode) ? body.authMode : null;
  if (!authMode) throw new Error('Choose Basic authentication or a bearer access token.');
  if (platform === 'aemaacs-cloud' && authMode !== 'bearer') throw new Error('Hosted AEMaaCS connections should use an OAuth bearer access token, not AEM 6.5 Basic authentication.');
  const username = typeof body?.username === 'string' ? body.username.trim().slice(0, 300) : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (authMode === 'basic' && (!username || !password)) throw new Error('Enter both the service-user name and password.');
  if (authMode === 'bearer' && !token) throw new Error('Paste a bearer access token.');
  const healthPathRaw = typeof body?.healthPath === 'string' ? body.healthPath.trim() : '';
  const defaultHealthPath = platform === 'aemaacs-cloud' || platform === 'eds' ? '/' : '/system/console/status-productinfo.json';
  const healthPath = healthPathRaw || defaultHealthPath;
  if (!healthPath.startsWith('/') || healthPath.startsWith('//') || healthPath.includes('\\')) throw new Error('Health path must be a relative path beginning with one slash.');
  return {
    id: `connector-${crypto.randomUUID()}`,
    name,
    platform,
    role,
    baseUrl: parsed.origin,
    authMode,
    healthPath,
    allowInsecureHttp: false,
    managedByUi: true,
    credentials: authMode === 'basic' ? { username, password } : { token },
    createdAt: new Date().toISOString(),
  };
}
