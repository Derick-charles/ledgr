// Backtest maths and input cleaning. Pure (no Node-only imports) so the SAME
// file runs on the server (to clean and store a backtest) and in the browser
// (to show the numbers and run the "would this have passed?" simulation).
//
// Everything is measured in R (multiples of the risk taken on a trade). To
// turn R into account percent, multiply by the risk per trade:
// 6.2R of drawdown at 0.5% risk per trade = 3.1% of the account.

export const MAX_RESULTS = 3000;
export const STATUSES = ['validated', 'review', 'rejected'];
export const DD_TYPES = ['trailing', 'static'];

export const DEFAULT_RULES = { firm: 'E8', target: 6, maxDD: 4, daily: 3, ddType: 'trailing' };
export const DEFAULT_PREP = {
  rules: DEFAULT_RULES,
  startDate: '',        // YYYY-MM-DD the real challenge begins; '' = not set yet
  perWeek: 3,           // planned backtests per week
  checks: { risk: false, stop: false, demo: false }, // the manual readiness items
};

const round = (n, d = 2) => { const f = 10 ** d; return Math.round((n + Number.EPSILON) * f) / f; };

// ---- reading pasted trade results -----------------------------------------
//
// One trade per line: "2023-03-14, 1.8". Commas, semicolons, tabs and spaces
// all work as separators, a trailing "R" is fine ("1.8R"), a minus sign can be
// "-" or "−", and a header line like "date, r" is ignored. A line with only a
// number is a trade with no date (each counts as its own day).
const DATE_RE = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/;

function validDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function parseResults(text) {
  const results = [];
  const skipped = [];
  const lines = String(text || '').split(/\r?\n/);
  let first = true;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const isFirst = first; first = false;
    if (isFirst && /^[a-z\s,;\t_-]+$/i.test(line)) continue; // a header row like "date, r"
    let date = null;
    let rest = line.replace(/−/g, '-');
    const m = DATE_RE.exec(rest);
    if (m) {
      const y = +m[1], mo = +m[2], d = +m[3];
      if (!validDate(y, mo, d)) { skipped.push(line); continue; }
      date = `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      rest = rest.replace(m[0], ' ');
    }
    const num = /[-+]?\d+(?:\.\d+)?/.exec(rest);
    const r = num ? Number(num[0]) : NaN;
    if (!Number.isFinite(r) || Math.abs(r) > 100) { skipped.push(line); continue; }
    results.push([date, round(r, 3)]);
    if (results.length >= MAX_RESULTS) break;
  }
  return { results, skipped };
}

// ---- statistics -------------------------------------------------------------

// Trades are [date|null, r]. Order matters for drawdown, so they are used in
// the order given (dated trades sorted oldest first, undated ones keep their place).
export function orderResults(results) {
  const dated = results.every((t) => t[0]);
  return dated ? [...results].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) : results;
}

export function dailyTotals(results) {
  const days = new Map();
  let undated = 0;
  for (const [date, r] of results) {
    const key = date || `#${undated++}`;
    days.set(key, (days.get(key) || 0) + r);
  }
  return [...days.values()];
}

