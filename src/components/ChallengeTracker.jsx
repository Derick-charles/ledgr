import { useMemo, useState } from 'react';
import { useEscape } from '../hooks/useEscape.js';
import { evaluatePhase, DRAWDOWN_TYPES } from '../utils/challenge';
import { fmtMoney } from '../utils/stats';
import { toDateId } from '../utils/dateHelpers';
import ChallengeForm, { newPhase, phaseError, phaseForSave } from './ChallengeForm';
import { reportError } from '../utils/errorBus';
import InfoTooltip from './InfoTooltip';
import { useOffline } from '../hooks/useOffline';

const STATES = {
  on_track: { label: 'On track', color: 'var(--positive)' },
  at_risk: { label: 'At risk', color: 'var(--amber)' },
  breached: { label: 'Breached', color: 'var(--negative)' },
  target_met: { label: 'Target hit', color: 'var(--positive)' },
  needs_days: { label: 'Target hit — more days needed', color: 'var(--amber)' },
  expired: { label: 'Deadline passed', color: 'var(--negative)' },
};
const nextName = (name, count) => (/^phase\s*1$/i.test(name) ? 'Phase 2' : /^phase\s*2$/i.test(name) ? 'Funded' : `Phase ${count + 1}`);
const BREACH_TEXT = { daily: 'Daily loss limit reached', drawdown: 'Max drawdown reached' };

function Meter({ label, value, max, color, right, sub }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span className="challenge-stat-label">{label}</span>
        <span className="challenge-stat-val" style={{ fontSize: 13 }}>{right}</span>
      </div>
      <div className="meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><div style={{ width: `${pct}%`, background: color }} /></div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>{sub}</div>}
    </div>
  );
}

