import crypto from 'node:crypto';
import { stores, json, uuid, DEFAULT_ACCOUNT_ID } from './_blobs.js';

// Users & sessions.
//
// Naming: a "user" is a LOGIN (email + password). The "accounts" elsewhere in
// the app are TRADING accounts (Personal, Funded 50K…). Every trading account
// belongs to exactly one user, and every endpoint checks that before touching
// any data — see protect() at the bottom.
//
// Sessions are stateless: a signed "userId.expiry.signature" token in an
// HttpOnly cookie. The signing secret is LEDGR_SESSION_SECRET if you set one,
// otherwise a random secret generated once and kept in the settings store.

export const COOKIE_NAME = 'ledgr_session';
export const SESSION_SECONDS = 30 * 24 * 60 * 60; // 30 days

// ---- passwords -----------------------------------------------------------

// New hashes are PBKDF2-SHA256 through the Web Crypto API, which runs the same
// on Netlify and on Cloudflare Workers (their free plan allows only a few
// milliseconds of JavaScript CPU per request, which the old scrypt cost too
// much for; Workers also caps PBKDF2 at 100,000 rounds). Hashes made by the
// older version ("salt:hash", scrypt) still verify, and are upgraded to the new
// format the next time that person signs in.
const PBKDF2_ROUNDS = 100000;
const subtle = () => globalThis.crypto?.subtle || crypto.webcrypto.subtle;

async function pbkdf2(password, salt, rounds, bytes = 32) {
  const key = await subtle().importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  return Buffer.from(await subtle().deriveBits({ name: 'PBKDF2', salt, iterations: rounds, hash: 'SHA-256' }, key, bytes * 8));
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await pbkdf2(password, salt, PBKDF2_ROUNDS);
  return `pbkdf2$${PBKDF2_ROUNDS}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export const needsRehash = (stored) => !String(stored || '').startsWith('pbkdf2$');

export async function verifyPassword(password, stored) {
  const text = String(stored || '');
  if (text.startsWith('pbkdf2$')) {
    const [, rounds, saltHex, hashHex] = text.split('$');
    if (!saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await pbkdf2(password, Buffer.from(saltHex, 'hex'), Number(rounds) || PBKDF2_ROUNDS, expected.length);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }
  const [saltHex, hashHex] = text.split(':'); // older scrypt format
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Burns about the same CPU as a real check, so "no such email" and "wrong
// password" take about the same time.
let dummyHash = null;
export async function fakeVerify(password) {
  dummyHash = dummyHash || (await hashPassword('ledgr-dummy-password'));
  await verifyPassword(password, dummyHash);
}

export const normalizeEmail = (e) => String(e || '').trim().toLowerCase();
// One email = one account, even if two sign-ups race each other (storage can
// lag, so "does this email exist yet?" is sometimes answered too late). The
// account's id — and its first trading account's id — are worked out from the
// email, so a duplicate sign-up lands on the SAME records instead of creating
// a second, separate account.
export const userIdForEmail = (email) => crypto.createHash('sha256').update(`ledgr-user:${email}`).digest('hex').slice(0, 32);
export const firstAccountId = (userId) => crypto.createHash('sha256').update(`ledgr-first-account:${userId}`).digest('hex').slice(0, 32);

// Files uploaded by an account that was later merged into this one still count as this user's.
export const ownsStamp = (user, owner) => !!owner && (owner === user.id || (user.mergedFrom || []).includes(owner));

export const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;

// ---- user records --------------------------------------------------------

export async function findUserByEmail(usersStore, email) {
  const ref = await usersStore.get(`email:${email}`, { type: 'json' });
  return ref ? usersStore.get(`id:${ref.id}`, { type: 'json' }) : null;
}

export async function getUser(usersStore, id) {
  return usersStore.get(`id:${id}`, { type: 'json' });
}

export const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name || '', hasRecovery: !!u.recoveryHash });

// A user's trading-account list lives in settings under their own key.
const userAccountsKey = (userId) => `userAccounts:${userId}`;

export async function getUserAccounts(settings, userId) {
  return (await settings.get(userAccountsKey(userId), { type: 'json' })) || [];
}
export async function setUserAccounts(settings, userId, list) {
  await settings.setJSON(userAccountsKey(userId), list);
}

// Data that existed before users did (the single-owner version) all lives
// under the old global `accounts` list and the "default" account. The first
// user to sign up — or LEDGR_OWNER_EMAIL, if you set it — takes it over, once.
export async function claimLegacyData(settings, user) {
  const claimedBy = await settings.get('legacyClaimedBy', { type: 'json' });
  if (claimedBy && claimedBy.userId !== user.id) return null; // (the same person signing up twice gets it again)
  const owner = normalizeEmail(process.env.LEDGR_OWNER_EMAIL);
  if (owner && owner !== user.email) return null;
  const legacy = await settings.get('accounts', { type: 'json' });
  const list = Array.isArray(legacy) && legacy.length
    ? legacy
    : [{ id: DEFAULT_ACCOUNT_ID, name: 'Personal', createdAt: Date.now() }];
  await settings.setJSON('legacyClaimedBy', { userId: user.id, at: Date.now() });
  return list;
}

export async function legacyOwnerId(settings) {
  const c = await settings.get('legacyClaimedBy', { type: 'json' });
  return c ? c.userId : null;
}

// ---- sessions ------------------------------------------------------------

let cachedSecret = null;
async function sessionSecret(settings) {
  if (process.env.LEDGR_SESSION_SECRET) return process.env.LEDGR_SESSION_SECRET;
  if (cachedSecret) return cachedSecret;
  const read = () => settings.get('sessionSecret', { type: 'json' });
  // A secret may already exist but not be visible to this function yet, so
  // look a couple of times before deciding to create one.
  let s = await eventually(read, (v) => !!v, [300, 700]);
  if (!s) {
    const mine = { value: crypto.randomBytes(32).toString('hex') };
    await settings.setJSON('sessionSecret', mine);
    // Two cold starts can race to create it; adopt whichever copy ended up
    // stored. (If it isn't readable back yet, our own copy is the best we have.)
    s = (await eventually(read, (v) => !!v, [300, 700])) || mine;
  }
  cachedSecret = s.value;
  return cachedSecret;
}

const sign = (secret, payload) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');

export async function makeSessionToken(settings, userId) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(await sessionSecret(settings), payload)}`;
}

