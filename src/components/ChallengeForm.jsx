import { DRAWDOWN_TYPES } from '../utils/challenge';
import { toDateId } from '../utils/dateHelpers';

export function newPhase(name = 'Phase 1', carry = {}) {
  return {
    id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name, startDate: toDateId(), startBalance: '', profitTarget: '',
    dailyLoss: { mode: 'amount', value: '' }, maxDrawdown: { mode: 'amount', value: '' },
    drawdownType: 'static', lockAtStart: true, minDays: '', endDate: '',
    status: 'active', result: null, balanceCheck: null, ...carry,
  };
}

// Server-bound shape: numbers as numbers, blanks as null.
export function phaseForSave(p) {
  const n = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  const lim = (l) => (n(l && l.value) > 0 ? { mode: l.mode, value: Number(l.value) } : null);
  return { ...p, startBalance: n(p.startBalance), profitTarget: n(p.profitTarget), dailyLoss: lim(p.dailyLoss), maxDrawdown: lim(p.maxDrawdown), minDays: n(p.minDays) || 0, endDate: p.endDate || null };
}

export function phaseError(p) {
  if (!(Number(p.startBalance) > 0)) return 'Enter the account size (starting balance).';
  if (p.dailyLoss && p.dailyLoss.mode === 'percent' && Number(p.dailyLoss.value) > 100) return 'A daily loss limit can’t be over 100%.';
  if (p.maxDrawdown && p.maxDrawdown.mode === 'percent' && Number(p.maxDrawdown.value) > 100) return 'A max drawdown can’t be over 100%.';
  return '';
}

function LimitField({ label, hint, value, onChange }) {
  return (
    <div className="modal-field">
      <label>{label} <span className="modal-field-hint">{hint}</span></label>
      <div className="limit-row">
        <input type="number" min="0" step="0.01" inputMode="decimal" value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value })} />
        <div className="chart-toggle">
          <button type="button" className={value.mode === 'amount' ? 'active' : ''} onClick={() => onChange({ ...value, mode: 'amount' })}>$</button>
          <button type="button" className={value.mode === 'percent' ? 'active' : ''} onClick={() => onChange({ ...value, mode: 'percent' })}>%</button>
        </div>
      </div>
    </div>
  );
}

// The rules of one challenge phase. Used when creating a challenge account,
// editing its rules, and starting the next phase.
export default function ChallengeForm({ phase, onChange }) {
  const set = (k, v) => onChange({ ...phase, [k]: v });
  const type = DRAWDOWN_TYPES.find((d) => d.value === phase.drawdownType);
  return (
    <div className="challenge-form">
      <div className="modal-row">
        <div className="modal-field"><label>Phase name</label><input type="text" maxLength={40} value={phase.name} onChange={(e) => set('name', e.target.value)} placeholder="Phase 1" /></div>
        <div className="modal-field"><label>Starts on</label><input type="date" value={phase.startDate} onChange={(e) => set('startDate', e.target.value)} /></div>
      </div>
      <div className="modal-row">
        <div className="modal-field"><label>Account size ($)</label><input type="number" min="0" step="0.01" inputMode="decimal" value={phase.startBalance} onChange={(e) => set('startBalance', e.target.value)} placeholder="50000" /></div>
        <div className="modal-field"><label>Profit target ($) <span className="modal-field-hint">(optional)</span></label><input type="number" min="0" step="0.01" inputMode="decimal" value={phase.profitTarget} onChange={(e) => set('profitTarget', e.target.value)} placeholder="4000" /></div>
      </div>
      <div className="modal-row">
        <LimitField label="Max daily loss" hint="of start-of-day balance if %" value={phase.dailyLoss} onChange={(v) => set('dailyLoss', v)} />
        <LimitField label="Max drawdown" hint="of account size if %" value={phase.maxDrawdown} onChange={(v) => set('maxDrawdown', v)} />
      </div>
      <div className="modal-field full">
        <label>Drawdown type</label>
        <select className="filter-select" value={phase.drawdownType} onChange={(e) => set('drawdownType', e.target.value)}>
          {DRAWDOWN_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <div className="modal-field-hint" style={{ marginTop: 4 }}>{type.hint}</div>
        {phase.drawdownType !== 'static' && (
          <label className="check-inline"><input type="checkbox" checked={phase.lockAtStart} onChange={(e) => set('lockAtStart', e.target.checked)} /> The floor stops rising once it reaches the starting balance</label>
        )}
      </div>
      <div className="modal-row">
        <div className="modal-field"><label>Min trading days <span className="modal-field-hint">(optional)</span></label><input type="number" min="0" step="1" inputMode="numeric" value={phase.minDays} onChange={(e) => set('minDays', e.target.value)} placeholder="4" /></div>
        <div className="modal-field"><label>Deadline <span className="modal-field-hint">(optional)</span></label><input type="date" value={phase.endDate || ''} onChange={(e) => set('endDate', e.target.value)} /></div>
      </div>
    </div>
  );
}
