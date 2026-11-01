import { stores, json } from './_blobs.js';
import crypto from 'node:crypto';
import {
  eventually, hashPassword, verifyPassword, fakeVerify, needsRehash, normalizeEmail, isValidEmail, findUserByEmail, getUser,
  publicUser, claimLegacyData, setUserAccounts, makeSessionToken, checkSession, sessionCookie,
  SESSION_SECONDS, uuid, isRevoked, invalidateUserSessions, legacyOwnerId, userIdForEmail, firstAccountId, getUserAccounts } from './_auth.js';

// Sign up / sign in / sign out / "who am I".
//   GET    → { authenticated, user }
//   POST   { action: 'signup' | 'login', email, password, name? }
//          { action: 'change_password', currentPassword, newPassword }
//          { action: 'sign_out_everywhere' }
//          { action: 'generate_recovery', password }      → { recoveryCode } (shown once)
//          { action: 'reset_password', email, recoveryCode, newPassword }
//   DELETE → sign out (this device)
//
// Optional environment variables:
//   LEDGR_OWNER_EMAIL   the email allowed to take over the journal data that
//                       existed before users did (otherwise: first sign-up)
//   LEDGR_ALLOW_SIGNUP  set to "false" to close sign-ups once the people you
//                       want have registered (the very first user is always allowed)

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

// A recovery code is the no-email way back into an account: 16 characters
// (no look-alikes), shown once, stored only as a scrypt hash.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRecoveryCode() {
  let raw = '';
  for (let i = 0; i < 16; i++) raw += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return raw.match(/.{4}/g).join('-');
}
const normalizeCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const throttleKey = (email) => `throttle:${crypto.createHash('sha256').update(email).digest('hex')}`;

function withSession(event, token, maxAge, body) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(event, token, maxAge), 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

// Wrong-guess limiter shared by sign-in, password change and recovery-code
// reset (separate counters per purpose). Returns a 429 response when locked.
async function lockedOut(settings, key) {
  const now = Date.now();
  let state = (await settings.get(key, { type: 'json' })) || { count: 0, first: now };
  if (now - state.first > WINDOW_MS) state = { count: 0, first: now };
  if (state.count >= MAX_FAILS) {
    const mins = Math.ceil((WINDOW_MS - (now - state.first)) / 60000);
    return { response: json(429, { error: `Too many wrong attempts. Try again in about ${mins} minute${mins !== 1 ? 's' : ''}.` }) };
  }
  return { state };
}
async function recordFail(settings, key, state) {
  await settings.setJSON(key, { count: state.count + 1, first: state.first });
  await sleep(300);
}

