import { stores, json, uuid } from './_blobs.js';
import { protect, ownsStamp } from './_auth.js';
import { getOrBuildSummary, upsertSummaryItem, removeSummaryItem, writeSummary } from './_summary.js';
import {
  cleanBacktest, cleanPrep, cleanRules, cleanEntry, cleanMonth, entriesFromResults, summariseEntries,
  parseResults, toSummary, DEFAULT_PREP, DEFAULT_RULES, MAX_RESULTS,
} from './_backtest-utils.js';

// Backtests belong to the PERSON, not to one trading account (a strategy you
// test isn't tied to Personal vs Funded), so everything here is keyed by the
// signed-in user's id and nobody else can see or touch it.
//
//   GET    /api/backtests              → light list for the gallery (no trade lists)
//   GET    /api/backtests?id=…         → one full backtest (with its trade results)
//   POST   /api/backtests              → create
//   PUT    /api/backtests?id=…         → change any of its fields
//   DELETE /api/backtests?id=…
//   GET/PUT /api/backtests?prep=1      → the challenge-preparation panel (rules, start date, checklist)
//
// The gallery list lives in ONE small summary blob so opening the page costs
// a single read however many backtests there are.

const KIND = 'backtests';
const MAX_MEDIA = 3;
const MAX_BACKTESTS = 500;

const MAX_ENTRY_MEDIA = 2;

// Sessions saved before entries existed only have a list of results — turn
// them into entries the first time they're touched.
function withEntries(bt) {
  if (!bt.entries) bt.entries = entriesFromResults(bt.results || []).map((e) => ({ ...e, id: uuid() }));
  return bt;
}
function finish(bt) {
  Object.assign(bt, summariseEntries(bt.entries));
  return bt;
}
const entryMedia = (bt) => (bt.entries || []).flatMap((e) => e.media || []);

const recordKey = (userId, id) => `${userId}/${id}`;
const summaryOwner = (userId) => `u:${userId}`;
const prepKey = (userId) => `bt-prep:${userId}`;

// Only files this person uploaded count; the kind (image/video) is read from
// what was actually stored, never from what the browser claims.
async function ownedMedia(mediaStore, items, user, max = MAX_MEDIA) {
  const out = [];
  for (const it of (Array.isArray(items) ? items : []).slice(0, max)) {
    const id = String((it && it.id) || '');
    if (!/^[0-9a-f-]{20,40}$/i.test(id)) continue;
    const meta = await mediaStore.getMetadata(id);
    const m = meta && meta.metadata;
    if (!m || !ownsStamp(user, m.owner)) continue;
    const ct = String(m.contentType || '');
    const type = ct.startsWith('video/') ? 'video' : ct.startsWith('image/') ? 'image' : null;
    if (type) out.push({ id, url: `/api/media?id=${id}`, type });
  }
  return out;
}

async function listAll(store, userId) {
  const { blobs } = await store.list();
  const keys = blobs.map((b) => b.key).filter((k) => k.startsWith(`${userId}/`));
  return (await Promise.all(keys.map((k) => store.get(k, { type: 'json' })))).filter(Boolean);
}

