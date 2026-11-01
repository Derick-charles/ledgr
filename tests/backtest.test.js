import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseResults, computeStats, evaluate, simulate, cleanBacktest, cleanPrep, cleanLink, cleanDuration, DEFAULT_RULES, DEFAULT_PREP, dailyTotals,
} from '../netlify/functions/_backtest-utils.js';

test('parseResults: separators, R suffix, unicode minus, header and bad lines', () => {
  const text = [
    'date, r',
    '2023-03-14, 1.8',
    '2023-03-14\t-1',
    '2023/03/15;  2R',
    '2023-03-16 −1.5R',
    '0.5',
    '2023-02-31, 1',        // not a real date
    'banana',
    '',
    '2023-03-17, 5000',     // absurd R
  ].join('\n');
  const { results, skipped } = parseResults(text);
  assert.deepEqual(results, [['2023-03-14', 1.8], ['2023-03-14', -1], ['2023-03-15', 2], ['2023-03-16', -1.5], [null, 0.5]]);
  assert.equal(skipped.length, 3);
});

test('parseResults: stops at the cap', () => {
  const text = Array.from({ length: 3500 }, (_, i) => `2023-01-01, ${i % 2 ? 1 : -1}`).join('\n');
  assert.equal(parseResults(text).results.length, 3000);
});

test('computeStats: win rate, net, expectancy, drawdown and worst day', () => {
  // equity: +2, +1(3), -1(2), -3(-1), +1(0)
  const r = [['2023-01-02', 2], ['2023-01-03', 1], ['2023-01-04', -1], ['2023-01-04', -3], ['2023-01-05', 1]];
  const s = computeStats(r);
  assert.equal(s.trades, 5);
  assert.equal(s.winRate, 60);
  assert.equal(s.netR, 0);
  assert.equal(s.expectancy, 0);
  assert.equal(s.maxDDR, 4);      // from the peak of 3 down to -1
  assert.equal(s.lowR, 1);        // never more than 1R under the start
  assert.equal(s.worstDayR, 4);   // 01-04 lost 1 + 3
  assert.equal(s.bestDayR, 2);
  assert.equal(s.firstDate, '2023-01-02');
  assert.equal(s.lastDate, '2023-01-05');
});

test('computeStats: sorts dated trades; empty input is all zeros', () => {
  const s = computeStats([['2023-01-05', -1], ['2023-01-01', 3]]);
  assert.equal(s.maxDDR, 1);
  assert.equal(s.netR, 2);
  const e = computeStats([]);
  assert.equal(e.trades, 0);
  assert.equal(e.winRate, 0);
});

test('evaluate: the numbers from the mock-up (6.2R drawdown at 0.5% = 3.1%)', () => {
  const stats = { trades: 118, maxDDR: 6.2, lowR: 3, worstDayR: 3, netR: 14.2 };
  const ev = evaluate(stats, 0.5, DEFAULT_RULES);
  assert.equal(ev.maxDDPct, 3.1);
  assert.equal(ev.worstDayPct, 1.5);
  assert.equal(ev.netPct, 7.1);
  assert.equal(ev.fits, true);
  // a tighter rule set fails it
  assert.equal(evaluate(stats, 0.5, { ...DEFAULT_RULES, maxDD: 3 }).ddOk, false);
  assert.equal(evaluate(stats, 0.5, { ...DEFAULT_RULES, daily: 1 }).dailyOk, false);
  // static drawdown is measured from the starting balance, not the peak
  assert.equal(evaluate(stats, 0.5, { ...DEFAULT_RULES, ddType: 'static' }).maxDDPct, 1.5);
  assert.equal(evaluate({ ...stats, trades: 0 }, 0.5).fits, false);
});

test('simulate: deterministic, and obeys the extremes', () => {
  const winners = Array.from({ length: 30 }, (_, i) => [`2023-02-${String(i + 1).padStart(2, '0')}`, 1]);
  const a = simulate(winners, 1, DEFAULT_RULES);
  assert.deepEqual(a, simulate(winners, 1, DEFAULT_RULES)); // same answer every time
  assert.equal(a.pass, 100);                                  // +1% every day reaches 6% with no losing day
  assert.equal(a.breach, 0);

  const losers = Array.from({ length: 30 }, (_, i) => [`2023-02-${String(i + 1).padStart(2, '0')}`, -1]);
  const b = simulate(losers, 1, DEFAULT_RULES);
  assert.equal(b.pass, 0);
  assert.equal(b.breach, 100);

  // one huge losing day breaches the daily limit whenever it is drawn
  const mixed = [...winners, ['2023-03-01', -4]];
  const c = simulate(mixed, 1, DEFAULT_RULES);
  assert.ok(c.breach > 0 && c.pass > 0);
  assert.equal(c.pass + c.breach + c.neither, 100);
});

