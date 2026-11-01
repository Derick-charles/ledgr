import { useRef, useState } from 'react';
import { useEscape } from '../hooks/useEscape.js';
import { clickable } from '../utils/a11y.js';
import { toDateId } from '../utils/dateHelpers';
import { fmtR } from '../utils/stats';
import { MAX_UPLOAD_BYTES } from '../api';
import { compressImage } from '../utils/image';
import InfoTooltip from './InfoTooltip';
import Lightbox from './Lightbox';

// Remembers the last "$ risked" you used so a fixed-risk trader doesn't
// retype it on every trade. Purely a convenience — wrapped in try/catch
// because storage can be unavailable (private windows etc.).
const LAST_RISK_KEY = 'ledgr:lastRisk';
function readLastRisk() {
  try { return localStorage.getItem(LAST_RISK_KEY) || ''; } catch { return ''; }
}
function saveLastRisk(v) {
  try { if (v) localStorage.setItem(LAST_RISK_KEY, String(v)); } catch { /* ignore */ }
}

// Built fresh on every open (not a module-level constant) so the date is
// always today's, even if the app has been left open overnight.
function emptyForm() {
  return {
    date: toDateId(), time: '', sym: '', side: 'long', entry: '', exit: '', size: '',
    pnlMode: 'calc', manualPnl: '', risk: readLastRisk(),
    planned: '', actual: '', mistake: '', poi: '', beforeMedia: [], afterMedia: [],
    ratingExec: null, ratingDisc: null, notes: '', tags: [],
  };
}

// Turns an already-saved media ref ({ id, url, type }) into the shape the
// form's media slots work with. `previewUrl` is just the stored URL — nothing
// to upload for these, and they're passed back to the server untouched.
function existingMediaToForm(list = []) {
  return (list || []).map((m, i) => ({
    id: m.id, url: m.url, type: m.type, previewUrl: m.url, key: m.id || `existing-${i}-${m.url}`,
  }));
}

const SIDE_OPTIONS = [
  { value: 'long', label: 'Long' },
  { value: 'short', label: 'Short' },
  { value: 'breakeven', label: 'Breakeven' },
  { value: 'missed', label: 'Missed' },
];

