import { useEffect, useState } from 'react';
import { clickable } from '../utils/a11y.js';
import { SECTION_IDS, scrollToSection } from '../utils/sections';
import ThemeSwitcher from './ThemeSwitcher';
import AccountMenu, { AccountButton } from './AccountMenu';
import SecurityModal from './SecurityModal';
import MergeModal from './MergeModal';

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
  const [open, setOpen] = useState(false); // mobile drawer only
  const [securityOpen, setSecurityOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
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
              <AccountButton user={user} alert={!user.hasRecovery && !recoveryMade} onClick={() => { setAccountOpen(true); }} />
            </div>
          )}
          <p>No broker sync. Every trade logged by hand, on purpose.</p>
        </div>
      </aside>
      {accountOpen && user && (
        <AccountMenu
          user={user} needsRecovery={!user.hasRecovery && !recoveryMade}
          onMerge={() => { setAccountOpen(false); setOpen(false); setMergeOpen(true); }}
          onSecurity={() => { setAccountOpen(false); setOpen(false); setSecurityOpen(true); }}
          onSignOut={onSignOut} onClose={() => setAccountOpen(false)}
        />
      )}
      {mergeOpen && user && <MergeModal user={user} onClose={() => setMergeOpen(false)} />}
      {securityOpen && user && <SecurityModal user={user} onRecoveryMade={() => setRecoveryMade(true)} onClose={() => setSecurityOpen(false)} />}
    </>
  );
}
