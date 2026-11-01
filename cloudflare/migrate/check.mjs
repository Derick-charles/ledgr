// Local test: fabricates an export folder, runs the "sql" step, loads the result into
// a fake D1 and reads it back through the Cloudflare storage layer.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
fs.mkdirSync(path.join(dir, 'media-files'));
const tricky = JSON.stringify({ note: "it's \"quoted\"\nnew line ünïcode 日本", n: 1 });
const w = (n, rows) => fs.writeFileSync(path.join(dir, n + '.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
w('users', [{ key: 'u1', value: tricky, meta: null }]);
const many = Array.from({ length: 900 }, (_, i) => ({ key: 't' + i, value: JSON.stringify({ i, pad: 'x'.repeat(2000) }), meta: null }));
w('trades', many);
w('media', [{ key: "m'1", file: '000001.bin', meta: { owner: 'u1', contentType: 'image/png' } }]);
fs.writeFileSync(path.join(dir, 'media-files/000001.bin'), Buffer.from('png'));
const env = { ...process.env, MIGRATION_DIR: dir };
execFileSync('node', [new URL('./migrate.mjs', import.meta.url).pathname, 'sql'], { env, stdio: 'inherit' });
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const files = fs.readdirSync(path.join(dir, 'sql')).sort();
for (const f of files) {
  const text = fs.readFileSync(path.join(dir, 'sql', f), 'utf8');
  if (text.length > 800 * 1024) throw new Error('file too large ' + f);
  db.exec(text);
}
let bad = 0; const ok = (n, c) => { if (!c) bad++; console.log(c ? 'PASS' : 'FAIL', n); };
ok('several SQL files for many rows', files.length > 1);
ok('tricky text survives exactly', db.prepare("SELECT value FROM blobs WHERE store='users' AND key='u1'").get().value === tricky);
ok('900 trades copied', db.prepare("SELECT COUNT(*) c FROM blobs WHERE store='trades'").get().c === 900);
const m = db.prepare("SELECT value, meta FROM blobs WHERE store='media'").get();
ok('media row has meta and no value', m.value === null && JSON.parse(m.meta).owner === 'u1');
ok('upload script written', fs.readFileSync(path.join(dir, 'upload-media.sh'), 'utf8').includes("ledgr-media/media/m'1"));
process.exit(bad ? 1 : 0);
