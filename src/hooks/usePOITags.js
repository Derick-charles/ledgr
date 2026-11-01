import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { POI_TAGS, POI_COLORS } from '../utils/stats';

let idCounter = 0;
const makeId = () => `poi-${Date.now()}-${idCounter++}`;
const FALLBACK_ITEMS = POI_TAGS.map((label) => ({ id: makeId(), label, color: POI_COLORS[label] || '#4FD8E8' }));

// Rotates through a few theme colors for POIs the user adds themselves.
const NEW_TAG_PALETTE = ['#4FD8E8', '#8B7FFF', '#35E0A1', '#F2A93B', '#FF6B7A'];

// A "Point of Interest" is the price-action concept behind a trade (Order
// Block, FVG, Liquidity Sweep, etc.) — tagged per-trade so win rate can be
// compared setup-by-setup. Fully editable, same pattern as useMistakeTags.
export function usePOITags(accountId) {
  const [tags, setTags] = useState(FALLBACK_ITEMS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const data = await api.get(`/api/poi-tags?account=${accountId}`);
      setTags(Array.isArray(data.items) && data.items.length ? data.items : FALLBACK_ITEMS);
    } catch (e) {
      console.error('Failed to load POI tags:', e);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  async function persist(nextTags) {
    setTags(nextTags);
    try {
      await api.put(`/api/poi-tags?account=${accountId}`, { items: nextTags });
    } catch (e) {
      console.error('Failed to save POI tags:', e);
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

  const colorMap = Object.fromEntries(tags.map((t) => [t.label, t.color]));

  return { tags, colorMap, loading, addTag, removeTag };
}
