import { useCallback, useEffect, useRef, useState } from 'react';
import { api, fileToUploadPayload } from '../api';
import { useLiveRefresh } from './useLiveRefresh';
import { registerFailedLoad } from '../utils/errorBus';
import { mergeRecent, noteDelete, noteWrite } from '../utils/recentWrites';

// Uploads each raw File to /api/media individually (its own small request),
// converting { file: File, type } into an already-resolved { id, url, type }
// reference. Already-resolved items (no `file` — a pasted link, or media
// left over from a previous attempt) pass through untouched.
//
// Uploading one-by-one instead of bundling every file's base64 into the
// trade's own POST body matters here specifically: Netlify Functions cap a
// request body at 6MB TOTAL. A single 4MB screenshot clears the per-file
// limit fine, but attach two or three of them to one trade and their
// combined base64 payload blows straight past 6MB — meaning multi-image
// trades could fail to save even though every individual file was within
// bounds. Uploading separately means the trade record itself only ever
// carries small { id, url, type } refs, regardless of how many images.
//
// `uploaded` collects the id of every file uploaded during THIS save attempt,
// so that if the save then fails (a later upload errors, the trade itself is
// rejected, the connection drops) they can be deleted again rather than left
// behind — and re-uploaded as duplicates when you press Save a second time.
async function prepareMedia(items = [], uploaded = []) {
  const out = [];
  for (const item of items) {
    // Existing/link items: keep only what's stored (drops form-only fields
    // like `key` and `previewUrl`). Links have no id.
    if (!item.file) { out.push({ id: item.id, url: item.url, type: item.type }); continue; }
    const payload = await fileToUploadPayload(item.file);
    const { id, url } = await api.post('/api/media', payload);
    uploaded.push(id);
    out.push({ id, url, type: item.type });
  }
  return out;
}

async function discardUploads(ids) {
  await Promise.all(ids.map((id) => api.del(`/api/media?id=${id}`).catch(() => {})));
}

// accountId is either a real account's id, or 'all' to pool every account's
// trades together (each returned trade carries its own accountId field).
// Called with no monthStartId/monthEndId, this fetches every trade ever
// logged for that account (used for all-time milestone evaluation) instead
// of one calendar month.
export function useTrades(accountId, monthStartId, monthEndId) {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  // Month navigation can fire several loads in quick succession; only the
  // most recent one is allowed to write its result, so a slow response for
  // an earlier month can't overwrite the month now on screen.
  const requestRef = useRef(0);

  const load = useCallback(async ({ silent } = {}) => {
    if (!accountId) return; // accounts still loading
    const requestId = ++requestRef.current;
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ account: accountId });
      if (monthStartId && monthEndId) { params.set('start', monthStartId); params.set('end', monthEndId); }
      const data = await api.get(`/api/trades?${params}`);
      const belongs = (t) => (accountId === 'all' || t.accountId === accountId) && (!monthStartId || !monthEndId || (t.date >= monthStartId && t.date <= monthEndId));
      if (requestId === requestRef.current) setTrades(mergeRecent('trade', data, { keep: belongs }).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0)));
    } catch (e) {
      console.error('Failed to load trades:', e);
      if (!silent) registerFailedLoad(load);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [accountId, monthStartId, monthEndId]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(() => load({ silent: true }));

  async function addTrade(trade) {
    const uploaded = [];
    try {
      const beforeMedia = await prepareMedia(trade.beforeMedia, uploaded);
      const afterMedia = await prepareMedia(trade.afterMedia, uploaded);
      const saved = await api.post(`/api/trades?account=${accountId}`, { ...trade, beforeMedia, afterMedia });
      noteWrite('trade', saved.id, saved);
    } catch (e) {
      await discardUploads(uploaded);
      throw e;
    }
    await load();
  }

  // Takes the trade object itself (not just an id) so this still works
  // correctly in the "All Accounts" aggregate view, where the hook's own
  // `accountId` is the pseudo-value 'all' — every trade already carries its
  // own real accountId field, which is what the delete needs to find it.
  async function deleteTrade(trade) {
    const acct = trade.accountId || accountId;
    await api.del(`/api/trades?account=${acct}&id=${trade.id}`);
    noteDelete('trade', trade.id);
    await load();
  }

  // Edit in place. The trade keeps its id/account/createdAt server-side;
  // media already attached arrives as { id, url, type } and is kept, new
  // files are uploaded first, and anything dropped from the form is removed
  // from storage by the server.
  async function updateTrade(trade, changes) {
    const acct = trade.accountId || accountId;
    const uploaded = [];
    try {
      const beforeMedia = await prepareMedia(changes.beforeMedia, uploaded);
      const afterMedia = await prepareMedia(changes.afterMedia, uploaded);
      const saved = await api.put(`/api/trades?account=${acct}&id=${trade.id}`, { ...changes, beforeMedia, afterMedia });
      noteWrite('trade', saved.id, saved);
    } catch (e) {
      await discardUploads(uploaded);
      throw e;
    }
    await load();
  }

  return { trades, loading, addTrade, updateTrade, deleteTrade, reload: load };
}
