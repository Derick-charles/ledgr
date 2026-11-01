import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { registerFailedLoad } from '../utils/errorBus';
import { computeStreak } from '../utils/streak';

// All-time, lightweight journal history for one account: per day just
// { dateId, tierComputed, hasAffirmations }. One request feeds Milestones'
// tier history, the affirmations milestone AND the journaling streak, which
// used to be two or three separate requests (all-time entries + ?keys=1).
export function useJournalSummary(accountId) {
  const [items, setItems] = useState([]); // sorted oldest → newest
  const [loading, setLoading] = useState(true);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!accountId) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const data = await api.get(`/api/journal?account=${accountId}&light=1`);
      if (requestId === requestRef.current) setItems(data);
    } catch (e) {
      console.error('Failed to load journal summary:', e);
      registerFailedLoad(load);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    window.addEventListener('ledgr:journal-saved', load);
    return () => window.removeEventListener('ledgr:journal-saved', load);
  }, [load]);

  const streak = useMemo(() => computeStreak(items.map((i) => i.dateId)), [items]);

  return { items, streak, loading, reload: load };
}
