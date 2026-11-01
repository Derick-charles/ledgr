import { useState } from 'react';
import { useEscape } from '../hooks/useEscape.js';
import { formatLong } from '../utils/dateHelpers';
import { fmtMoney, fmtR, tradeR } from '../utils/stats';
import Lightbox from './Lightbox';

function MediaRow({ label, items }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const viewable = (items || []).filter((m) => m.type !== 'link');
  if (!items || items.length === 0) return null;

  return (
    <div>
      <span className="field-label" style={{ marginBottom: 6 }}>{label}</span>
      <div className="media-grid" style={{ marginBottom: 0 }}>
        {items.map((m, i) => (
          <div className={`media-thumb${m.type === 'link' ? ' link-thumb' : ''}`} key={m.id || m.url || i}>
            {m.type === 'link' ? (
              <a href={m.url} target="_blank" rel="noopener noreferrer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </a>
            ) : (
              <button
                type="button" className="media-thumb-open"
                onClick={() => setLightboxIndex(viewable.findIndex((v) => (v.id || v.url) === (m.id || m.url)))}
                title="Click to enlarge"
              >
                {m.type === 'video' ? <><video src={m.url} muted playsInline /><span className="vid-badge">▶</span></> : <img src={m.url} alt="" />}
              </button>
            )}
          </div>
        ))}
      </div>
      <Lightbox items={viewable} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} />
    </div>
  );
}

export default function DayDetailModal({ dateId, trades, journalHistory, onClose, mistakeColorMap = {}, onOpenJournal, onEdit, onDelete }) {
  useEscape(onClose);
  const dayTrades = trades.filter((t) => t.date === dateId);
  const dayJournal = journalHistory.find((e) => e.dateId === dateId);
  const dayTotal = dayTrades.reduce((s, t) => s + t.pnl, 0);
  const [tradeIndex, setTradeIndex] = useState(0);
  // Clamped rather than raw state: after a delete shrinks dayTrades, the
  // previously-viewed index can point past the new end of the array.
  const safeIndex = Math.min(tradeIndex, Math.max(dayTrades.length - 1, 0));
  const t = dayTrades[safeIndex];

  function handleDelete() {
    if (window.confirm(`Delete the ${t.sym} trade? This also removes any attached images/clips and can't be undone.`)) {
      onDelete(t);
      setTradeIndex((i) => Math.max(i - 1, 0));
    }
  }

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal-card glass" role="dialog" aria-modal="true" aria-label="Day details" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{formatLong(dateId)}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {dayTrades.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              No trades logged this day. {dayJournal ? '' : "That's a missed journaling day too."}
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {dayTrades.length} trade{dayTrades.length !== 1 ? 's' : ''} · day total
                </span>
                <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: dayTotal >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                  {fmtMoney(dayTotal)}
                </span>
              </div>

              {/* Each trade is viewed on its own, one at a time — a day
                  with several trades no longer stacks them into one long
                  scroll; step through with the arrows below instead. */}
              {dayTrades.length > 1 && (
                <div className="trade-nav-row">
                  <button className="day-nav-btn" onClick={() => setTradeIndex((safeIndex - 1 + dayTrades.length) % dayTrades.length)} title="Previous trade">‹</button>
                  <span className="mono">Trade {safeIndex + 1} of {dayTrades.length}</span>
                  <button className="day-nav-btn" onClick={() => setTradeIndex((safeIndex + 1) % dayTrades.length)} title="Next trade">›</button>
                </div>
              )}

              <div
                key={t.id}
                style={{ border: '1px solid var(--glass-border)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{t.sym}</span>
                  <span className={`side ${t.side}`}>{t.side.toUpperCase()}</span>
                  <span className="mono" style={{ fontWeight: 600, color: t.side === 'missed' ? 'var(--text-tertiary)' : (t.pnl >= 0 ? 'var(--positive)' : 'var(--negative)'), flex: 1, textAlign: 'right' }}>
                    {t.side === 'missed' ? '—' : fmtMoney(t.pnl)}
                  </span>
                  {onEdit && (
                    <button className="row-edit-btn" title="Edit this trade" onClick={() => onEdit(t)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                  )}
                  {onDelete && (
                    <button className="row-delete-btn" title="Delete this trade" onClick={handleDelete}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                  {t.time ? `${t.time} · ` : ''}{t.entry && t.exit ? `$${t.entry} → $${t.exit} · ` : ''}{t.size ? `${t.size} shares · ` : ''}{t.side === 'missed' ? 'not taken' : (tradeR(t) === null ? 'R: set $ risked to track' : fmtR(tradeR(t)))}{t.risk ? ` · risked $${t.risk}` : ''}
                </div>
                {t.mistake && (() => {
                  const color = mistakeColorMap[t.mistake] || 'var(--negative)';
                  return (
                    <span className="mistake-tag" style={{ alignSelf: 'flex-start', color, background: `${color}1A`, borderColor: `${color}55` }}>
                      {t.mistake}
                    </span>
                  );
                })()}
                {(t.ratingExec || t.ratingDisc) && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Execution <strong style={{ color: 'var(--amber)' }}>{t.ratingExec ? '★'.repeat(t.ratingExec) : '—'}</strong>
                    {' · '}Discipline <strong style={{ color: 'var(--amber)' }}>{t.ratingDisc ? '★'.repeat(t.ratingDisc) : '—'}</strong>
                  </div>
                )}
                {(t.tags || []).length > 0 && (
                  <div className="trade-tags">{t.tags.map((x) => <span className="trade-tag" key={x}>{x}</span>)}</div>
                )}
                {t.notes && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    <strong style={{ color: 'var(--violet)' }}>Notes:</strong> {t.notes}
                  </div>
                )}
                {t.planned && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--cyan)' }}>Planned:</strong> {t.planned}
                  </div>
                )}
                {t.actual && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--negative)' }}>Actual:</strong> {t.actual}
                  </div>
                )}
                <MediaRow label="Before" items={t.beforeMedia} />
                <MediaRow label="After" items={t.afterMedia} />
              </div>
            </>
          )}

          {dayJournal && (
            <div style={{ display: 'flex', gap: 16, paddingTop: 12, borderTop: '1px solid var(--glass-border)', fontSize: 12.5 }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                Mindset: <strong style={{ color: 'var(--text-primary)' }}>{dayJournal.mindset}</strong>
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                Trade Quality: <strong style={{ color: 'var(--text-primary)' }}>{dayJournal.tierComputed} tier</strong>
              </span>
            </div>
          )}

          {onOpenJournal && (
            <button className="btn btn-ghost" style={{ width: '100%', marginTop: 4 }} onClick={() => onOpenJournal(dateId)}>
              Open full journal entry for this day →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
