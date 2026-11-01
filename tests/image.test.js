import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compressImage } from '../src/utils/image.js';

const file = (name, type, bytes) => new File([new Uint8Array(bytes)], name, { type });

test('non-images and videos are returned untouched', async () => {
  const v = file('a.mp4', 'video/mp4', 10);
  assert.equal(await compressImage(v), v);
});

test('GIFs and SVGs are never re-encoded', async () => {
  const g = file('a.gif', 'image/gif', 5_000_000), s = file('a.svg', 'image/svg+xml', 5_000_000);
  assert.equal(await compressImage(g), g);
  assert.equal(await compressImage(s), s);
});

test('images the browser cannot decode are returned untouched', async () => {
  globalThis.createImageBitmap = async () => { throw new Error('cannot decode'); };
  const heic = file('a.heic', 'image/heic', 5_000_000);
  assert.equal(await compressImage(heic), heic);
});

test('small, modest-sized images are left alone', async () => {
  let closed = false;
  globalThis.createImageBitmap = async () => ({ width: 800, height: 600, close() { closed = true; } });
  const small = file('a.png', 'image/png', 100_000);
  assert.equal(await compressImage(small), small);
  assert.equal(closed, true); // the decoded bitmap is always released
});
