// Pure helpers for /api/trades (no storage access), kept separate so they can be unit-tested.

// "$ risked" on a trade is what makes its R-multiple real: R = P&L ÷ risk.
// Computed here (not trusted from the client) so the stored fields always
// agree. No risk entered → r is null, meaning "unknown" — never a guess.
export function normalizeRisk(body) {
  const risk = parseFloat(body.risk);
  const hasRisk = Number.isFinite(risk) && risk > 0;
  const pnl = Number(body.pnl) || 0;
  return {
    risk: hasRisk ? Math.round(risk * 100) / 100 : null,
    r: hasRisk && body.side !== 'missed' ? Math.round((pnl / risk) * 100) / 100 : null,
  };
}

// Optional time of day the trade was taken ("HH:MM", 24h, as typed — no
// timezone conversion). Anything else is stored as null.
export function cleanTime(value) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  return m ? `${m[1]}:${m[2]}` : null;
}

// Per-trade self-review: two optional 1–5 star ratings, a free-text note and
// a handful of free-form tags. Cleaned here so stored values are always in
// the expected shape whatever the client sends.
export function cleanRating(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}
export function cleanExtras(body) {
  const tags = [];
  for (const t of Array.isArray(body.tags) ? body.tags : []) {
    const clean = String(t || '').trim().slice(0, 24);
    if (clean && !tags.some((x) => x.toLowerCase() === clean.toLowerCase())) tags.push(clean);
    if (tags.length >= 8) break;
  }
  const notes = String(body.notes || '').trim().slice(0, 2000);
  return { ratingExec: cleanRating(body.ratingExec), ratingDisc: cleanRating(body.ratingDisc), notes: notes || null, tags };
}

export function mediaIds(list = []) {
  return (list || []).filter((m) => m && m.id && m.type !== 'link').map((m) => m.id);
}

// The handful of fields every "all your trades, across all time" panel
// actually reads (milestones, POI performance, timing, the backup
// reminder's "do you have any trades yet"). Keeping `mistake`/`poi` as their
// real string values (not booleans) since those get grouped/compared by
// name, not just checked for truthiness.
export function toSummaryItem(t) {
  return {
    // `risk` (not just `r`) is kept so stats.js's tradeR() — which recomputes
    // R from risk+pnl+side rather than trusting a stored number — works
    // identically against summary items as it does against full trades.
    id: t.id, accountId: t.accountId, date: t.date, pnl: t.pnl, risk: t.risk, r: t.r, side: t.side,
    mistake: t.mistake || null, poi: t.poi || null, planned: !!t.planned, time: t.time || null,
    ratingExec: t.ratingExec || null, ratingDisc: t.ratingDisc || null, tags: Array.isArray(t.tags) ? t.tags : [],
  };
}

