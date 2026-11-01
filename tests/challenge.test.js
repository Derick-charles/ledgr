import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePhase, limitAmount } from '../src/utils/challenge.js';

const phase = (o = {}) => ({
  startDate: '2026-10-01', startBalance: 50000, profitTarget: 4000,
  dailyLoss: { mode: 'percent', value: 5 }, maxDrawdown: { mode: 'percent', value: 10 },
  drawdownType: 'static', lockAtStart: true, minDays: 3, balanceCheck: null, ...o,
});
const tr = (date, pnl, extra = {}) => ({ date, pnl, side: 'long', ...extra });
const TODAY = '2026-10-17';

test('limits: percent vs amount', () => {
  assert.equal(limitAmount({ mode: 'percent', value: 5 }, 50000), 2500);
  assert.equal(limitAmount({ mode: 'amount', value: 1500 }, 50000), 1500);
  assert.equal(limitAmount(null, 50000), null);
  assert.equal(limitAmount({ mode: 'amount', value: 0 }, 50000), null);
});

test('progress, trading days and target met', () => {
  const e = evaluatePhase(phase(), null, [tr('2026-10-01', 1000), tr('2026-10-02', 2000), tr('2026-10-03', 1500)], TODAY);
  assert.equal(e.profit, 4500);
  assert.equal(e.progress, 1);
  assert.equal(e.tradingDays, 3);
  assert.equal(e.state, 'target_met');
});

test('target hit before the minimum days is flagged', () => {
  const e = evaluatePhase(phase({ minDays: 5 }), null, [tr('2026-10-01', 4500)], TODAY);
  assert.equal(e.state, 'needs_days');
});

test('static drawdown breach', () => {
  const e = evaluatePhase(phase({ dailyLoss: null }), null, [tr('2026-10-01', -2000), tr('2026-10-02', -3000)], TODAY);
  assert.equal(e.state, 'breached');
  assert.deepEqual(e.breach, { date: '2026-10-02', kind: 'drawdown' });
});

test('daily loss breach is measured within a single day', () => {
  const e = evaluatePhase(phase(), null, [tr('2026-10-02', -1500), tr('2026-10-02', -1000)], TODAY);
  assert.equal(e.breach.kind, 'daily');
});

test('a loss spread over several days is not a daily breach', () => {
  const e = evaluatePhase(phase(), null, [tr('2026-10-01', -2000), tr('2026-10-02', -2000)], TODAY);
  assert.equal(e.breach, null);
});

test('trailing floor rises with the peak but locks at the starting balance', () => {
  const p = phase({ drawdownType: 'trailing', maxDrawdown: { mode: 'amount', value: 2000 }, dailyLoss: null });
  const up = evaluatePhase(p, null, [tr('2026-10-01', 1500)], TODAY);
  assert.equal(up.drawdown.floor, 49500); // 51500 - 2000
  const high = evaluatePhase(p, null, [tr('2026-10-01', 5000)], TODAY);
  assert.equal(high.drawdown.floor, 50000); // locked at start
  const unlocked = evaluatePhase({ ...p, lockAtStart: false }, null, [tr('2026-10-01', 5000)], TODAY);
  assert.equal(unlocked.drawdown.floor, 53000);
});

test('end-of-day trailing ignores intraday peaks', () => {
  const p = phase({ drawdownType: 'eod_trailing', maxDrawdown: { mode: 'amount', value: 2000 }, dailyLoss: null, lockAtStart: false });
  // Up 3000 then down 2500 in the same day: end of day is only +500.
  const e = evaluatePhase(p, null, [tr('2026-10-01', 3000, { time: '09:00' }), tr('2026-10-01', -2500, { time: '11:00' })], TODAY);
  assert.equal(e.breach, null);
  // The same day with closed-trade trailing: peak 53000 → floor 51000, balance 50500 breaches.
  const closed = evaluatePhase({ ...p, drawdownType: 'trailing' }, null, [tr('2026-10-01', 3000, { time: '09:00' }), tr('2026-10-01', -2500, { time: '11:00' })], TODAY);
  assert.equal(closed.breach.kind, 'drawdown');
});

test('missed trades and other phases are excluded', () => {
  const next = { startDate: '2026-10-10' };
  const e = evaluatePhase(phase(), next, [tr('2026-10-02', 100), tr('2026-10-03', 999, { side: 'missed' }), tr('2026-10-12', 5000)], TODAY);
  assert.equal(e.profit, 100);
});

test('balance check adjusts to the firm\'s figure', () => {
  const e = evaluatePhase(phase({ balanceCheck: { date: '2026-10-02', balance: 51000 } }), null, [tr('2026-10-01', 1000), tr('2026-10-02', -500)], TODAY);
  assert.equal(e.offset, 500);
  assert.equal(e.current, 51000);
});

test("today's daily meter", () => {
  const e = evaluatePhase(phase(), null, [tr(TODAY, -1000)], TODAY);
  assert.equal(e.daily.limit, 2500);
  assert.equal(e.daily.used, 1000);
  assert.equal(e.daily.left, 1500);
});