function SideField({ value, onChange }) {
  return (
    <div className="modal-field full">
      <label>Side</label>
      <div className="chip-row" style={{ marginBottom: 0 }}>
        {SIDE_OPTIONS.map((opt) => (
          <div key={opt.value} className={`chip${value === opt.value ? ' selected' : ''}`} style={{ cursor: 'pointer' }} {...clickable(() => onChange(opt.value), { pressed: value === opt.value })}>
            {opt.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// "Quick log" = symbol, side and P&L only (for logging from a phone between
// trades); the trade is flagged "needs details" so it's easy to find and
// finish later. Remembers which mode you used last; defaults to quick on a
// phone-sized screen.
const LOG_MODE_KEY = 'ledgr:logMode';
function initialQuick(isEdit) {
  if (isEdit) return false;
  let pref = null;
  try { pref = localStorage.getItem(LOG_MODE_KEY); } catch { /* ignore */ }
  if (pref) return pref === 'quick';
  return typeof window !== 'undefined' && window.innerWidth <= 760;
}

function formFromTrade(t) {
  const hasPrices = !!(t.entry && t.exit && t.size);
  return {
    date: t.date, time: t.time || '', sym: t.sym || '', side: t.side || 'long',
    entry: t.entry || '', exit: t.exit || '', size: t.size || '',
    // Trades saved by "enter P&L manually" — or any trade missing the prices
    // needed to recalculate — are edited in manual mode so the P&L isn't lost.
    pnlMode: t.pnlMode === 'manual' || !hasPrices ? 'manual' : 'calc',
    manualPnl: t.pnl === undefined || t.pnl === null ? '' : String(t.pnl),
    risk: t.risk ? String(t.risk) : '',
    planned: t.planned || '', actual: t.actual || '', mistake: t.mistake || '', poi: t.poi || '',
    ratingExec: t.ratingExec || null, ratingDisc: t.ratingDisc || null, notes: t.notes || '', tags: t.tags || [],
    beforeMedia: existingMediaToForm(t.beforeMedia),
    afterMedia: existingMediaToForm(t.afterMedia),
  };
}

// Optional 1–5 star rating; tap the selected star again to clear it.
function StarRating({ label, hint, value, onChange }) {
  return (
    <div className="modal-field">
      <label>{label} <span className="modal-field-hint">(optional)</span></label>
      <div className="star-row" role="radiogroup" aria-label={`${label} rating — ${hint}`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n} type="button" role="radio" aria-checked={value === n}
            className={`star-btn${value && n <= value ? ' on' : ''}`}
            title={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => onChange(value === n ? null : n)}
          >★</button>
        ))}
      </div>
    </div>
  );
}

// Free-form extra tags (up to 8). Suggests ones used on earlier trades.
function TagsField({ value, onChange, suggestions }) {
  const [text, setText] = useState('');
  const MAX_TAGS = 8;
  function add(raw) {
    const t = raw.trim().slice(0, 24);
    if (!t || value.length >= MAX_TAGS || value.some((x) => x.toLowerCase() === t.toLowerCase())) { setText(''); return; }
    onChange([...value, t]);
    setText('');
  }
  const unused = suggestions.filter((s) => !value.some((x) => x.toLowerCase() === s.toLowerCase())).slice(0, 12);
  return (
    <div className="modal-field full">
      <label>Extra Tags <span className="modal-field-hint">— optional, e.g. "A+ setup", "news day" (max {MAX_TAGS})</span></label>
      {value.length > 0 && (
        <div className="chip-row">
          {value.map((t) => (
            <div className="removable-chip" key={t}>
              <div className="chip selected">{t}</div>
              <button type="button" className="checklist-remove-btn" title="Remove tag" onClick={() => onChange(value.filter((x) => x !== t))}>×</button>
            </div>
          ))}
        </div>
      )}
      <div className="checklist-add-row">
        <input
          type="text" maxLength={24} placeholder="Add a tag…" value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(text); } }}
        />
        <button type="button" className="btn btn-ghost" onClick={() => add(text)}>Add</button>
      </div>
      {unused.length > 0 && (
        <div className="chip-row" style={{ marginTop: 8, marginBottom: 0 }}>
          {unused.map((s) => <div className="chip" key={s} style={{ cursor: 'pointer' }} {...clickable(() => add(s))}>+ {s}</div>)}
        </div>
      )}
    </div>
  );
}

