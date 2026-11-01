import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { computeStreak } from '../utils/streak';

// Standalone streak fetch (one cheap list-only request). The dashboard now
// derives its streak from useJournalSummary instead, so this is kept only
// for any caller that needs a streak without the full summary.
export function useStreak(accountId) {
  const [streak, setStreak] = useState(0);

  const load = useCallback(async () => {
    if (!accountId) return;
    try {
      setStreak(computeStreak(await api.get(`/api/journal?account=${accountId}&keys=1`)));
    } catch (e) {
      console.error('Failed to load streak:', e);
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    window.addEventListener('ledgr:journal-saved', load);
    return () => window.removeEventListener('ledgr:journal-saved', load);
  }, [load]);

  return streak;
}
