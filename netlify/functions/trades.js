import { stores, json, uuid, resolveMediaItems, keyFor, keyBelongsTo } from './_blobs.js';
import { protect } from './_auth.js';
import { getOrBuildSummary, upsertSummaryItem, removeSummaryItem } from './_summary.js';
import { normalizeRisk, cleanTime, cleanExtras, mediaIds, toSummaryItem } from './_trade-utils.js';

const KIND = 'trades';

// One-time, one-account rebuild for whoever doesn't have a summary blob yet
// (a brand new account, or upgrading from a version that predates
// summaries). Every load after this one for that account hits the cheap
// summary-only path instead.
export async function buildFullItemsFor(tradesStore, accountId) {
  const { blobs } = await tradesStore.list();
  const keys = blobs.map((b) => b.key).filter((k) => keyBelongsTo(k, accountId));
  const all = await Promise.all(keys.map((k) => tradesStore.get(k, { type: 'json' })));
  return all.filter(Boolean);
}

async function summaryItemsFor(summaries, tradesStore, accountId) {
  return getOrBuildSummary(summaries, KIND, accountId, () => buildFullItemsFor(tradesStore, accountId), toSummaryItem);
}

export const handler = protect(async (event, ctx) => {
  const { trades, media, summaries } = stores(event);

  try {
    if (event.httpMethod === 'GET') {
      const { start, end, account, light } = event.queryStringParameters || {};
      // "all" = every account THIS USER owns (never other users' accounts).
      const accountIdsToRead = account === 'all' ? ctx.accountIds : [account];

      const perAccount = await Promise.all(
        accountIdsToRead.map(async (id) => (await summaryItemsFor(summaries, trades, id)).map((it) => ({ ...it, accountId: id })))
      );
      let items = perAccount.flat();
      if (start) items = items.filter((t) => t.date >= start);
      if (end) items = items.filter((t) => t.date <= end);
      items.sort((a, b) => b.date.localeCompare(a.date));

      // Lightweight mode: milestones/POI-performance/timing/"any trades at
      // all" only ever need these few fields — stopping here means a page
      // load's all-time panels cost one small summary blob per account, not
      // one read per trade ever logged.
      if (light) return json(200, items);

      const full = await Promise.all(items.map((it) => trades.get(keyFor(it.accountId, it.id), { type: 'json' })));
      let list = full.filter(Boolean);
      list.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
      return json(200, list);
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      // The account comes from ?account= (already checked as yours), never from the body.
      const accountId = event.queryStringParameters.account;
      if (accountId === 'all') return json(400, { error: 'Pick a specific account.' });
      const id = uuid();

      const beforeMedia = await resolveMediaItems(media, body.beforeMedia, ctx.user.id);
      const afterMedia = await resolveMediaItems(media, body.afterMedia, ctx.user.id);

      const trade = { ...body, ...normalizeRisk(body), ...cleanExtras(body), time: cleanTime(body.time), incomplete: !!body.incomplete, id, accountId, beforeMedia, afterMedia, createdAt: Date.now() };
      await trades.setJSON(keyFor(accountId, id), trade);
      // Make sure the summary exists before upserting into it, otherwise a
      // brand-new account's first trade would trigger a (harmless but
      // pointless) "rebuild" over zero other trades — fine either way, this
      // just skips that no-op.
      await summaryItemsFor(summaries, trades, accountId);
      await upsertSummaryItem(summaries, KIND, accountId, 'id', toSummaryItem(trade));
      return json(200, trade);
    }

    // Edit an existing trade in place. id, accountId and createdAt are kept
    // from the stored record (never taken from the request), and any image
    // or clip that was attached before but is gone from the edited version
    // is deleted from storage so nothing is orphaned.
    if (event.httpMethod === 'PUT') {
      const { account, id } = event.queryStringParameters || {};
      if (!id) return json(400, { error: 'Missing id' });
      if (account === 'all') return json(400, { error: 'Pick a specific account.' });
      const key = keyFor(account, id);
      const existing = await trades.get(key, { type: 'json' });
      if (!existing) return json(404, { error: 'Trade not found' });

      const body = JSON.parse(event.body || '{}');
      const beforeMedia = await resolveMediaItems(media, body.beforeMedia, ctx.user.id);
      const afterMedia = await resolveMediaItems(media, body.afterMedia, ctx.user.id);

      const updated = {
        ...existing, ...body, ...normalizeRisk(body), ...cleanExtras(body), time: cleanTime(body.time), incomplete: !!body.incomplete,
        id: existing.id, accountId: existing.accountId, createdAt: existing.createdAt,
        beforeMedia, afterMedia, updatedAt: Date.now(),
      };
      await trades.setJSON(key, updated);
      await upsertSummaryItem(summaries, KIND, existing.accountId, 'id', toSummaryItem(updated));

      // Only ids that were on THIS trade can be removed by an edit — the
      // request can't be used to delete arbitrary media.
      const keep = new Set([...mediaIds(beforeMedia), ...mediaIds(afterMedia)]);
      const removed = [...mediaIds(existing.beforeMedia), ...mediaIds(existing.afterMedia)].filter((m) => !keep.has(m));
      await Promise.all(removed.map((mid) => media.delete(mid).catch((e) => console.warn('Could not delete removed media:', e))));
      return json(200, updated);
    }

    if (event.httpMethod === 'DELETE') {
      const { account, id } = event.queryStringParameters || {};
      if (!id) return json(400, { error: 'Missing id' });
      if (account === 'all') return json(400, { error: 'Pick a specific account.' });
      const key = keyFor(account, id);
      const trade = await trades.get(key, { type: 'json' });
      if (trade) {
        // Clean up any uploaded images/clips attached to this trade too —
        // link-type media has no blob backing it, nothing to delete for those.
        const mIds = [...(trade.beforeMedia || []), ...(trade.afterMedia || [])]
          .filter((m) => m && m.id && m.type !== 'link')
          .map((m) => m.id);
        await Promise.all(mIds.map((mid) => media.delete(mid).catch((e) => console.warn('Could not delete trade media:', e))));
      }
      await trades.delete(key);
      await removeSummaryItem(summaries, KIND, account, 'id', id);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('[trades]', e);
    return json(e.statusCode || 500, { error: e.message || 'Server error' });
  }
}, { allowAll: true });
