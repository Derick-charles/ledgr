// Copies your LEDGR data from Netlify to Cloudflare in two safe, repeatable steps.
// Nothing on Netlify is changed or deleted.
//
//   node cloudflare/migrate/migrate.mjs export   -> downloads everything into ./migration-data
//   node cloudflare/migrate/migrate.mjs sql      -> turns that into files Cloudflare can load
//
// "export" needs two values (see README): NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN.
import fs from 'node:fs';
import path from 'node:path';

const STORES = ['users', 'settings', 'trades', 'journal', 'certificates', 'lessons', 'backtests', 'summaries', 'media'];
const OUT = path.resolve(process.env.MIGRATION_DIR || 'migration-data');
const SQL_DIR = path.join(OUT, 'sql');
const MAX_FILE = 700 * 1024;      // keep each SQL file small so Cloudflare accepts it
const MAX_ROW = 1.9 * 1024 * 1024; // D1 rows are limited to 2 MB

const cmd = process.argv[2];

async function doExport() {
  const siteID = process.env.NETLIFY_SITE_ID, token = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token) {
    console.error('Missing NETLIFY_SITE_ID or NETLIFY_AUTH_TOKEN — see the README for where to find them.');
    process.exit(1);
  }
  const { getStore } = await import('@netlify/blobs');
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'media-files'), { recursive: true });
  const counts = {};
  for (const name of STORES) {
    const store = getStore({ name, siteID, token });
    const { blobs } = await store.list();
    const lines = [];
    let n = 0;
    for (const { key } of blobs) {
      const isMedia = name === 'media';
      const got = await store.getWithMetadata(key, { type: isMedia ? 'arrayBuffer' : 'text' });
      if (!got) { console.warn(`  skipped ${name}/${key} (vanished while reading)`); continue; }
      if (isMedia) {
        const file = `${String(++n).padStart(6, '0')}.bin`;
        fs.writeFileSync(path.join(OUT, 'media-files', file), Buffer.from(got.data));
        lines.push(JSON.stringify({ key, file, meta: got.metadata || {} }));
      } else {
        lines.push(JSON.stringify({ key, value: got.data, meta: got.metadata && Object.keys(got.metadata).length ? got.metadata : null }));
        n++;
      }
    }
    fs.writeFileSync(path.join(OUT, `${name}.jsonl`), lines.join('\n') + (lines.length ? '\n' : ''));
    counts[name] = lines.length;
    console.log(`  ${name}: ${lines.length}`);
  }
  fs.writeFileSync(path.join(OUT, 'counts.json'), JSON.stringify(counts, null, 2));
  console.log(`\nExported to ${OUT}\nNext: node cloudflare/migrate/migrate.mjs sql`);
}

const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

function doSql() {
  if (!fs.existsSync(OUT)) { console.error('Run the "export" step first.'); process.exit(1); }
  fs.rmSync(SQL_DIR, { recursive: true, force: true });
  fs.mkdirSync(SQL_DIR, { recursive: true });
  let part = 0, size = 0, buf = [];
  const flush = () => {
    if (!buf.length) return;
    fs.writeFileSync(path.join(SQL_DIR, `part-${String(++part).padStart(3, '0')}.sql`), buf.join('\n') + '\n');
    buf = []; size = 0;
  };
  const counts = {};
  const uploads = [];
  const skipped = [];
  for (const name of STORES) {
    const file = path.join(OUT, `${name}.jsonl`);
    counts[name] = 0;
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
      const row = JSON.parse(line);
      const value = name === 'media' ? null : row.value;
      const meta = row.meta ? JSON.stringify(row.meta) : null;
      if ((value || '').length + (meta || '').length > MAX_ROW) { skipped.push(`${name}/${row.key}`); continue; }
      const stmt = `INSERT OR REPLACE INTO blobs (store, key, value, meta) VALUES (${lit(name)}, ${lit(row.key)}, ${lit(value)}, ${lit(meta)});`;
      if (size + stmt.length > MAX_FILE) flush();
      buf.push(stmt); size += stmt.length + 1;
      counts[name]++;
      if (name === 'media') uploads.push({ key: row.key, file: row.file });
    }
  }
  flush();
  const q = (s) => `"${String(s).replace(/(["\\$`])/g, '\\$1')}"`;
  const sh = ['#!/bin/sh', '# Uploads every screenshot to Cloudflare R2. Safe to run again.', 'set -e', 'cd "$(dirname "$0")"',
    ...uploads.map((u) => `npx wrangler r2 object put ${q('ledgr-media/media/' + u.key)} --file=${q('media-files/' + u.file)} --remote`),
    `echo "Uploaded ${uploads.length} files."`];
  fs.writeFileSync(path.join(OUT, 'upload-media.sh'), sh.join('\n') + '\n', { mode: 0o755 });
  console.log(`Made ${part} SQL file(s) in ${SQL_DIR} and upload-media.sh (${uploads.length} files).`);
  console.log('Rows per store:', JSON.stringify(counts));
  if (skipped.length) console.warn('Too big for Cloudflare, NOT copied:', skipped.join(', '));
  return { counts, parts: part, skipped };
}

if (cmd === 'export') await doExport();
else if (cmd === 'sql') doSql();
else console.log('Usage: node cloudflare/migrate/migrate.mjs export | sql');
