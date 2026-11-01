import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tradeR, fmtR, fmtMoney, computeStats, computeStreaks, tierFromChecklist, computePOIPerformance, computeTimingPerformance } from '../src/utils/stats.js';

const t = (o) => ({ date: '2026-10-05', pnl: 0, side: 'long', ...o });

test('R-multiple is pnl ÷ risk, and unknown (null) without risk', () => {
  assert.equal(tradeR(t({ pnl: 300, risk: 100 })), 3);
  assert.equal(tradeR(t({ pnl: -50, risk: 100 })), -0.5);
  assert.equal(tradeR(t({ pnl: 300 })), null);
  assert.equal(tradeR(t({ pnl: 300, risk: 0 })), null);
  assert.equal(tradeR(t({ pnl: 300, risk: 100, side: 'missed' })), null);
  // an old placeholder `r` field is ignored
  assert.equal(tradeR(t({ pnl: 300, r: 1.5 })), null);
});

test('formatters', () => {
  assert.equal(fmtR(null), '—');
  assert.equal(fmtR(1.236), '+1.24R');
  assert.equal(fmtR(-2), '−2R');
  assert.equal(fmtMoney(null), '—');
  assert.equal(fmtMoney(0), '$0');
  assert.match(fmtMoney(-12.5), /^−\$12\.50$/);
});

test('computeStats: win rate, profit factor, Avg R only from trades with risk', () => {
  const s = computeStats([t({ pnl: 200, risk: 100 }), t({ pnl: -100, risk: 100 }), t({ pnl: 100 })]);
  assert.equal(s.netPnl, 200);
  assert.equal(s.winRate, 67);
  assert.equal(s.profitFactor, 3);
  assert.equal(s.avgR, 0.5);
  assert.equal(s.rCount, 2);
  assert.deepEqual(computeStats([]).bestDay, null);
});

test('computeStats: no losses → profit factor is gross win, not Infinity', () => {
  assert.equal(computeStats([t({ pnl: 50 })]).profitFactor, 50);
});

test('computeStats: best day sums trades on the same date', () => {
  const s = computeStats([t({ date: '2026-10-01', pnl: 100 }), t({ date: '2026-10-01', pnl: 50 }), t({ date: '2026-10-02', pnl: 120 })]);
  assert.deepEqual(s.bestDay, { date: '2026-10-01', pnl: 150 });
});

test('computeStreaks', () => {
  const trades = [-1, 5, 5, 5, -2, -2].map((pnl, i) => t({ pnl, date: `2026-10-0${i + 1}` }));
  const s = computeStreaks(trades);
  assert.equal(s.bestWinStreak, 3);
  assert.equal(s.worstLossStreak, 2);
  assert.equal(s.currentType, 'loss');
  assert.equal(s.currentCount, 2);
});

test('tierFromChecklist thresholds', () => {
  assert.equal(tierFromChecklist(0, 0).tier, 'C');
  assert.equal(tierFromChecklist(6, 6).tier, 'S');
  assert.equal(tierFromChecklist(4, 6).tier, 'A');
  assert.equal(tierFromChecklist(2, 6).tier, 'B');
  assert.equal(tierFromChecklist(1, 6).tier, 'C');
});

test('POI performance groups by POI and ignores untagged trades', () => {
  const rows = computePOIPerformance([t({ poi: 'FVG', pnl: 100, risk: 50 }), t({ poi: 'FVG', pnl: -50, risk: 50 }), t({ pnl: 999 })]);
  assert.equal(rows.length, 1);
  assert.deepEqual({ ...rows[0] }, { name: 'FVG', count: 2, winRate: 50, netPnl: 50, avgR: 0.5 });
});

test('timing performance buckets by hour and weekday (Mon-first)', () => {
  // 2026-10-05 is a Monday
  const r = computeTimingPerformance([t({ time: '09:15', pnl: 10 }), t({ time: '09:50', pnl: -5 }), t({ date: '2026-10-06', pnl: 5 })]);
  assert.equal(r.withTime, 2);
  assert.equal(r.total, 3);
  assert.deepEqual(r.hours.map((h) => [h.label, h.count, h.winRate]), [['09:00', 2, 50]]);
  assert.deepEqual(r.days.map((d) => [d.label, d.count]), [['Mon', 2], ['Tue', 1]]);
});
