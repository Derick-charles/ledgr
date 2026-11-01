import { stores, json } from './_blobs.js';
import { protect } from './_auth.js';
import { writeSummary } from './_summary.js';
import { toSummaryItem as tradeSummary } from './_trade-utils.js';
import { buildFullItemsFor } from './trades.js';
import { buildFullEntriesFor, toSummaryItem as journalSummary } from './journal.js';
import { toSummary as backtestSummary } from './_backtest-utils.js';

// POST /api/sync — "Sync now". The lists the app shows (trades, journal days,
// backtest sessions) are read from small summary records for speed. If one of
// those ever fell out of step with the real saved records (two devices saving
// at nearly the same moment, say), this rebuilds them from the records
// themselves. Only the signed-in person's own data is touched.
export const handler = protect(async (event, ctx) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { trades, journal, backtests, summaries } = stores(event);
  let tradeCount = 0, journalCount = 0;

  for (const accountId of ctx.accountIds) {
    const t = (await buildFullItemsFor(trades, accountId)).map(tradeSummary);
    await writeSummary(summaries, 'trades', accountId, t);
    tradeCount += t.length;
    const j = (await buildFullEntriesFor(journal, accountId)).map((e) => journalSummary(e, e.dateId));
    await writeSummary(summaries, 'journal', accountId, j);
    journalCount += j.length;
  }

  const prefix = `${ctx.user.id}/`;
  const { blobs } = await backtests.list();
  const sessions = (await Promise.all(blobs.map((b) => b.key).filter((k) => k.startsWith(prefix)).map((k) => backtests.get(k, { type: 'json' })))).filter(Boolean);
  await writeSummary(summaries, 'backtests', `u:${ctx.user.id}`, sessions.map(backtestSummary));

  return json(200, { accounts: ctx.accountIds.length, trades: tradeCount, journalDays: journalCount, sessions: sessions.length });
}, { account: 'none' });
