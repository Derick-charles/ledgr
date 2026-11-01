import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tradesToCSV, filterTrades, EMPTY_FILTERS } from '../src/utils/csv.js';

const base = { date: '2026-10-05', sym: 'US30', side: 'long', pnl: 100 };

test('CSV: header row and one line per trade, oldest first', () => {
  const lines = tradesToCSV([{ ...base, date: '2026-10-06' }, base]).split('\r\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^Date,Time,Account,Symbol,Side/);
  assert.ok(lines[1].startsWith('2026-10-05'));
});

test('CSV: cells starting with = + - @ are neutralised against formula injection', () => {
  const csv = tradesToCSV([{ ...base, notes: '=HYPERLINK("http://evil")', actual: '+cmd', planned: '@SUM(1)' }]);
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"")"`));
  assert.ok(csv.includes("'+cmd"));
  assert.ok(csv.includes("'@SUM(1)"));
});

test('CSV: negative P&L stays a plain number', () => {
  const row = tradesToCSV([{ ...base, pnl: -42.5 }]).split('\r\n')[1];
  assert.ok(row.includes(',-42.5,'));
  assert.ok(!row.includes("'-42.5"));
});

test('CSV: commas, quotes and newlines are quoted per RFC 4180', () => {
  const row = tradesToCSV([{ ...base, planned: 'a, "b"\nc' }]);
  assert.ok(row.includes('"a, ""b""\nc"'));
});

test('CSV: missed trades export no P&L; R only when risk known', () => {
  const rows = tradesToCSV([{ ...base, side: 'missed', pnl: 0 }, { ...base, date: '2026-10-07', risk: 50 }]).split('\r\n');
  const header = rows[0].split(',');
  const pnlIdx = header.indexOf('P&L'), rIdx = header.indexOf('R');
  assert.equal(rows[1].split(',')[pnlIdx], '');
  assert.equal(rows[2].split(',')[rIdx], '2');
});

test('filters: side, result, mistake, tag, rating, search', () => {
  const trades = [
    { ...base, id: 1, mistake: 'FOMO', tags: ['news'], ratingExec: 2, notes: 'chased it' },
    { ...base, id: 2, pnl: -10, side: 'short', ratingExec: 5, ratingDisc: 5 },
    { ...base, id: 3, side: 'missed', pnl: 0 },
  ];
  const ids = (f) => filterTrades(trades, { ...EMPTY_FILTERS, ...f }).map((x) => x.id);
  assert.deepEqual(ids({ side: 'short' }), [2]);
  assert.deepEqual(ids({ result: 'win' }), [1]);
  assert.deepEqual(ids({ result: 'loss' }), [2]);
  assert.deepEqual(ids({ mistake: '__clean' }), [2, 3]);
  assert.deepEqual(ids({ tag: 'news' }), [1]);
  assert.deepEqual(ids({ rating: 'low' }), [1]);
  assert.deepEqual(ids({ rating: 'high' }), [2]);
  assert.deepEqual(ids({ rating: 'unrated' }), [3]);
  assert.deepEqual(ids({ q: 'CHASED' }), [1]);
});
