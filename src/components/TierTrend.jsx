import { TIER_COLORS } from '../utils/stats';

const TIER_HEIGHTS = { S: 100, A: 75, B: 50, C: 28 };

// `history` = last 6 days of { dateId, tierComputed } from journalEntries.
// Today's bar always reflects the checklist live, even before it's saved.
export default function TierTrend({ history, todayTier }) {
  const bars = [
    ...history.map((h) => ({
      tier: h.tierComputed || 'C',
      label: new Date(h.dateId + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' }),
    })),
    { tier: todayTier, label: 'Today' },
  ];

  return (
    <div className="tier-trend">
      <div className="tier-trend-label">7-Day Trend</div>
      <div className="tier-trend-bars">
        {bars.map((b, i) => (
          <div className={`tier-trend-bar${b.label === 'Today' ? ' is-today' : ''}`} key={i}>
            <div className="bar" style={{ height: `${TIER_HEIGHTS[b.tier]}%`, background: TIER_COLORS[b.tier] }} title={`${b.tier} tier`} />
            <span className="lbl">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