export function computeStats(results) {
  const rs = orderResults(results);
  const trades = rs.length;
  if (!trades) return { trades: 0, wins: 0, losses: 0, winRate: 0, netR: 0, expectancy: 0, maxDDR: 0, lowR: 0, worstDayR: 0, bestDayR: 0, avgWinR: 0, avgLossR: 0, profitFactor: 0, firstDate: null, lastDate: null };

  let eq = 0, peak = 0, maxDD = 0, low = 0, wins = 0, losses = 0, sumWin = 0, sumLoss = 0;
  for (const [, r] of rs) {
    eq += r;
    if (eq > peak) peak = eq;
    if (peak - eq > maxDD) maxDD = peak - eq;
    if (eq < low) low = eq;
    if (r > 0) { wins++; sumWin += r; } else if (r < 0) { losses++; sumLoss += -r; }
  }
  const days = dailyTotals(rs);
  const dates = rs.map((t) => t[0]).filter(Boolean);
  return {
    trades, wins, losses,
    winRate: round((wins / trades) * 100, 1),
    netR: round(eq),
    expectancy: round(eq / trades),
    maxDDR: round(maxDD),     // biggest fall from a previous high (trailing-style drawdown)
    lowR: round(-low),        // deepest point below the starting balance (static-style drawdown)
    worstDayR: round(Math.max(0, -Math.min(0, ...days))),
    bestDayR: round(Math.max(0, ...days)),
    avgWinR: wins ? round(sumWin / wins) : 0,
    avgLossR: losses ? round(sumLoss / losses) : 0,
    profitFactor: sumLoss ? round(sumWin / sumLoss) : (sumWin ? 99 : 0),
    firstDate: dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null,
    lastDate: dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null,
  };
}

// ---- checking against a prop firm's rules -----------------------------------

export function evaluate(stats, riskPct, rules = DEFAULT_RULES) {
  const risk = Number(riskPct) || 0;
  const ddR = rules.ddType === 'static' ? stats.lowR : stats.maxDDR;
  const maxDDPct = round(ddR * risk, 2);
  const worstDayPct = round(stats.worstDayR * risk, 2);
  const ddOk = maxDDPct <= rules.maxDD;
  const dailyOk = worstDayPct <= rules.daily;
  return {
    maxDDPct, worstDayPct, ddOk, dailyOk,
    netPct: round(stats.netR * risk, 2),
    fits: stats.trades > 0 && ddOk && dailyOk,
  };
}

// Small deterministic random numbers, so the same backtest always shows the
// same simulated percentages instead of flickering on every refresh.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// "If I ran this edge as a challenge, how often would I hit the target before
// breaking a rule?" Replays randomly-chosen trading DAYS from the backtest
// (with replacement) until the target is reached, a rule is broken, or
// `maxDays` pass. Day order inside a day is unknown, so a daily-loss breach is
// judged on the day's total. An estimate, not a promise.
export function simulate(results, riskPct, rulesOrPhases = DEFAULT_RULES, { runs = 2000, maxDays = 260, seed = 12345 } = {}) {
  const phases = Array.isArray(rulesOrPhases) ? rulesOrPhases : [rulesOrPhases];
  const days = dailyTotals(results);
  const risk = Number(riskPct) || 0;
  if (days.length < 5 || !risk) return null;
  const pct = days.map((d) => d * risk);
  const rand = mulberry32(seed);
  const limit = maxDays * phases.length;
  let pass = 0, breach = 0;
  const cleared = phases.map(() => 0);
  for (let i = 0; i < runs; i++) {
    let eq = 0, peak = 0, k = 0;
    for (let d = 0; d < limit; d++) {
      const rules = phases[k];
      const day = pct[Math.floor(rand() * pct.length)];
      eq += day;
      if (eq > peak) peak = eq;
      const dd = rules.ddType === 'static' ? -eq : peak - eq;
      if (-day >= rules.daily || dd >= rules.maxDD) { breach++; break; }
      if (eq >= rules.target) {
        cleared[k]++;
        if (++k >= phases.length) { pass++; break; }
        eq = 0; peak = 0; // the next phase starts on a fresh balance
      }
    }
  }
  const pc = (n) => Math.round((n / runs) * 100);
  return { runs, pass: pc(pass), breach: pc(breach), neither: Math.max(0, 100 - pc(pass) - pc(breach)), cleared: cleared.map(pc) };
}

// ---- a whole challenge, phase by phase ----------------------------------------
//
// A prop firm challenge can be one step or two. Each phase starts on a fresh
// balance with its own target, drawdown and daily-loss rules; clear one and the
// next begins with the next entry. Breaking a rule ends the attempt (the account
// is blown). The entries are walked through in date order, exactly as you'd have
// traded them.
export const DEFAULT_PHASE2_TARGET = 5;
export function phasesOf(bt) {
  const first = { ...DEFAULT_RULES, ...(bt.rules || {}) };
  if (bt.steps === 2) return [first, { ...first, target: DEFAULT_PHASE2_TARGET, ...(bt.rules2 || {}) }];
  return [first];
}

