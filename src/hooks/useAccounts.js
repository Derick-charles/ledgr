import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

const STORAGE_KEY = 'ledgr:activeAccountId';

// 'all' is a frontend-only pseudo-account (not one of the real accounts
// below) meaning "combine every account's trades" — see Dashboard.jsx for
// which panels support that and which require one specific account.
export const ALL_ACCOUNTS = 'all';

export function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [activeAccountId, setActiveAccountIdState] = useState(() => localStorage.getItem(STORAGE_KEY) || null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/accounts');
      setAccounts(data);
      // First load, or the previously-active account got deleted elsewhere —
      // fall back to the first real account rather than an invalid selection.
      setActiveAccountIdState((cur) => {
        if (cur === ALL_ACCOUNTS) return cur;
        if (cur && data.some((a) => a.id === cur)) return cur;
        return data[0]?.id || null;
      });
    } catch (e) {
      console.error('Failed to load accounts:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function setActiveAccountId(id) {
    setActiveAccountIdState(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  }

  async function addAccount(name, challenge) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const account = await api.post('/api/accounts', challenge ? { name: trimmed, challenge } : { name: trimmed });
    await load();
    setActiveAccountId(account.id); // jump straight to the new account
  }

  async function renameAccount(id, name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await api.put(`/api/accounts?id=${id}`, { name: trimmed });
    await load();
  }

  // Saves (or, with null, removes) an account's prop-firm challenge settings.
  async function saveChallenge(id, challenge) {
    await api.put(`/api/accounts?id=${id}`, { challenge });
    await load();
  }

  async function removeAccount(id) {
    await api.del(`/api/accounts?id=${id}`);
    if (activeAccountId === id) setActiveAccountId(null); // load() will pick a fallback
    await load();
  }

  return { accounts, activeAccountId, setActiveAccountId, loading, addAccount, renameAccount, removeAccount, saveChallenge };
}