// Dashboard card for a prop-firm challenge account: progress to target,
// today's loss limit, drawdown room, trading days and the phase sequence.
export default function ChallengeTracker({ account, trades, saveChallenge }) {
  const offline = useOffline();
  const todayId = toDateId();
  const phases = account.challenge.phases;
  const idx = phases.length - 1;
  const phase = phases[idx];
  const ev = useMemo(() => evaluatePhase(phase, null, trades, todayId), [phase, trades, todayId]);
  const [dialog, setDialog] = useState(null); // 'rules' | 'check' | 'next' | 'remove' | null
  const [draft, setDraft] = useState(null);
  const [checkBalance, setCheckBalance] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const history = phases.slice(0, -1).map((p, i) => ({ p, ev: evaluatePhase(p, phases[i + 1], trades, todayId) }));
  useEscape(() => { if (!busy) setDialog(null); }, !!dialog);
  const ended = phase.status !== 'active';
  const st = ended
    ? (phase.status === 'passed' ? { label: 'Passed', color: 'var(--positive)' } : { label: 'Failed', color: 'var(--negative)' })
    : STATES[ev.state];

  async function persist(nextPhases) {
    setBusy(true); setError('');
    try {
      await saveChallenge(account.id, nextPhases === null ? null : { phases: nextPhases.map(phaseForSave) });
      setDialog(null);
    } catch (e) {
      setError(e.message);
      reportError(`Couldn't save the challenge: ${e.message}`);
    } finally { setBusy(false); }
  }
  const replaceLast = (changes) => phases.map((p, i) => (i === idx ? { ...p, ...changes } : p));

  function openRules() { setDraft({ ...phase, startBalance: String(phase.startBalance), profitTarget: phase.profitTarget ?? '', minDays: phase.minDays || '', endDate: phase.endDate || '', dailyLoss: phase.dailyLoss || { mode: 'amount', value: '' }, maxDrawdown: phase.maxDrawdown || { mode: 'amount', value: '' } }); setError(''); setDialog('rules'); }
  function openNext() {
    setDraft({ ...openCopy(phase), ...{ id: newPhase().id, name: nextName(phase.name, phases.length), startDate: todayId, status: 'active', result: null, balanceCheck: null } });
    setError(''); setDialog('next');
  }
  function openCopy(p) { return { ...p, startBalance: String(p.startBalance), profitTarget: p.profitTarget ?? '', minDays: p.minDays || '', endDate: '', dailyLoss: p.dailyLoss || { mode: 'amount', value: '' }, maxDrawdown: p.maxDrawdown || { mode: 'amount', value: '' } }; }
  function markEnded(status) {
    persist(replaceLast({ status, result: { profit: ev.profit, endedOn: todayId } }));
  }
  function saveRules() {
    const err = phaseError(draft); if (err) { setError(err); return; }
    persist(phases.map((p, i) => (i === idx ? { ...draft, status: phase.status, result: phase.result, balanceCheck: phase.balanceCheck } : p)));
  }
  function saveNext() {
    const err = phaseError(draft); if (err) { setError(err); return; }
    persist([...phases, draft]);
  }
  function saveCheck() {
    const b = parseFloat(checkBalance);
    if (!Number.isFinite(b) || b < 0) { setError('Enter your firm’s current balance.'); return; }
    persist(replaceLast({ balanceCheck: { date: todayId, balance: b } }));
  }

  return (
    <div className="glass panel challenge-card" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <h2>
          {account.name} · {phase.name}{' '}
          <InfoTooltip text="Built from the trades you've logged, so it's only as accurate as your entries — and it can't see floating (open) losses. Use “Check balance” to match your firm's real balance." />
        </h2>
        <span className="challenge-status" style={{ color: st.color }}>{st.label}</span>
      </div>

      {!ended && ev.breach && (
        <p role="alert" style={{ color: 'var(--negative)', fontSize: 13, margin: '0 0 8px' }}>
          {BREACH_TEXT[ev.breach.kind]} on {ev.breach.date}. If your firm hasn't failed you, check your trades and balance.
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <div><div className="challenge-stat-label">Balance</div><div className="challenge-stat-val" style={{ fontSize: 22 }}>{fmtMoney(ev.current).replace('+', '')}</div></div>
        <div style={{ textAlign: 'right' }}>
          <div className="challenge-stat-label">Profit</div>
          <div className="challenge-stat-val" style={{ fontSize: 22, color: ev.profit >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{fmtMoney(ev.profit)}</div>
        </div>
      </div>

      <div className="challenge-grid">
        {ev.target !== null ? (
          <Meter label="Profit target" value={Math.max(0, ev.profit)} max={ev.target} color="var(--positive)"
            right={`${Math.round(ev.progress * 100)}%`} sub={ev.toGo > 0 ? `${fmtMoney(ev.toGo).replace('+', '')} to go of ${fmtMoney(ev.target).replace('+', '')}` : 'Target reached'} />
        ) : <div><div className="challenge-stat-label">Profit target</div><div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Not set</div></div>}

        {ev.daily.limit !== null ? (
          <Meter label="Today's loss limit" value={ev.daily.used} max={ev.daily.limit}
            color={ev.daily.used / ev.daily.limit >= 0.75 ? 'var(--negative)' : ev.daily.used / ev.daily.limit >= 0.5 ? 'var(--amber)' : 'var(--positive)'}
            right={`${fmtMoney(ev.daily.left).replace('+', '')} left`} sub={`Lost ${fmtMoney(ev.daily.used).replace('+', '')} today of ${fmtMoney(ev.daily.limit).replace('+', '')}`} />
        ) : <div><div className="challenge-stat-label">Daily loss limit</div><div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Not set</div></div>}

        {ev.drawdown.amount !== null ? (
          <Meter label={`Max drawdown (${DRAWDOWN_TYPES.find((d) => d.value === phase.drawdownType).label.toLowerCase()})`}
            value={Math.max(0, ev.drawdown.amount - Math.max(0, ev.drawdown.room))} max={ev.drawdown.amount}
            color={ev.drawdown.room / ev.drawdown.amount <= 0.25 ? 'var(--negative)' : ev.drawdown.room / ev.drawdown.amount <= 0.5 ? 'var(--amber)' : 'var(--positive)'}
            right={`${fmtMoney(Math.max(0, ev.drawdown.room)).replace('+', '')} room`} sub={`Floor ${fmtMoney(ev.drawdown.floor).replace('+', '')}`} />
        ) : <div><div className="challenge-stat-label">Max drawdown</div><div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Not set</div></div>}

        <div>
          <div className="challenge-stat-label">Trading days</div>
          <div className="challenge-stat-val">{ev.tradingDays}{ev.minDays ? ` / ${ev.minDays}` : ''}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
            {ev.minDays ? (ev.tradingDays >= ev.minDays ? 'Minimum met' : `${ev.minDays - ev.tradingDays} more needed`) : 'No minimum'}
            {ev.daysLeft !== null && ` · ${ev.daysLeft >= 0 ? `${ev.daysLeft} day${ev.daysLeft !== 1 ? 's' : ''} left` : 'deadline passed'}`}
          </div>
        </div>
      </div>

      {ev.offset !== 0 && (
        <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 12 }}>
          Balance matched to your firm's figure ({fmtMoney(phase.balanceCheck.balance).replace('+', '')} on {phase.balanceCheck.date}) — a {fmtMoney(ev.offset)} difference from your logged trades.
        </p>
      )}

      {history.length > 0 && (
        <div className="phase-history">
          {history.map(({ p, ev: e }) => (
            <span key={p.id}>{p.name}: <strong style={{ color: p.status === 'passed' ? 'var(--positive)' : p.status === 'failed' ? 'var(--negative)' : 'var(--text-secondary)' }}>{p.status === 'active' ? 'ended' : p.status}</strong> ({fmtMoney(p.result ? p.result.profit : e.profit)})</span>
          ))}
        </div>
      )}

      {!offline && <div className="challenge-actions">
        {!ended && <button className="btn btn-ghost glass" onClick={() => { setCheckBalance(''); setError(''); setDialog('check'); }}>Check balance</button>}
        {!ended && (ev.state === 'target_met' || ev.state === 'needs_days') && <button className="btn btn-primary" disabled={busy} onClick={() => markEnded('passed')}>Mark passed</button>}
        {!ended && <button className="btn btn-ghost glass" disabled={busy} onClick={() => { if (window.confirm('Mark this phase as failed?')) markEnded('failed'); }}>Mark failed</button>}
        {ended && <button className="btn btn-primary" onClick={openNext}>Start next phase</button>}
        {!ended && ev.state !== 'target_met' && <button className="btn btn-ghost glass" onClick={openNext} title="Move on without marking this one passed">Next phase…</button>}
        <button className="btn btn-ghost glass" onClick={openRules}>Edit rules</button>
        <button className="btn btn-ghost glass" onClick={() => { setError(''); setDialog('remove'); }}>Stop tracking</button>
      </div>}
      {error && !dialog && <div style={{ color: 'var(--negative)', fontSize: 12.5, marginTop: 8 }}>{error}</div>}

      {dialog && (
        <div className="modal-overlay open" onClick={() => !busy && setDialog(null)}>
          <div className="modal-card glass" role="dialog" aria-modal="true" aria-label="Challenge" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{{ rules: `Edit ${phase.name} rules`, next: 'Start next phase', check: 'Check balance', remove: 'Stop tracking challenge' }[dialog]}</h3>
              <button className="modal-close" onClick={() => setDialog(null)}>×</button>
            </div>
            <div className="modal-body">
              {error && <div style={{ color: 'var(--negative)', fontSize: 12.5 }}>{error}</div>}
              {(dialog === 'rules' || dialog === 'next') && <ChallengeForm phase={draft} onChange={setDraft} />}
              {dialog === 'next' && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Trades from the start date onward count toward the new phase; earlier trades stay with {phase.name}. Rules are copied — adjust anything that differs (e.g. a funded account has no profit target).</p>}
              {dialog === 'check' && (
                <>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Enter the balance your firm's dashboard shows right now. LEDGR adds the difference to what your trades add up to, so floating P&amp;L, fees or a missed trade don't throw the meters off.</p>
                  <div className="modal-field full"><label>Firm's current balance ($)</label><input autoFocus type="number" step="0.01" inputMode="decimal" value={checkBalance} onChange={(e) => setCheckBalance(e.target.value)} placeholder={String(ev.current)} /></div>
                </>
              )}
              {dialog === 'remove' && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>This removes the challenge tracker and its phase history from this account. Your trades and journal aren't touched.</p>}
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost glass" onClick={() => setDialog(null)} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => ({ rules: saveRules, next: saveNext, check: saveCheck, remove: () => persist(null) }[dialog])()}>
                {busy ? 'Saving…' : dialog === 'remove' ? 'Stop tracking' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
