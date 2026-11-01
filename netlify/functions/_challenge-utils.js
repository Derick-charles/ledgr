import { randomUUID as uuid } from 'node:crypto';

// Prop-firm challenge settings live on the account itself:
//   challenge = { phases: [ { id, name, startDate, startBalance, profitTarget,
//     dailyLoss: {mode:'amount'|'percent', value}, maxDrawdown: {mode, value},
//     drawdownType: 'static'|'trailing'|'eod_trailing', lockAtStart, minDays,
//     endDate, status: 'active'|'passed'|'failed', result?, balanceCheck? } ] }
// Cleaned here so a malformed request can't store junk.
const num = (v, min = 0) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) && n >= min ? n : null; };
const dateOrNull = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
function cleanLimit(l) {
  if (!l) return null;
  const value = num(l.value);
  return value === null ? null : { mode: l.mode === 'percent' ? 'percent' : 'amount', value };
}
export function cleanChallenge(c) {
  if (!c || !Array.isArray(c.phases) || !c.phases.length) return null;
  const phases = c.phases.slice(0, 10).map((p, i) => {
    const startBalance = num(p.startBalance, 1);
    if (startBalance === null) return null;
    const check = p.balanceCheck && dateOrNull(p.balanceCheck.date) && num(p.balanceCheck.balance, 0) !== null
      ? { date: p.balanceCheck.date, balance: Number(p.balanceCheck.balance) } : null;
    return {
      id: String(p.id || uuid()), name: String(p.name || `Phase ${i + 1}`).trim().slice(0, 40) || `Phase ${i + 1}`,
      startDate: dateOrNull(p.startDate) || new Date().toISOString().slice(0, 10),
      startBalance, profitTarget: num(p.profitTarget), dailyLoss: cleanLimit(p.dailyLoss), maxDrawdown: cleanLimit(p.maxDrawdown),
      drawdownType: ['static', 'trailing', 'eod_trailing'].includes(p.drawdownType) ? p.drawdownType : 'static',
      lockAtStart: p.lockAtStart !== false, minDays: Math.round(num(p.minDays) || 0), endDate: dateOrNull(p.endDate),
      status: ['active', 'passed', 'failed'].includes(p.status) ? p.status : 'active',
      result: p.result && typeof p.result === 'object' ? { profit: Number(p.result.profit) || 0, endedOn: dateOrNull(p.result.endedOn) } : null,
      balanceCheck: check,
    };
  });
  return phases.some((p) => !p) ? null : { phases };
}

