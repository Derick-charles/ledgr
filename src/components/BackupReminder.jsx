import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { downloadAccountBackup } from '../utils/backup';
import { useOffline } from '../hooks/useOffline';

const REMIND_AFTER_DAYS = 14;
const SNOOZE_DAYS = 3;
const DAY = 24 * 60 * 60 * 1000;

// A nudge to download a backup file when it's been a while (or never). Only
// shows once the account has trades worth protecting. "Later" hides it for a
// few days on this browser only.
export default function BackupReminder({ account, hasTrades }) {
  const offline = useOffline();
  const [lastBackupAt, setLastBackupAt] = useState(undefined); // undefined = still loading
  const [busy, setBusy] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const key = account ? `ledgr:backupSnooze:${account.id}` : null;

  useEffect(() => {
    if (!account) return undefined;
    let cancelled = false;
    setLastBackupAt(undefined);
    try { setSnoozedUntil(Number(localStorage.getItem(key)) || 0); } catch { setSnoozedUntil(0); }
    api.get(`/api/backup?account=${account.id}&meta=1`)
      .then((d) => { if (!cancelled) setLastBackupAt(d.lastBackupAt); })
      .catch(() => { if (!cancelled) setLastBackupAt(undefined); });
    return () => { cancelled = true; };
  }, [account, key]);

  const backUp = useCallback(async () => {
    setBusy(true);
    try {
      await downloadAccountBackup(account);
      setLastBackupAt(Date.now());
    } catch (e) {
      alert(`Could not create backup: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }, [account]);

  function snooze() {
    const until = Date.now() + SNOOZE_DAYS * DAY;
    setSnoozedUntil(until);
    try { localStorage.setItem(key, String(until)); } catch { /* ignore */ }
  }

  if (offline || !account || !hasTrades || lastBackupAt === undefined) return null;
  const ageDays = lastBackupAt ? Math.floor((Date.now() - lastBackupAt) / DAY) : null;
  if (ageDays !== null && ageDays < REMIND_AFTER_DAYS) return null;
  if (Date.now() < snoozedUntil) return null;

  return (
    <div className="alert-card backup-card">
      <div className="alert-icon">⤓</div>
      <div className="alert-body">
        <div className="alert-title">Time to back up "{account.name}"</div>
        <div className="alert-text">
          {ageDays === null ? "You haven't downloaded a backup of this account yet." : `Your last backup was ${ageDays} days ago.`}
          {' '}A backup file holds your trades, journal and settings (not the image files themselves).
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <button className="btn btn-primary month-nav-today" onClick={backUp} disabled={busy}>{busy ? 'Preparing…' : 'Download backup'}</button>
          <button className="btn btn-ghost month-nav-today" onClick={snooze}>Remind me later</button>
        </div>
      </div>
    </div>
  );
}
