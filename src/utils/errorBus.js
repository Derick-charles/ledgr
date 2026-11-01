// Tiny pub/sub so any request failure — wherever it happens — can reach the
// one banner at the top of the app, instead of being console.error'd where
// nobody sees it (which looked exactly like "my data is gone").
const listeners = new Set();
let current = null; // { id, message, retry? } | null

function emit() { listeners.forEach((fn) => fn(current)); }

export function subscribeErrors(fn) {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

// `source` de-duplicates: a page load that fails 6 requests shows ONE banner.
export function reportError(message, { retry } = {}) {
  current = { id: Date.now(), message, retry };
  emit();
}

export function clearError() {
  if (!current) return;
  current = null;
  emit();
}

// Registry of reload functions for loads that failed, so "Retry" can re-run
// all of them at once. Hooks register their `load` when it fails.
const failedLoads = new Set();
export function registerFailedLoad(fn) { failedLoads.add(fn); }
export function retryFailedLoads() {
  const fns = [...failedLoads];
  failedLoads.clear();
  clearError();
  fns.forEach((fn) => fn());
}