export const handler = async (event) => {
  const { users, settings } = stores(event);
  try {
    if (event.httpMethod === 'GET') {
      const session = await checkSession(event, settings);
      const user = session.userId ? await eventually(() => getUser(users, session.userId), (u) => !!u) : null;
      if (user && isRevoked(user, session.exp)) return json(200, { authenticated: false, reason: 'revoked' });
      if (user) {
        // Setup warnings are shown only to whoever owns the original data —
        // booleans only, never the values themselves.
        const isOwner = (await legacyOwnerId(settings)) === user.id;
        const config = isOwner ? {
          ownerEmailSet: !!normalizeEmail(process.env.LEDGR_OWNER_EMAIL),
          sessionSecretSet: !!process.env.LEDGR_SESSION_SECRET,
          signupsClosed: String(process.env.LEDGR_ALLOW_SIGNUP).toLowerCase() === 'false',
        } : null;
        return json(200, { authenticated: true, user: publicUser(user), config });
      }
      // `reason` says why not (no cookie sent / bad signature / expired /
      // user missing) so a sign-in that doesn't stick can be diagnosed.
      return json(200, { authenticated: false, reason: session.userId ? 'user_missing' : session.reason });
    }

    if (event.httpMethod === 'DELETE') return withSession(event, '', 0, { ok: true });

    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const body = JSON.parse(event.body || '{}');
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');

    if (body.action === 'signup') {
      if (!isValidEmail(email)) return json(400, { error: 'Enter a valid email address.' });
      if (password.length < 8) return json(400, { error: 'Password must be at least 8 characters.' });
      if (password.length > 200) return json(400, { error: 'Password is too long.' });

      const { blobs } = await users.list({ prefix: 'id:' });
      if (blobs.length > 0 && String(process.env.LEDGR_ALLOW_SIGNUP).toLowerCase() === 'false') {
        return json(403, { error: 'Sign-ups are closed.' });
      }
      const newId = userIdForEmail(email);
      if ((await findUserByEmail(users, email)) || (await getUser(users, newId))) return json(409, { error: 'An account with that email already exists. Sign in instead.' });

      const recoveryCode = newRecoveryCode();
      const user = {
        id: newId, email, name: String(body.name || '').trim().slice(0, 60),
        passwordHash: await hashPassword(password), recoveryHash: await hashPassword(normalizeCode(recoveryCode)), createdAt: Date.now(),
      };
      await users.setJSON(`id:${user.id}`, user);
      await users.setJSON(`email:${email}`, { id: user.id });

      // Either inherits the pre-users data (once) or starts with a fresh
      // "Personal" trading account of their own.
      const inherited = await claimLegacyData(settings, user);
      // Never replace an account list that already exists (a sign-up repeated within a minute).
      const already = await getUserAccounts(settings, user.id);
      if (!already.length) await setUserAccounts(settings, user.id, inherited || [{ id: firstAccountId(user.id), name: 'Personal', createdAt: Date.now() }]);

      return withSession(event, await makeSessionToken(settings, user.id), SESSION_SECONDS, { ok: true, user: publicUser(user), recoveryCode });
    }

    if (body.action === 'login') {
      // Brute-force guard: 5 wrong passwords for an email in 15 minutes locks that email for the rest of the window.
      const lock = await lockedOut(settings, throttleKey(email));
      if (lock.response) return lock.response;
      const state = lock.state;

      const user = await findUserByEmail(users, email);
      const ok = user ? await verifyPassword(password, user.passwordHash) : (await fakeVerify(password), false);
      if (!ok) {
        await recordFail(settings, throttleKey(email), state);
        return json(401, { error: 'Wrong email or password.' });
      }
      if (state.count > 0) await settings.delete(throttleKey(email));
      // Quietly move an older-format hash to the current one now that we have the password.
      if (needsRehash(user.passwordHash)) await users.setJSON(`id:${user.id}`, { ...user, passwordHash: await hashPassword(password) }).catch(() => {});
      return withSession(event, await makeSessionToken(settings, user.id), SESSION_SECONDS, { ok: true, user: publicUser(user) });
    }

    // ---- Everything below needs a signed-in session ----------------------
    if (['change_password', 'sign_out_everywhere', 'generate_recovery'].includes(body.action)) {
      const session = await checkSession(event, settings);
      const user = session.userId ? await eventually(() => getUser(users, session.userId), (u) => !!u) : null;
      if (!user || isRevoked(user, session.exp)) return json(401, { code: 'unauthorized', error: 'Please sign in.' });

      // Re-issue this device's cookie after revoking, so only OTHER sessions end.
      const revokeOthers = async (changes) => {
        const updated = { ...user, ...changes, sessionsValidFrom: Date.now() };
        await users.setJSON(`id:${user.id}`, updated);
        invalidateUserSessions(user.id);
        return updated;
      };

      if (body.action === 'sign_out_everywhere') {
        const updated = await revokeOthers({});
        return withSession(event, await makeSessionToken(settings, user.id), SESSION_SECONDS, { ok: true, user: publicUser(updated) });
      }

      // Confirming with the current password guards against someone using a
      // phone that was left signed in. Shares the login attempt limiter.
      const key = throttleKey(user.email);
      const lock = await lockedOut(settings, key);
      if (lock.response) return lock.response;
      const current = String(body.currentPassword ?? body.password ?? '');
      if (!(await verifyPassword(current, user.passwordHash))) {
        await recordFail(settings, key, lock.state);
        return json(401, { error: 'Your current password is wrong.' });
      }
      if (lock.state.count > 0) await settings.delete(key);

      if (body.action === 'change_password') {
        const next = String(body.newPassword || '');
        if (next.length < 8) return json(400, { error: 'New password must be at least 8 characters.' });
        if (next.length > 200) return json(400, { error: 'Password is too long.' });
        const updated = await revokeOthers({ passwordHash: await hashPassword(next) });
        return withSession(event, await makeSessionToken(settings, user.id), SESSION_SECONDS, { ok: true, user: publicUser(updated) });
      }

      // generate_recovery — replaces any earlier code.
      const code = newRecoveryCode();
      const updated = { ...user, recoveryHash: await hashPassword(normalizeCode(code)) };
      await users.setJSON(`id:${user.id}`, updated);
      invalidateUserSessions(user.id);
      return json(200, { ok: true, recoveryCode: code, user: publicUser(updated) });
    }

    // Signed-out path: reset a forgotten password with the recovery code.
    if (body.action === 'reset_password') {
      const key = `${throttleKey(email)}:reset`;
      const lock = await lockedOut(settings, key);
      if (lock.response) return lock.response;
      const next = String(body.newPassword || '');
      if (next.length < 8) return json(400, { error: 'New password must be at least 8 characters.' });
      if (next.length > 200) return json(400, { error: 'Password is too long.' });

      const user = await findUserByEmail(users, email);
      const code = normalizeCode(body.recoveryCode);
      const ok = user && user.recoveryHash && code.length === 16 ? await verifyPassword(code, user.recoveryHash) : (await fakeVerify(code), false);
      if (!ok) {
        await recordFail(settings, key, lock.state);
        // Same message whether the email, the code, or the code's existence is wrong.
        return json(401, { error: "That email and recovery code don't match." });
      }
      if (lock.state.count > 0) await settings.delete(key);

      // A recovery code works once: the reset issues a fresh one.
      const fresh = newRecoveryCode();
      const updated = { ...user, passwordHash: await hashPassword(next), recoveryHash: await hashPassword(normalizeCode(fresh)), sessionsValidFrom: Date.now() };
      await users.setJSON(`id:${user.id}`, updated);
      invalidateUserSessions(user.id);
      await settings.delete(throttleKey(email)).catch(() => {});
      return withSession(event, await makeSessionToken(settings, user.id), SESSION_SECONDS, { ok: true, user: publicUser(updated), recoveryCode: fresh });
    }

    return json(400, { error: 'Unknown action' });
  } catch (e) {
    console.error('[auth]', e);
    // Includes the message so a failing deployment can be diagnosed from the browser.
    return json(500, { error: `Server error: ${e.message || e}` });
  }
};
