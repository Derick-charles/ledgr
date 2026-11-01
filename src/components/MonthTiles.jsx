import { useMemo } from 'react';
import { clickable } from '../utils/a11y.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A year at a glance: one tile per month with its total. Shared by the live
// journal (money) and the backtest journal (R). `byMonth` is
// { 'YYYY-MM': { v, count } }; `fmt` turns a total into text.
const many = (unit, n, plural) => (n === 1 ? unit : plural || `${unit}s`);

export default function MonthTiles({ year, byMonth, fmt, unit = 'trade', plural, onPick, onYear }) {
  const now = new Date();
  const { total, count, max, best } = useMemo(() => {
    let total = 0, count = 0, max = 0, best = null;
    for (let m = 0; m < 12; m++) {
      const d = byMonth[`${year}-${String(m + 1).padStart(2, '0')}`];
      if (!d) continue;
      total += d.v; count += d.count;
      max = Math.max(max, Math.abs(d.v));
      if (!best || d.v > best.v) best = { m, v: d.v };
    }
    return { total, count, max, best };
  }, [byMonth, year]);

  return (
    <div className="month-tiles">
      <div className="mt-head">
        <button type="button" className="mt-nav" onClick={() => onYear(-1)} aria-label={`Show ${year - 1}`}>‹</button>
        <div className="mt-year">
          <b>{year}</b>
          <span className={total > 0 ? 'pos' : total < 0 ? 'neg' : ''}>{count ? `${fmt(total)} · ${count} ${many(unit, count, plural)}` : 'Nothing logged'}</span>
        </div>
        <button type="button" className="mt-nav" onClick={() => onYear(1)} aria-label={`Show ${year + 1}`}>›</button>
      </div>
      <div className="mt-grid" key={year}>
        {MONTHS.map((name, m) => {
          const d = byMonth[`${year}-${String(m + 1).padStart(2, '0')}`];
          const isNow = year === now.getFullYear() && m === now.getMonth();
          const tone = !d ? '' : d.v > 0 ? 'pos' : d.v < 0 ? 'neg' : 'flat';
          const a = d && max ? 0.12 + 0.3 * (Math.abs(d.v) / max) : 0;
          const style = d && tone !== 'flat' ? { background: `rgba(var(--${tone === 'pos' ? 'positive' : 'negative'}-rgb), ${a.toFixed(2)})` } : undefined;
          const inner = (
            <>
              <span className="mt-name">{name}{best && best.m === m && d && d.v > 0 ? ' ★' : ''}</span>
              <span className="mt-v">{d ? fmt(d.v) : '—'}</span>
              <span className="mt-n">{d ? `${d.count} ${many(unit, d.count, plural)}` : ''}</span>
            </>
          );
          return d || (year < now.getFullYear() || (year === now.getFullYear() && m <= now.getMonth()))
            ? <div key={name} className={`mt-tile clickable ${tone}${isNow ? ' now' : ''}`} style={{ ...style, '--i': m }} {...clickable(() => onPick(year, m), { label: `${name} ${year}: ${d ? fmt(d.v) : 'no entries'}` })}>{inner}</div>
            : <div key={name} className={`mt-tile future${isNow ? ' now' : ''}`} style={{ '--i': m }}>{inner}</div>;
        })}
      </div>
    </div>
  );
}
