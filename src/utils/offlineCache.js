// The service worker keeps a copy of the data you've viewed so it can be read
// offline. That copy belongs to whoever is signed in, so it is wiped whenever
// the signed-in person changes or signs out.
import { clearRecent } from './recentWrites';

export function clearOfflineData() {
  clearRecent();
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'clear-data' });
    }
  } catch { /* no service worker (dev server, private mode) — nothing saved */ }
}

// Wipes the saved copy when a different person signs in than last time.
export function rememberUser(userId) {
  try {
    const prev = localStorage.getItem('ledgr:cacheUser');
    if (prev && prev !== userId) clearOfflineData();
    localStorage.setItem('ledgr:cacheUser', userId);
  } catch { /* ignore */ }
}
