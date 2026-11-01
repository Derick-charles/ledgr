import { useEffect, useState } from 'react';
import { clickable } from '../utils/a11y.js';
import { formatLong } from '../utils/dateHelpers';
import InfoTooltip from './InfoTooltip';
import { useOffline } from '../hooks/useOffline';

const PRESET_AFFIRMATIONS = [
  'I trade my plan, not my emotions',
  'I accept small losses as the cost of business',
  'I am patient and wait for my setup',
  'My edge plays out over many trades, not one',
];

export default function Affirmations({ dateId, entry, saveEntry, saveError }) {
  const offline = useOffline();
  const [notes, setNotes] = useState(entry.affirmationsNotes || '');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Same fix as DailyJournal's Notes field — entry loads asynchronously (and
  // changes entirely if the journal day being viewed changes), so a plain
  // useState(entry.affirmationsNotes) initial value only reads it once on
  // mount and never updates again, making a real save look like it never
  // happened on the next page load.
  useEffect(() => {
    setNotes(entry.affirmationsNotes || '');
  }, [entry.dateId]);

  async function handleSave(partial) {
    setSaving(true);
    try {
      await saveEntry(partial);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } catch (e) {
      console.error('Failed to save affirmations:', e);
    } finally {
      setSaving(false);
    }
  }

  function toggleAffirmation(text) {
    const current = entry.affirmationsSelected || [];
    const next = current.includes(text) ? current.filter((a) => a !== text) : [...current, text];
    handleSave({ affirmationsSelected: next });
  }

  return (
    <div className="glass journal-panel" style={{ marginBottom: 14 }}>
      <div className="journal-head"><h2>Affirmations <InfoTooltip text="Set your intentions before the trading day starts. Select a few presets, or write your own in the notes below." /></h2><span className="jd">{formatLong(dateId)}</span></div>

      <div className={offline ? 'offline-lock' : undefined} inert={offline ? 'true' : undefined}>
      <span className="field-label">Today's Affirmations</span>
      <div className="chip-row">
        {PRESET_AFFIRMATIONS.map((text) => (
          <span
            key={text}
            className={`chip${(entry.affirmationsSelected || []).includes(text) ? ' selected' : ''}`}
            {...clickable(() => toggleAffirmation(text), { pressed: (entry.affirmationsSelected || []).includes(text) })}
            style={{ cursor: 'pointer' }}
          >
            {text}
          </span>
        ))}
      </div>

      <span className="field-label">Notes</span>
      <textarea
        className="journal-notes"
        style={{ width: '100%', background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: 8, padding: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 14, resize: 'vertical' }}
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => handleSave({ affirmationsNotes: notes })}
        placeholder="Write a few lines to yourself for today…"
      />
      </div>

      <div className="journal-actions" style={{ marginTop: 14 }}>
        <span className="save-status">
          {saveError && <span style={{ color: 'var(--negative)' }}>{saveError}</span>}
          {!saveError && savedFlash && <span style={{ color: 'var(--positive)' }}>✓ Saved</span>}
        </span>
        <button className="btn btn-primary" onClick={() => handleSave({ affirmationsNotes: notes })} disabled={saving || offline}>
          {saving ? 'Saving…' : 'Save Affirmations'}
        </button>
      </div>
    </div>
  );
}
