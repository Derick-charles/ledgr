// One place that knows whether the app should behave as read-only.
//
// "Offline" here means either the browser says it has no network, or the
// service worker had to answer a request from its saved copy because the real
// request failed or stalled (a weak signal looks "online" to the browser but
// can't actually reach the server). Either way the data on screen may be old,
// so writes are blocked until a request genuinely reaches the server again.
const listeners = new Set();
let browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
let servedFromSaved = false;

const snapshot = () => browserOffline || servedFromSaved;
let last = snapshot();

function emit() {
  const now = snapshot();
  if (now === last) return;
  last = now;
  listeners.forEach((fn) => fn(now));
}

export const isOffline = () => snapshot();

export function subscribeOffline(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Called by api.js after every response: the service worker tags answers it
// served from its saved copy.
export function noteResponseSource(fromSavedCopy) {
  servedFromSaved = fromSavedCopy;
  emit();
}

export function noteBrowserOnline(online) {
  browserOffline = !online;
  if (online) servedFromSaved = false; // re-checked by the next real request
  emit();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => noteBrowserOnline(true));
  window.addEventListener('offline', () => noteBrowserOnline(false));
}

export const OFFLINE_WRITE_MESSAGE = "You're offline — you can view your saved data, but changes need a connection.";
