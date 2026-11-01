
export const STATUS_META = {
  validated: { label: 'Validated', cls: 'validated' },
  review: { label: 'To review', cls: 'review' },
  rejected: { label: 'Rejected', cls: 'rejected' },
};

export const fmtR = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}R`;
export function monthLabel(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(month || '');
  return m ? new Date(+m[1], +m[2] - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }) : '';
}
export const fmtPct = (n) => `${Number(n.toFixed(2))}%`;

// What a link is, for the little corner chip on a card and the "Open video" button.
export function linkSource(link) {
  if (!link) return '';
  try {
    const host = new URL(link).hostname.replace(/^www\./, '');
    if (/loom\.com$/.test(host)) return 'Loom';
    if (/(youtube\.com|youtu\.be)$/.test(host)) return 'YouTube';
    if (/tradingview\.com$/.test(host)) return 'TradingView';
    if (/(drive|docs)\.google\.com$/.test(host)) return 'Drive';
    return host;
  } catch { return ''; }
}

// YouTube is the one common host whose thumbnail can be derived from the link.
export function youtubeThumb(link) {
  try {
    const u = new URL(link);
    const host = u.hostname.replace(/^www\./, '');
    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (/youtube\.com$/.test(host)) id = u.searchParams.get('v') || (/^\/(embed|shorts)\/([\w-]{6,})/.exec(u.pathname) || [])[2] || '';
    return /^[\w-]{6,20}$/.test(id) ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '';
  } catch { return ''; }
}

// Tags shown on a card, from how the session did against its challenge rules.
export function cardFlags(item, rules) {
  const flags = [];
  if (item.closed) flags.push({ label: 'Closed', tone: 'plain' });
  const c = item.challenge;
  if (!c || c.overall === 'empty') return flags;
  const total = c.phases.length;
  const firm = (item.rules || rules || {}).firm || 'challenge';
  if (c.overall === 'passed') flags.push({ label: total > 1 ? 'Passed both phases' : `Passed ${firm}`, tone: 'good' });
  else if (c.overall === 'failed') {
    const i = c.phases.findIndex((p) => p.status === 'failed');
    flags.push({ label: `${total > 1 ? `Phase ${i + 1} failed` : 'Failed'} · ${c.phases[i].failedReason === 'daily' ? 'daily limit' : 'drawdown'}`, tone: 'warn' });
  } else if (total > 1) {
    const i = c.phases.findIndex((p) => p.status === 'active');
    flags.push({ label: `Phase ${Math.max(i, 0) + 1} of ${total}`, tone: 'plain' });
  }
  return flags;
}

export const phaseTone = (p) => ({ passed: 'validated', failed: 'rejected', active: 'review' }[p.status] || 'plain');
export const phaseLabel = (p) => (p.status === 'passed' ? `Passed${p.passedOn ? ` · ${p.passedOn}` : ''}`
  : p.status === 'failed' ? `Failed · ${p.failedReason === 'daily' ? 'daily limit' : 'drawdown'}`
  : p.status === 'active' ? 'In progress' : 'Not reached yet');

// ---- challenge-preparation maths ----

const DAY = 86400000;
const parseDay = (id) => { const [y, m, d] = id.split('-').map(Number); return new Date(y, m - 1, d); };

export function daysUntil(startDate, today = new Date()) {
  if (!startDate) return null;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((parseDay(startDate) - t) / DAY);
}

export function startLabel(startDate, today = new Date()) {
  const d = daysUntil(startDate, today);
  if (d === null) return 'Set a start date';
  if (d < 0) return 'Started';
  if (d === 0) return 'Starts today';
  if (d <= 30) return `Starts in ${d} day${d === 1 ? '' : 's'}`;
  return `Starts in ${parseDay(startDate).toLocaleString('en-US', { month: 'long' })}`;
}

export function countdownLabel(startDate, today = new Date()) {
  const d = daysUntil(startDate, today);
  if (d === null) return null;
  if (d < 0) return `Started ${-d} day${d === -1 ? '' : 's'} ago`;
  if (d < 7) return d === 0 ? 'Starts today' : `${d} day${d === 1 ? '' : 's'} to go`;
  const w = Math.ceil(d / 7);
  return `${w} week${w === 1 ? '' : 's'} to go`;
}

// Backtests created this calendar week (Monday–Sunday) — progress against "N a week".
export function doneThisWeek(items, today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const from = start.getTime();
  return items.filter((i) => i.createdAt >= from && i.createdAt < from + 7 * DAY).length;
}

// Everything pooled from EVERY session (not just the latest): totals, and for each
// readiness line how many sessions meet it.
export function overview(items) {
  const live = items.filter((i) => i.stats && i.stats.trades > 0 && i.challenge);
  const sum = (f) => live.reduce((n, i) => n + f(i), 0);
  const entries = sum((i) => i.stats.trades);
  const wins = sum((i) => i.stats.wins);
  const netR = sum((i) => i.stats.netR);
  const count = (f) => live.filter(f).length;
  const noFail = (reason) => (i) => !i.challenge.phases.some((p) => p.failedReason === reason);
  return {
    sessions: items.length, withEntries: live.length,
    open: items.filter((i) => !i.closed).length, closed: items.filter((i) => i.closed).length,
    entries, missed: items.reduce((n, i) => n + (i.missed || 0), 0),
    winRate: entries ? Math.round((wins / entries) * 100) : 0,
    expectancy: entries ? netR / entries : 0, netR,
    checks: [
      { id: 'dd', label: 'Stayed inside the drawdown limit', n: count(noFail('drawdown')) },
      { id: 'daily', label: 'Stayed inside the daily loss limit', n: count(noFail('daily')) },
      { id: 'passed', label: 'Passed the whole challenge', n: count((i) => i.challenge.overall === 'passed') },
      { id: 'edge', label: 'Positive expectancy', n: count((i) => i.stats.expectancy > 0) },
      { id: 'rules', label: 'Followed rules on 90%+ of entries', n: count((i) => (i.followedPct ?? 100) >= 90) },
    ],
  };
}
