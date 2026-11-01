import { useEffect, useState } from 'react';
import { clickable } from '../utils/a11y.js';
import { SECTION_IDS, scrollToSection } from '../utils/sections';
import ThemeSwitcher from './ThemeSwitcher';
import { api } from '../api';
import SecurityModal from './SecurityModal';
import MergeModal from './MergeModal';
import { useOffline } from '../hooks/useOffline';

const NAV_GROUPS = [
  { label: 'Journal', items: ['Dashboard', 'Trade Log', 'Daily Journal', 'Notebook'] },
  { label: 'Insight', items: ['Reports', 'Calendar'] },
  { label: 'Progress', items: ['Achievements'] },
];

const BACKTEST_NAV = [
  { label: 'Backtests', items: [
    { label: 'All backtests', go: () => window.dispatchEvent(new Event('ledgr:bt-home')) },
    { label: 'Challenge prep', go: () => { window.dispatchEvent(new Event('ledgr:bt-home')); setTimeout(() => scrollToSection('bt-prep'), 60); } },
  ] },
];

export default function Sidebar({ user, onSignOut, view = 'live', onViewChange }) {
  const offline = useOffline();
  const [open, setOpen] = useState(false); // mobile drawer only
  const [securityOpen, setSecurityOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [sync, setSync] = useState('idle'); // idle | busy | done | fail
  // Rebuilds the lists from the saved records, then every screen re-reads.
  async function handleSync() {
    setSync('busy');
    try { await api.post('/api/sync', {}); window.dispatchEvent(new Event('ledgr:refresh')); setSync('done'); }
    catch { setSync('fail'); }
    setTimeout(() => setSync('idle'), 3000);
  }
  const [recoveryMade, setRecoveryMade] = useState(false);
  const [activeId, setActiveId] = useState(SECTION_IDS.Dashboard);

  // Scroll-spy: highlight whichever section is currently near the top of
  // the viewport, so the active nav link tracks scroll position rather
  // than only updating on click.
  useEffect(() => {
    const ids = Object.values(SECTION_IDS);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      },
      { rootMargin: '-15% 0px -75% 0px', threshold: 0 }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  // Removes uploaded images/clips that nothing refers to any more (e.g. from
  // a save that failed part-way). Previews the count and asks first.
  async function handleCleanup() {
    try {
      const { count, bytes } = await api.get('/api/media?orphans=1');
      if (!count) { alert('Nothing to clean up — every uploaded file is still in use.'); return; }
      const size = bytes ? ` (about ${bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`})` : '';
      if (!window.confirm(`Delete ${count} unused image/clip file${count !== 1 ? 's' : ''}${size}? They aren't attached to any trade, journal entry or certificate. This can't be undone.`)) return;
      const { deleted } = await api.del('/api/media?orphans=1');
      alert(`Removed ${deleted} unused file${deleted !== 1 ? 's' : ''}.`);
    } catch (e) {
      alert(`Could not clean up: ${e.message}`);
    }
  }

  function handleNavClick(label) {
    const id = SECTION_IDS[label];
    scrollToSection(id);
    setActiveId(id);
    setOpen(false); // also closes the mobile drawer
  }

  return (
    <>
      <div className="mobile-topbar">
        <button className="hamburger-btn" onClick={() => setOpen(true)} aria-label="Open menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="brand-name">LEDGR</div>
      </div>

      <div className={`sidebar-backdrop${open ? ' open' : ''}`} onClick={() => setOpen(false)} />

      <aside className={`sidebar${open ? ' open' : ''}`}>
        <button className="sidebar-close-btn" onClick={() => setOpen(false)} aria-label="Close menu">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" />
          </svg>
        </button>

        <div className="brand">
          <div className="brand-mark"></div>
          <div className="brand-name">LEDGR</div>
        </div>

        {onViewChange && (
          <div className="view-switch" role="group" aria-label="Journal">
            <button type="button" className={view === 'live' ? 'active' : ''} aria-pressed={view === 'live'} onClick={() => { setOpen(false); view !== 'live' && onViewChange('live'); }}>Live</button>
            <button type="button" className={view === 'backtests' ? 'active' : ''} aria-pressed={view === 'backtests'} onClick={() => { setOpen(false); view !== 'backtests' && onViewChange('backtests'); }}>Backtests</button>
          </div>
        )}

        {view === 'backtests' && BACKTEST_NAV.map((group) => (
          <div key={group.label}>
            <div className="nav-label">{group.label}</div>
            {group.items.map((item) => (
              <div key={item.label} className="nav-item" {...clickable(() => { item.go(); setOpen(false); })}>{item.label}</div>
            ))}
          </div>
        ))}

        {view !== 'backtests' && NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="nav-label">{group.label}</div>
            {group.items.map((item) => (
              <div
                key={item}
                className={`nav-item${SECTION_IDS[item] === activeId ? ' active' : ''}`}
                {...clickable(() => handleNavClick(item))}
              >
                {item}
              </div>
            ))}
          </div>
        ))}

        <div className="sidebar-footer">
          <ThemeSwitcher />
          {user && (
            <div className="user-box">
              <div className="user-name" title={user.email}>{user.name || user.email}</div>
              {user.name && <div className="user-email">{user.email}</div>}
              <button type="button" className="signout-btn" onClick={handleSync} disabled={offline || sync === 'busy'}>
                {sync === 'busy' ? 'Syncing…' : sync === 'done' ? 'Synced ✓' : sync === 'fail' ? "Couldn't sync — try again" : 'Sync now'}
              </button>
              <button type="button" className="signout-btn" onClick={handleCleanup} disabled={offline}>Clean up unused images</button>
              <button type="button" className="signout-btn" onClick={() => setMergeOpen(true)} disabled={offline}>Merge accounts</button>
              <button type="button" className="signout-btn" onClick={() => setSecurityOpen(true)} disabled={offline}>
                Security{!user.hasRecovery && !recoveryMade && <span className="security-dot" title="No recovery code yet" aria-label="no recovery code yet"> ●</span>}
              </button>
              <button type="button" className="signout-btn" onClick={onSignOut} disabled={offline} title={offline ? 'Signing out needs a connection' : undefined}>Sign out</button>
            </div>
          )}
          <p>No broker sync. Every trade logged by hand, on purpose.</p>
        </div>
      </aside>
      {mergeOpen && user && <MergeModal user={user} onClose={() => setMergeOpen(false)} />}
      {securityOpen && user && <SecurityModal user={user} onRecoveryMade={() => setRecoveryMade(true)} onClose={() => setSecurityOpen(false)} />}
    </>
  );
}
