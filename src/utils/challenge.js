// Prop-firm challenge maths. Pure functions over an account's challenge
// phase and its logged trades — everything shown on the tracker card comes
// from here, so it can be tested on its own.
//
// Accuracy note: this only knows realised P&L from trades you logged. It
// can't see open (floating) losses, so trailing drawdown is measured on
// closed-trade balances. The "balance check" lets you enter your firm's real
// balance to correct any gap.

export const DRAWDOWN_TYPES = [
  { value: 'static', label: 'Static', hint: 'The loss floor is fixed from your starting balance.' },
  { value: 'trailing', label: 'Trailing', hint: 'The floor rises with your highest balance after any closed trade.' },
  { value: 'eod_trailing', label: 'End-of-day trailing', hint: 'The floor rises with your highest end-of-day balance only.' },
];

export function limitAmount(limit, base) {
  if (!limit || !(limit.value > 0)) return null;
  return limit.mode === 'percent' ? (limit.value / 100) * base : limit.value;
}

// The phase's trades: executed (not "missed"), from its start date up to the
// day before the next phase starts, in the order they were taken.
export function phaseTrades(phase, nextPhase, trades) {
  const end = nextPhase ? nextPhase.startDate : null;
  return trades
    .filter((t) => t.side !== 'missed' && t.date >= phase.startDate && (!end || t.date < end))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
}

const round2 = (n) => Math.round(n * 100) / 100;

export function evaluatePhase(phase, nextPhase, allTrades, todayId) {
  const trades = phaseTrades(phase, nextPhase, allTrades);
  const start = phase.startBalance;

  // Day-by-day, in order, tracking the running balance and the drawdown floor.
  const byDay = new Map();
  trades.forEach((t) => byDay.set(t.date, (byDay.get(t.date) || 0) + (Number(t.pnl) || 0)));
  const days = [...byDay.keys()].sort();

  let balance = start;
  let peakClosed = start;   // highest balance after any closed trade
  let peakEod = start;      // highest end-of-day balance
  let breach = null;        // { date, kind }
  const floorNow = () => {
    const dd = limitAmount(phase.maxDrawdown, start);
    if (dd === null) return null;
    if (phase.drawdownType === 'static') return start - dd;
    const peak = phase.drawdownType === 'eod_trailing' ? peakEod : peakClosed;
    const raw = peak - dd;
    return phase.lockAtStart ? Math.min(raw, start) : raw;
  };

  for (const day of days) {
    const startOfDay = balance;
    const dailyLimit = limitAmount(phase.dailyLoss, startOfDay);
    for (const t of trades.filter((x) => x.date === day)) {
      balance += Number(t.pnl) || 0;
      peakClosed = Math.max(peakClosed, balance);
      const f = floorNow();
      if (!breach && f !== null && balance <= f) breach = { date: day, kind: 'drawdown' };
      if (!breach && dailyLimit !== null && startOfDay - balance >= dailyLimit) breach = { date: day, kind: 'daily' };
    }
    peakEod = Math.max(peakEod, balance);
  }

  // Optional correction from the firm's real balance.
  let offset = 0;
  if (phase.balanceCheck) {
    const upTo = trades.filter((t) => t.date <= phase.balanceCheck.date).reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    offset = round2(phase.balanceCheck.balance - (start + upTo));
  }
  const current = round2(balance + offset);
  const profit = round2(current - start);
  const target = phase.profitTarget > 0 ? phase.profitTarget : null;

  // Today's loss meter (measured from the start-of-day balance).
  const todayPnl = byDay.get(todayId) || 0;
  const startOfToday = current - todayPnl;
  const dailyLimit = limitAmount(phase.dailyLoss, startOfToday);
  const dailyUsed = Math.max(0, -todayPnl);

  const floor = floorNow();
  const ddAmount = limitAmount(phase.maxDrawdown, start);
  const floorWithOffset = floor === null ? null : floor; // the firm's floor is what it is; the balance is corrected instead
  const ddRoom = floorWithOffset === null ? null : round2(current - floorWithOffset);

  const tradingDays = days.length;
  const daysLeft = phase.endDate ? Math.ceil((new Date(`${phase.endDate}T00:00:00`) - new Date(`${todayId}T00:00:00`)) / 86400000) : null;

  // Breach caused by the balance check itself (firm balance is below the floor).
  if (!breach && floorWithOffset !== null && current <= floorWithOffset) breach = { date: phase.balanceCheck ? phase.balanceCheck.date : todayId, kind: 'drawdown' };

  const targetMet = target !== null && profit >= target;
  const daysMet = tradingDays >= (phase.minDays || 0);
  let state = 'on_track';
  if (breach) state = 'breached';
  else if (targetMet && daysMet) state = 'target_met';
  else if (targetMet && !daysMet) state = 'needs_days';
  else if ((dailyLimit !== null && dailyLimit - dailyUsed <= dailyLimit * 0.25) || (ddAmount !== null && ddRoom !== null && ddRoom <= ddAmount * 0.25)) state = 'at_risk';
  else if (phase.endDate && daysLeft !== null && daysLeft < 0) state = 'expired';

  return {
    tradeCount: trades.length, tradingDays, current, profit, offset,
    target, progress: target ? Math.max(0, Math.min(1, profit / target)) : null, toGo: target ? Math.max(0, round2(target - profit)) : null,
    daily: { limit: dailyLimit === null ? null : round2(dailyLimit), used: round2(dailyUsed), left: dailyLimit === null ? null : round2(Math.max(0, dailyLimit - dailyUsed)) },
    drawdown: { amount: ddAmount === null ? null : round2(ddAmount), floor: floorWithOffset === null ? null : round2(floorWithOffset), room: ddRoom },
    daysLeft, minDays: phase.minDays || 0, breach, state,
  };
}
