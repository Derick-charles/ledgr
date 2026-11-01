import { useEffect, useRef } from 'react';

// Re-reads data when you come back to the app (switching tabs, unlocking the
// phone, reconnecting), and about once a minute while it's open — so something
// you saved on another device appears here without a manual refresh.
// `refresh` is called quietly (no loading flicker). "Sync now" forces one.
const MIN_GAP_MS = 15000;
const EVERY_MS = 60000;

export function useLiveRefresh(refresh) {
  const ref = useRef(refresh);
  ref.current = refresh;
  useEffect(() => {
    let last = Date.now();
    const run = (force) => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (!force && Date.now() - last < MIN_GAP_MS) return;
      last = Date.now();
      ref.current();
    };
    const soft = () => run(false);
    const hard = () => run(true);
    document.addEventListener('visibilitychange', soft);
    window.addEventListener('focus', soft);
    window.addEventListener('online', soft);
    window.addEventListener('ledgr:refresh', hard);
    const timer = setInterval(soft, EVERY_MS);
    return () => {
      document.removeEventListener('visibilitychange', soft);
      window.removeEventListener('focus', soft);
      window.removeEventListener('online', soft);
      window.removeEventListener('ledgr:refresh', hard);
      clearInterval(timer);
    };
  }, []);
}
