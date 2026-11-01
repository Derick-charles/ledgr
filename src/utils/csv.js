import { tradeR } from './stats.js';

const COLUMNS = [
  ['Date', (t) => t.date],
  ['Time', (t) => t.time || ''],
  ['Account', (t, ctx) => ctx.accountNameById?.[t.accountId] || ''],
  ['Symbol', (t) => t.sym],
  ['Side', (t) => t.side],
  ['Entry', (t) => t.entry || ''],
  ['Exit', (t) => t.exit || ''],
  ['Size', (t) => t.size || ''],
  ['P&L', (t) => (t.side === 'missed' ? '' : t.pnl)],
  ['Risked ($)', (t) => t.risk || ''],
  ['R', (t) => { const r = tradeR(t); return r === null ? '' : Math.round(r * 100) / 100; }],
  ['POI', (t) => t.poi || ''],
  ['Mistake', (t) => t.mistake || ''],
  ['Execution rating', (t) => t.ratingExec || ''],
  ['Discipline rating', (t) => t.ratingDisc || ''],
  ['Tags', (t) => (t.tags || []).join('; ')],
  ['Trade notes', (t) => t.notes || ''],
  ['Planned', (t) => t.planned || ''],
  ['Actual', (t) => t.actual || ''],
  ['Needs details', (t) => (t.incomplete ? 'yes' : '')],
];

// RFC 4180 quoting. Free-text cells that start with = + - @ would be run as
// a formula by Excel/Sheets, so they get a leading apostrophe (numbers are
// left alone — a negative P&L must stay a number).
function cell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function tradesToCSV(trades, ctx = {}) {
  const rows = [COLUMNS.map(([h]) => h)];
  [...trades]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
    .forEach((t) => rows.push(COLUMNS.map(([, get]) => get(t, ctx))));
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export function downloadCSV(filename, csv) {
  // BOM so Excel opens it as UTF-8 instead of mangling symbols/accents.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Shared by the trades list: text search + dropdown filters.
export const EMPTY_FILTERS = { q: '', side: '', result: '', poi: '', mistake: '', incomplete: '', tag: '', rating: '' };

export function filterTrades(trades, f) {
  const q = f.q.trim().toLowerCase();
  return trades.filter((t) => {
    if (q) {
      const hay = [t.sym, t.mistake, t.poi, t.planned, t.actual, t.notes, ...(t.tags || []), t.date].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.side && t.side !== f.side) return false;
    if (f.incomplete === 'yes' && !t.incomplete) return false;
    if (f.result === 'win' && !(t.side !== 'missed' && t.pnl > 0)) return false;
    if (f.result === 'loss' && !(t.side !== 'missed' && t.pnl < 0)) return false;
    if (f.poi && (t.poi || '') !== (f.poi === '__none' ? '' : f.poi)) return false;
    if (f.mistake && (t.mistake || '') !== (f.mistake === '__clean' ? '' : f.mistake)) return false;
    if (f.tag && !(t.tags || []).includes(f.tag)) return false;
    if (f.rating === 'low' && !((t.ratingExec && t.ratingExec <= 2) || (t.ratingDisc && t.ratingDisc <= 2))) return false;
    if (f.rating === 'high' && !((t.ratingExec && t.ratingExec >= 4) && (!t.ratingDisc || t.ratingDisc >= 4))) return false;
    if (f.rating === 'unrated' && (t.ratingExec || t.ratingDisc)) return false;
    return true;
  });
}
