import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { addDays, formatShort, toDateId } from '../utils/dateHelpers';
import { fmtMoney } from '../utils/stats';
import InfoTooltip from './InfoTooltip';
import { useOffline } from '../hooks/useOffline';

// weekId = the Monday of a week (local date), used as the record key so each
// week gets its own reflection: /api/lessons?week=<weekId>
function mondayOf(date = new Date()) {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // 0=Mon
  // Local date parts, not toISOString(): that converts to UTC and, for
  // anyone ahead of UTC, returns the wrong day in the early hours of Monday.
  return toDateId(d);
}

// A click-to-edit line of text. The placeholder is drawn by CSS (:empty), so
// it's never real text — clicking in and typing can't end up inside it, and
// leaving it untouched can't save it. The DOM text is managed here rather
// than by React children, because the browser edits it directly while typing.
function EditableLine({ value, placeholder, onCommit, readOnly }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) ref.current.textContent = value;
  }, [value]);
  return (
    <span
      ref={ref} className="editable" contentEditable={!readOnly} suppressContentEditableWarning data-placeholder={placeholder}
      onInput={(e) => { if (!e.currentTarget.textContent) e.currentTarget.innerHTML = ''; }}
      onBlur={(e) => onCommit(e.currentTarget.textContent)}
    />
  );
}

// `trades` isn't read directly — each week's trades are fetched on their own
// (a week can straddle two months) — but it changes whenever a trade is
// added, edited or deleted, so it's what triggers a refresh.
export default function WeeklyLessons({ trades, accountId }) {
  const offline = useOffline();
  const thisWeekId = mondayOf();
  const [weekId, setWeekId] = useState(thisWeekId);
  const weekEnd = addDays(weekId, 6);
  const isCurrentWeek = weekId === thisWeekId;

  const [bestDecision, setBestDecision] = useState('');
  const [carryForward, setCarryForward] = useState('');
  const [weekTrades, setWeekTrades] = useState([]);

  // Reflection notes for the selected week.
  useEffect(() => {
    if (!accountId) return undefined;
    let cancelled = false;
    setBestDecision(''); setCarryForward('');
    api.get(`/api/lessons?account=${accountId}&week=${weekId}`)
      .then((data) => {
        if (cancelled) return;
        setBestDecision(data.bestDecision || '');
        setCarryForward(data.carryForward || '');
      })
      .catch((e) => console.error('Failed to load weekly lessons:', e));
    return () => { cancelled = true; };
  }, [weekId, accountId]);

  // That week's trades, for the auto-calculated line and the summary.
  useEffect(() => {
    if (!accountId) return undefined;
    let cancelled = false;
    api.get(`/api/trades?account=${accountId}&start=${weekId}&end=${weekEnd}`)
      .then((data) => { if (!cancelled) setWeekTrades(data); })
      .catch((e) => console.error('Failed to load week trades:', e));
    return () => { cancelled = true; };
  }, [weekId, weekEnd, accountId, trades]);

  function save(field, value) {
    if (!accountId) return;
    api.put(`/api/lessons?account=${accountId}&week=${weekId}`, { field, value })
      .catch((e) => console.error('Failed to save weekly lessons:', e));
  }

  const topMistake = useMemo(() => {
    const counts = {};
    weekTrades.forEach((t) => { if (t.mistake) counts[t.mistake] = (counts[t.mistake] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0] || null;
  }, [weekTrades]);

  const summary = useMemo(() => {
    const taken = weekTrades.filter((t) => t.side !== 'missed');
    return { count: taken.length, net: taken.reduce((s, t) => s + t.pnl, 0), wins: taken.filter((t) => t.pnl > 0).length };
  }, [weekTrades]);

  const bestPlaceholder = isCurrentWeek ? 'Click to write about your best decision this week…' : 'Nothing written for this week — click to add.';
  const carryPlaceholder = isCurrentWeek ? 'Click to write one thing to carry forward…' : 'Nothing written for this week — click to add.';
  const commit = (field, current, setter) => (val) => {
    if (val === current) return; // nothing changed
    setter(val);
    save(field, val);
  };

  const rangeLabel = `${formatShort(weekId)} – ${formatShort(weekEnd)}`;

  return (
    <div className="glass panel" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <h2>{isCurrentWeek ? "This Week's Lessons" : 'Weekly Lessons'} <InfoTooltip text="Your biggest repeated mistake is calculated automatically from that week's trade tags. The other two lines are your own reflections — click the text to edit. Use the arrows to look back at earlier weeks." /></h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="icon-nav-btn" onClick={() => setWeekId(addDays(weekId, -7))} aria-label="Previous week" title="Previous week">‹</button>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)', minWidth: 96, textAlign: 'center' }}>{rangeLabel}</span>
          <button className="icon-nav-btn" onClick={() => setWeekId(addDays(weekId, 7))} disabled={isCurrentWeek} aria-label="Next week" title="Next week">›</button>
          {!isCurrentWeek && <button className="btn btn-ghost month-nav-today" onClick={() => setWeekId(thisWeekId)}>This week</button>}
        </div>
      </div>
      <div className="lessons-list" key={weekId}>
        <div className="lesson-row">
          <span className="lesson-dot mistake"></span>
          <div className="lesson-text">
            <strong>Biggest mistake repeated:</strong>{' '}
            {topMistake ? `"${topMistake[0]}" — happened ${topMistake[1]}× that week.` : 'None — clean run.'}
            {summary.count > 0 && (
              <span style={{ color: 'var(--text-tertiary)' }}> · {summary.count} trade{summary.count !== 1 ? 's' : ''}, {summary.wins} won, {fmtMoney(summary.net)}</span>
            )}
          </div>
        </div>
        <div className="lesson-row">
          <span className="lesson-dot win"></span>
          <div className="lesson-text">
            <strong>Best decision: </strong>
            <EditableLine readOnly={offline} value={bestDecision} placeholder={bestPlaceholder} onCommit={commit('bestDecision', bestDecision, setBestDecision)} />
          </div>
          <span className="lesson-tag-manual">Your notes</span>
        </div>
        <div className="lesson-row">
          <span className="lesson-dot forward"></span>
          <div className="lesson-text">
            <strong>Carry into next week: </strong>
            <EditableLine readOnly={offline} value={carryForward} placeholder={carryPlaceholder} onCommit={commit('carryForward', carryForward, setCarryForward)} />
          </div>
          <span className="lesson-tag-manual">Your notes</span>
        </div>
      </div>
    </div>
  );
}
