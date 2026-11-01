import { useMemo, useState } from 'react';
import InfoTooltip from './InfoTooltip';

export default function TradeReview({ trades, periodLabel = 'this month' }) {
  const reviewable = useMemo(() => trades.filter((t) => t.planned), [trades]);
  const [index, setIndex] = useState(0);
  const clampedIndex = Math.max(0, Math.min(index, reviewable.length - 1));
  const trade = reviewable[clampedIndex];

  return (
    <div className="glass panel" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <h2>Trade Review — Planned vs. Actual <InfoTooltip text="Only shows trades where you filled in a Planned Entry when logging them. Compare what you intended against what actually happened." /></h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="icon-nav-btn" disabled={clampedIndex === 0} onClick={() => setIndex((i) => i - 1)}>‹</button>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {trade ? `${trade.date} · ${trade.sym} (${clampedIndex + 1}/${reviewable.length})` : 'No reviewed trades yet'}
          </span>
          <button className="icon-nav-btn" disabled={clampedIndex >= reviewable.length - 1} onClick={() => setIndex((i) => i + 1)}>›</button>
        </div>
      </div>

      <div className="review-grid">
        <div className="review-col planned">
          <div className="review-label">Planned</div>
          <p className="review-text">{trade ? trade.planned : 'Log a trade with a Planned Entry to see it compared here.'}</p>
        </div>
        <div className="review-col actual">
          <div className="review-label">Actual</div>
          <p className="review-text">{trade ? (trade.actual || 'Went to plan — no deviation logged.') : '—'}</p>
        </div>
      </div>

      {trade && (
        <div className="review-lesson">
          {trade.mistake ? (
            <>
              <strong>Lesson:</strong> "{trade.mistake}" has happened{' '}
              {trades.filter((t) => t.mistake === trade.mistake).length}× {periodLabel}. Worth adding a specific rule for it to your checklist.
            </>
          ) : (
            <><strong>Lesson:</strong> No mistake tagged on this one — clean execution against the plan.</>
          )}
        </div>
      )}
    </div>
  );
}
