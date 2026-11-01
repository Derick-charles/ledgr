import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';

// swatch = [page background, primary accent, secondary accent] — used for the
// little previews in the switcher. meta = the browser/PWA chrome color.
export const THEMES = [
  { id: 'glass-cockpit',   name: 'Glass Cockpit',   mode: 'Dark',  meta: '#0A0C16', swatch: ['#0A0C16', '#4FD8E8', '#8B7FFF'] },
  { id: 'amber-terminal',  name: 'Amber Terminal',  mode: 'Dark',  meta: '#0B0905', swatch: ['#0B0905', '#FFB000', '#FF7A1A'] },
  { id: 'slate-daylight',  name: 'Slate Daylight',  mode: 'Light', meta: '#F1F3F8', swatch: ['#F1F3F8', '#4F46E5', '#8B5CF6'] },
  { id: 'midnight-aurora', name: 'Midnight Aurora', mode: 'Dark',  meta: '#050814', swatch: ['#050814', '#7C9CFF', '#C084FC'] },
  { id: 'synthwave',       name: 'Synthwave',       mode: 'Dark',  meta: '#0D0221', swatch: ['#0D0221', '#FF4FD8', '#22D8FF'] },
  { id: 'oled-black',      name: 'OLED Black',      mode: 'Dark',  meta: '#000000', swatch: ['#000000', '#F5F5F7', '#8E8E98'] },
];

const THEME_IDS = THEMES.map((t) => t.id);
const THEME_STORAGE_KEY = 'ledgr-theme';
const CVD_STORAGE_KEY = 'ledgr-cvd-safe';
const DEFAULT_THEME = 'glass-cockpit';

// Themes that were renamed/replaced. "Matrix" became Synthwave.
const LEGACY_THEMES = { matrix: 'synthwave' };

// Each non-default theme brings its own typefaces. They're fetched only when
// needed (and the rest quietly at idle time) so Glass Cockpit users don't pay
// for fonts they never use — but a switch still lands on a ready font.
const FONT_FAMILIES = {
  'amber-terminal':  ['IBM Plex Mono'],
  'slate-daylight':  ['Instrument Sans'],
  'midnight-aurora': ['Outfit'],
  'synthwave':       ['Tektur', 'Jura'],
  'oled-black':      ['Geist', 'Geist Mono'],
};
const FONT_URLS = {
  'amber-terminal':  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap',
  'slate-daylight':  'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap',
  'midnight-aurora': 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap',
  'synthwave':       'https://fonts.googleapis.com/css2?family=Tektur:wght@400;500;600;700;800&family=Jura:wght@400;500;600;700&display=swap',
  'oled-black':      'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap',
};

function injectFontLink(id) {
  const url = FONT_URLS[id];
  if (!url || document.querySelector(`link[data-theme-font="${id}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  link.dataset.themeFont = id;
  document.head.appendChild(link);
}

// Resolves once the theme's fonts are usable — or after a short timeout, so a
// slow network can never make the switch feel stuck.
function ensureFonts(id) {
  const families = FONT_FAMILIES[id];
  if (!families) return Promise.resolve();
  injectFontLink(id);
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const loaded = Promise.all(families.map((f) => document.fonts.load(`500 14px "${f}"`))).catch(() => {});
  const timeout = new Promise((r) => setTimeout(r, 700));
  return Promise.race([loaded, timeout]);
}

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    const migrated = LEGACY_THEMES[stored] || stored;
    return THEME_IDS.includes(migrated) ? migrated : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function readStoredCvd() {
  try {
    return localStorage.getItem(CVD_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

// Keeps the browser chrome (Android/desktop PWA title bar) matching the page.
// iOS reads its status-bar style at launch, so light/dark is set there on the
// next open rather than live (see the pre-paint script in index.html).
function syncChrome(id) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', theme.meta);
  const ios = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (ios) ios.setAttribute('content', theme.mode === 'Light' ? 'default' : 'black-translucent');
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Runs `apply` (which flips the data-theme attribute) inside a View Transition
// when the browser supports it — a real cross-fade of the whole page, including
// the animated backgrounds. Otherwise a short-lived class animates colors per
// element instead. Reduced-motion users get an instant switch.
function runThemeChange(apply) {
  const root = document.documentElement;
  if (prefersReducedMotion()) { apply(); return; }
  if (document.startViewTransition) {
    document.startViewTransition(apply);
    return;
  }
  root.classList.add('theme-switching');
  apply();
  window.setTimeout(() => root.classList.remove('theme-switching'), 650);
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme);
  const [cvdSafe, setCvdSafeState] = useState(readStoredCvd);

  // Initial paint: make sure the DOM, storage and chrome agree with state, and
  // warm the other themes' fonts once the browser is idle.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* best-effort */ }
    syncChrome(theme);
    injectFontLink(theme);
    const idle = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 1500));
    const handle = idle(() => THEME_IDS.forEach(injectFontLink));
    return () => { if (window.cancelIdleCallback && typeof handle === 'number') window.cancelIdleCallback(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cvdSafe) document.documentElement.setAttribute('data-cvd', 'true');
    else document.documentElement.removeAttribute('data-cvd');
    try { localStorage.setItem(CVD_STORAGE_KEY, String(cvdSafe)); } catch { /* best-effort */ }
  }, [cvdSafe]);

  const setTheme = useCallback(async (id) => {
    const next = THEME_IDS.includes(id) ? id : DEFAULT_THEME;
    await ensureFonts(next);
    runThemeChange(() => {
      // flushSync so React's state and the DOM attribute change in the same
      // frame the transition captures as the "new" state.
      flushSync(() => setThemeState(next));
      document.documentElement.setAttribute('data-theme', next);
      syncChrome(next);
    });
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* best-effort */ }
  }, []);

  const setCvdSafe = useCallback((on) => {
    runThemeChange(() => {
      flushSync(() => setCvdSafeState(!!on));
      if (on) document.documentElement.setAttribute('data-cvd', 'true');
      else document.documentElement.removeAttribute('data-cvd');
    });
  }, []);

  const value = useMemo(() => ({ theme, setTheme, cvdSafe, setCvdSafe, themes: THEMES }), [theme, cvdSafe, setTheme, setCvdSafe]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
