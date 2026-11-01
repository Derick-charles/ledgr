import { stores, json, uuid, keyFor, keyBelongsTo } from './_blobs.js';
import { cleanChallenge } from './_challenge-utils.js';
import { protect, getUserAccounts, setUserAccounts, invalidateSessionFor } from './_auth.js';

// The signed-in user's own TRADING accounts (Personal, Funded 50K…).
// Each user has a separate list; nobody can see, rename or delete another
// user's accounts.

// Every store an account's data could live in, for cascade delete.
async function deleteAllDataFor(allStores, accountId) {
  const targets = [allStores.trades, allStores.journal, allStores.certificates, allStores.lessons];
  for (const store of targets) {
    const { blobs } = await store.list();
    const mine = blobs.map((b) => b.key).filter((k) => keyBelongsTo(k, accountId));
    await Promise.all(mine.map((k) => store.delete(k)));
  }
  // Settings keys (checklist/mistakeTags/poiTags) are single JSON blobs per
  // account, not a list of many — delete each directly rather than via list().
  await Promise.all(
    ['checklist', 'mistakeTags', 'poiTags', 'lastBackup'].map((k) => allStores.settings.delete(keyFor(accountId, k)).catch(() => {}))
  );
  await Promise.all(['summary:trades', 'summary:journal'].map((k) => allStores.summaries.delete(keyFor(accountId, k)).catch(() => {})));
}

export const handler = protect(async (event, ctx) => {
  const allStores = stores(event);
  const { settings } = allStores;
  const userId = ctx.user.id;
  const q = event.queryStringParameters || {};

  if (event.httpMethod === 'GET') {
    return json(200, await getUserAccounts(settings, userId));
  }

  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    const name = (body.name || '').trim();
    if (!name) return json(400, { error: 'Account name is required' });
    const accounts = await getUserAccounts(settings, userId);
    const account = { id: uuid(), name, createdAt: Date.now() };
    if (body.challenge) {
      const challenge = cleanChallenge(body.challenge);
      if (!challenge) return json(400, { error: 'Challenge settings are incomplete (a starting balance is required).' });
      account.challenge = challenge;
    }
    await setUserAccounts(settings, userId, [...accounts, account]);
    invalidateSessionFor(event);
    return json(200, account);
  }

  if (event.httpMethod === 'PUT') {
    if (!q.id) return json(400, { error: 'Missing id' });
    if (!ctx.owns(q.id)) return json(403, { error: 'That account is not yours.' });
    const body = JSON.parse(event.body || '{}');
    const name = (body.name || '').trim();
    const hasChallenge = Object.prototype.hasOwnProperty.call(body, 'challenge');
    if (!name && !hasChallenge) return json(400, { error: 'Account name is required' });
    const patch = {};
    if (name) patch.name = name;
    if (hasChallenge) {
      // null removes challenge tracking from the account.
      const challenge = body.challenge === null ? null : cleanChallenge(body.challenge);
      if (body.challenge !== null && !challenge) return json(400, { error: 'Challenge settings are incomplete (a starting balance is required).' });
      patch.challenge = challenge;
    }
    const accounts = await getUserAccounts(settings, userId);
    const next = accounts.map((a) => {
      if (a.id !== q.id) return a;
      const merged = { ...a, ...patch };
      if (merged.challenge === null) delete merged.challenge;
      return merged;
    });
    await setUserAccounts(settings, userId, next);
    return json(200, next.find((a) => a.id === q.id));
  }

  if (event.httpMethod === 'DELETE') {
    if (!q.id) return json(400, { error: 'Missing id' });
    // Without this check a signed-in user could wipe someone else's data by id.
    if (!ctx.owns(q.id)) return json(403, { error: 'That account is not yours.' });
    const accounts = await getUserAccounts(settings, userId);
    if (accounts.length <= 1) {
      return json(400, { error: "Can't delete your only account." });
    }
    await setUserAccounts(settings, userId, accounts.filter((a) => a.id !== q.id));
    invalidateSessionFor(event);
    await deleteAllDataFor(allStores, q.id);
    return json(200, { ok: true });
  }

  return json(405, { error: 'Method not allowed' });
}, { account: 'none' });
