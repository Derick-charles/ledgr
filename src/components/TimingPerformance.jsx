import { useMemo, useState } from 'react';
import { MIN_SAMPLE, computeTimingPerformance, fmtMoney } from '../utils/stats';
import InfoTooltip from './InfoTooltip';

// Win rate by hour of day and by weekday, across the whole history — a
// single month is far too few trades per bucket to mean anything. Buckets
// under MIN_SAMPLE trades are dimmed and labelled "small sample" so 2 wins
// out of 2 doesn't read as a 100% edge.
export default function TimingPerformance({ trades }) {
  const [mode, setMode] = useState('day');
  const timing = useMemo(() => computeTimingPerformance(trades), [trades]);
  const rows = mode === 'hour' ? timing.hours : timing.days;

  return (
    <div className="glass panel" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <h2>Timing <InfoTooltip text={`Win rate by ${mode === 'hour' ? 'the hour you took the trade' : 'day of the week'}, across your whole history. Rows with fewer than ${MIN_SAMPLE} trades are dimmed — too few to trust. Hours need the optional trade time when logging.`} /></h2>
        <div className="chart-toggle">
          <button className={mode === 'day' ? 'active' : ''} onClick={() => setMode('day')}>Day</button>
          <button className={mode === 'hour' ? 'active' : ''} onClick={() => setMode('hour')}>Hour</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>
          {mode === 'hour'
            ? 'No trades have a time yet — add the optional time when logging (or editing) a trade to see win rate by hour.'
            : 'No trades logged yet.'}
        </p>
      ) : (
        rows.map((r) => {
          const small = r.count < MIN_SAMPLE;
          const color = r.winRate >= 50 ? 'var(--positive)' : 'var(--negative)';
          return (
            <div className="bar-row" key={r.label} style={small ? { opacity: 0.5 } : undefined} title={small ? `Only ${r.count} trade${r.count !== 1 ? 's' : ''} — small sample` : `${fmtMoney(r.netPnl)} net`}>
              <div className="bar-label" style={{ width: 52 }}>{r.label}</div>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${r.winRate}%`, background: color }} /></div>
              <div className="bar-value" style={{ width: 'auto', whiteSpace: 'nowrap' }}>
                {r.winRate}% <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>({r.count}{small ? ' · small sample' : ''})</span>
              </div>
            </div>
          );
        })
      )}

      {mode === 'hour' && timing.total > 0 && (
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 12 }}>
          {timing.withTime} of {timing.total} trades have a time logged.
        </p>
      )}
    </div>
  );
}
