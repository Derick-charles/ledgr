import { stores, json, keyFor } from './_blobs.js';
import { protect } from './_auth.js';

// Kept in sync with src/utils/stats.js CHECKLIST_ITEMS — this is the
// one-time seed used only if no checklist has been saved yet.
const DEFAULT_LABELS = [
  'Followed my trading plan',
  'Waited for confirmation signal',
  'Correct position size',
  'Stop loss set before entry',
  'No revenge trading after a loss',
  'Reviewed pre-market news',
];

let idCounter = 0;
const makeId = () => `item-${Date.now()}-${idCounter++}`;
const DEFAULT_ITEMS = DEFAULT_LABELS.map((label) => ({ id: makeId(), label }));

export const handler = protect(async (event, ctx) => {
  const { settings } = stores(event);
  const accountId = (event.queryStringParameters || {}).account;
  const key = keyFor(accountId, 'checklist');

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
    console.error('[checklist]', e);
    return json(e.statusCode || 500, { error: e.message || 'Server error' });
  }
});
