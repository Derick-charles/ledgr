// LEDGR service worker.
//
// Two jobs:
//   1. Make the app installable and let it OPEN with no connection (the app
//      shell: HTML, JS, CSS, icons, fonts).
//   2. Keep a copy of the data you've looked at, so your journaled trades can
//      be READ offline. Nothing is ever written offline — the app itself
//      blocks saving while there's no connection (see src/utils/connection.js).
//
// Online, everything is NETWORK-FIRST: you always get what's really on the
// server, and the saved copy is only a fallback when the network fails or
// stalls. (Not stale-while-revalidate — that would keep showing you an old
// answer for one more load even when you're online.)
//
// Privacy: the saved data belongs to whoever is signed in. It is wiped on
// sign-out, when someone else signs in, and whenever the server says the
// session has ended (a 401).
//
// Answers served from the saved copy carry `x-ledgr-saved: 1`, which is how
// the app knows it is showing saved data and should go read-only.
const SHELL = 'ledgr-shell-v4'; // HTML, hashed JS/CSS, icons, fonts
const DATA = 'ledgr-data-v1';   // GET /api/* answers
const MEDIA = 'ledgr-media-v1'; // screenshots / certificate files (immutable by id)
const KEEP = [SHELL, DATA, MEDIA];

const API_TIMEOUT_MS = 8000;   // a saved copy exists → stop waiting on a stalled network after this
const PAGE_TIMEOUT_MS = 5000;
const MAX_SHELL_ENTRIES = 120;
const MAX_MEDIA_ENTRIES = 80;

// ---- helpers --------------------------------------------------------------

function withSavedHeader(response) {
  const headers = new Headers(response.headers);
  headers.set('x-ledgr-saved', '1');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function clearUserData() {
  await Promise.all([caches.delete(DATA), caches.delete(MEDIA)]);
}

// Network first; if the network fails (or takes too long and a saved copy
// exists), answer from the saved copy.
async function networkFirst(event, request, cacheName, key, timeoutMs, onResponse) {
  const cache = await caches.open(cacheName);
  const network = fetch(request).then(async (res) => {
    if (onResponse) await onResponse(res.clone(), cache, key);
    else if (res.ok && res.status === 200) await cache.put(key, res.clone());
    return res;
  });
  const saved = await cache.match(key);
  if (!saved) return network; // nothing to fall back to — behave like a normal request
  try {
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const res = await Promise.race([network, timeout]);
    if (res) return res;
    // Too slow: show the saved copy now, but let the real request finish so the
    // copy refreshes for next time.
    event.waitUntil(network.catch(() => {}));
    return withSavedHeader(saved);
  } catch {
    return withSavedHeader(saved);
  }
}

// ---- install: save the app shell so the very first offline open works -----

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(SHELL);
      const res = await fetch('/index.html', { cache: 'reload' });
      if (!res.ok) return;
      const html = await res.clone().text();
      await cache.put('/index.html', res);
      const urls = new Set(['/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png']);
      for (const m of html.matchAll(/["'(](\/assets\/[^"')\s]+)/g)) urls.add(m[1]);
      await Promise.all([...urls].map((u) => cache.add(u).catch(() => {})));
    } catch { /* offline during install — the shell is saved on first online load instead */ }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'clear-data') event.waitUntil(clearUserData());
  // After a successful save the page tells us which address changed, so the
  // saved copy of it can never be served in place of the fresh one.
  if (event.data && event.data.type === 'forget' && typeof event.data.path === 'string') {
    event.waitUntil((async () => {
      const cache = await caches.open(DATA);
      const keys = await cache.keys();
      await Promise.all(keys.filter((k) => new URL(k.url).pathname === event.data.path).map((k) => cache.delete(k)));
    })());
  }
});

// ---- fetch ----------------------------------------------------------------

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // saves, uploads, deletes always go straight to the network
  if (request.headers.has('range')) return; // video seeking — can't be cached

  const url = new URL(request.url);

  // Fonts: save after first use (stale-while-revalidate is fine, they never change).
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const saved = await cache.match(request);
      const fresh = fetch(request).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
        return res;
      }).catch(() => saved);
      if (saved) { event.waitUntil(fresh); return saved; }
      return fresh;
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    // Never keep whole-account backups or bulk maintenance answers.
    if (url.pathname === '/api/backup' || url.searchParams.has('orphans')) return;

    // Screenshots: a file's id never changes what it contains → saved copy first.
    if (url.pathname === '/api/media' && url.searchParams.has('id')) {
      event.respondWith((async () => {
        const cache = await caches.open(MEDIA);
        const saved = await cache.match(url.href);
        if (saved) return saved;
        const res = await fetch(request);
        if (res.ok && res.status === 200) {
          await cache.put(url.href, res.clone());
          event.waitUntil(trim(MEDIA, MAX_MEDIA_ENTRIES));
        }
        return res;
      })());
      return;
    }

    // Everything else: network first, data saved for offline reading.
    const onResponse = async (res, cache, key) => {
      if (res.status === 401) { await clearUserData(); return; }
      if (url.pathname === '/api/auth') {
        // Only a signed-in answer is worth keeping; a signed-out one means the
        // saved data no longer belongs to anyone.
        let signedIn = false;
        try { signedIn = (await res.clone().json()).authenticated === true; } catch { /* ignore */ }
        if (signedIn && res.ok) await cache.put(key, res);
        else { await clearUserData(); }
        return;
      }
      if (res.ok && res.status === 200) await cache.put(key, res);
    };
    event.respondWith(networkFirst(event, request, DATA, url.href, API_TIMEOUT_MS, onResponse));
    return;
  }

  // Page loads (any route is the same single-page app).
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const network = fetch(request).then((res) => {
        if (res.ok) cache.put('/index.html', res.clone());
        return res;
      });
      const saved = await cache.match('/index.html');
      if (!saved) return network;
      try {
        const timeout = new Promise((resolve) => setTimeout(() => resolve(null), PAGE_TIMEOUT_MS));
        return (await Promise.race([network, timeout])) || saved;
      } catch { return saved; }
    })());
    return;
  }

  // Built files have a hash in their name, so a saved copy can never be stale.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const saved = await cache.match(request);
      if (saved) return saved;
      const res = await fetch(request);
      // (a missing file is answered with the app's HTML page — never keep that as a script)
      const isHtml = (res.headers.get('content-type') || '').includes('text/html');
      if (res.ok && res.status === 200 && !isHtml) {
        await cache.put(request, res.clone());
        event.waitUntil(trim(SHELL, MAX_SHELL_ENTRIES));
      }
      return res;
    })());
    return;
  }

  // Icons, manifest, anything else static: network first, saved copy as fallback.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && res.status === 200) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(request, copy)); }
        return res;
      })
      .catch(() => caches.open(SHELL).then((c) => c.match(request)).then((r) => r || Response.error()))
  );
});
