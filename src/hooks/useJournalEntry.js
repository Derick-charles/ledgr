import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

// checklist is keyed by item LABEL (not array position) — see
// useChecklistTemplate.js for why: it's what lets checklist items be added
// or removed later without corrupting any day's already-saved checked state.
const DEFAULT_ENTRY = {
  mindset: null,
  marketConditions: [],
  poiTags: [],
  notes: '',
  affirmationsSelected: [],
  affirmationsNotes: '',
  checklist: {},
  mediaUrls: [],
};

// One record per calendar day PER ACCOUNT — journal entries don't have an
// "all accounts" mode (whose mindset would that even be?), so this always
// needs one specific accountId.
export function useJournalEntry(accountId, dateId) {
  const [entry, setEntry] = useState(DEFAULT_ENTRY);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    if (!dateId || !accountId) return;
    setLoading(true);
    try {
      const data = await api.get(`/api/journal?account=${accountId}&date=${dateId}`);
      setEntry(data);
    } catch (e) {
      console.error('Failed to load journal entry:', e);
    } finally {
      setLoading(false);
    }
  }, [accountId, dateId]);

  useEffect(() => { load(); }, [load]);

  async function saveEntry(partial) {
    if (!dateId || !accountId) return;
    try {
      const merged = await api.put(`/api/journal?account=${accountId}&date=${dateId}`, partial);
      setEntry(merged);
      setSaveError('');
      // Lets useStreak (used independently in TopBar and Dashboard) know a
      // journal entry just changed, since there's no realtime subscription
      // here to pick that up on its own.
      window.dispatchEvent(new CustomEvent('ledgr:journal-saved'));
    } catch (e) {
      // Previously this just threw silently with nothing catching it in an
      // un-awaited onClick — a failed save looked identical to a successful
      // one from the UI. Surface it instead, and keep re-throwing so a
      // caller tracking its own "Saving…" button state still finds out too.
      console.error('Failed to save journal entry:', e);
      setSaveError(e.message || "Couldn't save — check your connection and try again.");
      throw e;
    }
  }

  return { entry, loading, saveEntry, saveError };
}
