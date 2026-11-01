import { reportError } from './utils/errorBus.js';
import { isOffline, noteResponseSource, OFFLINE_WRITE_MESSAGE } from './utils/connection.js';

const TIMEOUT_MS = 20000;
// Uploads can legitimately take longer on a slow phone connection.
const UPLOAD_TIMEOUT_MS = 60000;

// Thin wrapper around fetch() for the /api/* Netlify Functions. Every
// endpoint returns JSON (errors included), so this centralizes parsing and
// gives a consistent thrown-Error shape for callers to catch.
//
// Network failures, timeouts and server (5xx) errors are also reported to
// the error bus so the app can show a visible "couldn't load" banner. Normal
// 4xx answers (wrong password, validation, not found) are NOT — callers
// handle those inline.
async function request(path, options = {}) {
  // Offline = read-only. Saving would fail anyway; say so straight away
  // instead of waiting out a timeout, and don't pop the error banner (the
  // offline strip already explains it).
  if (options.method && options.method !== 'GET' && isOffline()) throw new Error(OFFLINE_WRITE_MESSAGE);
  const controller = new AbortController();
  const limit = options.method === 'POST' && path.startsWith('/api/media') ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), limit);
  let res;
  try {
    res = await fetch(path, {
      cache: 'no-store', // never let the browser answer from its own old copy
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
  } catch (e) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const message = e.name === 'AbortError'
      ? 'The server took too long to respond. Please try again.'
      : offline ? "You're offline." : "Couldn't reach the server. Check your connection.";
    if (!offline) reportError(message); // the offline banner already covers being offline
    throw new Error(message);
  } finally {
    clearTimeout(timer);
  }

  // A save went through: tell the offline helper to forget its old copy of that address.
  if (res.ok && options.method && options.method !== 'GET') {
    try { navigator.serviceWorker?.controller?.postMessage({ type: 'forget', path: new URL(path, window.location.origin).pathname }); } catch { /* not important */ }
  }
  // The service worker marks answers it served from its saved copy.
  if (options.method === 'GET' || !options.method) noteResponseSource(res.headers.get('x-ledgr-saved') === '1');
  let data = null;
  try { data = await res.json(); } catch { /* empty body, e.g. some 204s */ }
  if (!res.ok) {
    // Session expired (or never signed in) — tell the app shell to show the
    // sign-in screen. /api/auth reports a wrong password as a 401 too; the
    // sign-in form handles that one itself.
    if (res.status === 401 && !path.startsWith('/api/auth')) {
      window.dispatchEvent(new Event('ledgr:unauthorized'));
    }
    const message = (data && data.error) || `Request failed (${res.status})`;
    if (res.status >= 500) reportError(`Something went wrong on the server: ${message}`);
    throw new Error(message);
  }
  return data;
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: (path) => request(path, { method: 'DELETE' }),
};

// Converts a browser File into the { filename, contentType, dataBase64 }
// shape every media-accepting endpoint expects. Netlify Functions cap
// request/response bodies at 6MB, so files stay well under that raw.
export function fileToUploadPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result; // "data:<mime>;base64,<data>"
      const dataBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      resolve({ filename: file.name, contentType: file.type, dataBase64, size: file.size });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024;
