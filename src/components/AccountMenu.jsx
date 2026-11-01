import { useEffect, useRef, useState } from 'react';
import { useEscape } from '../hooks/useEscape.js';
import { useOffline } from '../hooks/useOffline';
import { api } from '../api';

const I = (d) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const ICON = {
  sync: I(<><path d="M21 12a9 9 0 0 1-15.5 6.2" /><path d="M3 12A9 9 0 0 1 18.5 5.8" /><polyline points="21 4 21 9 16 9" /><polyline points="3 20 3 15 8 15" /></>),
  clean: I(<><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>),
  merge: I(<><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="12" r="2.5" /><path d="M8 7.5c4 1 6 2.5 7.5 4M8 16.5c4-1 6-2.5 7.5-4" /></>),
  lock: I(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
  out: I(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>),
};

// The round account button at the bottom of the sidebar.
export function AccountButton({ user, alert, onClick }) {
  const initial = String(user.name || user.email || '?').trim().charAt(0).toUpperCase();
  return (
    <button type="button" className="acct-btn" onClick={onClick} aria-label="Account and tools" title={user.email}>
      <span className="acct-avatar">{initial}{alert && <i className="acct-alert" aria-label="No recovery code yet" />}</span>
      <span className="acct-btn-text"><b>{user.name || user.email}</b><small>Account &amp; tools</small></span>
    </button>
  );
}

// Everything that used to be a row of small links in the sidebar.
export default function AccountMenu({ user, needsRecovery, onSecurity, onMerge, onSignOut, onClose }) {
  const offline = useOffline();
  const [sync, setSync] = useState('idle'); // idle | busy | done | fail
  const timer = useRef(null);
  useEscape(onClose);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function handleSync() {
    setSync('busy');
    try { await api.post('/api/sync', {}); window.dispatchEvent(new Event('ledgr:refresh')); setSync('done'); }
    catch { setSync('fail'); }
    timer.current = setTimeout(() => setSync('idle'), 3000);
  }

  // Removes uploaded images/clips that nothing refers to any more. Asks first.
  async function handleCleanup() {
    try {
      const { count, bytes } = await api.get('/api/media?orphans=1');
      if (!count) { alert('Nothing to clean up — every uploaded file is still in use.'); return; }
      const size = bytes ? ` (about ${bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`})` : '';
      if (!window.confirm(`Delete ${count} unused image/clip file${count !== 1 ? 's' : ''}${size}? They aren't attached to any trade, journal entry or certificate. This can't be undone.`)) return;
      const { deleted } = await api.del('/api/media?orphans=1');
      alert(`Removed ${deleted} unused file${deleted !== 1 ? 's' : ''}.`);
    } catch (e) { alert(`Could not clean up: ${e.message}`); }
  }

  const rows = [
    { key: 'sync', icon: ICON.sync, title: sync === 'busy' ? 'Syncing…' : sync === 'done' ? 'Synced ✓' : sync === 'fail' ? "Couldn't sync — try again" : 'Sync now', hint: 'Refresh this device with your latest saved data', run: handleSync, disabled: offline || sync === 'busy' },
    { key: 'merge', icon: ICON.merge, title: 'Merge accounts', hint: 'Bring a duplicate account into this one', run: onMerge, disabled: offline },
    { key: 'security', icon: ICON.lock, title: 'Security', hint: needsRecovery ? 'No recovery code yet — make one' : 'Password and recovery code', run: onSecurity, disabled: offline, alert: needsRecovery },
    { key: 'clean', icon: ICON.clean, title: 'Clean up unused images', hint: 'Delete uploads nothing refers to', run: handleCleanup, disabled: offline },
  ];

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card glass" role="dialog" aria-modal="true" aria-label="Account and tools" style={{ maxWidth: 420 }}>
        <div className="modal-head">
          <h3>Account</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <div className="acct-who">
            <span className="acct-avatar big">{String(user.name || user.email || '?').trim().charAt(0).toUpperCase()}</span>
            <div><b>{user.name || user.email}</b>{user.name && <small>{user.email}</small>}</div>
          </div>
          {offline && <p className="bt-fine" style={{ margin: 0 }}>You're offline — these tools come back when you're connected.</p>}
          <div className="acct-list">
            {rows.map((r) => (
              <button key={r.key} type="button" className="acct-row" onClick={r.run} disabled={r.disabled}>
                <span className="acct-ico">{r.icon}</span>
                <span className="acct-row-text"><b>{r.title}{r.alert && <i className="acct-alert inline" aria-hidden="true" />}</b><small>{r.hint}</small></span>
              </button>
            ))}
          </div>
        </div>
        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="btn btn-ghost glass bt-danger" onClick={onSignOut} disabled={offline} title={offline ? 'Signing out needs a connection' : undefined}>{ICON.out}<span style={{ marginLeft: 8 }}>Sign out</span></button>
          <button type="button" className="btn btn-ghost glass" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
