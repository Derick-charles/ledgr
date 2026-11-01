import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useLiveRefresh } from './useLiveRefresh';
import { registerFailedLoad } from '../utils/errorBus';
import { mergeRecent } from '../utils/recentWrites';

// All-time, lightweight trades for one account: just the handful of fields
// the all-time panels read (Milestones, POI Performance, Timing, the backup
// reminder's "any trades yet?"). One small request instead of one full read
// per trade ever logged. Call `reload` after any trade add/edit/delete.
export function useTradeSummary(accountId) {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef(0);

  const load = useCallback(async ({ silent } = {}) => {
    if (!accountId) return;
    const requestId = ++requestRef.current;
    if (!silent) setLoading(true);
    try {
      const data = await api.get(`/api/trades?account=${accountId}&light=1`);
      if (requestId === requestRef.current) setTrades(mergeRecent('trade', data, { keep: (t) => accountId === 'all' || t.accountId === accountId }));
    } catch (e) {
      console.error('Failed to load trade summary:', e);
      if (!silent) registerFailedLoad(load);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(() => load({ silent: true }));

  return { trades, loading, reload: load };
}
