import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeSwitcher() {
  const { theme, setTheme, cvdSafe, setCvdSafe, themes } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const active = themes.find((t) => t.id === theme) || themes[0];

  useEffect(() => {
    if (!open) return;
    function onClickAway(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="theme-switcher" ref={rootRef}>
      <button className="theme-switcher-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="true" aria-expanded={open}>
        <span className="theme-swatch-dot" style={{ background: active.swatch[1] }} />
        <span className="theme-switcher-label">{active.name}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="theme-switcher-menu glass">
          {themes.map((t) => (
            <button
              key={t.id}
              className={`theme-switcher-item${t.id === theme ? ' active' : ''}`}
              onClick={() => { setTheme(t.id); setOpen(false); }}
            >
              <span className="theme-swatch">
                {t.swatch.map((c, i) => <span key={i} className="theme-swatch-chip" style={{ background: c }} />)}
              </span>
              <span className="theme-switcher-name">{t.name}</span>
              <span className="theme-mode">{t.mode}</span>
              {t.id === theme && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}

          <div className="theme-switcher-divider" />

          <label className="theme-switcher-item theme-cvd-toggle">
            <span className="theme-switcher-name">Color-blind-safe mode</span>
            <input
              type="checkbox" checked={cvdSafe}
              onChange={(e) => setCvdSafe(e.target.checked)}
            />
            <span className="theme-cvd-switch" aria-hidden="true" />
          </label>
        </div>
      )}
    </div>
  );
}
