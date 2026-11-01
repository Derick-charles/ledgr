import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { registerFailedLoad } from '../utils/errorBus';

// Fetches one account's journal entries in a date range, or — called with
// no start/end — every entry it ever saved (used for all-time milestone
// evaluation, so a milestone doesn't lose progress just because the month
// rolled over). Always scoped to one specific account — journal history
// doesn't have a meaningful "all accounts" combined view.
export function useJournalHistory(accountId, startId, endId) {
  const [entries, setEntries] = useState([]); // [{ dateId, mindset, checklist, ... }]
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ account: accountId });
      if (startId && endId) { params.set('start', startId); params.set('end', endId); }
      const data = await api.get(`/api/journal?${params}`);
      setEntries(data);
    } catch (e) {
      console.error('Failed to load journal history:', e);
      registerFailedLoad(load);
    } finally {
      setLoading(false);
    }
  }, [accountId, startId, endId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    window.addEventListener('ledgr:journal-saved', load);
    return () => window.removeEventListener('ledgr:journal-saved', load);
  }, [load]);

  return { entries, loading };
}
