import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { api } from '../src/api.js';
import { isOffline, noteBrowserOnline, noteResponseSource, subscribeOffline, OFFLINE_WRITE_MESSAGE } from '../src/utils/connection.js';

function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (path, opts) => { calls.push({ path, method: opts.method }); return handler(path, opts); };
  return calls;
}
const okResponse = (body, headers = {}) => ({ ok: true, status: 200, headers: { get: (k) => headers[k] ?? null }, json: async () => body });

test('offline: writes are refused without touching the network', async () => {
  const calls = stubFetch(() => okResponse({}));
  noteBrowserOnline(false);
  for (const call of [() => api.post('/api/trades', {}), () => api.put('/api/trades', {}), () => api.del('/api/trades?id=1')]) {
    await assert.rejects(call, { message: OFFLINE_WRITE_MESSAGE });
  }
  assert.equal(calls.length, 0);
  noteBrowserOnline(true);
});

test('offline: reads still go through (the service worker answers them)', async () => {
  const calls = stubFetch(() => okResponse([{ id: 1 }], { 'x-ledgr-saved': '1' }));
  noteBrowserOnline(false);
  assert.deepEqual(await api.get('/api/trades'), [{ id: 1 }]);
  assert.equal(calls.length, 1);
  noteBrowserOnline(true);
});

test('an answer served from the saved copy switches to read-only, a real one switches back', async () => {
  const seen = [];
  const off = subscribeOffline((v) => seen.push(v));
  stubFetch(() => okResponse({}, { 'x-ledgr-saved': '1' }));
  await api.get('/api/trades');
  assert.equal(isOffline(), true);
  await assert.rejects(() => api.post('/api/trades', {}), { message: OFFLINE_WRITE_MESSAGE });

  stubFetch(() => okResponse({}));
  await api.get('/api/trades');
  assert.equal(isOffline(), false);
  assert.deepEqual(seen, [true, false]);
  off();
});

test('coming back online clears the saved-copy flag', () => {
  noteResponseSource(true);
  assert.equal(isOffline(), true);
  noteBrowserOnline(true);
  assert.equal(isOffline(), false);
});

test('installable: manifest has what browsers require', () => {
  const m = JSON.parse(fs.readFileSync(new URL('../public/manifest.json', import.meta.url)));
  assert.equal(m.display, 'standalone');
  assert.ok(m.start_url && m.name && m.short_name);
  for (const size of ['192x192', '512x512']) assert.ok(m.icons.some((i) => i.sizes === size), `icon ${size}`);
  for (const i of m.icons) assert.ok(fs.existsSync(new URL(`../public${i.src}`, import.meta.url)), `${i.src} exists`);
});

test('service worker parses, never intercepts writes, and clears data on request', () => {
  const file = new URL('../public/sw.js', import.meta.url);
  execFileSync(process.execPath, ['--check', file.pathname]);
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /request\.method !== 'GET'\) return/);
  assert.match(src, /clear-data/);
  assert.match(src, /\/api\/backup/); // whole-account backups are never kept
});