export function simulateChallenge(results, riskPct, phases) {
  const risk = Number(riskPct) || 0;
  const rs = orderResults(results);
  const out = phases.map((rules, index) => ({ index, rules, status: 'pending', entries: 0, netPct: 0, maxDDPct: 0, worstDayPct: 0, passedOn: null, failedReason: null }));
  let overall = 'empty';
  if (rs.length && risk) {
    overall = 'active';
    let k = 0, eq = 0, peak = 0, dayKey = null, dayPnl = 0, undated = 0;
    for (const [date, r] of rs) {
      const ph = out[k];
      const rules = ph.rules;
      if (ph.status === 'pending') ph.status = 'active';
      const key = date || `#${undated++}`;
      if (key !== dayKey) { dayKey = key; dayPnl = 0; }
      const pnl = r * risk;
      eq += pnl; dayPnl += pnl;
      if (eq > peak) peak = eq;
      const dd = rules.ddType === 'static' ? Math.max(0, -eq) : peak - eq;
      ph.entries++; ph.netPct = eq;
      ph.maxDDPct = Math.max(ph.maxDDPct, dd);
      ph.worstDayPct = Math.max(ph.worstDayPct, -dayPnl);
      if (dd > rules.maxDD) { ph.status = 'failed'; ph.failedReason = 'drawdown'; overall = 'failed'; break; }
      if (-dayPnl > rules.daily) { ph.status = 'failed'; ph.failedReason = 'daily'; overall = 'failed'; break; }
      if (eq >= rules.target) {
        ph.status = 'passed'; ph.passedOn = date || null;
        if (++k >= out.length) { overall = 'passed'; break; }
        eq = 0; peak = 0; dayKey = null; dayPnl = 0;
      }
    }
  }
  return {
    overall,
    phases: out.map((p) => ({ ...p, netPct: round(p.netPct), maxDDPct: round(p.maxDDPct), worstDayPct: round(p.worstDayPct) })),
  };
}

// ---- cleaning what the browser sends -----------------------------------------

const str = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

export function cleanLink(v) {
  const s = str(v, 500);
  if (!s) return '';
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch { return ''; }
}

export function cleanDuration(v) {
  const s = str(v, 10);
  return /^\d{1,3}(:[0-5]\d){1,2}$/.test(s) ? s : '';
}

const cleanTags = (v) => (Array.isArray(v) ? v : String(v || '').split(','))
  .map((t) => str(t, 24)).filter(Boolean)
  .filter((t, i, a) => a.indexOf(t) === i).slice(0, 8);

function num(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Only the fields that are present are returned, so the same function serves
// create (all fields) and partial updates (e.g. just the status).
export function cleanBacktest(body = {}) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  if (has('title')) out.title = str(body.title, 120);
  if (has('strategy')) out.strategy = str(body.strategy, 60);
  if (has('symbol')) out.symbol = str(body.symbol, 20).toUpperCase();
  if (has('timeframe')) out.timeframe = str(body.timeframe, 10);
  if (has('month')) out.month = cleanMonth(body.month);
  if (has('rules')) out.rules = cleanRules(body.rules);
  if (has('rules2')) out.rules2 = cleanRules(body.rules2, { ...DEFAULT_RULES, target: DEFAULT_PHASE2_TARGET });
  if (has('steps')) out.steps = Number(body.steps) === 2 ? 2 : 1;
  if (has('closed')) out.closed = body.closed === true;
  if (has('period')) out.period = str(body.period, 80);
  if (has('riskPct')) out.riskPct = round(num(body.riskPct, 0.01, 10, 1), 3);
  if (has('status')) out.status = STATUSES.includes(body.status) ? body.status : 'review';
  if (has('link')) out.link = cleanLink(body.link);
  if (has('duration')) out.duration = cleanDuration(body.duration);
  if (has('tags')) out.tags = cleanTags(body.tags);
  if (has('notes')) out.notes = str(body.notes, 2000);
  if (has('learned')) {
    const l = body.learned || {};
    out.learned = { worked: str(l.worked, 400), failed: str(l.failed, 400), next: str(l.next, 400) };
  }
  return out;
}

