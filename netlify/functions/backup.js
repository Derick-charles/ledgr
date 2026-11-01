import { stores, json, keyFor, keyBelongsTo, stripPrefix } from './_blobs.js';
import { protect } from './_auth.js';

// Dumps every key in a store that belongs to this account, keyed by its
// plain (un-prefixed) id — e.g. { "2026-09-01": {...}, "2026-09-02": {...} }.
async function dumpStore(store, accountId) {
  const { blobs } = await store.list();
  const mine = blobs.map((b) => b.key).filter((k) => keyBelongsTo(k, accountId));
  const entries = await Promise.all(mine.map(async (k) => [stripPrefix(k, accountId), await store.get(k, { type: 'json' })]));
  return Object.fromEntries(entries);
}

// Writes each entry back under this account's namespace. Upsert, not
// replace — restoring never deletes anything the account currently has;
// it only adds/overwrites the records present in the backup file.
async function restoreStore(store, accountId, data) {
  if (!data || typeof data !== 'object') return 0;
  const entries = Object.entries(data);
  await Promise.all(entries.map(([id, val]) => store.setJSON(keyFor(accountId, id), val)));
  return entries.length;
}

export const handler = protect(async (event, ctx) => {
  const { trades, journal, certificates, lessons, settings, summaries } = stores(event);
  const { account } = event.queryStringParameters || {};

  try {
    if (!account) return json(400, { error: 'Missing account' });

    // When this account was last backed up — drives the "time to back up" reminder.
    // Stamped by the app (PUT) once a backup file has actually been downloaded;
    // simply reading the backup data (e.g. to count what a delete would remove) doesn't count.
    if (event.httpMethod === 'GET' && (event.queryStringParameters || {}).meta) {
      const last = await settings.get(keyFor(account, 'lastBackup'), { type: 'json' });
      return json(200, { lastBackupAt: last ? last.at : null });
    }
    if (event.httpMethod === 'PUT') {
      const at = Date.now();
      await settings.setJSON(keyFor(account, 'lastBackup'), { at });
      return json(200, { lastBackupAt: at });
    }

    if (event.httpMethod === 'GET') {
      const [tradesData, journalData, certificatesData, lessonsData] = await Promise.all([
        dumpStore(trades, account),
        dumpStore(journal, account),
        dumpStore(certificates, account),
        dumpStore(lessons, account),
      ]);
      const [checklist, mistakeTags, poiTags] = await Promise.all([
        settings.get(keyFor(account, 'checklist'), { type: 'json' }),
        settings.get(keyFor(account, 'mistakeTags'), { type: 'json' }),
        settings.get(keyFor(account, 'poiTags'), { type: 'json' }),
      ]);

      return json(200, {
        ledgrBackupVersion: 1,
        exportedAt: new Date().toISOString(),
        // Note: this does NOT include the actual uploaded image/video bytes —
        // only their stored URLs/metadata — to keep export files small and
        // avoid re-hitting Netlify Functions' payload limits on restore.
        counts: {
          trades: Object.keys(tradesData).length,
          journal: Object.keys(journalData).length,
          certificates: Object.keys(certificatesData).length,
        },
        trades: tradesData,
        journal: journalData,
        certificates: certificatesData,
        lessons: lessonsData,
        checklist,
        mistakeTags,
        poiTags,
      });
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const [tradesRestored, journalRestored, certificatesRestored, lessonsRestored] = await Promise.all([
        restoreStore(trades, account, body.trades),
        restoreStore(journal, account, body.journal),
        restoreStore(certificates, account, body.certificates),
        restoreStore(lessons, account, body.lessons),
      ]);
      // Restore wrote trades/journal directly, so the cached summaries are
      // stale — drop them; they rebuild automatically on the next read.
      await Promise.all(['summary:trades', 'summary:journal'].map((k) => summaries.delete(keyFor(account, k)).catch(() => {})));
      if (body.checklist) await settings.setJSON(keyFor(account, 'checklist'), body.checklist);
      if (body.mistakeTags) await settings.setJSON(keyFor(account, 'mistakeTags'), body.mistakeTags);
      if (body.poiTags) await settings.setJSON(keyFor(account, 'poiTags'), body.poiTags);

      return json(200, {
        ok: true,
        restored: { trades: tradesRestored, journal: journalRestored, certificates: certificatesRestored, lessons: lessonsRestored },
      });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('[backup]', e);
    return json(e.statusCode || 500, { error: e.message || 'Server error' });
  }
});