function readCookie(event, name) {
  const headers = event.headers || {};
  const raw = headers.cookie || headers.Cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i !== -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// Checks the session cookie. Returns { userId } when valid, or { reason }
// explaining why not (used by /api/auth to make sign-in problems diagnosable).
export async function checkSession(event, settings) {
  const token = readCookie(event, COOKIE_NAME);
  if (!token) return { reason: 'no_cookie' };
  const parts = token.split('.');
  if (parts.length !== 3) return { reason: 'malformed_cookie' };
  const [userId, exp, sig] = parts;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return { reason: 'expired' };
  const good = sign(await sessionSecret(settings), `${userId}.${exp}`);
  const a = Buffer.from(sig), b = Buffer.from(good);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? { userId, exp: Number(exp) } : { reason: 'bad_signature' };
}

// "Sign out everywhere" / a password change sets user.sessionsValidFrom.
// A token's issue time is its expiry minus the session length, so any token
// issued before that moment is refused — no per-session storage needed.
export function isRevoked(user, exp) {
  if (!user || !user.sessionsValidFrom || !exp) return false;
  return exp - SESSION_SECONDS < Math.floor(user.sessionsValidFrom / 1000);
}

// Returns the userId in a valid, unexpired session cookie — or null.
export async function sessionUserId(event, settings) {
  return (await checkSession(event, settings)).userId || null;
}

function isLocalhost(event) {
  const host = (event.headers && (event.headers.host || event.headers.Host)) || '';
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
}

export function sessionCookie(event, token, maxAgeSeconds) {
  return [
    `${COOKIE_NAME}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`,
    ...(isLocalhost(event) ? [] : ['Secure']), // keeps the cookie off plain http (not for local dev)
  ].join('; ');
}

// Netlify Blobs can serve a stale (empty) read for a moment after a write
// made by a DIFFERENT function — e.g. the very first requests after signing
// up, before the new user record has propagated. If the session cookie has a
// valid signature we know we issued it, so the user must exist: wait briefly
// and look again instead of wrongly treating them as signed out.
export async function eventually(read, isReady, delays = [200, 500, 1000]) {
  let value = await read();
  for (const ms of delays) {
    if (isReady(value)) break;
    await new Promise((r) => setTimeout(r, ms));
    value = await read();
  }
  return value;
}

// A warm Netlify Function instance keeps this module in memory between
// invocations, so a tiny cache here saves the two blob reads (`getUser` +
// `getUserAccounts`) that `protect()` would otherwise repeat on every single
// request. Keyed by the raw session cookie (which already changes whenever
// the user signs in again), kept for only a few seconds so a change made in
// one request (new account, renamed user) is never stale for long.
const SESSION_CACHE_TTL_MS = 10_000;
const sessionCache = new Map(); // token -> { user, accountList, expiresAt }

function getCachedSession(token) {
  const hit = sessionCache.get(token);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) { sessionCache.delete(token); return null; }
  return hit;
}

