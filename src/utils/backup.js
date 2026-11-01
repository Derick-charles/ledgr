import { api } from '../api';

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Downloads a backup file for one account and records the time on the server
// (that's what the "time to back up" reminder reads). Throws on failure.
export async function downloadAccountBackup(account) {
  const data = await api.get(`/api/backup?account=${account.id}`);
  const slug = account.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  downloadJSON(data, `ledgr-backup-${slug || account.id}-${new Date().toISOString().slice(0, 10)}.json`);
  try { await api.put(`/api/backup?account=${account.id}`, {}); } catch { /* the file is already saved; only the reminder timestamp missed */ }
}
