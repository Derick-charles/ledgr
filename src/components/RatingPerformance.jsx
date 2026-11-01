import { useMemo } from 'react';
import { MIN_SAMPLE, fmtMoney } from '../utils/stats';
import InfoTooltip from './InfoTooltip';

function bucket(list) {
  const wins = list.filter((t) => t.pnl > 0).length;
  return { count: list.length, winRate: list.length ? Math.round((wins / list.length) * 100) : 0, avg: list.length ? list.reduce((s, t) => s + t.pnl, 0) / list.length : 0, net: list.reduce((s, t) => s + t.pnl, 0) };
}

// Does grading yourself actually track results? Groups all-time executed
// trades by self-rating (and by extra tag) so e.g. "your 4–5★ execution
// trades average X, your 1–2★ trades average Y" is visible.
export default function RatingPerformance({ trades }) {
  const data = useMemo(() => {
    const groups = (key) => [
      ['4–5 ★', (t) => t[key] >= 4], ['3 ★', (t) => t[key] === 3], ['1–2 ★', (t) => t[key] >= 1 && t[key] <= 2],
    ].map(([label, fn]) => ({ label, ...bucket(trades.filter((t) => t[key] && fn(t))) })).filter((g) => g.count > 0);
    const tagNames = [...new Set(trades.flatMap((t) => t.tags || []))];
    return {
      exec: groups('ratingExec'), disc: groups('ratingDisc'),
      tags: tagNames.map((name) => ({ label: name, ...bucket(trades.filter((t) => (t.tags || []).includes(name))) })).sort((a, b) => b.count - a.count).slice(0, 8),
      rated: trades.filter((t) => t.ratingExec || t.ratingDisc).length,
    };
  }, [trades]);

  const row = (g) => {
    const small = g.count < MIN_SAMPLE;
    return (
      <div className="bar-row" key={g.label} style={small ? { opacity: 0.5 } : undefined} title={small ? `Only ${g.count} trade${g.count !== 1 ? 's' : ''} — small sample` : `${fmtMoney(g.net)} net`}>
        <div className="bar-label" style={{ width: 70 }}>{g.label}</div>
        <div className="bar-track"><div className="bar-fill" style={{ width: `${g.winRate}%`, background: g.avg >= 0 ? 'var(--positive)' : 'var(--negative)' }} /></div>
        <div className="bar-value" style={{ width: 'auto', whiteSpace: 'nowrap' }}>
          {g.winRate}% · avg {fmtMoney(g.avg)} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>({g.count}{small ? ' · small sample' : ''})</span>
        </div>
      </div>
    );
  };

  return (
    <div className="glass panel" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <h2>Ratings &amp; Tags <InfoTooltip text="Win rate and average P&L grouped by how you rated your own execution and discipline, and by your extra tags — across your whole history. Rows under 5 trades are dimmed." /></h2>
        <span className="mono" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>All-time</span>
      </div>
      {data.rated === 0 && data.tags.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>Rate a trade's execution and discipline (or add tags) when logging or editing it, and this will show whether your self-grades match your results.</p>
      ) : (
        <>
          {data.exec.length > 0 && <><div className="nav-label" style={{ padding: 0, margin: '4px 0 8px' }}>Execution</div>{data.exec.map(row)}</>}
          {data.disc.length > 0 && <><div className="nav-label" style={{ padding: 0, margin: '12px 0 8px' }}>Discipline</div>{data.disc.map(row)}</>}
          {data.tags.length > 0 && <><div className="nav-label" style={{ padding: 0, margin: '12px 0 8px' }}>Tags</div>{data.tags.map(row)}</>}
        </>
      )}
    </div>
  );
}