test('simulate: too little data or no risk returns null', () => {
  assert.equal(simulate([['2023-01-01', 1]], 1), null);
  assert.equal(simulate(Array.from({ length: 10 }, (_, i) => [`2023-01-${i + 1}`, 1]), 0), null);
});

test('dailyTotals groups by date; undated trades are separate days', () => {
  assert.deepEqual(dailyTotals([['2023-01-01', 1], ['2023-01-01', 2], [null, 5], [null, -1]]), [3, 5, -1]);
});

test('cleanLink: only web links, adds https, rejects script and file links', () => {
  assert.equal(cleanLink('https://www.loom.com/share/abc'), 'https://www.loom.com/share/abc');
  assert.equal(cleanLink('loom.com/share/abc'), 'https://loom.com/share/abc');
  assert.equal(cleanLink('javascript:alert(1)'), '');
  assert.equal(cleanLink('data:text/html,hi'), '');
  assert.equal(cleanLink('file:///etc/passwd'), '');
  assert.equal(cleanLink(''), '');
});

test('cleanDuration accepts mm:ss and h:mm:ss only', () => {
  assert.equal(cleanDuration('12:40'), '12:40');
  assert.equal(cleanDuration('1:02:03'), '1:02:03');
  assert.equal(cleanDuration('12:75'), '');
  assert.equal(cleanDuration('abc'), '');
});

test('cleanBacktest: trims, clamps, limits, and only returns fields that were sent', () => {
  const c = cleanBacktest({ title: '  NQ OB  ', symbol: 'nq', riskPct: 99, status: 'hacked', tags: 'a, b, a, ,c', learned: { worked: 'x'.repeat(900) }, extra: 'ignored', id: 'nope' });
  assert.equal(c.title, 'NQ OB');
  assert.equal(c.symbol, 'NQ');
  assert.equal(c.riskPct, 10);
  assert.equal(c.status, 'review');
  assert.deepEqual(c.tags, ['a', 'b', 'c']);
  assert.equal(c.learned.worked.length, 400);
  assert.equal('extra' in c, false);
  assert.equal('id' in c, false);
  assert.deepEqual(Object.keys(cleanBacktest({ status: 'validated' })), ['status']);
});

test('cleanPrep: defaults, clamping, valid dates, keeps what was not sent', () => {
  const p = cleanPrep({ rules: { target: 8, ddType: 'weird' }, startDate: '2027-01-05', perWeek: 500, checks: { risk: true } });
  assert.equal(p.rules.target, 8);
  assert.equal(p.rules.ddType, 'trailing');
  assert.equal(p.rules.maxDD, 4);
  assert.equal(p.startDate, '2027-01-05');
  assert.equal(p.perWeek, 50);
  assert.deepEqual(p.checks, { risk: true, stop: false, demo: false });
  const again = cleanPrep({ checks: { demo: true } }, p);
  assert.deepEqual(again.checks, { risk: true, stop: false, demo: true });
  assert.equal(again.startDate, '2027-01-05');
  assert.equal(cleanPrep({ startDate: '2027-02-31' }, DEFAULT_PREP).startDate, '');
});

test('entries: cleaned, custom timeframe kept, bad values dropped', async () => {
  const { cleanEntry, cleanTimeframe, summariseEntries, sessionReadiness, DEFAULT_RULES } = await import('../netlify/functions/_backtest-utils.js');
  assert.equal(cleanTimeframe('M3'), 'M3');
  assert.equal(cleanTimeframe('<script>'), '');
  const e = cleanEntry({ r: '1.5', date: '2024-02-30', time: '25:00', symbol: 'eurusd', side: 'sideways', entryPrice: '', followed: false });
  assert.equal(e.r, 1.5); assert.equal(e.date, ''); assert.equal(e.time, ''); assert.equal(e.symbol, 'EURUSD');
  assert.equal(e.side, ''); assert.equal(e.entryPrice, null); assert.equal(e.followed, false);
  assert.ok(!('r' in cleanEntry({ r: 500 })));
  const entries = [{ r: 1, date: '2024-01-01', followed: true }, { r: -1, date: '2024-01-02', followed: false }, { r: 2, date: '2024-01-03', followed: true }];
  const sum = summariseEntries(entries);
  assert.equal(sum.stats.trades, 3); assert.equal(Math.round(sum.stats.winRate), 67); assert.equal(sum.followedPct, 67);
  const ch = (await import('../netlify/functions/_backtest-utils.js')).simulateChallenge(sum.results, 0.5, [DEFAULT_RULES]);
  const ready = sessionReadiness(sum.stats, 0.5, DEFAULT_RULES, sum.followedPct, ch);
  assert.equal(ready.find((x) => x.id === 'edge').done, true);
  assert.equal(ready.find((x) => x.id === 'rules').done, false);
  assert.ok(!ready.some((x) => x.id === 'entries'), 'no 100-entries line any more');
});

