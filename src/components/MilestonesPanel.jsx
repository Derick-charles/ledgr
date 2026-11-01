import { evaluateAllMilestones } from '../utils/milestones';
import InfoTooltip from './InfoTooltip';

const TIER_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l2.9 6.3 6.9.8-5 4.8 1.3 6.8L12 17.5 5.9 20.7l1.3-6.8-5-4.8 6.9-.8L12 2z" />
  </svg>
);

function CategoryBlock({ cat }) {
  return (
    <div className="milestone-category" key={cat.label}>
      <div className="milestone-category-head">
        <h3>{cat.label}</h3>
        <p>{cat.hint}</p>
      </div>
      <div className="milestone-grid" style={{ '--n': cat.milestones.length }}>
        {cat.milestones.map((m) => (
          <div className={`milestone-card${m.result.achieved ? ' achieved' : ''}`} key={m.id}>
            <div className="milestone-top">
              <div className="milestone-badge">{TIER_ICON}</div>
              <div>
                <div className="milestone-title">{m.title}</div>
                <div className="milestone-desc">{m.description}</div>
              </div>
            </div>
            <div className="milestone-progress-track">
              <div className="milestone-progress-fill" style={{ width: `${m.result.progress * 100}%` }} />
            </div>
            <div className="milestone-progress-label">{m.result.progressLabel}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MilestonesPanel({ streak, trades, tierHistory, todayTier, entry, journalHistory }) {
  const categories = evaluateAllMilestones({ streak, trades, tierHistory, todayTier, entry, journalHistory });
  const totalCount = categories.reduce((s, c) => s + c.milestones.length, 0);
  const achievedCount = categories.reduce((s, c) => s + c.milestones.filter((m) => m.result.achieved).length, 0);

  // One category per row, its cards spread across the full width — no
  // lopsided columns, no gaps. (Phones fall back to a wrapping grid.)
  return (
    <div className="glass panel" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <h2>Milestones <InfoTooltip text="Achievements earned purely through discipline — consistency, checklist adherence, and clean execution. No P&L targets here, on purpose." /></h2>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{achievedCount}/{totalCount} earned</span>
      </div>

      <div className="milestone-stack">
        {categories.map((cat) => <CategoryBlock cat={cat} key={cat.label} />)}
      </div>
    </div>
  );
}
