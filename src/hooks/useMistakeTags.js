import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { MISTAKE_TAGS, MISTAKE_COLORS } from '../utils/stats';

let idCounter = 0;
const makeId = () => `tag-${Date.now()}-${idCounter++}`;
const FALLBACK_ITEMS = MISTAKE_TAGS.map((label) => ({ id: makeId(), label, color: MISTAKE_COLORS[label] || '#FF6B7A' }));

// Rotates through a few theme colors for tags the user adds themselves,
// which have no predefined color the way the seeded defaults do.
const NEW_TAG_PALETTE = ['#FF6B7A', '#F2A93B', '#8B7FFF', '#4FD8E8', '#35E0A1'];

export function useMistakeTags(accountId) {
  const [tags, setTags] = useState(FALLBACK_ITEMS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const data = await api.get(`/api/mistake-tags?account=${accountId}`);
      setTags(Array.isArray(data.items) && data.items.length ? data.items : FALLBACK_ITEMS);
    } catch (e) {
      console.error('Failed to load mistake tags:', e);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  async function persist(nextTags) {
    setTags(nextTags);
    try {
      await api.put(`/api/mistake-tags?account=${accountId}`, { items: nextTags });
    } catch (e) {
      console.error('Failed to save mistake tags:', e);
    }
  }

  function addTag(label) {
    const trimmed = label.trim();
    if (!trimmed) return;
    const color = NEW_TAG_PALETTE[tags.length % NEW_TAG_PALETTE.length];
    persist([...tags, { id: makeId(), label: trimmed, color }]);
  }

  function removeTag(id) {
    persist(tags.filter((t) => t.id !== id));
  }

  // { 'Chased Entry': '#FF6B7A', ... } — for coloring a trade's mistake tag
  // even after it's been removed from the editable list (old trades keep
  // whatever label they were tagged with).
  const colorMap = Object.fromEntries(tags.map((t) => [t.label, t.color]));

  return { tags, colorMap, loading, addTag, removeTag };
}
