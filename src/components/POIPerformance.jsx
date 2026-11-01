import { computePOIPerformance, fmtMoney } from '../utils/stats';
import InfoTooltip from './InfoTooltip';

// All-time, not month-scoped — a single month rarely has enough trades per
// POI to say anything meaningful about which setup is actually worth being
// keen on; this needs the full sample size.
export default function POIPerformance({ trades, poiColorMap = {} }) {
  const rows = computePOIPerformance(trades);
  const maxWinRate = Math.max(...rows.map((r) => r.winRate), 1);

  return (
    <div className="glass panel" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <h2>POI Performance <InfoTooltip text="Win rate by Point of Interest — the price-action setup tagged on each trade (Order Block, FVG, etc.). Computed across your whole history, so it takes more than a few trades on a POI before its number means much." /></h2>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>All-time</span>
      </div>
      {rows.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>No trades tagged with a POI yet — tag one in Log Trade to start comparing setups.</p>
      ) : (
        rows.map((r) => {
          const pct = (r.winRate / maxWinRate) * 100;
          const color = poiColorMap[r.name] || 'var(--cyan)';
          return (
            <div className="bar-row" key={r.name}>
              <div className="bar-label">{r.name}</div>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
              <div className="bar-value">
                {r.winRate}% <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>({r.count})</span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
