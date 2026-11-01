# LEDGR — handoff note (read this first)

## What this is
Derick's personal trading journal. React + Vite frontend, backend in `netlify/functions/` (Lambda-style `handler(event)` functions) storing data through `@netlify/blobs`. Multi-user email/password auth, installable PWA (offline read-only). Derick is not a developer: give exact copy-paste commands, send changes back as a zip.

## Features built so far (v16–v26)
Live | Backtests sidebar switch; backtest sessions with entries (gallery cards, details modal, edit/delete, multiple timeframes, Long/Short/Missed/Breakeven), per-session prop-firm rules + self-ticking readiness checklist, one/two-step challenge simulation with per-phase status, close/reopen/new session, home panel pooling all sessions; Days|Months P&L calendar (live + backtest); page/card animations; device sync (`/api/sync`, "Sync now"); duplicate-proof sign-up and merge-accounts tool (`/api/merge`); stale-data fix via `src/utils/recentWrites.js`.

## Current goal: leave Netlify (credits run out on deploys) for Cloudflare free tier
Workers + D1 + R2, static app served by the same Worker. UI unchanged, web/PWA only (no mobile app).
- **Step 1 DONE (v26):** `cloudflare/blobs-shim.js` (D1/R2 stand-in for @netlify/blobs, batches reads/writes to stay under ~50 D1 calls/request), `cloudflare/worker.js` (turns requests into Lambda events for the 14 handlers), `cloudflare/schema.sql`, `wrangler.toml` (alias @netlify/blobs -> shim, `[assets]` SPA fallback, `run_worker_first=["/api/*"]`), `public/_headers`. Checked only with fake D1/R2: `ESBUILD=<esbuild path> node cloudflare/check/run.mjs` (all pass, max 8 DB calls/request). NEVER run on real Cloudflare yet.
- **Step 2 DONE (v27, `cloudflare/migrate/`; export, sql, README steps; tested locally only):** originally: migration script copying real data from Netlify Blobs to D1/R2. Stores: trades, journal, certificates, settings, lessons, media (binary -> R2 key `media/<key>`, metadata in D1 `meta`), users, summaries, backtests. D1 table: `blobs(store,key,value,meta)`. Derick must run it himself (needs his Netlify site ID + token); write it as a Node script that exports JSON, plus an import via `wrangler d1 execute`/a Worker import endpoint. Mind D1 limits: 100 bound params/query, 2MB per row.
- **Step 3 TODO:** deploy (README has setup commands), set secrets `LEDGR_SESSION_SECRET` and `LEDGR_OWNER_EMAIL`, verify, cut over; keep Netlify until he is happy. Real `npm run build` (Vite) has never been run in the dev sandbox — run it on deploy.

## Rules / gotchas
- Do NOT use `consistency:'strong'` with Netlify Blobs (broke production: "uncachedEdgeURL").
- Passwords: PBKDF2-SHA256 100k (WebCrypto). Old scrypt hashes verify and upgrade on login, so Derick should log in once on Netlify before cutover. Recovery-code hashes stay scrypt.
- Backtest maths lives in `netlify/functions/_backtest-utils.js`, shared by server and client.
- `npm test` needs `npm install` first (tests import `@netlify/blobs`); ~74 tests.
- Service worker `public/sw.js` caches the shell (v4); keep its `request.method !== 'GET') return` line (a test checks it).
- Reminders for Derick: make a recovery code (Sidebar -> Security).
