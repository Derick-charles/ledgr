import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRisk, cleanTime, cleanExtras, toSummaryItem, mediaIds } from '../netlify/functions/_trade-utils.js';
import { cleanChallenge } from '../netlify/functions/_challenge-utils.js';

test('normalizeRisk: real R from $ risked, unknown otherwise', () => {
  assert.deepEqual(normalizeRisk({ pnl: 300, risk: '100', side: 'long' }), { risk: 100, r: 3 });
  assert.deepEqual(normalizeRisk({ pnl: -50, risk: 200, side: 'short' }), { risk: 200, r: -0.25 });
  assert.deepEqual(normalizeRisk({ pnl: 300 }), { risk: null, r: null });
  assert.deepEqual(normalizeRisk({ pnl: 300, risk: -5 }), { risk: null, r: null });
  assert.deepEqual(normalizeRisk({ pnl: 300, risk: 'abc' }), { risk: null, r: null });
  assert.equal(normalizeRisk({ pnl: 0, risk: 100, side: 'missed' }).r, null);
  assert.equal(normalizeRisk({ pnl: 100, risk: 3, side: 'long' }).r, 33.33);
});

test('cleanTime accepts HH:MM only', () => {
  assert.equal(cleanTime('09:30'), '09:30');
  assert.equal(cleanTime('23:59'), '23:59');
  for (const bad of ['24:00', '9:30', '09:60', 'noon', '', null, undefined]) assert.equal(cleanTime(bad), null);
});

test('cleanExtras: ratings 1–5, notes trimmed, tags de-duplicated and capped', () => {
  const e = cleanExtras({ ratingExec: '4', ratingDisc: 9, notes: '  hi  ', tags: [' A+ ', 'a+', 'x'.repeat(40), '', 7] });
  assert.equal(e.ratingExec, 4);
  assert.equal(e.ratingDisc, null);
  assert.equal(e.notes, 'hi');
  assert.deepEqual(e.tags, ['A+', 'x'.repeat(24), '7']);
  assert.equal(cleanExtras({ tags: Array.from({ length: 20 }, (_, i) => `t${i}`) }).tags.length, 8);
  assert.deepEqual(cleanExtras({}), { ratingExec: null, ratingDisc: null, notes: null, tags: [] });
  assert.equal(cleanExtras({ notes: 'n'.repeat(5000) }).notes.length, 2000);
});

test('summary item keeps only the light fields (and real mistake/poi strings)', () => {
  const s = toSummaryItem({ id: '1', accountId: 'a', date: '2026-10-01', pnl: 5, risk: 2, r: 2.5, side: 'long', mistake: 'FOMO', poi: 'FVG', planned: 'long text', time: '09:30', notes: 'private', beforeMedia: [{}] });
  assert.equal(s.planned, true);
  assert.equal(s.mistake, 'FOMO');
  assert.equal('notes' in s, false);
  assert.equal('beforeMedia' in s, false);
});

test('mediaIds ignores links and empties', () => {
  assert.deepEqual(mediaIds([{ id: 'a' }, { type: 'link', url: 'x' }, null, { id: 'b', type: 'image' }]), ['a', 'b']);
});

test('cleanChallenge validates and normalises phases', () => {
  assert.equal(cleanChallenge(null), null);
  assert.equal(cleanChallenge({ phases: [] }), null);
  assert.equal(cleanChallenge({ phases: [{ startBalance: '' }] }), null);
  const c = cleanChallenge({ phases: [{
    startBalance: '50000', profitTarget: '', dailyLoss: { mode: 'percent', value: '5' }, maxDrawdown: null,
    drawdownType: 'weird', startDate: '2026-10-01', endDate: 'bad', minDays: '4.4', status: 'x',
  }] });
  const p = c.phases[0];
  assert.equal(p.startBalance, 50000);
  assert.equal(p.profitTarget, null);
  assert.deepEqual(p.dailyLoss, { mode: 'percent', value: 5 });
  assert.equal(p.maxDrawdown, null);
  assert.equal(p.drawdownType, 'static');
  assert.equal(p.endDate, null);
  assert.equal(p.minDays, 4);
  assert.equal(p.status, 'active');
  assert.equal(p.lockAtStart, true);
});
