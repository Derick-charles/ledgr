import { useState } from 'react';
import { useOffline } from '../hooks/useOffline';
import { countdownLabel, doneThisWeek, fmtR, overview, startLabel } from '../utils/backtestView';

const CHECK = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="4 12 10 18 20 6" /></svg>
);

// "Preparing for a challenge": how long until it starts, the rules you're
// backtesting against, and a readiness checklist. Lives next to the gallery.
export default function E8Prep({ items, prep, savePrep }) {
  const offline = useOffline();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const { rules } = prep;
  const firm = rules.firm;
  const left = countdownLabel(prep.startDate);
  const week = doneThisWeek(items);
  const all = overview(items);

  function startEdit() {
    setDraft({ firm: rules.firm, target: rules.target, maxDD: rules.maxDD, daily: rules.daily, ddType: rules.ddType, startDate: prep.startDate, perWeek: prep.perWeek });
    setError('');
    setEditing(true);
  }
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  async function save() {
    const n = (v) => Number(v);
    if (![draft.target, draft.maxDD, draft.daily, draft.perWeek].every((v) => Number.isFinite(n(v)) && n(v) > 0)) {
      setError('Target, drawdown, daily limit and weekly plan need to be numbers above zero.');
      return;
    }
    try {
      await savePrep({
        rules: { firm: draft.firm, target: n(draft.target), maxDD: n(draft.maxDD), daily: n(draft.daily), ddType: draft.ddType },
        startDate: draft.startDate, perWeek: n(draft.perWeek),
      });
      setEditing(false);
    } catch (e) { setError(e.message); }
  }

  return (
    <section className="bt-prep" id="bt-prep" aria-label={`${firm} preparation`}>
      <div className="bt-prep-head">
        <h2>{firm} preparation</h2>
        <span className="bt-pill">{startLabel(prep.startDate)}</span>
      </div>

      <div className="bt-prep-card">
        <div className="bt-prep-big">{left || 'No start date yet'}</div>
        <div className="bt-prep-sub">Plan: {prep.perWeek} session{prep.perWeek === 1 ? '' : 's'} a week · {week} started this week</div>
      </div>

      <div className="bt-prep-card">
        <div className="bt-prep-row">
          <div>
            <div className="bt-prep-title">Default rules for new sessions</div>
            <div className="bt-prep-sub bt-prep-rules">{rules.target}% target · {rules.maxDD}% max drawdown · {rules.daily}% daily · {rules.ddType}</div>
          </div>
          {!offline && !editing && <button type="button" className="bt-link-btn" onClick={startEdit}>Edit</button>}
        </div>
        <div className="bt-prep-sub">Each session can use its own rules. Confirm on {firm}'s site before you pay.</div>

        {editing && draft && (
          <div className="bt-rules-form">
            <div className="modal-row">
              <div className="modal-field"><label>Firm name</label><input type="text" value={draft.firm} onChange={set('firm')} maxLength={20} /></div>
              <div className="modal-field"><label>Profit target %</label><input type="number" step="0.1" min="0" value={draft.target} onChange={set('target')} /></div>
            </div>
            <div className="modal-row">
              <div className="modal-field"><label>Max drawdown %</label><input type="number" step="0.1" min="0" value={draft.maxDD} onChange={set('maxDD')} /></div>
              <div className="modal-field"><label>Daily loss %</label><input type="number" step="0.1" min="0" value={draft.daily} onChange={set('daily')} /></div>
            </div>
            <div className="modal-row">
              <div className="modal-field">
                <label>Drawdown type</label>
                <select value={draft.ddType} onChange={set('ddType')}>
                  <option value="trailing">Trailing — from the highest point</option>
                  <option value="static">Static — from the start balance</option>
                </select>
              </div>
              <div className="modal-field"><label>Challenge starts</label><input type="date" value={draft.startDate} onChange={set('startDate')} /></div>
            </div>
            <div className="modal-field"><label>Sessions a week</label><input type="number" min="1" max="50" value={draft.perWeek} onChange={set('perWeek')} /></div>
            {error && <div className="auth-error">{error}</div>}
            <div className="bt-form-actions">
              <button type="button" className="btn btn-ghost glass" onClick={() => setEditing(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={save}>Save rules</button>
            </div>
          </div>
        )}
      </div>

      <div className="bt-prep-card">
        <div className="bt-prep-row">
          <div>
            <div className="bt-prep-title">All sessions together</div>
            <div className="bt-prep-sub">{all.sessions === 0 ? 'Fills up as you add sessions' : `Pooled from every session — ${all.open} open · ${all.closed} closed`}</div>
          </div>
        </div>
        <div className="bt-stat-grid bt-pool">
          <div className="bt-stat"><b>{all.entries}</b><span>Entries{all.missed ? ` · ${all.missed} missed` : ''}</span></div>
          <div className="bt-stat"><b>{all.entries ? `${all.winRate}%` : '—'}</b><span>Win rate</span></div>
          <div className="bt-stat"><b className={all.netR > 0 ? 'pos' : all.netR < 0 ? 'neg' : ''}>{all.entries ? fmtR(all.netR) : '—'}</b><span>Net result</span></div>
          <div className="bt-stat"><b>{all.entries ? `${all.expectancy.toFixed(2)}R` : '—'}</b><span>Expectancy</span></div>
        </div>
        <div className="bt-prep-title" style={{ marginTop: 14 }}>Sessions that meet each check</div>
        <ul className="bt-check-list">
          {all.checks.map((c) => {
            const done = all.withEntries > 0 && c.n === all.withEntries;
            return (
              <li key={c.id} className={done ? 'done' : ''}>
                <span className="bt-check-line">
                  <span className="bt-check-box" aria-hidden="true">{done && CHECK}</span>
                  <span className="bt-check-text">{c.label}</span>
                  <span className="bt-prep-count">{c.n} of {all.withEntries}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
