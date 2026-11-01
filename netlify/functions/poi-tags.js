import { stores, json, keyFor } from './_blobs.js';
import { protect } from './_auth.js';

// Kept in sync with src/hooks/usePOITags.js's fallback list — this is the
// one-time seed used only if no custom list has been saved yet. Names come
// from ICT/SMC-style price-action concepts, but the list is fully editable.
const DEFAULT_TAGS = [
  { label: 'Order Block', color: '#4FD8E8' },
  { label: 'Fair Value Gap', color: '#8B7FFF' },
  { label: 'Liquidity Sweep', color: '#F2A93B' },
  { label: 'Breaker Block', color: '#35E0A1' },
  { label: 'Supply/Demand Zone', color: '#4FD8E8' },
  { label: 'Trendline Break', color: '#8B7FFF' },
];

let idCounter = 0;
const makeId = () => `poi-${Date.now()}-${idCounter++}`;
const DEFAULT_ITEMS = DEFAULT_TAGS.map((t) => ({ id: makeId(), ...t }));

export const handler = protect(async (event, ctx) => {
  const { settings } = stores(event);
  const accountId = (event.queryStringParameters || {}).account;
  const key = keyFor(accountId, 'poiTags');

  try {
    if (event.httpMethod === 'GET') {
      const saved = await settings.get(key, { type: 'json' });
      if (saved && Array.isArray(saved.items)) return json(200, { items: saved.items });
      await settings.setJSON(key, { items: DEFAULT_ITEMS });
      return json(200, { items: DEFAULT_ITEMS });
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const items = Array.isArray(body.items) ? body.items : [];
      await settings.setJSON(key, { items });
      return json(200, { items });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('[poi-tags]', e);
    return json(e.statusCode || 500, { error: e.message || 'Server error' });
  }
});
