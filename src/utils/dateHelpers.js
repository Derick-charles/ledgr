// All journal/trade docs are keyed by a plain 'YYYY-MM-DD' string — easy to
// query, sort, and use as a Firestore document ID (one journal entry per day).

export function toDateId(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatShort(dateId) {
  const d = new Date(dateId + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatLong(dateId) {
  const d = new Date(dateId + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function startOfMonthId(dateId) {
  const [y, m] = dateId.split('-');
  return `${y}-${m}-01`;
}

// Builds the Mon-Sun week grid for a given month, matching the calendar UI.
// Returns an array of week-rows, each row an array of { dateId, dayNum } | null.
export function buildMonthGrid(year, monthIndex /* 0-based */) {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  // JS getDay(): 0=Sun..6=Sat. We want Monday-first, so shift.
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // 0=Mon..6=Sun

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateId = toDateId(new Date(year, monthIndex, d));
    cells.push({ dateId, dayNum: d });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function isWeekend(dateId) {
  const day = new Date(dateId + 'T00:00:00').getDay();
  return day === 0 || day === 6;
}

// Adds (or subtracts, with a negative n) whole days to a dateId string,
// for the Daily Journal's prev/next day navigation.
export function addDays(dateId, n) {
  const d = new Date(dateId + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toDateId(d);
}
