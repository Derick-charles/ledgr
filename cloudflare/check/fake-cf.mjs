// Stand-ins for Cloudflare's D1 database and R2 bucket, used only by the local checks.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function makeEnv() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const stats = { calls: 0, max: 0, maxParams: 0 };
  const run = (sql, args) => {
    stats.maxParams = Math.max(stats.maxParams, args.length);
    if (args.length > 100) throw new Error(`too many bound values (${args.length})`);
    const st = sqlite.prepare(sql);
    return /^\s*select/i.test(sql) ? { results: st.all(...args) } : (st.run(...args), { results: [] });
  };
  const prepare = (sql) => {
    let args = [];
    const q = { bind: (...a) => { args = a; return q; }, all: async () => { stats.calls++; return run(sql, args); }, run: async () => { stats.calls++; return run(sql, args); }, _go: () => run(sql, args) };
    return q;
  };
  const DB = { prepare, batch: async (qs) => { stats.calls++; return qs.map((q) => q._go()); } };
  const objects = new Map();
  const BUCKET = {
    put: async (k, v) => { objects.set(k, Buffer.from(v instanceof ArrayBuffer ? new Uint8Array(v) : v)); },
    get: async (k) => { const b = objects.get(k); return b ? { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } : null; },
    delete: async (k) => { objects.delete(k); },
  };
  return { DB, BUCKET, stats, objects, LEDGR_SESSION_SECRET: 'test-secret-test-secret-test-secret', LEDGR_OWNER_EMAIL: 'owner@x.co' };
}
