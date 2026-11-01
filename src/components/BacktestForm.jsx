import { useMemo, useRef, useState } from 'react';
import { useEscape } from '../hooks/useEscape.js';
import { clickable } from '../utils/a11y.js';
import { api, fileToUploadPayload, MAX_UPLOAD_BYTES } from '../api';
import { compressImage } from '../utils/image';
import { parseResults, computeStats } from '../../netlify/functions/_backtest-utils.js';
import { STATUS_META, fmtR } from '../utils/backtestView';

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const blank = { title: '', month: thisMonth(), strategy: '', riskPct: '0.5', status: 'review' };

// Add or edit a backtest SESSION. `initial` is the saved session when editing;
// `defaultRules` are the prop-firm rules from the home screen.
export default function BacktestForm({ initial, template, defaultRules, onSave, onClose }) {
  const editing = !!initial;
  // `template` = the session you just closed: the next one starts with the same setup.
  const base = initial || template;
  const [form, setForm] = useState(() => (initial ? {
    title: initial.title, month: initial.month || thisMonth(), strategy: initial.strategy,
    riskPct: String(initial.riskPct), status: initial.status,
  } : template ? { ...blank, strategy: template.strategy, riskPct: String(template.riskPct) } : blank));
  const [rules, setRules] = useState(() => ({ ...defaultRules, ...(base?.rules || {}) }));
  const [steps, setSteps] = useState(base?.steps === 2 ? 2 : 1);
  const [rules2, setRules2] = useState(() => ({ ...defaultRules, ...(base?.rules || {}), target: 5, ...(base?.rules2 || {}) }));
  const setRule2 = (k) => (e) => { setRules2((r) => ({ ...r, [k]: e.target.value })); setError(''); };
  const setRule = (k) => (e) => { setRules((r) => ({ ...r, [k]: e.target.value })); setError(''); };
  const [media, setMedia] = useState(initial ? initial.media : []);
  const [added, setAdded] = useState([]); // uploaded during this edit — removed again if you cancel
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setError(''); };

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    const p = parseResults(text);
    return { ...p, stats: computeStats(p.results) };
  }, [text]);

  async function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { setError('Pick an image or a short video clip.'); return; }
    setUploading(true); setError('');
    try {
      const f = await compressImage(file);
      if (f.size > MAX_UPLOAD_BYTES) { setError(`${file.name} is over 4.5MB — that's the per-file limit.`); return; }
      const { id, url } = await api.post('/api/media', await fileToUploadPayload(f));
      const item = { id, url, type: f.type.startsWith('video/') ? 'video' : 'image' };
      setMedia((m) => [...m, item].slice(-3));
      setAdded((a) => [...a, id]);
    } catch (e) { setError(`Upload failed: ${e.message}`); } finally { setUploading(false); }
  }

  async function removeMedia(item) {
    setMedia((m) => m.filter((x) => x.id !== item.id));
    if (added.includes(item.id)) { setAdded((a) => a.filter((x) => x !== item.id)); api.del(`/api/media?id=${item.id}`).catch(() => {}); }
  }

  async function cancel() {
    if (saving) return;
    added.forEach((id) => api.del(`/api/media?id=${id}`).catch(() => {}));
    onClose();
  }
  useEscape(cancel);

  async function submit() {
    if (!form.title.trim()) { setError('Give the session a name.'); return; }
    if (!/^\d{4}-\d{2}$/.test(form.month)) { setError('Pick the month and year this session covers.'); return; }
    const rn = (v) => Number(v);
    const bad = (r) => ![r.target, r.maxDD, r.daily].every((v) => Number.isFinite(rn(v)) && rn(v) > 0);
    if (bad(rules) || (steps === 2 && bad(rules2))) { setError('Profit target, max drawdown and daily loss need to be numbers above zero.'); return; }
    const risk = Number(form.riskPct);
    if (!Number.isFinite(risk) || risk <= 0 || risk > 10) { setError('Risk per trade should be a percent between 0 and 10 (e.g. 0.5).'); return; }
    const payload = { ...form, riskPct: risk, rules: { firm: rules.firm, target: rn(rules.target), maxDD: rn(rules.maxDD), daily: rn(rules.daily), ddType: rules.ddType },
      steps, rules2: { firm: rules.firm, target: rn(rules2.target), maxDD: rn(rules2.maxDD), daily: rn(rules2.daily), ddType: rules2.ddType }, media: media.map((m) => ({ id: m.id })) };
    if (text.trim()) {
      if (!parsed.results.length) { setError('No entries could be read from the import box. Use one per line, like: 2023-03-14, 1.8'); return; }
      payload.resultsText = text;
    }
    setSaving(true);
    try { await onSave(payload); }
    catch (e) { setError(e.message || "Couldn't save. Check your connection and try again."); setSaving(false); }
  }

  return (
    <div className="modal-overlay open">
      <div className="modal-card glass" role="dialog" aria-modal="true" aria-label={editing ? 'Edit session' : 'New session'} style={{ maxWidth: 600 }}>
        <div className="modal-head">
          <h3>{editing ? 'Edit session' : 'New backtest session'}</h3>
          <button className="modal-close" onClick={cancel} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <div className="modal-field full"><label>Name of session</label><input type="text" autoFocus placeholder="NQ order block — February" maxLength={120} value={form.title} onChange={set('title')} /></div>
          <div className="modal-row">
            <div className="modal-field"><label>Month and year</label><input type="month" value={form.month} onChange={set('month')} /></div>
            <div className="modal-field"><label>Strategy used</label><input type="text" placeholder="Order block" maxLength={60} value={form.strategy} onChange={set('strategy')} /></div>
            <div className="modal-field"><label>Risk per trade %</label><input type="number" step="0.05" min="0" value={form.riskPct} onChange={set('riskPct')} /></div>
          </div>

          <fieldset className="bt-rules-set">
            <legend>{steps === 2 ? 'Phase 1 rules' : 'Prop firm rules for this session'}</legend>
            <div className="modal-row">
              <div className="modal-field"><label>Challenge type</label>
                <div className="bt-seg two" role="group" aria-label="Challenge type">
                  {[1, 2].map((n) => <button key={n} type="button" className={steps === n ? 'active' : ''} aria-pressed={steps === n} onClick={() => setSteps(n)}>{n === 1 ? 'One step' : 'Two step'}</button>)}
                </div>
              </div>
            </div>
            <div className="modal-row">
              <div className="modal-field"><label>Firm</label><input type="text" maxLength={20} value={rules.firm} onChange={setRule('firm')} /></div>
              <div className="modal-field"><label>Profit target %</label><input type="number" step="0.1" min="0" value={rules.target} onChange={setRule('target')} /></div>
              <div className="modal-field"><label>Max drawdown %</label><input type="number" step="0.1" min="0" value={rules.maxDD} onChange={setRule('maxDD')} /></div>
            </div>
            <div className="modal-row">
              <div className="modal-field"><label>Daily loss %</label><input type="number" step="0.1" min="0" value={rules.daily} onChange={setRule('daily')} /></div>
              <div className="modal-field"><label>Drawdown type</label>
                <select value={rules.ddType} onChange={setRule('ddType')}><option value="trailing">Trailing — from the highest point</option><option value="static">Static — from the start balance</option></select>
              </div>
              <div className="modal-field"><label>Status</label>
                <select value={form.status} onChange={set('status')}>{Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</select>
              </div>
            </div>
          </fieldset>
          {steps === 2 && (
            <fieldset className="bt-rules-set">
              <legend>Phase 2 rules <span className="modal-field-hint">— starts on a fresh balance once phase 1 is passed</span></legend>
              <div className="modal-row">
                <div className="modal-field"><label>Profit target %</label><input type="number" step="0.1" min="0" value={rules2.target} onChange={setRule2('target')} /></div>
                <div className="modal-field"><label>Max drawdown %</label><input type="number" step="0.1" min="0" value={rules2.maxDD} onChange={setRule2('maxDD')} /></div>
                <div className="modal-field"><label>Daily loss %</label><input type="number" step="0.1" min="0" value={rules2.daily} onChange={setRule2('daily')} /></div>
              </div>
              <div className="modal-row">
                <div className="modal-field"><label>Drawdown type</label>
                  <select value={rules2.ddType} onChange={setRule2('ddType')}><option value="trailing">Trailing — from the highest point</option><option value="static">Static — from the start balance</option></select>
                </div>
              </div>
            </fieldset>
          )}

          <div className="modal-field full">
            <label>Preview <span className="modal-field-hint">— optional image or short clip, up to 4.5MB (up to 3)</span></label>
            <div className="bt-upload-row">
              {media.map((m) => (
                <div className="bt-upload-thumb" key={m.id}>
                  {m.type === 'video' ? <video src={m.url} muted playsInline preload="metadata" /> : <img src={m.url} alt="" />}
                  <button type="button" onClick={() => removeMedia(m)} aria-label="Remove">×</button>
                </div>
              ))}
              {media.length < 3 && (
                <div className="bt-upload-add" {...clickable(() => fileRef.current && fileRef.current.click(), { label: 'Add preview' })}>
                  {uploading ? '…' : '+'}
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ''; }} />
            </div>
          </div>

          <details className="modal-field full bt-import">
            <summary>Import many entries at once <span className="modal-field-hint">— optional</span></summary>
            <label>One entry per line: date, R (e.g. 2023-03-14, 1.8)</label>
            <textarea rows={6} className="bt-results-input" placeholder={'2023-03-14, 1.8\n2023-03-14, -1\n2023-03-15, 2.4'} value={text} onChange={(e) => { setText(e.target.value); setError(''); }} />
            <div className="bt-fine">
              {parsed
                ? <>{parsed.results.length} trade{parsed.results.length === 1 ? '' : 's'} read{parsed.skipped.length ? ` · ${parsed.skipped.length} line${parsed.skipped.length === 1 ? '' : 's'} skipped` : ''}{parsed.results.length ? ` · ${Math.round(parsed.stats.winRate)}% win · ${fmtR(parsed.stats.netR)} net` : ''}</>
                : editing ? <>{initial.stats.trades} entries saved. Pasted lines are added to them.</>
                : <>Paste from your sheet or tester — commas, tabs or spaces all work, and "1.8R" is fine. Add the detail (timeframe, prices, notes) per entry afterwards.</>}
            </div>
          </details>

          {error && <div className="auth-error" role="alert">{error}</div>}
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost glass" onClick={cancel} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || uploading}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create session'}</button>
        </div>
      </div>
    </div>
  );
}
