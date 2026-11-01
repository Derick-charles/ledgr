import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { hashPassword, verifyPassword, needsRehash } from '../netlify/functions/_auth.js';

test('new hashes verify and are not flagged for upgrade', async () => {
  const h = await hashPassword('password1');
  assert.ok(h.startsWith('pbkdf2$'));
  assert.equal(await verifyPassword('password1', h), true);
  assert.equal(await verifyPassword('nope', h), false);
  assert.equal(needsRehash(h), false);
});

test('older scrypt hashes still verify and are flagged for upgrade', async () => {
  const salt = crypto.randomBytes(16);
  const old = `${salt.toString('hex')}:${crypto.scryptSync('password1', salt, 64).toString('hex')}`;
  assert.equal(await verifyPassword('password1', old), true);
  assert.equal(await verifyPassword('wrong', old), false);
  assert.equal(needsRehash(old), true);
});
