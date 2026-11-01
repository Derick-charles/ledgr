import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAllMilestones } from '../src/utils/milestones.js';

const run = (ctx) => {
  const out = {};
  evaluateAllMilestones({ streak: 0, trades: [], tierHistory: [], todayTier: null, entry: {}, journalHistory: [], ...ctx })
    .forEach((c) => c.milestones.forEach((m) => { out[m.id] = m.result; }));
  return out;
};

test('journaling streak milestones', () => {
  const r = run({ streak: 10 });
  assert.equal(r['streak-7'].achieved, true);
  assert.equal(r['streak-30'].achieved, false);
  assert.equal(r['streak-30'].progressLabel, '10/30 days');
});

test('S-tier counts include today', () => {
  const r = run({ tierHistory: [{ tierComputed: 'S' }, { tierComputed: 'A' }], todayTier: 'S' });
  assert.equal(r['first-s-tier'].achieved, true);
  assert.equal(r['five-s-tier'].progressLabel, '2/5 days');
});

test('no C-tier needs at least one tracked day and no C', () => {
  assert.equal(run({}) ['no-c-tier-week'].achieved, false);
  assert.equal(run({ tierHistory: [{ tierComputed: 'B' }] })['no-c-tier-week'].achieved, true);
  assert.equal(run({ tierHistory: [{ tierComputed: 'C' }] })['no-c-tier-week'].achieved, false);
});

test('clean-trade streak walks from the most recent trade', () => {
  const trades = [{}, {}, {}, {}, {}, { mistake: 'FOMO' }]; // newest first
  assert.equal(run({ trades })['clean-streak-5'].achieved, true);
  assert.equal(run({ trades: [{ mistake: 'FOMO' }, {}, {}, {}, {}, {}] })['clean-streak-5'].achieved, false);
});

test('revenge trades and planned entries', () => {
  assert.equal(run({ trades: [{ mistake: 'Revenge Trade' }] })['no-revenge-trades'].achieved, false);
  assert.equal(run({ trades: [{ planned: true }] })['first-planned-trade'].achieved, true);
  assert.equal(run({ trades: [{}] })['first-planned-trade'].achieved, false);
});

test('affirmations milestone works with summary items and full entries', () => {
  assert.equal(run({ journalHistory: [{ hasAffirmations: true }] })['first-affirmation'].achieved, true);
  assert.equal(run({ journalHistory: [{ affirmationsNotes: 'x' }] })['first-affirmation'].achieved, true);
  assert.equal(run({ entry: { affirmationsSelected: ['a'] } })['first-affirmation'].achieved, true);
  assert.equal(run({ journalHistory: [{ hasAffirmations: false }] })['first-affirmation'].achieved, false);
});
