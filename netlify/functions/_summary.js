import { keyFor } from './_blobs.js';

// A per-account "summary" blob holds a small array of light records (trade
// essentials, or journal-day essentials) instead of the full documents.
// Panels that only need a few fields across a whole account's history
// (milestones, POI performance, timing, the journaling streak, "do I have
// any trades yet") read ONE small blob instead of one full document per
// trade/day ever logged — that's the fix for page loads re-reading every
// trade/entry on every visit.
//
// `kind` namespaces the key so trades and journal summaries (and any future
// kind) can share the same `summaries` store without colliding:
// "trades:<accountId>" / "journal:<accountId>".
function summaryKey(kind, accountId) {
  return keyFor(accountId, `summary:${kind}`);
}

export async function readSummary(summaries, kind, accountId) {
  return summaries.get(summaryKey(kind, accountId), { type: 'json' });
}

export async function writeSummary(summaries, kind, accountId, items) {
  await summaries.setJSON(summaryKey(kind, accountId), { items, updatedAt: Date.now() });
}

// Read-modify-write a single item in by id/key field. `idField` is whichever
// field uniquely identifies a record ("id" for trades, "dateId" for journal
// days) — upserts by replacing any existing record with the same id.
export async function upsertSummaryItem(summaries, kind, accountId, idField, item) {
  const existing = await readSummary(summaries, kind, accountId);
  const items = (existing?.items || []).filter((x) => x[idField] !== item[idField]);
  items.push(item);
  await writeSummary(summaries, kind, accountId, items);
}

export async function removeSummaryItem(summaries, kind, accountId, idField, idValue) {
  const existing = await readSummary(summaries, kind, accountId);
  if (!existing) return;
  await writeSummary(summaries, kind, accountId, existing.items.filter((x) => x[idField] !== idValue));
}

// Gets an account's summary, rebuilding it once from the given `fullItems`
// (already-fetched full documents) if nothing is cached yet — covers both
// a brand new account (nothing to summarize) and upgrading from a version
// of this app that predates summaries (one last full read, ever, for that
// account; every load after this one hits the cheap path).
export async function getOrBuildSummary(summaries, kind, accountId, buildFullItems, toSummaryItem) {
  const existing = await readSummary(summaries, kind, accountId);
  if (existing) return existing.items;
  const full = await buildFullItems();
  const items = full.map(toSummaryItem);
  await writeSummary(summaries, kind, accountId, items);
  return items;
}

export async function removeSummary(summaries, kind, accountId) {
  await summaries.delete(summaryKey(kind, accountId));
}