// Each item is either { file: File, previewUrl: blob-url, type: 'image'|'video', key }
// — the raw File is what actually gets uploaded on submit, previewUrl is
// purely local and never sent anywhere — or { url: string, type: 'link', key }
// for a pasted link, which has nothing to upload and is saved as-is.
function MediaSlot({ label, hint, files, onAdd, onRemove }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkError, setLinkError] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [processing, setProcessing] = useState(0);

  // Links open in a new tab on click instead of enlarging — nothing to view
  // bigger about a URL. Lightbox wants { url, type }; these items use
  // `previewUrl` (a local blob URL) rather than `url` since nothing's been
  // uploaded yet at this point in the form.
  const viewableItems = files.filter((f) => f.type !== 'link').map((f) => ({ url: f.previewUrl, type: f.type }));

  // Images are shrunk in the browser first (a retina screenshot is often
  // 5–10MB), so the 4.5MB upload limit only really bites on long video clips.
  async function handleFiles(fileList) {
    const picked = [...fileList].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (!picked.length) return;
    setProcessing((n) => n + 1);
    const additions = [];
    try {
      for (const original of picked) {
        const f = await compressImage(original);
        if (f.size > MAX_UPLOAD_BYTES) {
          alert(`${original.name} is still over 4.5MB — that's the per-file limit on Netlify Functions. Pick a shorter clip or a smaller image.`);
          continue;
        }
        additions.push({
          file: f,
          previewUrl: URL.createObjectURL(f),
          type: f.type.startsWith('video/') ? 'video' : 'image',
          key: `${Date.now()}-${Math.random().toString(36).slice(2)}-${f.name}`,
        });
      }
    } finally {
      setProcessing((n) => n - 1);
    }
    if (additions.length) onAdd(additions);
  }

  function handleAddLink() {
    const trimmed = linkText.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) {
      setLinkError('Link needs to start with http:// or https://');
      return;
    }
    onAdd([{ url: trimmed, type: 'link', key: `link-${Date.now()}` }]);
    setLinkText('');
    setLinkError('');
  }

  function hostnameOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  }

  return (
    <div className="modal-field full">
      <label>{label} <span className="modal-field-hint">— {hint}</span></label>
      <div
        className={`media-dropzone${dragOver ? ' dragover' : ''}`}
        style={{ padding: 14, marginBottom: 10 }}
        {...clickable(() => inputRef.current.click())}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
      >
        <div className="dz-text">
          {processing > 0 ? 'Preparing images…' : <>Click or drop screenshots/clips — select several at once, or add more anytime, or <span className="dz-browse">browse</span></>}
        </div>
        <input ref={inputRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
      </div>

      <div className="checklist-add-row" style={{ marginBottom: files.length ? 10 : 0 }}>
        <input
          type="text" placeholder="…or paste a link instead (TradingView replay, YouTube, etc.)" value={linkText}
          onChange={(e) => { setLinkText(e.target.value); setLinkError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAddLink(); }}
        />
        <button type="button" className="btn btn-ghost" onClick={handleAddLink}>Add link</button>
      </div>
      {linkError && <div style={{ color: 'var(--negative)', fontSize: 11.5, marginTop: -4, marginBottom: 10 }}>{linkError}</div>}

      {files.length > 0 && (
        <div className="media-grid">
          {files.map((f) => (
            <div className={`media-thumb${f.type === 'link' ? ' link-thumb' : ''}`} key={f.key}>
              {f.type === 'link' ? (
                <a href={f.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  <span className="link-host">{hostnameOf(f.url)}</span>
                </a>
              ) : (
                <button
                  type="button" className="media-thumb-open"
                  onClick={() => setLightboxIndex(files.filter((x) => x.type !== 'link').findIndex((x) => x.key === f.key))}
                  title="Click to enlarge"
                >
                  {f.type === 'video' ? (
                    <><video src={f.previewUrl} muted playsInline /><span className="vid-badge">▶ VIDEO</span></>
                  ) : (
                    <img src={f.previewUrl} alt="" />
                  )}
                </button>
              )}
              <button
                className="remove-btn"
                onClick={(e) => { e.stopPropagation(); if (f.previewUrl && f.file) URL.revokeObjectURL(f.previewUrl); onRemove(f.key); }}
                title="Remove"
              >×</button>
            </div>
          ))}
        </div>
      )}

      <Lightbox items={viewableItems} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} />
    </div>
  );
}


