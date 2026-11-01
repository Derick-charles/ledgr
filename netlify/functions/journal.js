import { stores, json, keyFor, keyBelongsTo, stripPrefix } from './_blobs.js';
import { protect } from './_auth.js';
import { getOrBuildSummary, upsertSummaryItem } from './_summary.js';

const KIND = 'journal';

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

// The only fields the all-time-only consumers actually read: Milestones'
// trade-quality-tier history and its "ever wrote an affirmation" check.
// Everything else (notes, checklist, media) only matters for a specific
// day's view, which always goes through the month-ranged/single-date paths
// below — those stay full-document reads, unchanged.
export function toSummaryItem(entry, dateId) {
  return {
    dateId,
    tierComputed: entry.tierComputed || null,
    hasAffirmations: (entry.affirmationsSelected?.length || 0) > 0 || !!entry.affirmationsNotes,
  };
}

export async function buildFullEntriesFor(journalStore, accountId) {
  const { blobs } = await journalStore.list();
  const dateIds = blobs.map((b) => b.key).filter((k) => keyBelongsTo(k, accountId)).map((k) => stripPrefix(k, accountId));
  const entries = await Promise.all(dateIds.map(async (d) => ({ ...(await journalStore.get(keyFor(accountId, d), { type: 'json' })), dateId: d })));
  return entries.filter(Boolean);
}

export const handler = protect(async (event, ctx) => {
  const { journal, summaries } = stores(event);
  const q = event.queryStringParameters || {};
  const accountId = q.account;

  try {
    if (event.httpMethod === 'GET') {
      // ?keys=1 — just the list of dateIds that have a saved entry, used by
      // the streak calculation (computed client-side to avoid any server/
      // browser timezone mismatch on "what day is today"). Already cheap
      // (list-only) — left as-is.
      if (q.keys) {
        const { blobs } = await journal.list();
        const dateIds = blobs.map((b) => b.key).filter((k) => keyBelongsTo(k, accountId)).map((k) => stripPrefix(k, accountId));
        return json(200, dateIds.sort().reverse().slice(0, 60));
      }

      if (q.date) {
        const entry = await journal.get(keyFor(accountId, q.date), { type: 'json' });
        return json(200, entry ? { ...DEFAULT_ENTRY, ...entry, dateId: q.date } : { ...DEFAULT_ENTRY, dateId: q.date });
      }

      // Lightweight, all-time mode: Milestones' tier-history/affirmations
      // checks only need a couple of fields per day, forever — so this reads
      // one small per-account summary blob instead of every journal entry
      // ever written. (Rebuilt once, automatically, the first time an
      // account with no summary yet hits this path.)
      if (q.light) {
        const items = await getOrBuildSummary(summaries, KIND, accountId, () => buildFullEntriesFor(journal, accountId), (e) => toSummaryItem(e, e.dateId));
        return json(200, items.sort((a, b) => a.dateId.localeCompare(b.dateId)));
      }

      // ?start=&end= for a bounded range (already cheap: lists keys, filters
      // by date, THEN fetches only the entries in range) — left as-is.
      {
        const { blobs } = await journal.list();
        let dateIds = blobs.map((b) => b.key).filter((k) => keyBelongsTo(k, accountId)).map((k) => stripPrefix(k, accountId));
        if (q.start && q.end) dateIds = dateIds.filter((d) => d >= q.start && d <= q.end);
        const entries = await Promise.all(
          dateIds.map(async (d) => ({ ...DEFAULT_ENTRY, ...(await journal.get(keyFor(accountId, d), { type: 'json' })), dateId: d }))
        );
        return json(200, entries);
      }
    }

    if (event.httpMethod === 'PUT') {
      if (!q.date) return json(400, { error: 'Missing date' });
      const key = keyFor(accountId, q.date);
      const existing = (await journal.get(key, { type: 'json' })) || DEFAULT_ENTRY;
      const partial = JSON.parse(event.body || '{}');
      const merged = { ...DEFAULT_ENTRY, ...existing, ...partial, updatedAt: Date.now() };
      await journal.setJSON(key, merged);
      // Keep the summary in lockstep so the next all-time/light read doesn't
      // need rebuilding from scratch.
      await getOrBuildSummary(summaries, KIND, accountId, () => buildFullEntriesFor(journal, accountId), (e) => toSummaryItem(e, e.dateId));
      await upsertSummaryItem(summaries, KIND, accountId, 'dateId', toSummaryItem(merged, q.date));
      return json(200, { ...merged, dateId: q.date });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('[journal]', e);
    return json(e.statusCode || 500, { error: e.message || 'Server error' });
  }
});
