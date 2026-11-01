import { useMemo } from 'react';
import InfoTooltip from './InfoTooltip';

// This is a genuine join, not a lookup table: mindset comes from
// journalEntries (one per day), P&L comes from trades (summed per day).
export default function MindsetPerformance({ trades, journalEntries }) {
  const rows = useMemo(() => {
    const pnlByDate = {};
    trades.forEach((t) => { pnlByDate[t.date] = (pnlByDate[t.date] || 0) + t.pnl; });

    const groups = {};
    journalEntries.forEach((entry) => {
      if (!entry.mindset) return;
      const pnl = pnlByDate[entry.dateId];
      if (pnl === undefined) return; // no trades that day — nothing to attribute
      if (!groups[entry.mindset]) groups[entry.mindset] = { sum: 0, days: 0 };
      groups[entry.mindset].sum += pnl;
      groups[entry.mindset].days += 1;
    });

    return Object.entries(groups)
      .map(([name, g]) => ({ name, avg: g.sum / g.days, days: g.days }))
      .sort((a, b) => b.avg - a.avg);
  }, [trades, journalEntries]);

  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.avg)), 1);

  return (
    <div className="glass panel" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <h2>Mindset vs. Performance <InfoTooltip text="Average daily P&L grouped by the mindset you logged that day — a way to see which mental states actually correlate with good trading." /></h2>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Avg P&amp;L per day</span>
      </div>
      {rows.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>
          Not enough journal history yet — log a Mindset in Daily Journal on days you also trade.
        </p>
      ) : (
        rows.map((r) => {
          const pct = (Math.abs(r.avg) / maxAbs) * 100;
          const color = r.avg >= 0 ? 'var(--positive)' : 'var(--negative)';
          const valText = (r.avg >= 0 ? '+$' : '\u2212$') + Math.abs(Math.round(r.avg));
          return (
            <div className="bar-row" key={r.name}>
              <div className="bar-label">{r.name} <span style={{ color: 'var(--text-tertiary)' }}>({r.days}d)</span></div>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
              <div className="bar-value" style={{ color }}>{valText}</div>
            </div>
          );
        })
      )}
    </div>
  );
}
