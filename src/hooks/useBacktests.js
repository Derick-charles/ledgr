import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useLiveRefresh } from './useLiveRefresh';
import { registerFailedLoad } from '../utils/errorBus';
import { DEFAULT_PREP, toSummary } from '../../netlify/functions/_backtest-utils.js';
import { getRecent, mergeRecent, noteDelete, noteWrite } from '../utils/recentWrites';

// The person's backtests (not tied to a trading account). `items` are the light
// gallery records, newest first; one backtest's full trade list is fetched on
// demand with `fetchOne`.
export function useBacktests() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [prep, setPrep] = useState(DEFAULT_PREP);

  const newest = (list) => [...list].sort((a, b) => b.createdAt - a.createdAt);
  const fresher = (rec, onServer) => (rec.updatedAt || 0) >= (onServer.updatedAt || 0);

  const load = useCallback(async ({ silent } = {}) => {
    try {
      const [list, p] = await Promise.all([api.get('/api/backtests'), api.get('/api/backtests?prep=1')]);
      setItems(newest(mergeRecent('bt', list, { newer: fresher })));
      setPrep(p);
    } catch (e) {
      console.error('Failed to load backtests:', e);
      if (!silent) registerFailedLoad(load);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(() => load({ silent: true }));

  // The saved record comes straight back from the server, so the screen is
  // updated from THAT — not from a re-read of the list, which can still show
  // the version from before the save for a short while.
  const apply = (bt) => {
    const summary = toSummary(bt);
    noteWrite('bt', bt.id, summary);
    noteWrite('btfull', bt.id, bt);
    setItems((cur) => newest([...cur.filter((x) => x.id !== bt.id), summary]));
    return bt;
  };

  // One full session. A session you just changed is answered from what you
  // saved, unless the server already has something at least as new.
  const fetchOne = useCallback(async (id) => {
    const recent = getRecent('btfull', id);
    let server = null;
    try { server = await api.get(`/api/backtests?id=${id}`); } catch (e) { if (!recent) throw e; }
    if (recent && (!server || (server.updatedAt || 0) < (recent.updatedAt || 0))) return recent;
    return server;
  }, []);

  const create = async (payload) => apply(await api.post('/api/backtests', payload));
  const update = async (id, patch) => apply(await api.put(`/api/backtests?id=${id}`, patch));
  async function remove(id) {
    await api.del(`/api/backtests?id=${id}`);
    noteDelete('bt', id); noteDelete('btfull', id);
    setItems((cur) => cur.filter((x) => x.id !== id));
  }
  const addEntry = async (id, payload) => apply(await api.post(`/api/backtests?id=${id}&entry=1`, payload));
  const editEntry = async (id, entryId, payload) => apply(await api.put(`/api/backtests?id=${id}&entry=${entryId}`, payload));
  const removeEntry = async (id, entryId) => apply(await api.del(`/api/backtests?id=${id}&entry=${entryId}`));
  async function savePrep(patch) {
    const next = await api.put('/api/backtests?prep=1', patch);
    setPrep(next);
    return next;
  }

  return { items, loading, prep, reload: load, fetchOne, create, update, remove, addEntry, editEntry, removeEntry, savePrep };
}
