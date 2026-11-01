import { Fragment, useEffect, useMemo, useState } from 'react';
import { useOffline } from '../hooks/useOffline';
import { simulate, sessionReadiness, phasesOf, tfList } from '../../netlify/functions/_backtest-utils.js';
import { STATUS_META, fmtPct, fmtR, linkSource, monthLabel, phaseLabel, phaseTone } from '../utils/backtestView';
import { clickable } from '../utils/a11y.js';
import EntryForm from './EntryForm';
import PeriodCalendar from './PeriodCalendar';
import EntryView from './EntryView';
import { reportError } from '../utils/errorBus';

const PLAY_BIG = (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><polygon points="7 5 19 12 7 19 7 5" /></svg>
);

function Hero({ item }) {
  const clip = item.media.find((m) => m.type === 'video');
  const image = item.media.find((m) => m.type === 'image');
  const source = linkSource(item.link);
  return (
    <div className="bt-hero">
      {clip ? <video src={clip.url} controls playsInline preload="metadata" />
        : image ? <img src={image.url} alt="" />
        : <div className="bt-hero-empty">{item.link ? PLAY_BIG : <span>No video added yet</span>}</div>}
      {item.link && (
        <a className="bt-open-link" href={item.link} target="_blank" rel="noopener noreferrer">
          ▶ Open {source ? `in ${source}` : 'video'}{item.duration ? ` · ${item.duration}` : ''}
        </a>
      )}
    </div>
  );
}

// Cumulative R, with the starting line. A glance at the shape of the run.
function RCurve({ results }) {
  const pts = useMemo(() => {
    const rs = results.every((t) => t[0]) ? [...results].sort((a, b) => (a[0] < b[0] ? -1 : 1)) : results;
    let eq = 0;
    return [0, ...rs.map(([, r]) => (eq += r))];
  }, [results]);
  if (pts.length < 3) return null;
  const W = 600, H = 120, pad = 6;
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const span = hi - lo || 1;
  const x = (i) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - lo) / span) * (H - pad * 2);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <div className="bt-card-block">
      <div className="bt-block-title">R curve <span>{pts.length - 1} trades</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="bt-rcurve" role="img" aria-label="Cumulative R over the backtest">
        <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity="0.2" strokeDasharray="3 4" />
        <path d={d} fill="none" stroke="var(--cyan)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

const ICON = {
  good: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--positive)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label="passes"><polyline points="4 12 10 18 20 6" /></svg>,
  warn: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="warning"><path d="M12 3 2 20h20L12 3z" /><line x1="12" y1="10" x2="12" y2="14" /><line x1="12" y1="17" x2="12" y2="17.5" /></svg>,
  bad: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--negative)" strokeWidth="2.2" strokeLinecap="round" aria-label="fails"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>,
};

function LearnedRow({ kind, label, value, readOnly, onSave }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const icons = {
    worked: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><polyline points="8 12 11 15 16 9" /></svg>,
    failed: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></svg>,
    next: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" /></svg>,
  };
  return (
    <label className="bt-learned-row">
      <span className="bt-learned-icon">{icons[kind]}</span>
      <span className="bt-learned-label">{label}:</span>
      <input
        type="text" value={text} maxLength={400} readOnly={readOnly}
        placeholder={readOnly ? '—' : 'Click to write…'}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (text.trim() !== value) onSave(text.trim()); }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
    </label>
  );
}

const TICK = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="4 12 10 18 20 6" /></svg>;
const SHOW = 24;

const byNewest = (a, b) => `${b.date || ''} ${b.time || ''} ${b.createdAt || 0}`.localeCompare(`${a.date || ''} ${a.time || ''} ${a.createdAt || 0}`);

