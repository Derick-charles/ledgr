import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStreak } from '../src/utils/streak.js';

const today = new Date(2026, 9, 17); // 17 Oct 2026 (local)
test('streak counts consecutive days ending today', () => {
  assert.equal(computeStreak(['2026-10-17', '2026-10-16', '2026-10-15', '2026-10-13'], today), 3);
});
test('no entry yet today does not break the streak', () => {
  assert.equal(computeStreak(['2026-10-16', '2026-10-15'], today), 2);
});
test('a gap yesterday means no streak', () => {
  assert.equal(computeStreak(['2026-10-15', '2026-10-14'], today), 0);
});
test('empty and Set inputs', () => {
  assert.equal(computeStreak([], today), 0);
  assert.equal(computeStreak(new Set(['2026-10-17']), today), 1);
});
test('crosses a month boundary', () => {
  assert.equal(computeStreak(['2026-10-01', '2026-09-30', '2026-09-29'], new Date(2026, 9, 1)), 3);
});