export const handler = protect(async (event, ctx) => {
  const { backtests, summaries, media, settings } = stores(event);
  const userId = ctx.user.id;
  const q = event.queryStringParameters || {};

  // ---- challenge-preparation panel ----
  if (q.prep) {
    const current = (await settings.get(prepKey(userId), { type: 'json' })) || DEFAULT_PREP;
    if (event.httpMethod === 'GET') return json(200, cleanPrep({}, current));
    if (event.httpMethod === 'PUT') {
      const next = cleanPrep(JSON.parse(event.body || '{}'), current);
      await settings.setJSON(prepKey(userId), next);
      return json(200, next);
    }
    return json(405, { error: 'Method not allowed' });
  }

  // ---- entries inside a session ----
  //   POST   /api/backtests?id=S&entry=1      → add an entry
  //   PUT    /api/backtests?id=S&entry=E      → change one
  //   DELETE /api/backtests?id=S&entry=E
  if (q.id && q.entry && event.httpMethod !== 'GET') {
    const found = await backtests.get(recordKey(userId, q.id), { type: 'json' });
    if (!found) return json(404, { error: 'Session not found' });
    const bt = withEntries(found);
    if (bt.closed) return json(409, { error: 'This session is closed. Reopen it to change its entries.' });
    const save = async () => {
      finish(bt); bt.updatedAt = Date.now();
      await backtests.setJSON(recordKey(userId, bt.id), bt);
      await upsertSummaryItem(summaries, KIND, summaryOwner(userId), 'id', toSummary(bt));
      return json(200, bt);
    };

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const clean = cleanEntry(body);
      if (clean.side === 'breakeven') clean.r = 0;
      if (clean.side === 'missed' && !Number.isFinite(clean.r)) clean.r = 0;
      if (!Number.isFinite(clean.r)) return json(400, { error: 'Enter the result in R (e.g. 1.8 or -1).' });
      if (bt.entries.length >= MAX_RESULTS) return json(400, { error: `A session holds up to ${MAX_RESULTS} entries.` });
      bt.entries.push({
        date: '', time: '', symbol: '', side: '', timeframe: '', timeframes: [], entryPrice: null, stopPrice: null, exitPrice: null, setup: '', followed: true, notes: '',
        ...clean, id: uuid(), media: await ownedMedia(media, body.media, ctx.user, MAX_ENTRY_MEDIA), createdAt: Date.now(),
      });
      return save();
    }
    const entry = bt.entries.find((e) => e.id === q.entry);
    if (event.httpMethod === 'PUT') {
      if (!entry) return json(404, { error: 'Entry not found' });
      const body = JSON.parse(event.body || '{}');
      const clean = cleanEntry(body);
      const sideNow = clean.side ?? entry.side;
      if (sideNow === 'breakeven') clean.r = 0;
      if (sideNow === 'missed' && Object.prototype.hasOwnProperty.call(body, 'r') && !Number.isFinite(clean.r)) clean.r = 0;
      if (Object.prototype.hasOwnProperty.call(body, 'r') && !Number.isFinite(clean.r)) return json(400, { error: 'Enter the result in R (e.g. 1.8 or -1).' });
      Object.assign(entry, clean);
      if (Object.prototype.hasOwnProperty.call(body, 'media')) {
        const next = await ownedMedia(media, body.media, ctx.user, MAX_ENTRY_MEDIA);
        const keep = new Set(next.map((m) => m.id));
        await Promise.all((entry.media || []).filter((m) => !keep.has(m.id)).map((m) => media.delete(m.id).catch(() => {})));
        entry.media = next;
      }
      return save();
    }
    if (event.httpMethod === 'DELETE') {
      if (entry) {
        bt.entries = bt.entries.filter((e) => e.id !== q.entry);
        await Promise.all((entry.media || []).map((m) => media.delete(m.id).catch(() => {})));
      }
      return save();
    }
    return json(405, { error: 'Method not allowed' });
  }

  if (event.httpMethod === 'GET') {
    if (q.id) {
      const bt = await backtests.get(recordKey(userId, q.id), { type: 'json' });
      return bt ? json(200, withEntries(bt)) : json(404, { error: 'Backtest not found' });
    }
    let items = await getOrBuildSummary(summaries, KIND, summaryOwner(userId), () => listAll(backtests, userId), toSummary);
    if (items.some((i) => !i.challenge || !i.daily)) {
      // Saved before sessions carried challenge results — rebuild the list once from the sessions themselves.
      items = (await listAll(backtests, userId)).map((bt) => toSummary(finish(withEntries(bt))));
      await writeSummary(summaries, KIND, summaryOwner(userId), items);
    }
    return json(200, items);
  }

  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    const clean = cleanBacktest(body);
    if (!clean.title) return json(400, { error: 'Give the backtest a title.' });
    const existing = await getOrBuildSummary(summaries, KIND, summaryOwner(userId), () => listAll(backtests, userId), toSummary);
    if (existing.length >= MAX_BACKTESTS) return json(400, { error: `You've reached ${MAX_BACKTESTS} backtests — delete some first.` });

    const parsed = parseResults(body.resultsText);
    const prepNow = (await settings.get(prepKey(userId), { type: 'json' })) || DEFAULT_PREP;
    const now = Date.now();
    const d = new Date();
    const bt = {
      strategy: '', symbol: '', timeframe: '', period: '', riskPct: 1, status: 'review', link: '', duration: '', tags: [], notes: '',
      learned: { worked: '', failed: '', next: '' },
      ...clean,
      month: clean.month || `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      rules: cleanRules(body.rules, prepNow.rules),
      steps: 1, closed: false, closedAt: null,
      id: uuid(), userId,
      entries: entriesFromResults(parsed.results).map((e) => ({ ...e, id: uuid() })),
      media: await ownedMedia(media, body.media, ctx.user),
      createdAt: now, updatedAt: now,
    };
    finish(bt);
    await backtests.setJSON(recordKey(userId, bt.id), bt);
    await upsertSummaryItem(summaries, KIND, summaryOwner(userId), 'id', toSummary(bt));
    return json(200, { ...bt, skippedLines: parsed.skipped.length });
  }

  if (event.httpMethod === 'PUT') {
    if (!q.id) return json(400, { error: 'Missing id' });
    const existing = withEntries(await backtests.get(recordKey(userId, q.id), { type: 'json' }) || {});
    if (!existing.id) return json(404, { error: 'Backtest not found' });
    const body = JSON.parse(event.body || '{}');
    const clean = cleanBacktest(body);
    if (Object.prototype.hasOwnProperty.call(clean, 'title') && !clean.title) return json(400, { error: 'Give the backtest a title.' });

    const next = { ...existing, ...clean };
    if (Object.prototype.hasOwnProperty.call(clean, 'closed')) next.closedAt = clean.closed ? (existing.closed ? existing.closedAt : Date.now()) : null;
    if (existing.closed && Object.prototype.hasOwnProperty.call(body, 'resultsText')) return json(409, { error: 'This session is closed. Reopen it to add entries.' });
    let skippedLines = 0;
    if (Object.prototype.hasOwnProperty.call(body, 'resultsText')) {
      const parsed = parseResults(body.resultsText); // imported lines are ADDED as entries
      next.entries = [...existing.entries, ...entriesFromResults(parsed.results).map((e) => ({ ...e, id: uuid() }))].slice(0, MAX_RESULTS);
      skippedLines = parsed.skipped.length;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'media')) {
      next.media = await ownedMedia(media, body.media, ctx.user);
      const keep = new Set(next.media.map((m) => m.id));
      await Promise.all((existing.media || []).filter((m) => !keep.has(m.id)).map((m) => media.delete(m.id).catch(() => {})));
    }
    finish(next);
    next.id = existing.id; next.userId = userId; next.createdAt = existing.createdAt; next.updatedAt = Date.now();
    await backtests.setJSON(recordKey(userId, next.id), next);
    await upsertSummaryItem(summaries, KIND, summaryOwner(userId), 'id', toSummary(next));
    return json(200, { ...next, skippedLines });
  }

  if (event.httpMethod === 'DELETE') {
    if (!q.id) return json(400, { error: 'Missing id' });
    const existing = await backtests.get(recordKey(userId, q.id), { type: 'json' });
    if (!existing) return json(200, { ok: true });
    await backtests.delete(recordKey(userId, q.id));
    await Promise.all([...(existing.media || []), ...entryMedia(existing)].map((m) => media.delete(m.id).catch(() => {})));
    await removeSummaryItem(summaries, KIND, summaryOwner(userId), 'id', q.id);
    return json(200, { ok: true });
  }

  return json(405, { error: 'Method not allowed' });
}, { account: 'none' });
