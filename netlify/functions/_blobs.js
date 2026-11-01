import { connectLambda, getStore } from '@netlify/blobs';

// Netlify Functions running in "Lambda compatibility mode" (the classic
// `handler = async (event) => {...}` signature we use everywhere here) don't
// get the Blobs execution context wired up automatically — connectLambda(event)
// has to be called first, on every invocation, before getStore() will work.
// See: https://github.com/netlify/blobs#lambda-compatibility-mode
// NOTE: Netlify Blobs reads are "eventually consistent" — a read straight after
// a save can briefly return the older copy. Asking for 'strong' consistency
// isn't possible in this (Lambda-compatible) function format on Netlify — it
// fails with "uncachedEdgeURL" — so the app avoids depending on it: the server
// answers every save with the saved record, and the page uses that answer
// instead of re-reading the list straight away.
const open = (name) => getStore(name);

export function stores(event) {
  connectLambda(event);
  return {
    trades: open('trades'),
    journal: open('journal'),
    certificates: open('certificates'),
    settings: open('settings'),
    lessons: open('lessons'),
    media: open('media'),
    users: open('users'),
    summaries: open('summaries'),
    backtests: open('backtests'),
  };
}

export function json(statusCode, data) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(data),
  };
}

export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Multi-account support: every entity key is namespaced by which account it
// belongs to. The FIRST/default account's data was never namespaced (it's
// exactly what existed before accounts were a concept), so rather than
// migrating every existing blob, the default account is simply "no prefix" —
// all pre-existing data keeps working untouched.
export const DEFAULT_ACCOUNT_ID = 'default';

export function keyFor(accountId, key) {
  const id = accountId || DEFAULT_ACCOUNT_ID;
  return id === DEFAULT_ACCOUNT_ID ? key : `${id}::${key}`;
}

// True if a listed blob key belongs to `accountId`. Safe because none of our
// own generated ids (uuid, YYYY-MM-DD dates, "item-<ts>-<n>") ever contain
// "::" themselves, so a bare key unambiguously means the default account.
export function keyBelongsTo(key, accountId) {
  const id = accountId || DEFAULT_ACCOUNT_ID;
  return id === DEFAULT_ACCOUNT_ID ? !key.includes('::') : key.startsWith(`${id}::`);
}

// Strips the "accountId::" prefix back off a listed key, recovering the
// plain entity id (date, trade id, etc.) callers actually want.
export function stripPrefix(key, accountId) {
  const id = accountId || DEFAULT_ACCOUNT_ID;
  return id === DEFAULT_ACCOUNT_ID ? key : key.slice(id.length + 2);
}

// Netlify Functions (classic/Lambda-compatible) cap request AND response
// bodies at 6MB. Base64 inflates raw bytes by ~33%, so a raw file needs to
// stay comfortably under that after encoding — 4.5MB raw is the safe line.
export const MAX_MEDIA_BYTES = 4.5 * 1024 * 1024;

// `ownerId` is stamped on every uploaded file so /api/media can refuse to
// serve it to anyone but the user who owns it.
export async function resolveMediaItems(mediaStore, items = [], ownerId) {
  const out = [];
  for (const item of items) {
    if (!item || !item.dataBase64) {
      if (item) out.push(item); // already-resolved { url, id, type } — pass through
      continue;
    }
    const buf = Buffer.from(item.dataBase64, 'base64');
    if (buf.byteLength > MAX_MEDIA_BYTES) {
      const err = new Error(`"${item.filename || 'file'}" is too large (max ~4.5MB per file when hosted on Netlify Functions).`);
      err.statusCode = 413;
      throw err;
    }
    const mediaId = uuid();
    await mediaStore.set(mediaId, buf, { metadata: { contentType: item.contentType || 'application/octet-stream', filename: item.filename || '', owner: ownerId || '', createdAt: Date.now(), size: buf.byteLength } });
    out.push({ id: mediaId, url: `/api/media?id=${mediaId}`, type: item.type });
  }
  return out;
}