test('entries: top-down timeframes, missed and breakeven', async () => {
  const { cleanEntry, summariseEntries, tfList } = await import('../netlify/functions/_backtest-utils.js');
  const e = cleanEntry({ r: 1, timeframes: ['D1', 'H4', 'M15', 'H4', 'bad<'] });
  assert.deepEqual(e.timeframes, ['D1', 'H4', 'M15']);
  assert.deepEqual(tfList({ timeframe: 'M5' }), ['M5']);
  assert.equal(cleanEntry({ side: 'missed' }).side, 'missed');
  const sum = summariseEntries([{ r: 2, date: '2024-01-01', side: 'long' }, { r: 5, date: '2024-01-02', side: 'missed' }, { r: 0, date: '2024-01-03', side: 'breakeven' }]);
  assert.equal(sum.stats.trades, 2); assert.equal(sum.stats.wins, 1); assert.equal(sum.missed, 1); assert.equal(sum.stats.netR, 2);
});


test('challenge: one step and two steps, phase by phase', async () => {
  const { simulateChallenge, sessionReadiness, computeStats, phasesOf, simulate, DEFAULT_RULES } = await import('../netlify/functions/_backtest-utils.js');
  const day = (i) => `2024-01-${String(i).padStart(2, '0')}`;
  const wins = (n, from = 1) => Array.from({ length: n }, (_, i) => [day(from + i), 1]);
  const one = [{ ...DEFAULT_RULES, target: 6, maxDD: 4, daily: 3 }];
  const two = [...one, { ...DEFAULT_RULES, target: 5, maxDD: 4, daily: 3 }];

  const a = simulateChallenge(wins(6), 1, one);
  assert.equal(a.overall, 'passed'); assert.equal(a.phases[0].passedOn, day(6));

  const b = simulateChallenge(wins(8), 1, two); // phase 1 done on day 6, phase 2 still needs 3 more
  assert.equal(b.overall, 'active'); assert.equal(b.phases[0].status, 'passed'); assert.equal(b.phases[1].status, 'active');
  assert.equal(b.phases[1].entries, 2); assert.equal(b.phases[1].netPct, 2);

  const c = simulateChallenge(wins(11), 1, two);
  assert.equal(c.overall, 'passed'); assert.equal(c.phases[1].passedOn, day(11));

  const d = simulateChallenge(Array.from({ length: 5 }, (_, i) => [day(i + 1), -1]), 1, one);
  assert.equal(d.overall, 'failed'); assert.equal(d.phases[0].failedReason, 'drawdown');

  const e = simulateChallenge([[day(1), -2], [day(1), -2]], 1, one); // −4% in one day, limit 3%
  assert.equal(e.phases[0].failedReason, 'daily');

  const f = simulateChallenge([[day(1), 3], [day(2), -2], [day(3), -2.5]], 1, one); // trailing: 3% → −1.5% = 4.5% fall
  assert.equal(f.phases[0].failedReason, 'drawdown');

  // phase 2 breaks its own rule after phase 1 was passed
  const g = simulateChallenge([...wins(6), ...Array.from({ length: 5 }, (_, i) => [day(10 + i), -1])], 1, two);
  assert.equal(g.phases[0].status, 'passed'); assert.equal(g.phases[1].status, 'failed'); assert.equal(g.overall, 'failed');

  // the checklist has three lines per phase, and ticks as phases are passed
  const stats = computeStats(wins(8));
  const list = sessionReadiness(stats, 1, one[0], 100, b);
  assert.deepEqual(list.filter((x) => x.phase !== undefined).map((x) => x.id), ['p1-dd', 'p1-daily', 'p1-target', 'p2-dd', 'p2-daily', 'p2-target']);
  assert.equal(list.find((x) => x.id === 'p1-target').done, true);
  assert.equal(list.find((x) => x.id === 'p2-target').done, false);

  assert.equal(phasesOf({ steps: 1, rules: one[0] }).length, 1);
  assert.equal(phasesOf({ steps: 2, rules: one[0] }).length, 2);
  assert.equal(phasesOf({ steps: 2, rules: one[0] })[1].target, 5);

  // the estimate understands two phases and reports how many cleared the first
  const est = simulate(wins(20).map(([d, r], i) => [d, i % 3 ? 1 : -1]), 1, two);
  assert.ok(est.cleared.length === 2 && est.cleared[0] >= est.cleared[1]);
});
