import { stores, json, uuid, MAX_MEDIA_BYTES, keyBelongsTo } from './_blobs.js';
import { protect, legacyOwnerId, ownsStamp } from './_auth.js';

// Every uploaded file is stamped with its owner's user id. Files uploaded
// before users existed have no stamp and belong to whoever took over the
// original data. Anyone else asking for a file gets a 404.
async function canAccess(media, settings, id, user) {
  const result = await media.getWithMetadata(id, { type: 'arrayBuffer' });
  if (!result) return { result: null, ok: false };
  const owner = (result.metadata && result.metadata.owner) || (await legacyOwnerId(settings));
  return { result, ok: ownsStamp(user, owner) };
}

// Uploaded files nothing points to any more — left behind by a trade save
// that failed half-way, a deleted account, etc. A file counts as unused only
// if it's (a) this user's, (b) not attached to any of their trades, journal
// entries or certificates, and (c) more than an hour old, so an upload that's
// still being attached is never touched.
const GRACE_MS = Number(process.env.LEDGR_ORPHAN_GRACE_MS ?? 60 * 60 * 1000);

function idOf(m) {
  if (!m) return null;
  if (m.id && m.type !== 'link' && !String(m.id).startsWith('link-')) return m.id;
  const hit = /[?&]id=([^&]+)/.exec(m.url || m.fileUrl || '');
  return hit ? hit[1] : null;
}

async function findUnusedMedia(allStores, ctx) {
  const { trades, journal, certificates, media, settings, backtests } = allStores;
  const referenced = new Set();
  const note = (m) => { const id = idOf(m); if (id) referenced.add(id); };

  const collect = async (store, visit) => {
    const { blobs } = await store.list();
    const keys = blobs.map((b) => b.key).filter((k) => ctx.accountIds.some((id) => keyBelongsTo(k, id)));
    await Promise.all(keys.map(async (k) => { const v = await store.get(k, { type: 'json' }); if (v) visit(v); }));
  };
  await collect(trades, (t) => { [...(t.beforeMedia || []), ...(t.afterMedia || [])].forEach(note); });
  await collect(journal, (e) => { (e.mediaUrls || []).forEach(note); });
  await collect(certificates, (c) => { note({ id: c.mediaId }); note({ url: c.fileUrl }); });
  // Backtests belong to the person, not to an account — keys are "<userId>/<id>".
  const { blobs: btBlobs } = await backtests.list();
  await Promise.all(btBlobs.map((b) => b.key).filter((k) => k.startsWith(`${ctx.user.id}/`)).map(async (k) => {
    const bt = await backtests.get(k, { type: 'json' });
    (bt?.media || []).forEach(note);
    (bt?.entries || []).forEach((e) => (e.media || []).forEach(note));
  }));

  const legacyOwner = await legacyOwnerId(settings);
  const { blobs } = await media.list();
  const unused = [];
  await Promise.all(blobs.map(async ({ key }) => {
    if (referenced.has(key)) return;
    const meta = await media.getMetadata(key);
    const m = (meta && meta.metadata) || {};
    if (!ownsStamp(ctx.user, m.owner || legacyOwner)) return; // someone else's file — never touch
    if (m.createdAt && Date.now() - m.createdAt < GRACE_MS) return;
    unused.push({ key, size: m.size || 0 });
  }));
  return unused;
}

export const handler = protect(async (event, ctx) => {
  const allStores = stores(event);
  const { media, settings } = allStores;
  const q = event.queryStringParameters || {};

  // ?orphans=1 — GET previews what would be removed, DELETE removes it.
  if (q.orphans) {
    if (event.httpMethod === 'GET') {
      const unused = await findUnusedMedia(allStores, ctx);
      return json(200, { count: unused.length, bytes: unused.reduce((s, u) => s + u.size, 0) });
    }
    if (event.httpMethod === 'DELETE') {
      const unused = await findUnusedMedia(allStores, ctx);
      await Promise.all(unused.map((u) => media.delete(u.key).catch((e) => console.warn('Could not delete unused media:', e))));
      return json(200, { deleted: unused.length });
    }
  }

  if (event.httpMethod === 'GET') {
    if (!q.id) return json(400, { error: 'Missing id' });
    const { result, ok } = await canAccess(media, settings, q.id, ctx.user);
    if (!result || !ok) return json(404, { error: 'Not found' });
    const contentType = (result.metadata && result.metadata.contentType) || 'application/octet-stream';
    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        // "private": this is behind the login, so a shared/CDN cache must
        // never hand the image to someone who isn't signed in.
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
      body: Buffer.from(result.data).toString('base64'),
      isBase64Encoded: true,
    };
  }

  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}');
    if (!body.dataBase64) return json(400, { error: 'Missing dataBase64' });
    const buf = Buffer.from(body.dataBase64, 'base64');
    if (buf.byteLength > MAX_MEDIA_BYTES) {
      return json(413, { error: `"${body.filename || 'file'}" is too large (max ~4.5MB per file when hosted on Netlify Functions).` });
    }
    const id = uuid();
    await media.set(id, buf, { metadata: { contentType: body.contentType || 'application/octet-stream', filename: body.filename || '', owner: ctx.user.id, createdAt: Date.now(), size: buf.byteLength } });
    return json(200, { id, url: `/api/media?id=${id}` });
  }

  if (event.httpMethod === 'DELETE') {
    if (!q.id) return json(400, { error: 'Missing id' });
    const { result, ok } = await canAccess(media, settings, q.id, ctx.user);
    if (result && !ok) return json(404, { error: 'Not found' });
    await media.delete(q.id);
    return json(200, { ok: true });
  }

  return json(405, { error: 'Method not allowed' });
}, { account: 'none' });