function setCachedSession(token, user, accountList) {
  sessionCache.set(token, { user, accountList, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
  // Belt-and-braces: don't let a long-lived warm instance grow this forever.
  if (sessionCache.size > 500) sessionCache.delete(sessionCache.keys().next().value);
}

// A write that changes what `protect()` caches (account list, user record)
// can call this with the same cookie token to make the next request see the
// change immediately instead of waiting out the TTL.
export function invalidateSessionCache(token) {
  if (token) sessionCache.delete(token);
}

// Convenience for handlers: invalidate the calling request's own cached
// session (e.g. right after creating/renaming/deleting a trading account),
// so this same user's very next request sees the change instead of a stale
// account list for up to SESSION_CACHE_TTL_MS.
// Drops every cached session of one user (after revoking their sessions).
export function invalidateUserSessions(userId) {
  for (const [token, v] of sessionCache) if (v.user && v.user.id === userId) sessionCache.delete(token);
}

export function invalidateSessionFor(event) {
  invalidateSessionCache(readCookie(event, COOKIE_NAME));
}

// ---- the guard every data endpoint goes through ---------------------------

// protect(handler, { account })
//   Runs `handler(event, ctx)` only for a signed-in user, with
//   ctx = { user, accountIds, owns(id), stores }.
//   account: 'query'  (default) — requires ?account=<id> and checks the user
//                       owns it; ?account=all is accepted only if allowAll.
//            'none'   — no account involved (media, accounts list).
//            'manual' — the handler checks ctx.owns() itself (e.g. the
//                       account id arrives in a POST body).
// Anything else gets a 401 (not signed in) or 403 (not your account) and the
// handler never runs, so no data can be read or changed.
export function protect(handler, { account = 'query', allowAll = false } = {}) {
  return async (event, context) => {
    try {
      const all = stores(event);
      const token = readCookie(event, COOKIE_NAME);
      const cached = token ? getCachedSession(token) : null;

      let user, accountList;
      if (cached) {
        ({ user, accountList } = cached);
        // Still validate the token itself (signature/expiry) on every call.
        const s = await checkSession(event, all.settings);
        if (!s.userId || isRevoked(user, s.exp)) { sessionCache.delete(token); return json(401, { code: 'unauthorized', error: 'Please sign in.' }); }
      } else {
        const session = await checkSession(event, all.settings);
        const userId = session.userId || null;
        user = userId ? await eventually(() => getUser(all.users, userId), (u) => !!u) : null;
        if (!user || isRevoked(user, session.exp)) return json(401, { code: 'unauthorized', error: 'Please sign in.' });

        // Every user has at least one trading account, so an empty list means
        // "not visible yet" rather than "none".
        accountList = await eventually(() => getUserAccounts(all.settings, user.id), (l) => l.length > 0);
        setCachedSession(token, user, accountList);
      }

      const accountIds = accountList.map((a) => a.id);
      const owns = (id) => !!id && accountIds.includes(id);
      const ctx = { user, accountIds, owns, stores: all };

      if (account === 'query') {
        const id = (event.queryStringParameters || {}).account;
        if (!id) return json(400, { error: 'Missing account' });
        if (!(id === 'all' && allowAll) && !owns(id)) return json(403, { error: 'That account is not yours.' });
      }
      return await handler(event, ctx);
    } catch (e) {
      console.error('[protect]', e);
      return json(e.statusCode || 500, { error: e.message || 'Server error' });
    }
  };
}

export { uuid };
