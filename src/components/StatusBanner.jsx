import { useEffect, useState } from 'react';
import { api } from '../api';
import { useOffline } from '../hooks/useOffline';
import { subscribeErrors, clearError, retryFailedLoads } from '../utils/errorBus';

// One strip at the top of the app for the two situations that used to look
// like "my data is gone": you're offline, or a request failed.
export default function StatusBanner() {
  const offline = useOffline();
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);

  // Coming back online: reload anything that failed.
  useEffect(() => {
    const up = () => retryFailedLoads();
    window.addEventListener('online', up);
    return () => window.removeEventListener('online', up);
  }, []);
  useEffect(() => subscribeErrors(setError), []);

  // On a weak signal the browser still says "online" while the app is showing
  // saved data — check again every 20s, and on demand, so it unlocks itself.
  async function recheck() {
    setChecking(true);
    try { await api.get('/api/auth'); retryFailedLoads(); } catch { /* still offline */ } finally { setChecking(false); }
  }
  useEffect(() => {
    if (!offline) return undefined;
    const t = setInterval(() => { if (navigator.onLine !== false) api.get('/api/auth').then(() => retryFailedLoads()).catch(() => {}); }, 20000);
    return () => clearInterval(t);
  }, [offline]);

  if (offline) {
    return (
      <div className="status-banner offline" role="status">
        <span>You're offline — showing your saved data. Viewing only; adding or editing needs a connection.</span>
        <span className="status-actions"><button type="button" onClick={recheck} disabled={checking}>{checking ? 'Checking…' : 'Try again'}</button></span>
      </div>
    );
  }
  if (!error) return null;
  return (
    <div className="status-banner error" role="alert">
      <span>{error.message}</span>
      <span className="status-actions">
        <button type="button" onClick={retryFailedLoads}>Retry</button>
        <button type="button" onClick={clearError} aria-label="Dismiss">✕</button>
      </span>
    </div>
  );
}
