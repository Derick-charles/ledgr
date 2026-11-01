import { useMemo, useState } from 'react';
import { buildMonthGrid, toDateId } from '../utils/dateHelpers';
import { fmtR } from '../utils/backtestView';
import MonthTiles from './MonthTiles';

// P&L calendar for the backtest journal, in R. Days view = one month of day
// boxes; Months view = the year's twelve monthly totals. `daily` is
// { 'YYYY-MM-DD': { v: R that day, count } }.
export default function PeriodCalendar({ daily, title = 'Calendar' }) {
  const start = useMemo(() => {
    const last = Object.keys(daily).sort().pop();
    const d = last ? new Date(`${last}T00:00:00`) : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [mode, setMode] = useState('days');
  const [view, setView] = useState(start);
  const today = toDateId();

  const byMonth = useMemo(() => {
    const m = {};
    for (const [date, d] of Object.entries(daily)) {
      const k = date.slice(0, 7);
      (m[k] = m[k] || { v: 0, count: 0 });
      m[k].v += d.v; m[k].count += d.count;
    }
    return m;
  }, [daily]);

  const weeks = useMemo(() => buildMonthGrid(view.year, view.month), [view]);
  const prefix = `${view.year}-${String(view.month + 1).padStart(2, '0')}`;
  const month = byMonth[prefix];
  const label = new Date(view.year, view.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const step = (n) => setView((v) => { const d = new Date(v.year, v.month + n, 1); return { year: d.getFullYear(), month: d.getMonth() }; });
  const max = Math.max(0, ...weeks.flat().filter(Boolean).map((c) => Math.abs((daily[c.dateId] || { v: 0 }).v)));

  return (
    <div className="bt-card-block bt-cal">
      <div className="bt-block-title">
        <b>{title}</b>
        <div className="cal-toggle" role="group" aria-label="Calendar view">
          <button type="button" className={mode === 'days' ? 'active' : ''} aria-pressed={mode === 'days'} onClick={() => setMode('days')}>Days</button>
          <button type="button" className={mode === 'months' ? 'active' : ''} aria-pressed={mode === 'months'} onClick={() => setMode('months')}>Months</button>
        </div>
      </div>

      {mode === 'months' ? (
        <MonthTiles year={view.year} byMonth={byMonth} fmt={fmtR} unit="entry" plural="entries" onYear={(n) => setView((v) => ({ ...v, year: v.year + n }))} onPick={(y, m) => { setView({ year: y, month: m }); setMode('days'); }} />
      ) : (
        <>
          <div className="mt-head">
            <button type="button" className="mt-nav" onClick={() => step(-1)} aria-label="Previous month">‹</button>
            <div className="mt-year"><b>{label}</b><span className={month && month.v > 0 ? 'pos' : month && month.v < 0 ? 'neg' : ''}>{month ? `${fmtR(month.v)} · ${month.count} entr${month.count === 1 ? 'y' : 'ies'}` : 'Nothing logged'}</span></div>
            <button type="button" className="mt-nav" onClick={() => step(1)} aria-label="Next month">›</button>
          </div>
          <div className="pc-weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d}>{d}</span>)}</div>
          <div className="pc-grid" key={prefix}>
            {weeks.flat().map((c, i) => {
              if (!c) return <div key={i} className="pc-cell empty" />;
              const d = daily[c.dateId];
              const tone = !d ? '' : d.v > 0 ? 'pos' : d.v < 0 ? 'neg' : 'flat';
              const a = d && max ? 0.14 + 0.3 * (Math.abs(d.v) / max) : 0;
              const style = d && tone !== 'flat' ? { background: `rgba(var(--${tone === 'pos' ? 'positive' : 'negative'}-rgb), ${a.toFixed(2)})` } : undefined;
              return (
                <div key={i} className={`pc-cell ${tone}${c.dateId === today ? ' today' : ''}`} style={style} title={d ? `${c.dateId}: ${fmtR(d.v)}, ${d.count} entr${d.count === 1 ? 'y' : 'ies'}` : c.dateId}>
                  <span className="pc-d">{c.dayNum}</span>
                  {d && <span className="pc-v">{fmtR(d.v)}</span>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
