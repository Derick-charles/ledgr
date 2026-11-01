import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { CHECKLIST_ITEMS } from '../utils/stats';

let idCounter = 0;
const makeId = () => `item-${Date.now()}-${idCounter++}`;
const FALLBACK_ITEMS = CHECKLIST_ITEMS.map((label) => ({ id: makeId(), label }));

// The checklist ITEMS (the rules) live separately from a given day's CHECKED
// STATE (stored in journalEntries.checklist, keyed by label) — this is what
// lets items be added/removed without corrupting historical entries.
export function useChecklistTemplate(accountId) {
  const [items, setItems] = useState(FALLBACK_ITEMS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const data = await api.get(`/api/checklist?account=${accountId}`);
      setItems(Array.isArray(data.items) && data.items.length ? data.items : FALLBACK_ITEMS);
    } catch (e) {
      console.error('Failed to load checklist template:', e);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  async function persist(nextItems) {
    setItems(nextItems);
    try {
      await api.put(`/api/checklist?account=${accountId}`, { items: nextItems });
    } catch (e) {
      console.error('Failed to save checklist template:', e);
    }
  }

  function addItem(label) {
    const trimmed = label.trim();
    if (!trimmed) return;
    persist([...items, { id: makeId(), label: trimmed }]);
  }

  function removeItem(id) {
    persist(items.filter((i) => i.id !== id));
  }

  return { items, loading, addItem, removeItem };
}
