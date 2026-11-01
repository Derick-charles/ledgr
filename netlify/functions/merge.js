import crypto from 'node:crypto';
import { stores, json } from './_blobs.js';
import { protect, getUser, getUserAccounts, setUserAccounts, eventually, invalidateUserSessions } from './_auth.js';
import { writeSummary, removeSummary } from './_summary.js';
import { toSummary } from './_backtest-utils.js';

// Merging two accounts that ended up separate (the same person signed up
// twice, or on two different emails). Both accounts must be signed in at the
// same time, one on each device:
//
//   1. On the account you want to RETIRE:   POST { action: 'create' } → a one-time code (15 minutes)
//   2. On the account you want to KEEP:     POST { action: 'merge', code } → everything from the
//      retired account moves into this one, and the retired account is deleted.
//
// Nothing is merged without a code only the retired account's own session can
// make, so nobody can pull someone else's data in.

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TTL_MS = 15 * 60 * 1000;
const normalizeCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const codeKey = (code) => `merge:${crypto.createHash('sha256').update(normalizeCode(code)).digest('hex')}`;
function newCode() {
  let raw = '';
  for (let i = 0; i < 12; i++) raw += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return raw.match(/.{4}/g).join('-');
}

export const handler = protect(async (event, ctx) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { settings, users, backtests, summaries } = stores(event);
  const me = ctx.user;
  const body = JSON.parse(event.body || '{}');

  if (body.action === 'create') {
    const code = newCode();
    await settings.setJSON(codeKey(code), { from: me.id, exp: Date.now() + TTL_MS });
    return json(200, { code, minutes: TTL_MS / 60000 });
  }

  if (body.action !== 'merge') return json(400, { error: 'Unknown action' });
  const key = codeKey(body.code);
  const rec = await eventually(() => settings.get(key, { type: 'json' }), (v) => !!v, [200, 600]);
  if (!rec || rec.exp < Date.now()) return json(404, { error: 'That code is wrong or has expired. Make a new one on the other account.' });
  if (rec.from === me.id) return json(400, { error: 'That code is from this same account. Make it on the OTHER account.' });
  const src = await eventually(() => getUser(users, rec.from), (u) => !!u, [200, 600]);
  if (!src) { await settings.delete(key).catch(() => {}); return json(404, { error: 'The other account no longer exists.' }); }

  // 1. Trading accounts (their trades, journal, certificates … stay under the same account ids).
  const srcAccounts = await eventually(() => getUserAccounts(settings, src.id), (l) => l.length > 0, [200, 600]);
  const myAccounts = await getUserAccounts(settings, me.id);
  const have = new Set(myAccounts.map((a) => a.id));
  const names = new Set(myAccounts.map((a) => String(a.name || '').toLowerCase()));
  const moved = srcAccounts.filter((a) => !have.has(a.id)).map((a) => (names.has(String(a.name || '').toLowerCase()) ? { ...a, name: `${a.name} (merged)` } : a));
  await setUserAccounts(settings, me.id, [...myAccounts, ...moved]);

  // 2. Backtest sessions.
  const { blobs } = await backtests.list();
  const srcKeys = blobs.map((b) => b.key).filter((k) => k.startsWith(`${src.id}/`));
  for (const k of srcKeys) {
    const bt = await backtests.get(k, { type: 'json' });
    if (!bt) continue;
    await backtests.setJSON(`${me.id}/${bt.id}`, { ...bt, userId: me.id });
    await backtests.delete(k);
  }
  const mine = (await Promise.all(blobs.map((b) => b.key).filter((k) => k.startsWith(`${me.id}/`)).map((k) => backtests.get(k, { type: 'json' })))).filter(Boolean);
  const all = [...mine, ...(await Promise.all(srcKeys.map((k) => backtests.get(`${me.id}/${k.slice(src.id.length + 1)}`, { type: 'json' })))).filter(Boolean)];
  await writeSummary(summaries, 'backtests', `u:${me.id}`, all.map(toSummary));
  await removeSummary(summaries, 'backtests', `u:${src.id}`).catch(() => {});

  // 3. Challenge-prep settings: keep mine, otherwise take theirs.
  const theirPrep = await settings.get(`bt-prep:${src.id}`, { type: 'json' });
  if (theirPrep && !(await settings.get(`bt-prep:${me.id}`, { type: 'json' }))) await settings.setJSON(`bt-prep:${me.id}`, theirPrep);
  await settings.delete(`bt-prep:${src.id}`).catch(() => {});

  // 4. If the retired account held the pre-accounts data, it now belongs to this one.
  const claimed = await settings.get('legacyClaimedBy', { type: 'json' });
  if (claimed && claimed.userId === src.id) await settings.setJSON('legacyClaimedBy', { ...claimed, userId: me.id });

  // 5. Uploaded files carry their owner's id; this account now also owns the retired one's.
  const mergedFrom = [...new Set([...(me.mergedFrom || []), src.id, ...(src.mergedFrom || [])])];
  await users.setJSON(`id:${me.id}`, { ...me, mergedFrom });

  // 6. Retire the other account. (Its sign-in email, if it had a different one, stops working.)
  const ref = await users.get(`email:${src.email}`, { type: 'json' });
  if (ref && ref.id === src.id) {
    if (src.email === me.email) await users.setJSON(`email:${src.email}`, { id: me.id });
    else await users.delete(`email:${src.email}`);
  }
  await users.delete(`id:${src.id}`);
  await settings.delete(`userAccounts:${src.id}`).catch(() => {});
  await settings.delete(key).catch(() => {});
  invalidateUserSessions(src.id);
  invalidateUserSessions(me.id);

  return json(200, { ok: true, accounts: moved.length, sessions: srcKeys.length, from: src.email });
}, { account: 'none' });
