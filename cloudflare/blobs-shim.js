// A stand-in for @netlify/blobs that keeps records in Cloudflare D1 (and
// uploaded files in R2). wrangler.toml maps the "@netlify/blobs" import to
// this file, so every backend file runs unchanged.
//
// Cloudflare's free plan allows only ~50 database calls per request, while a
// month of trades is read one record at a time. So reads made in the same
// moment are grouped into a few "WHERE key IN (…)" queries, and writes into
// batches — a request that touches hundreds of records still makes a handful
// of calls.

const READ_CHUNK = 80;    // D1 allows ~100 bound values per query
const WRITE_CHUNK = 40;
const env = () => {
  const e = globalThis.__LEDGR_ENV;
  if (!e || !e.DB) throw new Error('Database is not connected (missing D1 binding "DB").');
  return e;
};

export function connectLambda() { /* nothing to connect — bindings come from the Worker */ }

const parse = (text) => { try { return JSON.parse(text); } catch { return null; } };
const parseMeta = (text) => (text ? parse(text) || {} : {});
const isBinary = (v) => v instanceof ArrayBuffer || ArrayBuffer.isView(v);
const r2Key = (store, key) => `${store}/${key}`;

class Store {
  constructor(name) { this.name = name; this.readQ = []; this.writeQ = []; this.scheduled = false; }

  // ---- grouping -------------------------------------------------------
  _schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    // a few hops, so reads started in the same burst all make it into one group
    Promise.resolve().then(() => {}).then(() => {}).then(() => this._flush());
  }

  async _flush() {
    const reads = this.readQ, writes = this.writeQ;
    this.readQ = []; this.writeQ = []; this.scheduled = false;
    const db = env().DB;

    // writes first (so a read queued next to a write sees it)
    for (let i = 0; i < writes.length; i += WRITE_CHUNK) {
      const part = writes.slice(i, i + WRITE_CHUNK);
      try {
        await db.batch(part.map((w) => db.prepare(w.sql).bind(...w.args)));
        part.forEach((w) => w.resolve());
      } catch (e) { part.forEach((w) => w.reject(e)); }
    }

    const keys = [...new Set(reads.map((r) => r.key))];
    const rows = new Map();
    try {
      for (let i = 0; i < keys.length; i += READ_CHUNK) {
        const part = keys.slice(i, i + READ_CHUNK);
        const marks = part.map(() => '?').join(',');
        const res = await db.prepare(`SELECT key, value, meta FROM blobs WHERE store = ? AND key IN (${marks})`).bind(this.name, ...part).all();
        for (const row of res.results || []) rows.set(row.key, row);
      }
      reads.forEach((r) => r.resolve(rows.get(r.key) || null));
    } catch (e) { reads.forEach((r) => r.reject(e)); }
  }

  _row(key) { return new Promise((resolve, reject) => { this.readQ.push({ key, resolve, reject }); this._schedule(); }); }
  _write(sql, args) { return new Promise((resolve, reject) => { this.writeQ.push({ sql, args, resolve, reject }); this._schedule(); }); }

  // ---- the @netlify/blobs surface the app uses --------------------------
  async _data(row, key, type) {
    if (type === 'arrayBuffer') {
      const obj = await env().BUCKET.get(r2Key(this.name, key));
      return obj ? obj.arrayBuffer() : null;
    }
    if (row.value == null) return null;
    return type === 'json' ? parse(row.value) : row.value;
  }

  async get(key, opts = {}) {
    const row = await this._row(key);
    return row ? this._data(row, key, opts.type) : null;
  }

  async getWithMetadata(key, opts = {}) {
    const row = await this._row(key);
    if (!row) return null;
    const data = await this._data(row, key, opts.type);
    if (data === null && opts.type === 'arrayBuffer') return null;
    return { data, metadata: parseMeta(row.meta), etag: '' };
  }

  async getMetadata(key) {
    const row = await this._row(key);
    return row ? { metadata: parseMeta(row.meta), etag: '' } : null;
  }

  async set(key, value, opts = {}) {
    const meta = opts.metadata ? JSON.stringify(opts.metadata) : null;
    let text = null;
    if (isBinary(value)) {
      if (this.name !== 'media') text = new TextDecoder().decode(value);
      else await env().BUCKET.put(r2Key(this.name, key), value);
    } else text = String(value);
    await this._write(
      'INSERT INTO blobs (store, key, value, meta) VALUES (?, ?, ?, ?) ON CONFLICT (store, key) DO UPDATE SET value = excluded.value, meta = excluded.meta',
      [this.name, key, text, meta],
    );
  }

  setJSON(key, value, opts) { return this.set(key, JSON.stringify(value), opts); }

  async delete(key) {
    if (this.name === 'media') await env().BUCKET.delete(r2Key(this.name, key));
    await this._write('DELETE FROM blobs WHERE store = ? AND key = ?', [this.name, key]);
  }

  async list(opts = {}) {
    const db = env().DB;
    const prefix = opts.prefix || '';
    const res = prefix
      ? await db.prepare('SELECT key FROM blobs WHERE store = ? AND key >= ? AND key < ? ORDER BY key').bind(this.name, prefix, `${prefix}￿`).all()
      : await db.prepare('SELECT key FROM blobs WHERE store = ? ORDER BY key').bind(this.name).all();
    return { blobs: (res.results || []).map((r) => ({ key: r.key, etag: '' })), directories: [] };
  }
}

export function getStore(arg) {
  return new Store(typeof arg === 'string' ? arg : arg.name);
}
