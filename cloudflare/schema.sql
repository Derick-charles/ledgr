-- LEDGR on Cloudflare: one table holds every record the Netlify version kept
-- in "blobs". `store` is the old store name (trades, journal, users …) and
-- `key` the old key. `value` is the JSON text; uploaded files live in R2 and
-- only their details (owner, type, size) are kept here in `meta`.
CREATE TABLE IF NOT EXISTS blobs (
  store TEXT NOT NULL,
  key   TEXT NOT NULL,
  value TEXT,
  meta  TEXT,
  PRIMARY KEY (store, key)
) WITHOUT ROWID;