export const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];
// Direction of a trade — plus two outcomes that aren't a direction: a trade you
// missed (not taken, so it never counts in the stats) and a breakeven (0R).
export const SIDES = ['long', 'short', 'missed', 'breakeven'];

// An entry's timeframes, oldest-format safe (top-down: e.g. D1, H4, M15).
export const tfList = (e) => (Array.isArray(e.timeframes) ? e.timeframes : e.timeframe ? [e.timeframe] : []);

// A timeframe is one of the presets or a custom one you typed (e.g. "M3", "10s", "H2").
export function cleanTimeframe(v) {
  const s = str(v, 10);
  return /^[A-Za-z0-9 ./-]{1,10}$/.test(s) ? s : '';
}

export function cleanRules(r = {}, base = DEFAULT_RULES) {
  const m = { ...DEFAULT_RULES, ...(base || {}), ...(r || {}) };
  return {
    firm: str(m.firm, 20) || 'E8',
    target: round(num(m.target, 0.1, 100, DEFAULT_RULES.target), 2),
    maxDD: round(num(m.maxDD, 0.1, 100, DEFAULT_RULES.maxDD), 2),
    daily: round(num(m.daily, 0.1, 100, DEFAULT_RULES.daily), 2),
    ddType: DD_TYPES.includes(m.ddType) ? m.ddType : 'trailing',
  };
}

export function cleanMonth(v) {
  const s = String(v || '').trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : '';
}

const price = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) < 1e9 ? round(n, 5) : null;
};

// One trade inside a session. Only fields that are present come back, so the
// same function serves "add" and "change one thing".
export function cleanEntry(body = {}) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  if (has('r')) { const n = Number(body.r); if (body.r !== '' && Number.isFinite(n) && Math.abs(n) <= 100) out.r = round(n, 3); }
  if (has('date')) { const m = DATE_RE.exec(String(body.date || '')); out.date = m && validDate(+m[1], +m[2], +m[3]) ? `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}` : ''; }
  if (has('time')) out.time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.time || '')) ? body.time : '';
  if (has('symbol')) out.symbol = str(body.symbol, 20).toUpperCase();
  if (has('side')) out.side = SIDES.includes(body.side) ? body.side : '';
  if (has('timeframes') || has('timeframe')) {
    const raw = Array.isArray(body.timeframes) ? body.timeframes : [body.timeframe];
    out.timeframes = raw.map(cleanTimeframe).filter(Boolean).filter((t, i, a) => a.indexOf(t) === i).slice(0, 6);
    out.timeframe = out.timeframes[0] || '';
  }
  if (has('entryPrice')) out.entryPrice = price(body.entryPrice);
  if (has('stopPrice')) out.stopPrice = price(body.stopPrice);
  if (has('exitPrice')) out.exitPrice = price(body.exitPrice);
  if (has('setup')) out.setup = str(body.setup, 80);
  if (has('followed')) out.followed = body.followed !== false && body.followed !== 'false';
  if (has('notes')) out.notes = str(body.notes, 1000);
  return out;
}

// The pasted-results format becomes entries (date + R, nothing else known).
export function entriesFromResults(results) {
  return results.map(([date, r]) => ({ date: date || '', time: '', symbol: '', side: '', timeframe: '', timeframes: [], entryPrice: null, stopPrice: null, exitPrice: null, setup: '', followed: true, notes: '', media: [], r }));
}

