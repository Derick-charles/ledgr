import { stores, json, uuid, resolveMediaItems, keyFor, keyBelongsTo } from './_blobs.js';
import { protect } from './_auth.js';

export const handler = protect(async (event, ctx) => {
  const { certificates, media } = stores(event);
  const q = event.queryStringParameters || {};
  const accountId = q.account;

  try {
    if (event.httpMethod === 'GET') {
      const { blobs } = await certificates.list();
      const keys = blobs.map((b) => b.key).filter((k) => keyBelongsTo(k, accountId));
      const all = await Promise.all(keys.map((k) => certificates.get(k, { type: 'json' })));
      const list = all.filter(Boolean).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      return json(200, list);
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const id = uuid();

      let fileUrl = null, fileType = null, fileName = null, mediaId = null;
      if (body.file && body.file.dataBase64) {
        const [resolved] = await resolveMediaItems(media, [body.file], ctx.user.id);
        fileUrl = resolved.url;
        mediaId = resolved.id;
        fileType = (body.file.contentType || '').startsWith('image/') ? 'image' : 'pdf';
        fileName = body.file.filename || null;
      }

      const cert = {
        id,
        type: body.type,
        firm: body.firm,
        amount: body.amount,
        date: body.date,
        fileUrl, fileType, fileName, mediaId,
        createdAt: Date.now(),
      };
      await certificates.setJSON(keyFor(accountId, id), cert);
      return json(200, cert);
    }

    if (event.httpMethod === 'DELETE') {
      if (!q.id) return json(400, { error: 'Missing id' });
      const key = keyFor(accountId, q.id);
      const cert = await certificates.get(key, { type: 'json' });
      if (cert && cert.mediaId) {
        try { await media.delete(cert.mediaId); } catch (e) { console.warn('Could not delete certificate media:', e); }
      }
      await certificates.delete(key);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('[certificates]', e);
    return json(e.statusCode || 500, { error: e.message || 'Server error' });
  }
});
