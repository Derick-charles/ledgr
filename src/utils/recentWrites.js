// Netlify's storage can answer a read with the version from before your last
// save for a short while ("eventual consistency"). So the app remembers what
// you just saved or deleted — for a couple of minutes, more than long enough —
// and blends it into whatever the server returns. Anything older than that is
// trusted to the server, which has caught up by then.
const KEY = 'ledgr:recent';
const TTL_MS = 150000;
const MAX_RECORD_CHARS = 400000; // keeps one huge record from filling browser storage

function read() {
  try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch { return {}; }
}
let mem = read();

function prune() {
  const now = Date.now();
  for (const k of Object.keys(mem)) if (now - mem[k].t > TTL_MS) delete mem[k];
}
function persist() {
  try { sessionStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* memory copy still works */ }
}

// `record` is the saved item exactly as the server returned it; null = deleted.
export function noteWrite(kind, id, record) {
  prune();
  if (record && JSON.stringify(record).length > MAX_RECORD_CHARS) { mem[`${kind}:${id}`] = { t: Date.now(), record }; try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } return; }
  mem[`${kind}:${id}`] = { t: Date.now(), record };
  persist();
}
export const noteDelete = (kind, id) => noteWrite(kind, id, null);

export function getRecent(kind, id) {
  prune();
  const hit = mem[`${kind}:${id}`];
  return hit ? hit.record : undefined; // undefined = nothing recent; null = recently deleted
}

export function clearRecent() {
  mem = {};
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

// Blend recent saves into a list the server just returned. `keep(record)` says
// whether a recently saved record belongs in THIS list (right account/month).
// `newer(recent, fromServer)` stops an older recent copy replacing a newer one.
export function mergeRecent(kind, list, { keep = () => true, newer = () => true } = {}) {
  prune();
  const prefix = `${kind}:`;
  let out = list;
  for (const [k, { record }] of Object.entries(mem)) {
    if (!k.startsWith(prefix)) continue;
    const id = k.slice(prefix.length);
    const at = out.findIndex((x) => x.id === id);
    if (record === null) { if (at >= 0) out = out.filter((x) => x.id !== id); continue; }
    if (at >= 0) { if (newer(record, out[at])) out = out.map((x, i) => (i === at ? { ...x, ...record } : x)); }
    else if (keep(record)) out = [...out, record];
  }
  return out;
}
