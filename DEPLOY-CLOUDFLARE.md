# Going live on Cloudflare (free) — step by step

Do this on your laptop, in the project folder. Netlify stays live the whole time, so nothing breaks if you stop halfway.

## A. One-time setup
1. Make a free account at dash.cloudflare.com (no card needed).
2. `npm install`
3. `npx wrangler login` (a browser window opens — allow it).
4. `npx wrangler d1 create ledgr` — it prints a `database_id`. Paste it into `wrangler.toml` where it says PASTE-YOUR-DATABASE-ID-HERE.
5. `npx wrangler d1 execute ledgr --remote --file cloudflare/schema.sql`
6. `npx wrangler r2 bucket create ledgr-media` (if Cloudflare asks you to enable R2 in the dashboard first, do that — the free plan is enough).
7. Secrets (use the SAME values as on Netlify so existing logins keep working):
   - `npx wrangler secret put LEDGR_SESSION_SECRET`
   - `npx wrangler secret put LEDGR_OWNER_EMAIL`

## B. Deploy
8. `npm run deploy:cf` — builds the app and uploads it. It prints your address, like `https://ledgr.YOURNAME.workers.dev`.

## C. Copy your data (README, "step 2")
9. Log in once on the Netlify site first, then do the export, sql, load and screenshot steps. Check the counts match.

## D. Test before switching
Open the workers.dev address and check: sign in; trades and journal show; open a backtest session; add and delete a test entry; open a screenshot; reload while offline (PWA); sign in on your phone too.

## E. Switch over
- Easiest: start using the workers.dev address (on your phone, remove the old installed app and install again from the new address, since a PWA is tied to its address).
- Own domain later: Cloudflare dashboard → Workers → ledgr → Settings → Domains.
- Keep Netlify untouched for a week or two as a backup. To avoid new Netlify deploys eating credits, simply stop deploying there.

## If something goes wrong
- Blank page or "not found": rerun `npm run deploy:cf`; make sure the build made a `dist` folder.
- Data missing: rerun the load steps (safe to repeat).
- Error logs: `npx wrangler tail`.
- Login fails for old accounts: log in once on Netlify first (upgrades the password format), re-export, reload.
