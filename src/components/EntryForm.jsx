import { useRef, useState } from 'react';
import { useEscape } from '../hooks/useEscape.js';
import { clickable } from '../utils/a11y.js';
import { api, fileToUploadPayload, MAX_UPLOAD_BYTES } from '../api';
import { compressImage } from '../utils/image';
import { TIMEFRAMES, tfList } from '../../netlify/functions/_backtest-utils.js';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const SIDE_LABEL = { long: 'Long', short: 'Short', missed: 'Missed trade', breakeven: 'Breakeven' };

// R worked out from prices: how far it moved, in units of how far the stop was.
export function rFromPrices(side, entry, stop, exit) {
  const e = Number(entry), s = Number(stop), x = Number(exit);
  if (![entry, stop, exit].every((v) => v !== '' && v != null) || ![e, s, x].every(Number.isFinite) || e === s) return null;
  const r = side === 'short' ? (e - x) / (s - e) : (x - e) / (e - s);
  return Number.isFinite(r) ? Math.round(r * 100) / 100 : null;
}

// One trade inside a session. `initial` is the saved entry when editing;
// `defaults` pre-fills a new one (the last entry's date, symbol, timeframe…).
export default function EntryForm({ initial, defaults = {}, onSave, onDelete, onClose }) {
  const editing = !!initial;
  const start = initial || defaults;
  const [f, setF] = useState(() => ({
    date: start.date || today(), time: start.time || '', symbol: start.symbol || '', side: start.side || 'long',
    tfs: tfList(start), tfCustom: '',
    r: initial ? String(initial.r) : '', entryPrice: initial?.entryPrice ?? '', stopPrice: initial?.stopPrice ?? '', exitPrice: initial?.exitPrice ?? '',
    setup: start.setup || '', followed: initial ? initial.followed !== false : true, notes: initial?.notes || '',
  }));
  const [media, setMedia] = useState(initial?.media || []);
  const [added, setAdded] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setError(''); };

  const auto = rFromPrices(f.side, f.entryPrice, f.stopPrice, f.exitPrice);
  const flat = f.side === 'long' || f.side === 'short';
  // Top-down: tap them in the order you read the chart (e.g. D1, then H4, then M15).
  const toggleTf = (t) => setF((x) => ({ ...x, tfs: x.tfs.includes(t) ? x.tfs.filter((y) => y !== t) : [...x.tfs, t].slice(0, 6) }));
  function addCustom() {
    const t = f.tfCustom.trim().slice(0, 10);
    if (!t) return;
    if (!/^[A-Za-z0-9 ./-]+$/.test(t)) { setError('A timeframe can use letters and numbers only (e.g. M3, H2, 10s).'); return; }
    setF((x) => ({ ...x, tfs: x.tfs.includes(t) ? x.tfs : [...x.tfs, t].slice(0, 6), tfCustom: '' }));
    setError('');
  }

  async function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Pick a screenshot (an image).'); return; }
    setUploading(true); setError('');
    try {
      const c = await compressImage(file);
      if (c.size > MAX_UPLOAD_BYTES) { setError('That image is over 4.5MB.'); return; }
      const { id, url } = await api.post('/api/media', await fileToUploadPayload(c));
      setMedia((m) => [...m, { id, url, type: 'image' }].slice(-2));
      setAdded((a) => [...a, id]);
    } catch (e) { setError(`Upload failed: ${e.message}`); } finally { setUploading(false); }
  }
  function removeMedia(item) {
    setMedia((m) => m.filter((x) => x.id !== item.id));
    if (added.includes(item.id)) { setAdded((a) => a.filter((x) => x !== item.id)); api.del(`/api/media?id=${item.id}`).catch(() => {}); }
  }
  function cancel() {
    if (saving) return;
    added.forEach((id) => api.del(`/api/media?id=${id}`).catch(() => {}));
    onClose();
  }
  useEscape(cancel);

  async function submit(another) {
    const r = f.side === 'breakeven' ? 0 : f.r.trim() !== '' ? Number(f.r) : f.side === 'missed' ? 0 : auto;
    if (r === null || !Number.isFinite(r)) { setError('Enter the result in R (e.g. 1.8 or -1) — or fill entry, stop and exit prices and it is worked out for you.'); return; }
    if (Math.abs(r) > 100) { setError('That R looks too big — check it.'); return; }
    const payload = {
      r, date: f.date, time: f.time, symbol: f.symbol, side: f.side, timeframes: f.tfs,
      entryPrice: f.entryPrice, stopPrice: f.stopPrice, exitPrice: f.exitPrice,
      setup: f.setup, followed: f.followed, notes: f.notes, media: media.map((m) => ({ id: m.id })),
    };
    setSaving(true);
    try { await onSave(payload, another); if (another) { setF((x) => ({ ...x, r: '', entryPrice: '', stopPrice: '', exitPrice: '', notes: '', followed: true })); setMedia([]); setAdded([]); setSaving(false); } }
    catch (e) { setError(e.message || "Couldn't save. Check your connection and try again."); setSaving(false); }
  }

  return (
    <div className="modal-overlay open">
      <div className="modal-card glass" role="dialog" aria-modal="true" aria-label={editing ? 'Edit entry' : 'New entry'} style={{ maxWidth: 600 }}>
        <div className="modal-head">
          <h3>{editing ? 'Edit entry' : 'New entry'}</h3>
          <button className="modal-close" onClick={cancel} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <div className="modal-row">
            <div className="modal-field"><label>Date</label><input type="date" value={f.date} onChange={set('date')} /></div>
            <div className="modal-field"><label>Time <span className="modal-field-hint">optional</span></label><input type="time" value={f.time} onChange={set('time')} /></div>
            <div className="modal-field"><label>Symbol</label><input type="text" placeholder="EURUSD" maxLength={20} value={f.symbol} onChange={set('symbol')} /></div>
          </div>

          <div className="modal-field full">
            <label>Direction</label>
            <div className="bt-seg four" role="group" aria-label="Direction">
              {Object.entries(SIDE_LABEL).map(([s, label]) => (
                <button key={s} type="button" className={f.side === s ? 'active' : ''} aria-pressed={f.side === s} onClick={() => setF((x) => ({ ...x, side: s }))}>{label}</button>
              ))}
            </div>
            {f.side === 'missed' && <div className="bt-fine">A missed trade is one you saw but didn't take. It's kept for review and left out of the win rate and drawdown.</div>}
            {f.side === 'breakeven' && <div className="bt-fine">Breakeven counts as a trade at 0R — neither a win nor a loss.</div>}
          </div>

          <div className="modal-field full">
            <label>Timeframes <span className="modal-field-hint">— tap in the order you analysed them (top-down), add your own if needed</span></label>
            <div className="bt-tf-row" role="group" aria-label="Timeframes">
              {[...TIMEFRAMES, ...f.tfs.filter((t) => !TIMEFRAMES.includes(t))].map((t) => {
                const i = f.tfs.indexOf(t);
                return <button key={t} type="button" className={`bt-tf-chip${i >= 0 ? ' on' : ''}`} aria-pressed={i >= 0} onClick={() => toggleTf(t)}>{i >= 0 && <i>{i + 1}</i>}{t}</button>;
              })}
            </div>
            <div className="bt-tf-add">
              <input type="text" placeholder="Custom, e.g. M3 or H2" maxLength={10} value={f.tfCustom} aria-label="Custom timeframe"
                onChange={set('tfCustom')} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} />
              <button type="button" className="btn btn-ghost glass" onClick={addCustom}>Add</button>
            </div>
          </div>

          <div className="modal-field full"><label>Setup <span className="modal-field-hint">optional</span></label><input type="text" placeholder="FVG retest" maxLength={80} value={f.setup} onChange={set('setup')} /></div>

          <div className="modal-row">
            <div className="modal-field"><label>Entry price</label><input type="number" step="any" value={f.entryPrice} onChange={set('entryPrice')} /></div>
            <div className="modal-field"><label>Stop price</label><input type="number" step="any" value={f.stopPrice} onChange={set('stopPrice')} /></div>
            <div className="modal-field"><label>Exit price</label><input type="number" step="any" value={f.exitPrice} onChange={set('exitPrice')} /></div>
          </div>

          <div className="modal-row">
            {f.side !== 'breakeven' && (
              <div className="modal-field">
                <label>{f.side === 'missed' ? 'R it would have made' : 'Result in R'}{f.side === 'missed' && <span className="modal-field-hint"> optional</span>}</label>
                <input type="number" step="any" placeholder={flat && auto !== null ? `${auto} (from prices)` : '1.8 or -1'} value={f.r} onChange={set('r')} />
              </div>
            )}
            {f.side !== 'missed' && <div className="modal-field">
              <label>Followed my rules?</label>
              <label className="bt-check-line bt-follow"><input type="checkbox" checked={f.followed} onChange={(e) => setF((x) => ({ ...x, followed: e.target.checked }))} /><span className="bt-check-box" aria-hidden="true">{f.followed && '✓'}</span>{f.followed ? 'Yes, by the plan' : 'No, I broke a rule'}</label>
            </div>}
          </div>

          <div className="modal-field full"><label>Notes</label><textarea rows={3} maxLength={1000} placeholder="What you saw, why you took it, what you'd change" value={f.notes} onChange={set('notes')} /></div>

          <div className="modal-field full">
            <label>Screenshots <span className="modal-field-hint">— up to 2</span></label>
            <div className="bt-upload-row">
              {media.map((m) => (
                <div className="bt-upload-thumb" key={m.id}><img src={m.url} alt="" /><button type="button" onClick={() => removeMedia(m)} aria-label="Remove">×</button></div>
              ))}
              {media.length < 2 && <div className="bt-upload-add" {...clickable(() => fileRef.current && fileRef.current.click(), { label: 'Add screenshot' })}>{uploading ? '…' : '+'}</div>}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ''; }} />
            </div>
          </div>
          {error && <div className="auth-error" role="alert">{error}</div>}
        </div>
        <div className="modal-actions">
          {editing && onDelete && <button type="button" className="btn btn-ghost glass bt-danger" style={{ marginRight: 'auto' }} onClick={onDelete} disabled={saving}>Delete</button>}
          <button className="btn btn-ghost glass" onClick={cancel} disabled={saving}>Cancel</button>
          {!editing && <button className="btn btn-ghost glass" onClick={() => submit(true)} disabled={saving || uploading}>Save & add another</button>}
          <button className="btn btn-primary" onClick={() => submit(false)} disabled={saving || uploading}>{saving ? 'Saving…' : editing ? 'Save' : 'Add entry'}</button>
        </div>
      </div>
    </div>
  );
}
