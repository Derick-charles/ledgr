import { useEffect, useState } from 'react';
import { clickable } from '../utils/a11y.js';
import { formatLong, addDays, toDateId } from '../utils/dateHelpers';
import MediaUpload from './MediaUpload';
import TradeChecklist from './TradeChecklist';
import InfoTooltip from './InfoTooltip';
import { useOffline } from '../hooks/useOffline';

const CONDITIONS = ['Trending', 'Choppy', 'News-Driven', 'Range-Bound'];
const MINDSETS = ['Anxious', 'Focused', 'Calm', 'Overconfident', 'Tilted'];

export default function DailyJournal({ dateId, onDateChange, entry, saveEntry, saveError, tierHistory, checklistTemplate, poiTags }) {
  const offline = useOffline();
  const [notes, setNotes] = useState(entry.notes || '');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // entry arrives asynchronously (and changes entirely when dateId changes,
  // via the day-navigation below) — a plain useState(entry.notes) initial
  // value only reads it once on mount and never updates again, which is
  // exactly what made this field look like it never saved anything: it was
  // always showing blank/stale content regardless of what was actually
  // persisted. Re-sync whenever we've loaded a genuinely different day.
  useEffect(() => {
    setNotes(entry.notes || '');
  }, [entry.dateId]);

  async function handleSave(partial) {
    setSaving(true);
    try {
      await saveEntry(partial);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } catch (e) {
      console.error('Failed to save journal entry:', e);
    } finally {
      setSaving(false);
    }
  }

  const isToday = dateId === toDateId();

  return (
    <div className="glass journal-panel" style={{ marginBottom: 14 }}>
      <div className="journal-head">
        <h2>Daily Journal <InfoTooltip text="Your end-of-day reflection: market conditions, mindset, notes, reference media, and the trade checklist that drives your Trade Quality tier. Use the arrows to review or edit any past day." /></h2>
        <div className="journal-day-nav">
          <button type="button" className="day-nav-btn" onClick={() => onDateChange(addDays(dateId, -1))} title="Previous day">‹</button>
          <span className="jd">{formatLong(dateId)}</span>
          <button type="button" className="day-nav-btn" onClick={() => onDateChange(addDays(dateId, 1))} title="Next day">›</button>
          {!isToday && <button type="button" className="day-nav-today" onClick={() => onDateChange(toDateId())}>Today</button>}
        </div>
      </div>
      <div className="journal-body">
        <div className="journal-left">
          <div className={`journal-fields${offline ? ' offline-lock' : ''}`} inert={offline ? 'true' : undefined}>
          <span className="field-label">Market Conditions</span>
          <div className="chip-row">
            {CONDITIONS.map((c) => (
              <span
                key={c} className={`chip${(entry.marketConditions || []).includes(c) ? ' selected' : ''}`}
                style={{ cursor: 'pointer' }}
                {...clickable(() => {
                  const cur = entry.marketConditions || [];
                  handleSave({ marketConditions: cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c] });
                }, { pressed: (entry.marketConditions || []).includes(c) })}
              >
                {c}
              </span>
            ))}
          </div>

          <span className="field-label">Mindset</span>
          <div className="chip-row">
            {MINDSETS.map((m) => (
              <span
                key={m} className={`chip${entry.mindset === m ? ' selected' : ''}`}
                style={{ cursor: 'pointer' }}
                {...clickable(() => handleSave({ mindset: m }), { pressed: entry.mindset === m })}
              >
                {m}
              </span>
            ))}
          </div>

          <span className="field-label">Points of Interest Observed <span className="modal-field-hint">— broader market context, separate from any individual trade</span></span>
          <div className="chip-row">
            {(poiTags?.tags || []).map((t) => {
              const selected = (entry.poiTags || []).includes(t.label);
              return (
                <span
                  key={t.id} className={`chip${selected ? ' selected' : ''}`}
                  style={selected ? { cursor: 'pointer' } : { cursor: 'pointer', color: t.color, borderColor: `${t.color}55` }}
                  {...clickable(() => {
                    const cur = entry.poiTags || [];
                    handleSave({ poiTags: cur.includes(t.label) ? cur.filter((x) => x !== t.label) : [...cur, t.label] });
                  }, { pressed: selected })}
                >
                  {t.label}
                </span>
              );
            })}
          </div>

          <span className="field-label">Notes</span>
          <textarea
            className="journal-notes"
            style={{ width: '100%', background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: 8, padding: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 14, resize: 'vertical' }}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => handleSave({ notes })}
            placeholder="What happened today? What would you do differently?"
          />
          </div>
        </div>

        <TradeChecklist entry={entry} saveEntry={handleSave} tierHistory={tierHistory} checklistTemplate={checklistTemplate} />
      </div>

      <div className="journal-media">
        <MediaUpload dateId={dateId} entry={entry} saveEntry={handleSave} />

        <div className="journal-actions" style={{ marginTop: 16 }}>
          <span className="save-status">
            {saveError && <span style={{ color: 'var(--negative)' }}>{saveError}</span>}
            {!saveError && savedFlash && <span style={{ color: 'var(--positive)' }}>✓ Saved</span>}
          </span>
          <button className="btn btn-primary" onClick={() => handleSave({ notes })} disabled={saving || offline}>
            {saving ? 'Saving…' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}
