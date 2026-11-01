import { stores, json, keyFor } from './_blobs.js';
import { protect } from './_auth.js';

export const handler = protect(async (event, ctx) => {
  const { lessons } = stores(event);
  const q = event.queryStringParameters || {};
  const accountId = q.account;

  try {
    if (!q.week) return json(400, { error: 'Missing week' });
    const key = keyFor(accountId, q.week);

    if (event.httpMethod === 'GET') {
      const entry = await lessons.get(key, { type: 'json' });
      return json(200, entry || { bestDecision: '', carryForward: '' });
    }

    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}'); // { field, value }
      const existing = (await lessons.get(key, { type: 'json' })) || { bestDecision: '', carryForward: '' };
      const merged = { ...existing, [body.field]: body.value, updatedAt: Date.now() };
      await lessons.setJSON(key, merged);
      return json(200, merged);
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('[lessons]', e);
    return json(e.statusCode || 500, { error: e.message || 'Server error' });
  }
});
