export function fmtMoney(v) {
  if (v === null || v === undefined) return '—';
  const sign = v > 0 ? '+' : v < 0 ? '\u2212' : '';
  return sign + '$' + Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// R-multiple = P&L ÷ the dollars risked on the trade. It's only real when a
// "$ risked" amount was entered, so a trade without one has NO R (null) —
// it's left out of Avg R rather than counted as a guess. (Older trades
// carry a placeholder `r` field from before risk was tracked; it's ignored.)
export function tradeR(t) {
  const risk = Number(t.risk);
  if (t.side === 'missed' || !(risk > 0)) return null;
  return t.pnl / risk;
}

export function fmtR(r) {
  if (r === null || r === undefined || Number.isNaN(r)) return '—';
  const rounded = Math.round(r * 100) / 100;
  return `${rounded > 0 ? '+' : rounded < 0 ? '\u2212' : ''}${Math.abs(rounded)}R`;
}

// Computes the dashboard's top stat row directly from a trades array.
// Trades are expected to have: { pnl: number, risk?: number }
export function computeStats(trades) {
  if (!trades.length) {
    return { netPnl: 0, winRate: 0, profitFactor: 0, avgR: null, rCount: 0, wins: 0, losses: 0, bestDay: null };
  }
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const netPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const winRate = Math.round((wins.length / trades.length) * 100);
  const profitFactor = grossLoss === 0 ? grossWin : grossWin / grossLoss;
  const rValues = trades.map(tradeR).filter((r) => r !== null);
  const avgR = rValues.length ? rValues.reduce((s, r) => s + r, 0) / rValues.length : null;

  // Group by date to find the single best day
  const byDate = {};
  trades.forEach((t) => { byDate[t.date] = (byDate[t.date] || 0) + t.pnl; });
  const bestDayEntry = Object.entries(byDate).sort((a, b) => b[1] - a[1])[0];

  return {
    netPnl,
    winRate,
    profitFactor: Math.round(profitFactor * 100) / 100,
    avgR: avgR === null ? null : Math.round(avgR * 100) / 100,
    rCount: rValues.length,
    wins: wins.length,
    losses: losses.length,
    bestDay: bestDayEntry ? { date: bestDayEntry[0], pnl: bestDayEntry[1] } : null,
  };
}

// Trades sorted chronologically (oldest first) to find streaks — trailing
// current streak, and the longest win/loss runs across the whole month.
export function computeStreaks(trades) {
  if (!trades.length) {
    return { currentType: null, currentCount: 0, bestWinStreak: 0, worstLossStreak: 0, avgWin: 0, avgLoss: 0 };
  }
  const chrono = [...trades].sort((a, b) => a.date.localeCompare(b.date));

  let bestWinStreak = 0, worstLossStreak = 0, winRun = 0, lossRun = 0;
  chrono.forEach((t) => {
    if (t.pnl > 0) { winRun++; lossRun = 0; }
    else if (t.pnl < 0) { lossRun++; winRun = 0; }
    else { winRun = 0; lossRun = 0; }
    bestWinStreak = Math.max(bestWinStreak, winRun);
    worstLossStreak = Math.max(worstLossStreak, lossRun);
  });

  let currentType = null, currentCount = 0;
  for (let i = chrono.length - 1; i >= 0; i--) {
    const pnl = chrono[i].pnl;
    if (currentType === null) {
      if (pnl > 0) { currentType = 'win'; currentCount = 1; }
      else if (pnl < 0) { currentType = 'loss'; currentCount = 1; }
      else break;
    } else if ((currentType === 'win' && pnl > 0) || (currentType === 'loss' && pnl < 0)) {
      currentCount++;
    } else break;
  }

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;

  return { currentType, currentCount, bestWinStreak, worstLossStreak, avgWin, avgLoss };
}

export function tierFromChecklist(checkedCount, total) {
  if (total === 0) return { tier: 'C', name: 'No checklist yet' };
  if (checkedCount === total) return { tier: 'S', name: 'Elite Execution' };
  if (checkedCount >= Math.ceil(total * 0.66)) return { tier: 'A', name: 'Strong Discipline' };
  if (checkedCount >= Math.ceil(total * 0.33)) return { tier: 'B', name: 'Needs Improvement' };
  return { tier: 'C', name: 'Poor Process' };
}

export const TIER_COLORS = { S: '#4FD8E8', A: '#35E0A1', B: '#F2A93B', C: '#FF6B7A' };
export const MISTAKE_TAGS = ['Chased Entry', 'Moved Stop', 'Oversized', 'Revenge Trade', 'Ignored Plan', 'FOMO Exit'];
export const MISTAKE_COLORS = {
  'Chased Entry': '#FF6B7A', 'Moved Stop': '#F2A93B', 'Oversized': '#F2A93B',
  'Revenge Trade': '#FF6B7A', 'Ignored Plan': '#FF6B7A', 'FOMO Exit': '#8B7FFF',
};
export const CHECKLIST_ITEMS = [
  'Followed my trading plan',
  'Waited for confirmation signal',
  'Correct position size',
  'Stop loss set before entry',
  'No revenge trading after a loss',
  'Reviewed pre-market news',
];

export const POI_TAGS = ['Order Block', 'Fair Value Gap', 'Liquidity Sweep', 'Supply/Demand Zone', 'Breaker Block', 'Trendline Break'];
export const POI_COLORS = {
  'Order Block': '#4FD8E8', 'Fair Value Gap': '#8B7FFF', 'Liquidity Sweep': '#35E0A1',
  'Supply/Demand Zone': '#F2A93B', 'Breaker Block': '#FF6B7A', 'Trendline Break': '#4FD8E8',
};

// One row per Point of Interest actually used on a trade — win rate, avg R,
// and net P&L for that setup specifically, so it's clear which POIs are
// actually worth being keen on versus which just show up a lot.
export function computePOIPerformance(trades) {
  const byPoi = {};
  trades.forEach((t) => {
    if (!t.poi) return;
    if (!byPoi[t.poi]) byPoi[t.poi] = [];
    byPoi[t.poi].push(t);
  });
  return Object.entries(byPoi)
    .map(([name, list]) => {
      const wins = list.filter((t) => t.pnl > 0).length;
      const netPnl = list.reduce((s, t) => s + t.pnl, 0);
      const rValues = list.map(tradeR).filter((r) => r !== null);
      const avgR = rValues.length ? rValues.reduce((s, r) => s + r, 0) / rValues.length : null;
      return {
        name,
        count: list.length,
        winRate: Math.round((wins / list.length) * 100),
        netPnl,
        avgR: avgR === null ? null : Math.round(avgR * 100) / 100,
      };
    })
    .sort((a, b) => b.winRate - a.winRate || b.count - a.count);
}

// Fewer trades than this in a bucket is too small a sample to trust — the
// panels dim those rows and label them rather than hiding them.
export const MIN_SAMPLE = 5;

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function bucketStats(list) {
  const wins = list.filter((t) => t.pnl > 0).length;
  return {
    count: list.length,
    wins,
    winRate: list.length ? Math.round((wins / list.length) * 100) : 0,
    netPnl: list.reduce((s, t) => s + t.pnl, 0),
  };
}

// Win rate by hour of day (needs the optional trade time) and by day of the
// week (needs only the date). Expects executed trades — missed setups have no
// outcome to measure.
export function computeTimingPerformance(trades) {
  const byHour = {}, byDay = {};
  let withTime = 0;
  trades.forEach((t) => {
    const dow = (new Date(`${t.date}T00:00:00`).getDay() + 6) % 7; // 0 = Monday
    (byDay[dow] ||= []).push(t);
    const m = /^(\d{2}):\d{2}$/.exec(t.time || '');
    if (m) { withTime++; (byHour[Number(m[1])] ||= []).push(t); }
  });
  return {
    withTime,
    total: trades.length,
    hours: Object.keys(byHour).map(Number).sort((a, b) => a - b)
      .map((h) => ({ label: `${String(h).padStart(2, '0')}:00`, ...bucketStats(byHour[h]) })),
    days: Object.keys(byDay).map(Number).sort((a, b) => a - b)
      .map((d) => ({ label: DAY_NAMES[d], ...bucketStats(byDay[d]) })),
  };
}
