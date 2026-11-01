import { stores, json, keyFor } from './_blobs.js';
import { protect } from './_auth.js';

// Kept in sync with src/utils/stats.js MISTAKE_TAGS/MISTAKE_COLORS — this
// is the one-time seed used only if no custom list has been saved yet.
const DEFAULT_TAGS = [
  { label: 'Chased Entry', color: '#FF6B7A' },
  { label: 'Moved Stop', color: '#F2A93B' },
  { label: 'Oversized', color: '#F2A93B' },
  { label: 'Revenge Trade', color: '#FF6B7A' },
  { label: 'Ignored Plan', color: '#FF6B7A' },
  { label: 'FOMO Exit', color: '#8B7FFF' },
];

let idCounter = 0;
const makeId = () => `tag-${Date.now()}-${idCounter++}`;
const DEFAULT_ITEMS = DEFAULT_TAGS.map((t) => ({ id: makeId(), ...t }));

export const handler = protect(async (event, ctx) => {
  const { settings } = stores(event);
  const accountId = (event.queryStringParameters || {}).account;
  const key = keyFor(accountId, 'mistakeTags');

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
    console.error('[mistake-tags]', e);
    return json(e.statusCode || 500, { error: e.message || 'Server error' });
  }
});
