import { computeStreaks, fmtMoney } from '../utils/stats';
import InfoTooltip from './InfoTooltip';

export default function TradeStreaks({ trades }) {
  const s = computeStreaks(trades);
  const hasCurrent = s.currentType !== null;
  const currentLabel = hasCurrent ? `${s.currentCount}${s.currentType === 'win' ? 'W' : 'L'}` : '—';
  const currentColorClass = s.currentType === 'win' ? 'pos' : s.currentType === 'loss' ? 'neg' : '';

  return (
    <div className="glass panel" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <h2>Win/Loss Streaks <InfoTooltip text="How your wins and losses cluster together — useful for spotting tilt building during a loss streak, or overconfidence creeping in after a long win streak." /></h2>
      </div>
      <div className="streak-stat-grid">
        <div className="streak-stat">
          <div className="streak-stat-label">Current Streak</div>
          <div className={`streak-stat-value mono ${currentColorClass}`}>{currentLabel}</div>
        </div>
        <div className="streak-stat">
          <div className="streak-stat-label">Best Win Streak</div>
          <div className="streak-stat-value mono pos">{s.bestWinStreak}W</div>
        </div>
        <div className="streak-stat">
          <div className="streak-stat-label">Worst Loss Streak</div>
          <div className="streak-stat-value mono neg">{s.worstLossStreak}L</div>
        </div>
        <div className="streak-stat">
          <div className="streak-stat-label">Avg Win / Avg Loss</div>
          <div className="streak-stat-value combo mono">
            <span className="pos">{fmtMoney(s.avgWin)}</span>
            <span style={{ color: 'var(--text-tertiary)', margin: '0 4px' }}>/</span>
            <span className="neg">{fmtMoney(s.avgLoss)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