// `trade` set = editing that trade (form pre-filled, saves over it);
// unset = logging a new one. Dashboard mounts a fresh instance each time
// the modal opens, so the form always starts from the right state.
export default function LogTradeModal({ open, trade, onClose, onSubmit, mistakeTags, poiTags, knownTags = [] }) {
  const isEdit = !!trade;
  const [quick, setQuickState] = useState(() => initialQuick(isEdit));
  function setQuick(v) {
    setQuickState(v);
    try { localStorage.setItem(LOG_MODE_KEY, v ? 'quick' : 'full'); } catch { /* ignore */ }
  }
  const [form, setForm] = useState(() => (trade ? formFromTrade(trade) : emptyForm()));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [newTagText, setNewTagText] = useState('');
  const [editingPoi, setEditingPoi] = useState(false);
  const [newPoiText, setNewPoiText] = useState('');

  function handleAddTag() {
    if (!newTagText.trim()) return;
    mistakeTags.addTag(newTagText);
    setNewTagText('');
  }

  function handleAddPoi() {
    if (!newPoiText.trim()) return;
    poiTags.addTag(newPoiText);
    setNewPoiText('');
  }

  function update(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  // What the P&L currently works out to from the form, or null while it
  // can't be determined yet — drives the live R preview next to "$ risked".
  function previewPnl() {
    if (form.side === 'missed') return null;
    if (form.side === 'breakeven') return 0;
    if (form.pnlMode === 'manual') {
      const m = parseFloat(form.manualPnl);
      return isNaN(m) ? null : m;
    }
    const entry = parseFloat(form.entry), exit = parseFloat(form.exit), size = parseFloat(form.size);
    if (isNaN(entry) || isNaN(exit) || isNaN(size)) return null;
    return (exit - entry) * size * (form.side === 'long' ? 1 : -1);
  }

  async function handleSubmit() {
    let pnl;
    let entryVal = '', exitVal = '', sizeVal = '';

    if (form.side === 'missed' || form.side === 'breakeven') {
      // Nothing to compute — a missed setup was never taken, and a
      // breakeven trade is being explicitly declared net-zero rather than
      // calculated. Entry/exit/size are optional context either way.
      if (!form.sym.trim()) {
        setError('Please fill in a symbol.');
        return;
      }
      pnl = 0;
      if (form.entry) entryVal = parseFloat(form.entry).toFixed(2);
      if (form.exit) exitVal = parseFloat(form.exit).toFixed(2);
      if (form.size) sizeVal = String(parseFloat(form.size));
    } else if (quick || form.pnlMode === 'manual') {
      const manual = parseFloat(form.manualPnl);
      if (!form.sym.trim() || isNaN(manual)) {
        setError('Please fill in symbol and a profit/loss amount.');
        return;
      }
      pnl = Math.round(manual * 100) / 100;
      // Entry/exit/size are optional in manual mode — kept if the person
      // filled them in anyway (nice context), just not used for the math.
      if (form.entry) entryVal = parseFloat(form.entry).toFixed(2);
      if (form.exit) exitVal = parseFloat(form.exit).toFixed(2);
      if (form.size) sizeVal = String(parseFloat(form.size));
    } else {
      const entry = parseFloat(form.entry);
      const exit = parseFloat(form.exit);
      const size = parseFloat(form.size);
      if (!form.sym.trim() || isNaN(entry) || isNaN(exit) || isNaN(size)) {
        setError('Please fill in symbol, entry, exit, and size.');
        return;
      }
      const rawPnl = (exit - entry) * size * (form.side === 'long' ? 1 : -1);
      pnl = Math.round(rawPnl * 100) / 100;
      entryVal = entry.toFixed(2);
      exitVal = exit.toFixed(2);
      sizeVal = String(size);
    }

    // Quick log hides the risk field, so a remembered value must not be applied silently.
    const riskVal = quick ? NaN : parseFloat(form.risk);
    if (!quick && form.risk !== '' && (isNaN(riskVal) || riskVal <= 0)) {
      setError('"$ risked" must be a positive amount — or leave it blank.');
      return;
    }

    setError('');
    setSaving(true);
    try {
      await onSubmit({
        date: form.date,
        time: form.time || null,
        sym: form.sym.toUpperCase(),
        side: form.side,
        entry: entryVal,
        exit: exitVal,
        size: sizeVal,
        pnl,
        pnlMode: quick ? 'manual' : form.pnlMode,
        incomplete: quick, // quick-logged: details still to fill in
        // Dollars risked on this trade. The server turns it into the real
        // R-multiple (P&L ÷ risk); blank means "unknown", not zero.
        risk: !quick && form.side !== 'missed' && form.risk !== '' ? riskVal : null,
        mistake: form.mistake || null,
        poi: form.poi || null,
        ratingExec: quick ? null : form.ratingExec,
        ratingDisc: quick ? null : form.ratingDisc,
        notes: quick ? null : form.notes.trim() || null,
        tags: quick ? [] : form.tags,
        planned: form.planned.trim() || null,
        actual: form.actual.trim() || null,
        beforeMedia: form.beforeMedia, // raw File objects — uploaded to Storage inside addTrade()
        afterMedia: form.afterMedia,
      });
      if (riskVal > 0) saveLastRisk(form.risk);
    } catch (e) {
      console.error(e);
      setError('Something went wrong saving this trade. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  useEscape(() => { if (!saving) onClose(); }, open);

  if (!open) return null;

  return (
    <div className="modal-overlay open">
      <div className="modal-card glass" role="dialog" aria-modal="true" aria-label={isEdit ? 'Edit trade' : 'Log trade'}>
        <div className="modal-head">
          <h3>{isEdit ? 'Edit Trade' : 'Log Trade'} <InfoTooltip text="Record a trade after you've closed it — including what you planned beforehand, what actually happened, and any screenshots or clips for reference." /></h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {error && <div style={{ color: 'var(--negative)', fontSize: 12.5 }}>{error}</div>}
          {!isEdit && (
            <div className="chip-row" style={{ marginBottom: 0 }}>
              <div className={`chip${quick ? ' selected' : ''}`} style={{ cursor: 'pointer' }} {...clickable(() => setQuick(true), { pressed: quick })}>Quick log</div>
              <div className={`chip${!quick ? ' selected' : ''}`} style={{ cursor: 'pointer' }} {...clickable(() => setQuick(false), { pressed: !quick })}>Full details</div>
            </div>
          )}

          {quick ? (
            <>
              <div className="modal-field full">
                <label>Symbol</label>
                <input type="text" autoFocus autoCapitalize="characters" placeholder="NVDA" value={form.sym} onChange={(e) => update('sym', e.target.value)} />
              </div>
              <SideField value={form.side} onChange={(v) => update('side', v)} />
              {(form.side === 'long' || form.side === 'short') && (
                <div className="modal-field full">
                  <label>Profit / Loss ($) <span className="modal-field-hint">— negative for a loss</span></label>
                  <input type="number" inputMode="decimal" step="0.01" placeholder="-84.50" value={form.manualPnl} onChange={(e) => update('manualPnl', e.target.value)} />
                </div>
              )}
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
                Saved for {form.date}. It'll be marked "needs details" so you can add prices, notes and screenshots later.{' '}
                <button type="button" className="checklist-edit-toggle" onClick={() => setQuick(false)}>Add details now</button>
              </p>
            </>
          ) : (
          <>
          <div className="modal-row">
            <div className="modal-field"><label>Date</label><input type="date" value={form.date} onChange={(e) => update('date', e.target.value)} /></div>
            <div className="modal-field"><label>Time <span className="modal-field-hint">(optional)</span></label><input type="time" value={form.time} onChange={(e) => update('time', e.target.value)} aria-label="Trade time" /></div>
            <div className="modal-field"><label>Symbol</label><input type="text" placeholder="NVDA" value={form.sym} onChange={(e) => update('sym', e.target.value)} /></div>
          </div>
          <SideField value={form.side} onChange={(v) => update('side', v)} />
          {form.side === 'missed' ? (
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 2px' }}>
              A setup you saw but didn't take — no entry/exit needed. Use Planned/Actual below to note why you passed on it.
            </p>
          ) : form.side === 'breakeven' ? (
            <div className="modal-row">
              <div className="modal-field"><label>Entry Price <span className="modal-field-hint">(optional)</span></label><input type="number" step="0.01" placeholder="128.40" value={form.entry} onChange={(e) => update('entry', e.target.value)} /></div>
              <div className="modal-field"><label>Exit Price <span className="modal-field-hint">(optional)</span></label><input type="number" step="0.01" placeholder="128.55" value={form.exit} onChange={(e) => update('exit', e.target.value)} /></div>
              <div className="modal-field"><label>Size <span className="modal-field-hint">(optional)</span></label><input type="number" placeholder="100" value={form.size} onChange={(e) => update('size', e.target.value)} /></div>
            </div>
          ) : (
            <>
              <div className="field-head-row">
                <span className="field-label" style={{ marginBottom: 0 }}>Trade Size</span>
                <button
                  type="button" className="checklist-edit-toggle"
                  onClick={() => update('pnlMode', form.pnlMode === 'manual' ? 'calc' : 'manual')}
                >
                  {form.pnlMode === 'manual' ? 'Calculate from entry/exit instead' : 'Enter P&L manually instead'}
                </button>
              </div>
              {form.pnlMode === 'manual' ? (
                <div className="modal-row">
                  <div className="modal-field">
                    <label>Profit / Loss ($) <span className="modal-field-hint">— negative for a loss</span></label>
                    <input type="number" step="0.01" placeholder="-84.50" value={form.manualPnl} onChange={(e) => update('manualPnl', e.target.value)} />
                  </div>
                  <div className="modal-field"><label>Entry Price <span className="modal-field-hint">(optional)</span></label><input type="number" step="0.01" placeholder="128.40" value={form.entry} onChange={(e) => update('entry', e.target.value)} /></div>
                  <div className="modal-field"><label>Exit Price <span className="modal-field-hint">(optional)</span></label><input type="number" step="0.01" placeholder="131.90" value={form.exit} onChange={(e) => update('exit', e.target.value)} /></div>
                </div>
              ) : (
                <div className="modal-row">
                  <div className="modal-field"><label>Entry Price</label><input type="number" step="0.01" placeholder="128.40" value={form.entry} onChange={(e) => update('entry', e.target.value)} /></div>
                  <div className="modal-field"><label>Exit Price</label><input type="number" step="0.01" placeholder="131.90" value={form.exit} onChange={(e) => update('exit', e.target.value)} /></div>
                  <div className="modal-field"><label>Size</label><input type="number" placeholder="100" value={form.size} onChange={(e) => update('size', e.target.value)} /></div>
                </div>
              )}
            </>
          )}

          {form.side !== 'missed' && (() => {
            const pnlNow = previewPnl();
            const riskNow = parseFloat(form.risk);
            const rNow = pnlNow !== null && riskNow > 0 ? pnlNow / riskNow : null;
            return (
              <div className="modal-row">
                <div className="modal-field">
                  <label>$ Risked <span className="modal-field-hint">(optional)</span></label>
                  <input type="number" step="0.01" min="0" placeholder="200" value={form.risk} onChange={(e) => update('risk', e.target.value)} />
                </div>
                <div className="modal-field">
                  <label>R-Multiple</label>
                  <div className="mono" style={{ padding: '9px 0', fontSize: 14, fontWeight: 600, color: rNow === null ? 'var(--text-tertiary)' : (rNow >= 0 ? 'var(--positive)' : 'var(--negative)') }}>
                    {rNow === null ? (riskNow > 0 ? '—' : 'Add $ risked to see it') : fmtR(rNow)}
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="modal-field full">
            <label>Planned Entry <span className="modal-field-hint">— what was the plan before you took this trade?</span></label>
            <textarea rows={2} value={form.planned} onChange={(e) => update('planned', e.target.value)} placeholder="e.g. Wait for a pullback to the 20EMA before entering long. Risk 0.5R." />
          </div>
          <div className="modal-field full">
            <label>What Actually Happened <span className="modal-field-hint">— leave blank if it went to plan</span></label>
            <textarea rows={2} value={form.actual} onChange={(e) => update('actual', e.target.value)} placeholder="e.g. Chased the breakout 40¢ above trigger without waiting for confirmation." />
          </div>
          <div className="modal-field full">
            <div className="field-head-row">
              <label>Mistake Tag <span className="modal-field-hint">— optional, only if something went off-plan</span></label>
              <button type="button" className="checklist-edit-toggle" onClick={() => setEditingTags((v) => !v)}>
                {editingTags ? 'Done' : 'Edit list'}
              </button>
            </div>
            <div className="chip-row">
              <div className={`chip${!form.mistake ? ' selected' : ''}`} {...clickable(() => update('mistake', ''), { pressed: !form.mistake })}>
                None — clean trade
              </div>
              {mistakeTags.tags.map((t) => {
                const isSelected = form.mistake === t.label;
                return (
                  <div className="removable-chip" key={t.id}>
                    <div
                      className={`chip${isSelected ? ' selected' : ''}`}
                      style={isSelected ? {} : { color: t.color, borderColor: `${t.color}55` }}
                      {...clickable(() => update('mistake', t.label), { pressed: isSelected })}
                    >
                      {t.label}
                    </div>
                    {editingTags && (
                      <button
                        type="button" className="checklist-remove-btn" title="Remove tag"
                        onClick={() => { mistakeTags.removeTag(t.id); if (form.mistake === t.label) update('mistake', ''); }}
                      >×</button>
                    )}
                  </div>
                );
              })}
            </div>
            {editingTags && (
              <div className="checklist-add-row">
                <input
                  type="text" placeholder="Add a new mistake tag…" value={newTagText}
                  onChange={(e) => setNewTagText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag(); }}
                />
                <button type="button" className="btn btn-ghost" onClick={handleAddTag}>Add</button>
              </div>
            )}
          </div>

          <div className="modal-field full">
            <div className="field-head-row">
              <label>Point of Interest (POI) <span className="modal-field-hint">— the setup you traded off of</span></label>
              <button type="button" className="checklist-edit-toggle" onClick={() => setEditingPoi((v) => !v)}>
                {editingPoi ? 'Done' : 'Edit list'}
              </button>
            </div>
            <div className="chip-row">
              <div className={`chip${!form.poi ? ' selected' : ''}`} {...clickable(() => update('poi', ''), { pressed: !form.poi })}>
                None
              </div>
              {poiTags.tags.map((t) => {
                const isSelected = form.poi === t.label;
                return (
                  <div className="removable-chip" key={t.id}>
                    <div
                      className={`chip${isSelected ? ' selected' : ''}`}
                      style={isSelected ? {} : { color: t.color, borderColor: `${t.color}55` }}
                      {...clickable(() => update('poi', t.label), { pressed: isSelected })}
                    >
                      {t.label}
                    </div>
                    {editingPoi && (
                      <button
                        type="button" className="checklist-remove-btn" title="Remove POI"
                        onClick={() => { poiTags.removeTag(t.id); if (form.poi === t.label) update('poi', ''); }}
                      >×</button>
                    )}
                  </div>
                );
              })}
            </div>
            {editingPoi && (
              <div className="checklist-add-row">
                <input
                  type="text" placeholder="Add a new POI…" value={newPoiText}
                  onChange={(e) => setNewPoiText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddPoi(); }}
                />
                <button type="button" className="btn btn-ghost" onClick={handleAddPoi}>Add</button>
              </div>
            )}
          </div>

          <div className="modal-row">
            <StarRating label="Execution" hint="how well did you execute?" value={form.ratingExec} onChange={(v) => update('ratingExec', v)} />
            <StarRating label="Discipline" hint="did you follow your rules?" value={form.ratingDisc} onChange={(v) => update('ratingDisc', v)} />
          </div>
          <div className="modal-field full">
            <label>Trade Notes <span className="modal-field-hint">— why you took it, what you'd change</span></label>
            <textarea rows={3} maxLength={2000} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="e.g. Good patience on the entry, but I moved my stop — don't do that." />
          </div>
          <TagsField value={form.tags} onChange={(v) => update('tags', v)} suggestions={knownTags} />

          <MediaSlot
            label="Before Entry"
            hint="chart setup at the moment you entered"
            files={form.beforeMedia}
            onAdd={(files) => setForm((f) => ({ ...f, beforeMedia: [...f.beforeMedia, ...files] }))}
            onRemove={(key) => update('beforeMedia', form.beforeMedia.filter((f) => f.key !== key))}
          />
          <MediaSlot
            label="After Exit"
            hint="chart result after you closed the trade"
            files={form.afterMedia}
            onAdd={(files) => setForm((f) => ({ ...f, afterMedia: [...f.afterMedia, ...files] }))}
            onRemove={(key) => update('afterMedia', form.afterMedia.filter((f) => f.key !== key))}
          />
          </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost glass" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Save Trade')}
          </button>
        </div>
      </div>
    </div>
  );
}