function Entries({ entries, offline, locked, day, onClearDay, onNew, onOpen }) {
  const [all, setAll] = useState(false);
  const list = useMemo(() => [...entries].filter((e) => !day || e.date === day).sort(byNewest), [entries, day]);
  const shown = all || day ? list : list.slice(0, SHOW);
  return (
    <div className="bt-card-block">
      <div className="bt-block-title">
        <b>Entries <span className="bt-count">{day ? `${list.length} of ${entries.length}` : entries.length}</span></b>
        <button type="button" className="btn btn-primary bt-new-entry" onClick={onNew} disabled={offline || locked} title={locked ? 'This session is closed — reopen it to add entries' : offline ? 'Adding an entry needs a connection' : undefined}>+ New entry</button>
      </div>
      {day && (
        <div className="bt-dayfilter">
          <span>Showing {day}</span>
          <button type="button" onClick={onClearDay} aria-label="Show all days">✕ Show all</button>
        </div>
      )}
      {locked && <p className="bt-fine" style={{ marginTop: 0 }}>This session is closed, so its entries are locked. Reopen it to add or change them.</p>}
      {entries.length === 0 || list.length === 0 ? (
        <p className="bt-prep-sub">{entries.length > 0 ? 'No entries on this day.' : 'No entries yet. Add each trade you backtest — the win rate, drawdown and checklist all update from them.'}</p>
      ) : (
        <>
        <div className="bt-grid bt-entry-grid">
          {shown.map((e) => {
            const shot = (e.media || [])[0];
            const tfs = tfList(e);
            const outcome = e.side === 'missed' ? { label: 'Missed', cls: 'review' } : e.side === 'breakeven' || e.r === 0 ? { label: 'Breakeven', cls: 'plain' } : e.r > 0 ? { label: 'Win', cls: 'validated' } : { label: 'Loss', cls: 'rejected' };
            const dir = e.side === 'long' ? 'Long' : e.side === 'short' ? 'Short' : '';
            const tone = e.side === 'missed' ? '' : e.r > 0 ? 'pos' : e.r < 0 ? 'neg' : '';
            const body = (
              <>
                <div className="bt-thumb">
                  {shot ? <img src={shot.url} alt="" loading="lazy" /> : <span className={`bt-entry-bigr ${tone}`}>{e.side === 'missed' ? `(${fmtR(e.r)})` : fmtR(e.r)}</span>}
                  {tfs.length > 0 && <span className="bt-thumb-chip">{tfs.join(' › ')}</span>}
                </div>
                <div className="bt-card-body">
                  <div className="bt-card-title">{[e.symbol || 'Trade', dir].filter(Boolean).join(' · ')}</div>
                  <div className="bt-card-sub">{[e.date, e.time, e.setup].filter(Boolean).join(' · ') || 'No date'}</div>
                  <div className="bt-card-stats">{shot ? <><b className={`bt-entry-r ${tone}`}>{e.side === 'missed' ? `(${fmtR(e.r)})` : fmtR(e.r)}</b>{e.notes ? ' · ' : ''}</> : null}{e.notes ? <span className="bt-entry-notes">{e.notes}</span> : null}</div>
                  <div className="bt-tags">
                    <span className={`bt-tag ${outcome.cls}`}>{outcome.label}</span>
                    {e.followed === false && e.side !== 'missed' && <span className="bt-tag warn">Broke a rule</span>}
                  </div>
                </div>
              </>
            );
            return <div key={e.id} className="bt-card" {...clickable(() => onOpen(e), { label: `Open entry ${e.symbol || ''} ${e.date || ''}` })}>{body}</div>;
          })}
        </div>
        {!all && !day && list.length > SHOW && <button type="button" className="bt-link-btn" style={{ marginTop: 10 }} onClick={() => setAll(true)}>Show all {list.length}</button>}
        </>
      )}
    </div>
  );
}

