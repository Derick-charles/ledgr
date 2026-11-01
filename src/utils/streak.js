import { toDateId } from './dateHelpers.js';

// Counts consecutive days (ending today or yesterday) present in `dateIds`.
// Pure so it can run against either a live `?keys=1` fetch or — now — the
// same dateIds already sitting in the journal summary, with no extra
// network request either way. Today not yet having an entry doesn't break
// the streak (you haven't journaled today *yet*), so the walk starts from
// yesterday in that case.
export function computeStreak(dateIds, today = new Date()) {
  const set = dateIds instanceof Set ? dateIds : new Set(dateIds);
  let count = 0;
  const cursor = new Date(today);
  if (!set.has(toDateId(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (set.has(toDateId(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}
