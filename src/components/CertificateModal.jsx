import { useRef, useState } from 'react';
import { useEscape } from '../hooks/useEscape.js';
import { clickable } from '../utils/a11y.js';
import { toDateId } from '../utils/dateHelpers';

const EMPTY_FORM = { type: 'Funded Account', firm: '', amount: '', date: toDateId() };

export default function CertificateModal({ open, onClose, onSubmit }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  function update(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  function handleFile(f) {
    if (!f) return;
    if (!f.type.startsWith('image/') && f.type !== 'application/pdf') {
      setError('Please upload an image or PDF.');
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      setError('That file is over 25MB — the Storage rules will reject it.');
      return;
    }
    setError('');
    setFile(f);
  }

  async function handleSubmit() {
    const amount = parseFloat(form.amount);
    if (!form.firm.trim() || isNaN(amount)) {
      setError('Please fill in the firm name and amount.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSubmit({
        type: form.type,
        firm: form.firm.trim(),
        amount,
        date: form.date,
        file, // raw File object, or null — uploaded to Storage inside addCertificate()
      });
      setForm(EMPTY_FORM);
      setFile(null);
    } catch (e) {
      console.error(e);
      setError('Something went wrong saving this certificate. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  useEscape(onClose, open);

  if (!open) return null;

  return (
    <div className="modal-overlay open">
      <div className="modal-card glass" role="dialog" aria-modal="true" aria-label="Add certificate">
        <div className="modal-head">
          <h3>Add Certificate</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {error && <div style={{ color: 'var(--negative)', fontSize: 12.5 }}>{error}</div>}

          <div className="modal-row">
            <div className="modal-field">
              <label>Type</label>
              <select value={form.type} onChange={(e) => update('type', e.target.value)}>
                <option>Funded Account</option>
                <option>Payout</option>
              </select>
            </div>
            <div className="modal-field"><label>Firm</label><input type="text" placeholder="FTMO" value={form.firm} onChange={(e) => update('firm', e.target.value)} /></div>
            <div className="modal-field"><label>Date</label><input type="date" value={form.date} onChange={(e) => update('date', e.target.value)} /></div>
          </div>

          <div className="modal-field full">
            <label>Amount <span className="modal-field-hint">— funded size, or payout amount</span></label>
            <input type="number" step="0.01" placeholder="100000" value={form.amount} onChange={(e) => update('amount', e.target.value)} />
          </div>

          <div className="modal-field full">
            <label>Certificate File <span className="modal-field-hint">— optional, image or PDF</span></label>
            <div className="media-dropzone" {...clickable(() => inputRef.current.click())} style={{ padding: 16 }}>
              <div className="dz-text">{file ? file.name : <>Click to upload, or <span className="dz-browse">browse</span></>}</div>
              <div className="dz-sub">PNG, JPG, PDF — up to 25MB</div>
              <input ref={inputRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => handleFile(e.target.files[0])} />
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost glass" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Certificate'}
          </button>
        </div>
      </div>
    </div>
  );
}
