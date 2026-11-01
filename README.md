# LEDGR — trading journal (Netlify edition)

A manual-first, privacy-first trading journal. No broker sync, no auto-import
— every trade logged by hand, on purpose.

This version has **no Firebase** — it's built to run
entirely on Netlify:

- **Frontend** — React + Vite, same UI as before.
- **Backend** — [Netlify Functions](https://docs.netlify.com/functions/overview/)
  under `netlify/functions/`, exposed at `/api/*`.
- **Data storage** — [Netlify Blobs](https://docs.netlify.com/blobs/overview/),
  Netlify's built-in key-value/object store. No database to provision, no
  connection string, no separate service — it's automatically available to
  every Netlify Function on your site.

## Users (sign-up & login)

People sign up with an email and password and each gets their own journal.
Naming: a **user** is a login; the **accounts** in the app (Personal, Funded
50K…) are trading accounts, and each belongs to exactly one user. Every
endpoint checks that the requested account belongs to the signed-in user, so
one user can't read or change another's trades, journal or images.

- **Your existing data** goes to the first person who signs up. To be sure
  that's you, set `LEDGR_OWNER_EMAIL` (below) *before* sharing the URL.
- Optional environment variables (Netlify → Site configuration → Environment variables):
  - `LEDGR_OWNER_EMAIL` — only this email can take over the pre-existing data.
  - `LEDGR_ALLOW_SIGNUP=false` — close sign-ups once everyone you want has registered.
  - `LEDGR_SESSION_SECRET` — optional; otherwise a random secret is generated and stored.
- Passwords are hashed (scrypt); sessions are signed HttpOnly cookies (30 days);
  5 wrong passwords lock that email for 15 minutes.
- **Forgot your password?** There's no email reset, so each account has a
  **recovery code** (shown once at sign-up; make a new one any time in
  Sidebar → Security). "Forgot your password?" on the sign-in screen takes
  email + recovery code + new password, and issues a fresh code.
- **Security panel** (Sidebar → Security): change password, **sign out other
  devices** (ends every other session immediately, instead of waiting 30
  days), make a recovery code, and — for the owner — checks that
  `LEDGR_OWNER_EMAIL` and `LEDGR_SESSION_SECRET` are set.
- Changing the password or resetting it also signs out every other device.

## Install as an app & offline use

LEDGR is a PWA: open it in Chrome/Safari and use **Add to Home screen / Install app**.

- **Offline = view only.** Anything you have already opened (this month's trades, journal days, the all-time panels, screenshots, certificates) is saved on the device and can be read with no connection. Adding, editing and deleting are switched off until you're back online; the app says so in a strip at the top.
- **Only what you've viewed is saved.** A month you never opened won't be there offline. Open the months you care about once while online.
- **Weak signal counts as offline.** If the server doesn't answer within about 8 seconds and a saved copy exists, the app shows the saved copy and goes read-only; it unlocks itself when a real answer arrives (or tap "Try again").
- **Always up to date when online.** Online, every request goes to the server first; the saved copy is only a fallback.
- **Privacy.** The saved copy is wiped on sign-out, when a different person signs in, and when the session ends. Backup downloads are never saved. Signing out needs a connection (otherwise you'd just be signed back in).
- **Updating.** New deploys reach installed copies on the next open (the service worker is served with `no-cache`).

## 1. Install dependencies

```bash
npm install
```

## 2. Run it locally

Plain `vite dev` won't work fully on its own here, because `/api/*` needs to
be served by Netlify Functions, not Vite. Use the Netlify CLI instead — it
runs Vite *and* your functions together, with the same redirects your live
site will use:

```bash
npx netlify dev
```

This opens the app at `http://localhost:8888` (not 5173) with `/api/*`
already wired up and Netlify Blobs working locally out of the box — no
environment variables, no login, nothing to configure.

## 3. Deploy to Netlify

The easiest path, and the one that avoids every CLI/OAuth headache:

1. Push this project to a GitHub (or GitLab/Bitbucket) repo.
2. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** →
   **Import an existing project** → pick the repo.
3. Netlify will auto-detect the build settings from `netlify.toml`
   (`npm run build`, publish directory `dist`, functions in
   `netlify/functions`) — just click **Deploy**.
4. That's it. No environment variables to set, no database to create.
   Netlify Blobs is provisioned automatically for the site the first time a
   function writes to it.

Prefer the CLI instead? `npx netlify init` then `npx netlify deploy --prod`
works too, once you're logged in (`npx netlify login`).

## How data is stored

Every "collection" is a separate Netlify Blobs store, written to by the
matching function:

| Function | Store | What it holds |
|---|---|---|
| `trades.js` | `trades` | One record per logged trade |
| `journal.js` | `journal` | One record per calendar day (mindset, notes, checklist state, affirmations, media refs) |
| `certificates.js` | `certificates` | Funded/payout certificates |
| `checklist.js` | `settings` | The editable Trade Checklist template |
| `lessons.js` | `lessons` | One record per week (Weekly Lessons free-text fields) |
| `media.js` | `media` | Raw image/video bytes for everything above |

Data persists across deploys automatically — Netlify Blobs stores are
site-scoped, not tied to any one deploy.

## Known limits, worth knowing

- **~4.5MB per uploaded file.** Netlify Functions (the classic/Lambda-
  compatible kind used here) cap request and response bodies at 6MB, and
  base64 encoding inflates a file by about a third — so raw files need to
  stay under ~4.5MB. This is lower than Firebase Storage's old 25MB limit.
  If this becomes a real constraint, the fix is switching `media.js` to a
  [Netlify Edge Function](https://docs.netlify.com/edge-functions/overview/)
  or [Background Function](https://docs.netlify.com/functions/background-functions/),
  which aren't bound by that same payload cap.
- **No realtime sync.** Firestore's `onSnapshot` gave live updates across
  tabs/devices for free; plain HTTP functions don't. The app refetches after
  every save, so a single tab always reflects its own changes immediately —
  it just won't auto-update if you have the journal open in two tabs at
  once.
- **No auth, by design.** See above — add a password gate if you deploy this
  somewhere less private than a personal link.

## Project structure

```
netlify/functions/     Backend API (Netlify Functions, /api/*)
  _blobs.js             Shared Blobs store + media-resolving helpers
  trades.js             GET/POST /api/trades
  journal.js             GET/PUT  /api/journal (single day, range, or streak keys)
  certificates.js        GET/POST/DELETE /api/certificates
  checklist.js           GET/PUT  /api/checklist
  lessons.js              GET/PUT  /api/lessons
  media.js                GET/POST/DELETE /api/media (binary upload/serve)
src/
  api.js                 fetch() wrapper + File→base64 helper used by every hook
  hooks/                  One hook per resource above, same shape as before
  components/, pages/, utils/, styles/   Unchanged UI layer
netlify.toml            Build settings + /api/* → functions redirect
```

## Backups (please use these)

Netlify Blobs has **no built-in versioning or point-in-time restore** — deleted
is deleted. So LEDGR has its own:

- **Manage Accounts (gear icon, top bar) → download icon** next to an account
  saves a `.json` backup of that account's trades, journal entries,
  certificates, checklist, tags, and weekly lessons.
- **Upload icon** restores from a backup file into that account. Restore only
  adds/overwrites records in the file — it never deletes what's already there.
- Uploaded image/video *files* are not inside the backup (only their
  references), to keep backups small.
- Deleting an account now shows exactly how many trades/entries will be lost
  and requires typing the account's name to confirm.

Worth downloading a backup every week or so.

## Themes

Pick one from the switcher at the bottom of the sidebar (Glass Cockpit, Amber
Terminal, Slate Daylight, Midnight Aurora, Synthwave, OLED Black), plus a
colour-blind-safe toggle that works on top of any of them.

Each theme is a full design, not a tint: `src/styles/global.css` holds every
theme's tokens (colours, fonts, corner radii, blur, shadows, accent fill) and
`src/styles/themes.css` holds the per-theme styling (backgrounds, headings,
nav, buttons). Fonts load on demand. Switching cross-fades (View Transitions,
with a fallback) and respects "reduce motion". Anyone who had the old Matrix
theme is moved to Synthwave automatically.

## Tests

`npm test` runs the unit tests (Node's built-in runner, nothing extra to
install). They cover the R-multiple maths, stats/streak/milestone logic, CSV
quoting and filters, the challenge tracker maths (static/trailing/end-of-day
drawdown), server-side input cleaning, and image compression's skip rules.

## Recent changes

- **Account recovery & sessions** — recovery codes, forgot-password reset,
  change password, sign out everywhere, setup checks (see Users above).
- **Keyboard access** — chips, calendar days, drop zones, nav links and other
  clickable boxes can now be reached with Tab and used with Enter/Space;
  dialogs close with Escape. Calendar days announce their date and P&L.

- **Trade review** — rate each trade's Execution and Discipline (1–5★), add
  trade notes and up to 8 free-form tags. They show in Recent Trades (new
  Review column), the day popup, CSV export and filters, and a new
  "Ratings & Tags" report compares your self-grades with real results.
- **Prop-firm challenge tracker** — tick "This is a prop-firm challenge
  account" when creating an account (or press "Challenge" on an existing one).
  Set size, profit target, daily loss and max drawdown ($ or %), drawdown type
  (static / trailing / end-of-day trailing), minimum days and a deadline. The
  dashboard shows progress to target, today's loss limit, drawdown room,
  trading days and status. "Check balance" matches it to your firm's real
  balance; "Mark passed" / "Start next phase" builds the Phase 1 → Phase 2 →
  Funded sequence. It is built from logged trades and can't see open
  (floating) losses.

- **Faster, cheaper loads** — all-time panels (Milestones, POI Performance,
  Timing, streak, backup reminder) now read one small per-account summary
  (`summaries` store) instead of every trade/journal day ever logged. The
  month view fetches only that month's trades in full. The summary is built
  automatically the first time an account loads after upgrading, and kept in
  step on every save/edit/delete/restore. Login + account checks are cached
  for ~10 seconds per warm function instance.
- **Visible errors** — a banner shows when you're offline or a request fails
  (with Retry), requests time out after 20s instead of hanging, and a failed
  delete now says so instead of failing silently.

- **Edit trades** — pencil icon on any row in Recent Trades, or in a day's
  detail popup. Fix a typo without deleting; attached images are kept, and
  any you remove in the editor are deleted from storage. (Per-account view
  only — "All Accounts" is view/delete.)
- **Real R-multiple** — new optional **$ Risked** field on each trade.
  R = P&L ÷ $ risked. Trades without it show "—" and are left out of Avg R
  (the old R was a placeholder of P&L ÷ 200). Edit older trades to add it;
  the last $ risked you used is pre-filled on new trades.
- **Month navigation** — ‹ › above the stats browse past months; stats,
  equity curve, calendar, trades and reports follow. The Daily P&L calendar
  now fits its column (Week column no longer cut off).

- **Weekly Lessons history** — ‹ › steps back through past weeks; each week
  shows its own trades summary, auto-calculated biggest mistake and your notes.
- **Search, filter & export** — Recent Trades can search (symbol, POI, mistake,
  notes), filter by side / win-loss / POI / mistake, switch between the viewed
  month and all time, and export what's shown to CSV.
- **Trade time** — optional time on each trade, plus a Timing panel with win
  rate by weekday and by hour. Buckets under 5 trades are dimmed and labelled
  "small sample".

- **Mistake cost** — Mistake Frequency now shows the net P&L of each tagged
  mistake and can rank by Count or Cost.
- **Backup reminder** — a banner appears when an account with trades hasn't
  been backed up for 14 days (or ever). "Remind me later" snoozes it 3 days.
- **Screenshot compression** — images are shrunk in the browser (max 2400px,
  JPEG) before upload, so the 4.5MB limit now mainly affects video clips.
- **Unused-image cleanup** — failed trade saves delete the files they
  uploaded, and "Clean up unused images" (sidebar) removes older leftovers
  that nothing refers to. Files under an hour old are never touched.
- **Quick log** — symbol, side and P&L only (the default on phones). Quick
  trades are flagged "needs details" and can be filtered and finished later
  via Edit.

## Backtest journal

Use the **Live | Backtests** switch at the top of the sidebar. Backtests are a separate, per-user library (not tied to any trading account).

- **Sessions:** `+ New session` → name, month and year, strategy, risk per trade, and the **prop firm rules** for that session (firm, profit target, max drawdown, daily loss, trailing/static). New sessions start from the default rules in the E8 panel. An optional preview image or short clip (up to ~4.5 MB) can be added. A missed trade is kept for review but left out of every number; breakeven counts as a trade at 0R.
- **Entries:** open a session and press `+ New entry`. Entries show as gallery cards; tap one for its full details, with **Edit** and **Delete** buttons (hidden while offline). Each has date, time, symbol, direction (**Long, Short, Missed trade or Breakeven**), **timeframes** (tap several in top-down order, M1–W1, plus custom ones), entry/stop/exit prices, result in R (worked out from the prices if left empty), setup, "followed my rules", notes and up to 2 screenshots. `Save & add another` keeps the date/symbol/timeframe for quick logging.
- **Everything is worked out from the entries:** win rate, net R, expectancy, max drawdown, R curve, "Would this have passed?" and a simulation (2000 replayed runs; an estimate, not a promise).
- **Challenge simulation (per session):** choose **One step** or **Two step** when creating a session (phase 2 has its own target / drawdown / daily rules, default 5% target). Entries are walked through in date order like a real account: each phase starts on a fresh balance; reaching its target passes it and the next phase begins with the next entry; breaking the drawdown or daily limit ends the attempt. You see each phase's status (passed on a date, in progress, failed and why).
- **Readiness checklist (ticks itself, per phase):** drawdown inside the limit · worst day inside the limit · profit target reached — three lines for each phase — plus positive expectancy and rules followed on 90%+ of entries.
- **Closing a session:** when every box is ticked a **Close session** button appears. A closed session is locked (entries can't be added or changed; notes still can) and offers **Start a new session**, which begins with the same strategy, risk and rules. Reopen it any time.
- **Home panel pools every session:** total entries, win rate, net result and expectancy across all sessions, and for each check how many sessions meet it.
- **Import:** the optional "Import many entries" box takes one `date, R` per line (e.g. `2023-03-14, 1.8`); lines are added as entries. Max 3000 entries per session.
- Works offline in read-only mode, like the rest of the app. Backtests are **not** included in the per-account backup/restore.

## Fresh data after saving

Netlify Blobs reads are "eventually consistent": a read right after a save can return the previous version for a short while. (Requesting `consistency: 'strong'` does NOT work with this app's function format — Netlify answers "uncachedEdgeURL has not been configured" — so don't add it.) Instead, the backtest pages take the record the server returns from each save and use it directly instead of re-reading the list, API answers carry `Cache-Control: no-store`, and after each save the page tells the service worker to drop its saved copy of that address.

## Using LEDGR on several devices

Everything is saved on the server under your account, so your phone and laptop show the same journal as long as you're signed in with the **same email** and viewing the **same trading account** (check the account switcher). Each device re-reads quietly when you come back to the app and about once a minute while it's open. **Sidebar → Sync now** rebuilds the lists from the saved records (`POST /api/sync`) and refreshes every screen — use it if two devices ever disagree.

## One account per email, and merging two accounts

- **No duplicates:** a user's id (and their first trading account's id) are worked out from their email, so even if two sign-ups race each other they end up on the SAME records instead of becoming two accounts. Emails ignore capital letters and spaces.
- **Merging accounts that already split:** sign in to both accounts at once (two devices, or one normal and one private window). On the account to retire: **Sidebar → Merge accounts → "This is the account to retire"** shows a one-time code (15 minutes). On the account to keep: **Merge accounts → "This is the account to keep"** and enter the code. All trading accounts (trades, journal, certificates…), backtest sessions and uploaded files move to the kept account, and the retired account is deleted. A code can only be made from inside the account it retires, so nobody can pull in someone else's data.

## P&L calendars and motion

- **Live journal:** the Daily P&L panel has a **Days | Months** toggle. Months shows the year's twelve totals (★ marks the best month); tap a month to jump to its days. Month totals come from the light all-time trade summary, so no extra reads.
- **Backtest journal:** a P&L calendar in R with the same toggle — on the home screen pooled across every session, and inside each session. Daily totals ride along in each session's summary (most recent 400 days).
- **Motion:** page/card entrances, staggered galleries, calendar and month-tile transitions, modal pop-in, checklist tick pop and the R-curve reveal are CSS-only. They switch off automatically when the device is set to "reduce motion".

## Cloudflare (free) hosting — step 1: backend

`cloudflare/` holds a version of the backend that runs on Cloudflare Workers + D1 (database) + R2 (screenshots). The app code is unchanged; `wrangler.toml` swaps `@netlify/blobs` for `cloudflare/blobs-shim.js`. Netlify keeps working as before.

Local check (no Cloudflare account needed): `ESBUILD=<path to esbuild> node cloudflare/check/run.mjs`

Setup (when you are ready to deploy): `npx wrangler login`, `npx wrangler d1 create ledgr` (paste the id into `wrangler.toml`), `npx wrangler d1 execute ledgr --remote --file cloudflare/schema.sql`, `npx wrangler r2 bucket create ledgr-media`, `npx wrangler secret put LEDGR_SESSION_SECRET`, `npx wrangler secret put LEDGR_OWNER_EMAIL`, `npm run build`, `npx wrangler deploy`.
Log in once on Netlify before cutover so old password hashes upgrade (recovery-code hashes stay as they are).

## Cloudflare — step 2: copy your data from Netlify

Nothing on Netlify is changed or deleted; you can repeat this as often as you like (it overwrites on Cloudflare).

1. **Get two values from Netlify.** Site ID: Netlify → your site → Site configuration → Site ID. Token: Netlify → User settings → Applications → Personal access tokens → New token.
2. **Export** (from the project folder, after `npm install`):
   - Mac/Linux: `NETLIFY_SITE_ID=xxxx NETLIFY_AUTH_TOKEN=yyyy node cloudflare/migrate/migrate.mjs export`
   - Windows PowerShell: `$env:NETLIFY_SITE_ID="xxxx"; $env:NETLIFY_AUTH_TOKEN="yyyy"; node cloudflare/migrate/migrate.mjs export`

   It prints how many records each store has — keep that list.
3. **Make the Cloudflare files:** `node cloudflare/migrate/migrate.mjs sql`
4. **Load the records** (after the Cloudflare setup commands above): for every file in `migration-data/sql/` run `npx wrangler d1 execute ledgr --remote --file migration-data/sql/part-001.sql` (then `part-002.sql`, …).
5. **Load the screenshots:** `sh migration-data/upload-media.sh` (Windows: run it in Git Bash or WSL).
6. **Check:** `npx wrangler d1 execute ledgr --remote --command "SELECT store, COUNT(*) FROM blobs GROUP BY store"` — the numbers should match step 2.

Delete the token on Netlify afterwards, and don't share `migration-data/` (it contains your whole journal and password hashes).

## v29 interface polish
Roomier spacing (sessions ↔ calendar, cards, detail page); on desktop an open session's entries run full width below the stats; click a day with entries in a session's P&L calendar to show only that day (click again or "Show all" to clear); click a screenshot in an entry to view it large (arrow keys / Esc); session cards show a progress strip per phase toward the profit target (green passed, red failed).

## v30
The backtest P&L calendar has a **Week** column (that week's total in R). The sidebar's account links (Sync now, Merge accounts, Security, Clean up unused images, Sign out) now live in one **Account** button at the bottom of the sidebar that opens a window; an amber dot on it means no recovery code has been made yet. "Show all" in the day filter is a proper button. (The live journal calendar already had week totals.)
