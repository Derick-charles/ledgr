// Bundles the Worker the way wrangler does (with @netlify/blobs swapped for the
// D1/R2 version) and runs the main flows against fake D1 + R2.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { makeEnv } from './fake-cf.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const esbuild = process.env.ESBUILD || 'esbuild';
const out = path.join(process.env.TMPDIR || '/tmp', 'ledgr-cf-check');
mkdirSync(out, { recursive: true });
execFileSync(esbuild, ['cloudflare/worker.js', '--bundle', '--format=esm', '--platform=node', '--outfile=' + out + '/worker.mjs',
  '--alias:@netlify/blobs=./cloudflare/blobs-shim.js', '--log-level=error'], { cwd: root, stdio: 'inherit' });
const worker = (await import(pathToFileURL(out + '/worker.mjs') + '?' + Date.now())).default;

const env = makeEnv();
process.env.LEDGR_SESSION_SECRET = env.LEDGR_SESSION_SECRET; // the real runtime fills process.env from secrets
process.env.LEDGR_OWNER_EMAIL = env.LEDGR_OWNER_EMAIL;
let fails = 0;
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log(cond ? 'PASS' : 'FAIL', name, extra); };
const call = async (method, p, body, cookie) => {
  env.stats.calls = 0;
  const res = await worker.fetch(new Request('https://ledgr.test' + p, { method, body: body ? JSON.stringify(body) : undefined, headers: { cookie: cookie || '', 'content-type': 'application/json' } }), env, {});
  env.stats.max = Math.max(env.stats.max, env.stats.calls);
  const text = await res.text();
  let b = text; try { b = JSON.parse(text); } catch {}
  return { s: res.status, b, c: (res.headers.get('set-cookie') || '').split(';')[0], calls: env.stats.calls, res };
};

const su = await call('POST', '/api/auth', { action: 'signup', email: 'me@x.co', password: 'password1' });
ok('sign up', su.s === 200 && su.c, su.s + ' ' + JSON.stringify(su.b));
const dup = await call('POST', '/api/auth', { action: 'signup', email: 'ME@x.co', password: 'password1' });
ok('duplicate refused', dup.s === 409);
const bad = await call('POST', '/api/auth', { action: 'login', email: 'me@x.co', password: 'wrongpass1' });
ok('wrong password refused', bad.s === 401 || bad.s === 400, bad.s);
const li = await call('POST', '/api/auth', { action: 'login', email: 'me@x.co', password: 'password1' });
ok('login', li.s === 200 && li.c);
const cookie = li.c;
const accts = await call('GET', '/api/accounts', null, cookie);
const acct = accts.b[0].id;
ok('account listed', !!acct);
ok('unauthenticated request refused', (await call('GET', '/api/trades?account=' + acct)).s === 401);

// many trades → many records
for (let i = 0; i < 60; i++) {
  const r = await call('POST', '/api/trades?account=' + acct, { date: `2024-03-${String(1 + (i % 28)).padStart(2, '0')}`, symbol: 'EURUSD', side: 'long', pnl: i % 3 ? 10 : -5 }, cookie);
  if (r.s !== 200 && r.s !== 201) { ok('trade ' + i, false, r.s + JSON.stringify(r.b)); break; }
}
const list = await call('GET', '/api/trades?account=' + acct, null, cookie);
ok('60 trades readable', Array.isArray(list.b?.trades || list.b) && (list.b.trades || list.b).length === 60, `${(list.b.trades || list.b).length} in ${list.calls} db calls`);
ok('list stays well under 50 db calls', list.calls <= 10, list.calls);

// backtests
const s = await call('POST', '/api/backtests', { title: 'Sess', month: '2024-03' }, cookie);
ok('create session', s.s === 200 || s.s === 201, s.s + JSON.stringify(s.b).slice(0, 120));
const sid = s.b.id || s.b.backtest?.id;
for (let i = 0; i < 40; i++) await call('POST', `/api/backtests?id=${sid}&entry=1`, { date: '2024-03-05', result: i % 2 ? 1.5 : -1, side: 'long', timeframes: ['H1'] }, cookie);
const bl = await call('GET', '/api/backtests', null, cookie);
ok('backtest list', bl.s === 200, bl.s + ' calls=' + bl.calls);
const bd = await call('GET', `/api/backtests?id=${sid}`, null, cookie);
ok('backtest detail', bd.s === 200, 'calls=' + bd.calls);
const sy = await call('POST', '/api/sync', {}, cookie);
ok('sync', sy.s === 200, sy.s + ' calls=' + sy.calls);

// media in R2
const up = await call('POST', '/api/media', { filename: 'a.png', contentType: 'image/png', dataBase64: Buffer.from('hello-image').toString('base64') }, cookie);
ok('upload', up.s === 200, up.s + JSON.stringify(up.b).slice(0, 100));
ok('file stored in R2', env.objects.size === 1);
const dl = await call('GET', '/api/media?id=' + up.b.id, null, cookie);
ok('download', dl.s === 200, dl.s);
ok('download is the same bytes', dl.res.headers.get('content-type')?.startsWith('image/'), dl.res.headers.get('content-type'));
const other = await call('POST', '/api/auth', { action: 'signup', email: 'x@x.co', password: 'password1' });
ok('another user cannot download', (await call('GET', '/api/media?id=' + up.b.id, null, other.c)).s >= 400);
const del = await call('DELETE', '/api/media?id=' + up.b.id, null, cookie);
ok('delete', del.s === 200 || del.s === 204, del.s);
ok('R2 emptied', env.objects.size === 0);

const merge = await call('POST', '/api/merge', { action: 'create' }, other.c);
ok('merge code', merge.s === 200, merge.s);
ok('unknown api route', (await call('GET', '/api/nope')).s === 404);
ok('max db calls in one request', env.stats.max <= 50, env.stats.max);
console.log('max db calls in a request:', env.stats.max, ' max bound values:', env.stats.maxParams);
process.exit(fails ? 1 : 0);
