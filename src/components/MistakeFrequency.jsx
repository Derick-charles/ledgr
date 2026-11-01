import { useMemo, useState } from 'react';
import { fmtMoney } from '../utils/stats';
import InfoTooltip from './InfoTooltip';

// How often each mistake tag shows up AND what those trades netted. "Missed"
// setups have no P&L, so they count toward frequency but add $0 to cost.
export default function MistakeFrequency({ trades, mistakeColorMap = {}, periodLabel = 'this month' }) {
  const [sortBy, setSortBy] = useState('count'); // 'count' | 'cost'

  const entries = useMemo(() => {
    const byTag = {};
    trades.forEach((t) => {
      if (!t.mistake) return;
      const row = (byTag[t.mistake] ||= { name: t.mistake, count: 0, net: 0 });
      row.count += 1;
      if (t.side !== 'missed') row.net += t.pnl;
    });
    const list = Object.values(byTag);
    // Cost view puts the most expensive mistake first (most negative net).
    return sortBy === 'cost'
      ? list.sort((a, b) => a.net - b.net || b.count - a.count)
      : list.sort((a, b) => b.count - a.count || a.net - b.net);
  }, [trades, sortBy]);

  const maxCount = Math.max(...entries.map((e) => e.count), 1);
  const maxAbsNet = Math.max(...entries.map((e) => Math.abs(e.net)), 1);
  const totalNet = entries.reduce((s, e) => s + e.net, 0);

  return (
    <div className="glass panel" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <h2>Mistake Frequency <InfoTooltip text="How often each mistake tag shows up, and the net P&L of the trades carrying it — so you can see which mistake is actually costing you money, not just which is most common. Switch the bars between count and cost." /></h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{periodLabel === 'this month' ? 'This month' : periodLabel.replace(/^in /, '')}</span>
          <div className="chart-toggle">
            <button className={sortBy === 'count' ? 'active' : ''} onClick={() => setSortBy('count')}>Count</button>
            <button className={sortBy === 'cost' ? 'active' : ''} onClick={() => setSortBy('cost')}>Cost</button>
          </div>
        </div>
      </div>
      {entries.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>No mistakes tagged — clean run.</p>
      ) : (
        <>
          {entries.map((e) => {
            const color = mistakeColorMap[e.name] || '#FF6B7A';
            const pct = sortBy === 'cost' ? (Math.abs(e.net) / maxAbsNet) * 100 : (e.count / maxCount) * 100;
            return (
              <div className="bar-row" key={e.name}>
                <div className="bar-label">{e.name}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: sortBy === 'cost' ? (e.net < 0 ? 'var(--negative)' : 'var(--positive)') : color }} /></div>
                <div className="bar-value" style={{ width: 'auto', whiteSpace: 'nowrap' }}>
                  {e.count}× <span style={{ color: e.net < 0 ? 'var(--negative)' : e.net > 0 ? 'var(--positive)' : 'var(--text-tertiary)' }}>· {fmtMoney(e.net)}</span>
                </div>
              </div>
            );
          })}
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 12 }}>
            Trades with a mistake tagged netted {fmtMoney(totalNet)} in total.
          </p>
        </>
      )}
    </div>
  );
}
