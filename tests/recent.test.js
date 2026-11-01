import test from 'node:test';
import assert from 'node:assert/strict';
import { noteWrite, noteDelete, mergeRecent, getRecent, clearRecent } from '../src/utils/recentWrites.js';

test('a just-saved item shows up even if the server list is behind', () => {
  clearRecent();
  noteWrite('trade', 't2', { id: 't2', date: '2024-02-02', accountId: 'a' });
  const out = mergeRecent('trade', [{ id: 't1', date: '2024-02-01', accountId: 'a' }], { keep: (t) => t.accountId === 'a' });
  assert.deepEqual(out.map((t) => t.id).sort(), ['t1', 't2']);
});

test('items for another account or month are not added', () => {
  clearRecent();
  noteWrite('trade', 'x', { id: 'x', date: '2024-05-01', accountId: 'b' });
  assert.equal(mergeRecent('trade', [], { keep: (t) => t.accountId === 'a' }).length, 0);
});

test('a just-deleted item stays gone; an edited one shows the edit', () => {
  clearRecent();
  noteDelete('trade', 't1');
  noteWrite('trade', 't2', { id: 't2', notes: 'fixed typo' });
  const out = mergeRecent('trade', [{ id: 't1' }, { id: 't2', notes: 'typo' }]);
  assert.deepEqual(out, [{ id: 't2', notes: 'fixed typo' }]);
  assert.equal(getRecent('trade', 't1'), null);
});

test('an older recent copy never replaces a newer one from the server', () => {
  clearRecent();
  noteWrite('bt', 's', { id: 's', updatedAt: 100, title: 'old' });
  const out = mergeRecent('bt', [{ id: 's', updatedAt: 200, title: 'new' }], { newer: (r, s) => r.updatedAt >= s.updatedAt });
  assert.equal(out[0].title, 'new');
});