export default function BacktestDetail({ item, rules: defaultRules, index, total, onBack, onPrev, onNext, onEdit, onNewFrom, fetchOne, update, remove, addEntry, editEntry, removeEntry }) {
  const offline = useOffline();
  const rules = item.rules || defaultRules;
  const [entryForm, setEntryForm] = useState(null); // null | { initial }
  const [viewId, setViewId] = useState(null);       // the entry being looked at
  const [full, setFull] = useState(null);
  const [day, setDay] = useState(null);           // a calendar day picked to filter entries
  const [failed, setFailed] = useState(false);
  const s = item.stats;
  const challenge = item.challenge || { overall: 'empty', phases: [] };
  const phases = challenge.phases;
  const many = phases.length > 1;

  useEffect(() => {
    let cancelled = false;
    setFull(null); setFailed(false);
    fetchOne(item.id).then((d) => { if (!cancelled) setFull(d); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [item.id, item.updatedAt, fetchOne]);

  const sim = useMemo(() => (full ? simulate(full.results, item.riskPct, phasesOf({ ...item, rules })) : null), [full, item.riskPct, item.steps, item.rules, item.rules2, item.updatedAt]);
  const entries = full ? full.entries : [];
  const daily = useMemo(() => {
    const m = {};
    (full ? full.results : []).forEach(([d, r]) => { if (!d) return; const c = m[d] || (m[d] = { v: 0, count: 0 }); c.v += r; c.count++; });
    return m;
  }, [full]);
  const ready = sessionReadiness(s, item.riskPct, rules, item.followedPct ?? 100, challenge);
  const allDone = ready.length > 0 && ready.every((x) => x.done);
  const closed = !!item.closed;
  const readyCount = ready.filter((x) => x.done).length;
  const learned = (full || item).learned || { worked: '', failed: '', next: '' };

  const save = (patch) => update(item.id, patch).catch((e) => reportError(`Couldn't save: ${e.message}`));
  const saveLearned = (key) => (value) => save({ learned: { ...learned, [key]: value } });

  async function handleDelete() {
    if (!window.confirm(`Delete "${item.title}"? Its entries, screenshots and any uploaded preview go with it. This can't be undone.`)) return;
    try { await remove(item.id); onBack(); } catch (e) { reportError(`Couldn't delete: ${e.message}`); }
  }

  const meta = STATUS_META[item.status] || STATUS_META.review;
  const meaning = item.riskPct ? `risk ${item.riskPct}% per trade` : '';
  const sub = [monthLabel(item.month), item.strategy, meaning].filter(Boolean).join(' · ');
  const viewing = viewId ? entries.find((x) => x.id === viewId) : null;
  const last = [...entries].sort(byNewest)[0];

  async function saveEntry(payload, another) {
    if (entryForm.initial) await editEntry(item.id, entryForm.initial.id, payload);
    else await addEntry(item.id, payload);
    if (!another) setEntryForm(null);
  }
  async function deleteEntry(entry) {
    if (!window.confirm('Delete this entry? Its screenshots go with it. This can\'t be undone.')) return;
    try { await removeEntry(item.id, entry.id); setEntryForm(null); setViewId(null); } catch (e) { reportError(`Couldn't delete: ${e.message}`); }
  }
  const simTone = !sim ? 'warn' : sim.breach >= 50 ? 'bad' : sim.breach >= 10 ? 'warn' : 'good';

  return (
    <div className="bt-detail">
      <div className="bt-detail-nav">
        <button type="button" className="bt-back" onClick={onBack}>‹ All backtests</button>
        <span className="bt-pager">
          <button type="button" onClick={onPrev} disabled={!onPrev} aria-label="Previous backtest">‹</button>
          {index + 1} of {total}
          <button type="button" onClick={onNext} disabled={!onNext} aria-label="Next backtest">›</button>
        </span>
      </div>

      <div className="bt-detail-grid">
        <div className="bt-detail-main">
          <Hero item={item} />
          <div className="bt-detail-title">
            <h2>{item.title}</h2>
            {sub && <div className="bt-prep-sub">{sub}</div>}
            {item.tags.length > 0 && <div className="bt-tags">{item.tags.map((t) => <span key={t} className="bt-tag plain">{t}</span>)}</div>}
          </div>

          <div className="bt-stat-grid">
            <div className="bt-stat"><b>{s.trades ? `${Math.round(s.winRate)}%` : '—'}</b><span>Win rate</span></div>
            <div className="bt-stat"><b className={s.netR > 0 ? 'pos' : s.netR < 0 ? 'neg' : ''}>{s.trades ? fmtR(s.netR) : '—'}</b><span>Net result</span></div>
            <div className="bt-stat"><b>{s.trades ? `${s.expectancy.toFixed(2)}R` : '—'}</b><span>Expectancy per trade</span></div>
            <div className="bt-stat"><b>{s.trades ? `${(rules.ddType === 'static' ? s.lowR : s.maxDDR).toFixed(1)}R` : '—'}</b><span>Max drawdown</span></div>
          </div>
          {full && <RCurve results={full.results} />}
          {full && Object.keys(daily).length > 0 && <PeriodCalendar daily={daily} title="P&L calendar" selectedDay={day} onPickDay={(d) => setDay((cur) => (cur === d ? null : d))} />}
        </div>

        <div className="bt-detail-side">
          <div className="bt-card-block">
            <div className="bt-block-title">
              <b>Would this have passed {rules.firm}?</b>
              {!many && phases[0] && phases[0].status !== 'pending' && <span className={`bt-tag ${phaseTone(phases[0])}`}>{phaseLabel(phases[0])}</span>}
            </div>
            {!s.trades ? (
              <p className="bt-prep-sub">Add entries to this session to check it against the rules.</p>
            ) : (
              <>
                {phases.map((p, i) => (
                  <div key={i} className={many ? 'bt-phase' : ''}>
                    {many && <div className="bt-phase-head"><b>Phase {i + 1}</b><span className={`bt-tag ${phaseTone(p)}`}>{phaseLabel(p)}</span></div>}
                    {p.status === 'pending' ? <p className="bt-prep-sub">Starts once phase {i} is passed.</p> : (
                      <ul className="bt-verdict">
                        <li>{p.failedReason === 'drawdown' ? ICON.bad : ICON.good}<span>Max drawdown {fmtPct(p.maxDDPct)} against a {p.rules.maxDD}% limit</span></li>
                        <li>{p.failedReason === 'daily' ? ICON.bad : ICON.good}<span>Worst day {fmtPct(p.worstDayPct)} against a {p.rules.daily}% limit</span></li>
                        <li>{p.status === 'passed' ? ICON.good : p.status === 'failed' ? ICON.bad : ICON.warn}<span>Profit {fmtPct(p.netPct)} of the {p.rules.target}% target{p.status === 'passed' ? ' — reached' : ''}</span></li>
                      </ul>
                    )}
                  </div>
                ))}
                {many && challenge.overall === 'passed' && <p className="bt-banner good">Both phases passed — this setup would have earned the funded account.</p>}
                <ul className="bt-verdict">
                  <li>
                    {ICON[simTone]}
                    <span>
                      {sim ? (many ? `Simulated: ${sim.pass}% pass both phases (${sim.cleared[0]}% clear phase 1), ${sim.breach}% breach first` : `Simulated: ${sim.pass}% reach the target, ${sim.breach}% breach first`)
                        : failed ? 'Simulation unavailable offline until this session has loaded'
                        : full ? 'Simulation needs entries on at least 5 different days'
                        : 'Running the simulation…'}
                    </span>
                  </li>
                </ul>
              </>
            )}
            {s.trades > 0 && <p className="bt-fine">Entries are walked through in date order. {many ? 'Each phase starts on a fresh balance once the one before is passed. ' : ''}Drawdown is {rules.ddType === 'static' ? 'measured from the starting balance' : 'measured from the highest point reached'}. The simulation replays random trading days from this session; it's an estimate, not a promise.</p>}
          </div>

          <div className="bt-card-block">
            <div className="bt-block-title">Readiness <span>{readyCount} of {ready.length}</span></div>
            {phases.map((p, i) => (
              <p key={i} className="bt-prep-sub bt-prep-rules">{many ? `Phase ${i + 1}: ` : `${rules.firm} rules · `}{p.rules.target}% target · {p.rules.maxDD}% drawdown ({p.rules.ddType}) · {p.rules.daily}% daily</p>
            ))}
            <ul className="bt-check-list">
              {ready.map((i, idx) => (
                <Fragment key={i.id}>
                  {many && i.phase !== undefined && (idx === 0 || ready[idx - 1].phase !== i.phase) && <li className="bt-check-group">Phase {i.phase + 1}</li>}
                  {many && i.phase === undefined && ready[idx - 1] && ready[idx - 1].phase !== undefined && <li className="bt-check-group">Overall</li>}
                  <li className={i.done ? 'done' : ''}><span className="bt-check-line"><span className="bt-check-box" aria-hidden="true">{i.done && TICK}</span>{i.label}</span></li>
                </Fragment>
              ))}
            </ul>
            <p className="bt-fine">These tick themselves as your entries meet each one.</p>
            {closed ? (
              <div className="bt-closebar">
                <span>Session closed{item.closedAt ? ` on ${new Date(item.closedAt).toLocaleDateString()}` : ''}. Its entries are locked.</span>
                <div className="bt-closebar-actions">
                  {!offline && <button type="button" className="btn btn-ghost glass" onClick={() => save({ closed: false })}>Reopen</button>}
                  {!offline && <button type="button" className="btn btn-primary" onClick={() => onNewFrom(item)}>Start a new session</button>}
                </div>
              </div>
            ) : allDone && !offline ? (
              <div className="bt-closebar ready">
                <span>Every box is ticked. Close this session and start a new one.</span>
                <div className="bt-closebar-actions"><button type="button" className="btn btn-primary" onClick={() => save({ closed: true })}>Close session</button></div>
              </div>
            ) : null}
          </div>

          <div className="bt-card-block">
            <div className="bt-block-title">What I learned</div>
            <LearnedRow kind="worked" label="Worked" value={learned.worked} readOnly={offline} onSave={saveLearned('worked')} />
            <LearnedRow kind="failed" label="Failed" value={learned.failed} readOnly={offline} onSave={saveLearned('failed')} />
            <LearnedRow kind="next" label="Next test" value={learned.next} readOnly={offline} onSave={saveLearned('next')} />
          </div>

          {!offline && (
            <div className="bt-card-block">
              <div className="bt-block-title">Status <span className={`bt-tag ${meta.cls}`}>{meta.label}</span></div>
              <div className="bt-seg" role="group" aria-label="Status">
                {Object.entries(STATUS_META).map(([key, m]) => (
                  <button key={key} type="button" className={item.status === key ? 'active' : ''} aria-pressed={item.status === key} onClick={() => item.status !== key && save({ status: key })}>{m.label}</button>
                ))}
              </div>
              <div className="bt-form-actions" style={{ justifyContent: 'space-between', marginTop: 14 }}>
                <button type="button" className="btn btn-ghost glass" onClick={() => onEdit(item)}>Edit details</button>
                <button type="button" className="btn btn-ghost glass" onClick={() => save({ closed: !closed })}>{closed ? 'Reopen' : 'Close session'}</button>
                <button type="button" className="btn btn-ghost glass bt-danger" onClick={handleDelete}>Delete</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="bt-detail-entries">
        {full
            ? <Entries entries={entries} offline={offline} locked={!!item.closed} day={day} onClearDay={() => setDay(null)} onNew={() => setEntryForm({ initial: null })} onOpen={(e) => setViewId(e.id)} />
            : <div className="bt-card-block"><p className="bt-prep-sub">{failed ? 'Entries load once you are online.' : 'Loading entries…'}</p></div>}
      </div>
      {viewing && !entryForm && (
        <EntryView locked={!!item.closed} entry={viewing} onClose={() => setViewId(null)} onEdit={() => { setEntryForm({ initial: viewing }); }} onDelete={() => deleteEntry(viewing)} />
      )}
      {entryForm && (
        <EntryForm
          initial={entryForm.initial}
          defaults={last ? { date: last.date, symbol: last.symbol, timeframes: tfList(last), setup: last.setup, side: last.side === 'missed' || last.side === 'breakeven' ? 'long' : last.side } : {}}
          onSave={saveEntry} onDelete={entryForm.initial ? () => deleteEntry(entryForm.initial) : null} onClose={() => setEntryForm(null)}
        />
      )}
    </div>
  );
}