// Everything a session shows is worked out from its entries.
export function summariseEntries(entries) {
  // A missed trade was never taken, so it stays out of every number.
  const taken = entries.filter((e) => e.side !== 'missed');
  const results = taken.map((e) => [e.date || null, e.r]);
  return {
    results,
    stats: computeStats(results),
    followedPct: taken.length ? Math.round((taken.filter((e) => e.followed !== false).length / taken.length) * 100) : 0,
    missed: entries.length - taken.length,
  };
}

// The readiness checklist: every line ticks itself once the session meets it.
// One step → three lines about the challenge; two steps → three lines per phase.
// `challenge` comes from simulateChallenge (the session summary carries it).
export function sessionReadiness(stats, riskPct, rules = DEFAULT_RULES, followedPct = 100, challenge = null) {
  const has = stats.trades > 0;
  const items = [];
  const phases = challenge ? challenge.phases : [];
  const many = phases.length > 1;
  phases.forEach((p, i) => {
    const started = p.status !== 'pending';
    items.push({ id: `p${i + 1}-dd`, phase: i, label: `Drawdown inside the ${p.rules.maxDD}% limit`, done: started && p.failedReason !== 'drawdown' });
    items.push({ id: `p${i + 1}-daily`, phase: i, label: `Worst day inside the ${p.rules.daily}% limit`, done: started && p.failedReason !== 'daily' });
    items.push({ id: `p${i + 1}-target`, phase: i, label: `Reached the ${p.rules.target}% profit target`, done: p.status === 'passed' });
  });
  items.push({ id: 'edge', label: 'Positive expectancy per trade', done: has && stats.expectancy > 0 });
  items.push({ id: 'rules', label: 'Followed your rules on 90%+ of entries', done: has && followedPct >= 90 });
  return items;
}

export function cleanPrep(body = {}, current = DEFAULT_PREP) {
  const rules = cleanRules(body.rules, current.rules);
  const start = Object.prototype.hasOwnProperty.call(body, 'startDate') ? body.startDate : current.startDate;
  const m = DATE_RE.exec(String(start || ''));
  const startDate = m && validDate(+m[1], +m[2], +m[3]) ? `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}` : '';
  const c = { ...DEFAULT_PREP.checks, ...(current.checks || {}), ...(body.checks || {}) };
  return {
    rules, startDate,
    perWeek: Math.round(num(Object.prototype.hasOwnProperty.call(body, 'perWeek') ? body.perWeek : current.perWeek, 1, 50, 3)),
    checks: { risk: !!c.risk, stop: !!c.stop, demo: !!c.demo },
  };
}

// The light record shown on gallery cards (no trade list).
export function toSummary(bt) {
  const stats = bt.stats || computeStats([]);
  const challenge = simulateChallenge(bt.results || [], bt.riskPct, phasesOf(bt));
  // R per calendar day (most recent 400 days) — what the home calendar pools.
  const days = {};
  for (const [date, r] of bt.results || []) if (date) { const d = days[date] || (days[date] = { v: 0, count: 0 }); d.v = round(d.v + r, 3); d.count++; }
  const daily = Object.fromEntries(Object.entries(days).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 400));
  return {
    id: bt.id, title: bt.title, strategy: bt.strategy || '', symbol: bt.symbol || '', timeframe: bt.timeframe || '',
    period: bt.period || '', riskPct: bt.riskPct, status: bt.status, link: bt.link || '', duration: bt.duration || '',
    tags: bt.tags || [], media: (bt.media || []).map((m) => ({ id: m.id, url: m.url, type: m.type })),
    month: bt.month || '', rules: bt.rules || null, steps: bt.steps === 2 ? 2 : 1, rules2: bt.rules2 || null,
    daily,
    closed: !!bt.closed, closedAt: bt.closedAt || null, missed: bt.missed || 0,
    followedPct: bt.followedPct ?? 100,
    challenge: { overall: challenge.overall, phases: challenge.phases },
    stats, createdAt: bt.createdAt, updatedAt: bt.updatedAt,
  };
}
