// Month switcher for the whole dashboard — stats, equity curve, calendar,
// trades and the month's reports all follow the month chosen here.
export default function MonthNav({ year, monthIndex, isCurrentMonth, onChange, onToday }) {
  const label = new Date(year, monthIndex, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  function step(delta) {
    const d = new Date(year, monthIndex + delta, 1);
    onChange(d.getFullYear(), d.getMonth());
  }

  return (
    <div className="month-nav">
      <button className="icon-nav-btn" onClick={() => step(-1)} aria-label="Previous month" title="Previous month">‹</button>
      <span className="month-nav-label">{label}</span>
      {/* No point browsing past the current month — nothing to show there yet. */}
      <button className="icon-nav-btn" onClick={() => step(1)} disabled={isCurrentMonth} aria-label="Next month" title="Next month">›</button>
      {!isCurrentMonth && <button className="btn btn-ghost month-nav-today" onClick={onToday}>Back to this month</button>}
    </div>
  );
}
