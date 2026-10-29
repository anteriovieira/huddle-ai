// Google Drive access via chrome.identity.getAuthToken (Chrome manages refresh).
// Scope is drive.file: the extension only ever sees files it created itself.

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const UPLOAD_URL =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FOLDER_NAME = 'Huddle AI';
let cachedFolderId = null; // the "Huddle AI" folder, resolved once per session

// Returns { token } or null. interactive:true shows Google's consent/account sheet.
async function getToken(interactive) {
  try {
    const result = await chrome.identity.getAuthToken({ interactive, scopes: [SCOPE] });
    const token = typeof result === 'string' ? result : result?.token;
    return token ?? null;
  } catch (error) {
    // Non-interactive with no cached grant throws; treat as "not connected".
    if (!interactive) return null;
    throw new Error(describeAuthError(error));
  }
}

function describeAuthError(error) {
  const message = error?.message ?? String(error);
  if (/did not approve|canceled|cancelled/i.test(message)) return 'Conexão cancelada.';
  if (/OAuth2 not granted|bad client id|invalid/i.test(message)) {
    return 'OAuth não configurado. Confira o client_id no manifest e o ID da extensão no Google Cloud.';
  }
  return `Falha ao conectar: ${message}`;
}

async function dropToken(token) {
  if (!token) return;
  try {
    await chrome.identity.removeCachedAuthToken({ token });
  } catch {
    // ignore
  }
}

// Whether we already hold a grant, without prompting. Returns the email when known.
export async function status() {
  const token = await getToken(false);
  if (!token) return { connected: false, email: null };
  let email = null;
  try {
    const info = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' });
    email = info?.email || null;
  } catch {
    // email is cosmetic; ignore if unavailable
  }
  return { connected: true, email };
}

// Prompts for consent the first time. Trusts the token it just obtained instead of
// re-querying with interactive:false, which resolves against Chrome's primary account and
// can miss the account the user actually picked in the consent sheet.
export async function connect() {
  const token = await getToken(true);
  if (!token) throw new Error('Não foi possível obter autorização do Google.');
  let email = null;
  try {
    const info = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' });
    email = info?.email || null;
  } catch {
    // email is cosmetic; ignore if unavailable
  }
  return { connected: true, email };
}

export async function disconnect() {
  const token = await getToken(false);
  if (!token) return;
  // Revoke so the next connect re-prompts, then clear Chrome's cache.
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' });
  } catch {
    // offline revoke failure still clears the local cache below
  }
  await dropToken(token);
}

function multipartBody(metadata, content, mimeType, boundary) {
  return [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${mimeType}; charset=UTF-8`,
    '',
    content,
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

// Finds the "Huddle AI" folder the app created before (drive.file list only sees app files).
async function findFolder(token) {
  const q = `mimeType='${FOLDER_MIME}' and name='${FOLDER_NAME}' and trashed=false`;
  const url = `${FILES_URL}?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id)`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const data = await response.json();
  return data.files?.[0]?.id ?? null;
}

async function createFolder(token) {
  const response = await fetch(`${FILES_URL}?fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
  });
  if (!response.ok) throw new Error(`Não consegui criar a pasta no Drive (${response.status}).`);
  return (await response.json()).id;
}

// The id of the "Huddle AI" folder, creating it the first time. Cached for the session.
async function ensureFolder(token) {
  if (cachedFolderId) return cachedFolderId;
  cachedFolderId = (await findFolder(token)) ?? (await createFolder(token));
  return cachedFolderId;
}

async function postFile(name, content, mimeType, token, folderId) {
  const boundary = `huddle-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const metadata = folderId ? { name, mimeType, parents: [folderId] } : { name, mimeType };
  const response = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody(metadata, content, mimeType, boundary),
  });
  return response;
}

// Uploads one text file into the "Huddle AI" folder. Retries once on 401 with a fresh token,
// and once on 404 (the cached folder was deleted) after recreating the folder.
// Returns { id, name, webViewLink }.
export async function upload({ name, content, mimeType = 'text/plain' }) {
  let token = await getToken(true);
  if (!token) throw new Error('Conecte o Google Drive primeiro.');

  let folderId = await ensureFolder(token).catch(() => null);
  let response = await postFile(name, content, mimeType, token, folderId);

  if (response.status === 401) {
    await dropToken(token);
    token = await getToken(true);
    cachedFolderId = null;
    folderId = await ensureFolder(token).catch(() => null);
    response = await postFile(name, content, mimeType, token, folderId);
  }
  if (response.status === 404 && folderId) {
    cachedFolderId = null;
    folderId = await ensureFolder(token).catch(() => null);
    response = await postFile(name, content, mimeType, token, folderId);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Drive respondeu ${response.status}. ${detail.slice(0, 200)}`);
  }
  return response.json();
}
