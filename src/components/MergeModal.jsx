import { useState } from 'react';
import { api } from '../api';
import { useEscape } from '../hooks/useEscape.js';

// Joins two accounts that ended up separate. Both must be signed in at once,
// one on each device (or one normal window and one private window).
export default function MergeModal({ user, onClose }) {
  const [mode, setMode] = useState('choose'); // choose | give | take | done
  const [code, setCode] = useState('');
  const [made, setMade] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  useEscape(() => { if (!busy) onClose(); });

  async function makeCode() {
    setBusy(true); setError('');
    try { setMade(await api.post('/api/merge', { action: 'create' })); setMode('give'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function merge() {
    if (!window.confirm(`Move everything from the other account into ${user.email}? The other account is deleted afterwards. This can't be undone.`)) return;
    setBusy(true); setError('');
    try { setResult(await api.post('/api/merge', { action: 'merge', code })); setMode('done'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay open">
      <div className="modal-card glass" role="dialog" aria-modal="true" aria-label="Merge accounts" style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <h3>Merge two accounts</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close" disabled={busy}>×</button>
        </div>
        <div className="modal-body">
          {mode === 'choose' && (
            <>
              <p className="bt-prep-sub">Use this if you ended up with two separate accounts and want all your trades, journal and backtests in one. Sign in to <b>both</b> accounts — one on each device, or one in a private window — then:</p>
              <div className="merge-choice">
                <button type="button" className="btn btn-ghost glass" onClick={makeCode} disabled={busy}>
                  <b>This is the account to retire</b>
                  <span>Get a code. Everything here moves into the other account.</span>
                </button>
                <button type="button" className="btn btn-ghost glass" onClick={() => setMode('take')}>
                  <b>This is the account to keep</b>
                  <span>Enter the code from the other account.</span>
                </button>
              </div>
            </>
          )}
          {mode === 'give' && made && (
            <>
              <p className="bt-prep-sub">On the account you want to <b>keep</b>, open <b>Sidebar → Merge accounts → "This is the account to keep"</b> and enter:</p>
              <div className="merge-code" aria-label="Merge code">{made.code}</div>
              <p className="bt-fine">Works once, for {made.minutes} minutes. After the merge this account ({user.email}) is deleted and everything in it lives in the other one.</p>
            </>
          )}
          {mode === 'take' && (
            <>
              <p className="bt-prep-sub">You're keeping <b>{user.email}</b>. Enter the code shown on the other account.</p>
              <div className="modal-field full"><label>Merge code</label>
                <input type="text" autoFocus placeholder="ABCD-EFGH-JKLM" maxLength={14} autoComplete="off" autoCapitalize="characters" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(''); }} />
              </div>
            </>
          )}
          {mode === 'done' && result && (
            <p className="bt-prep-sub">Done. {result.accounts} trading account{result.accounts === 1 ? '' : 's'} and {result.sessions} backtest session{result.sessions === 1 ? '' : 's'} from {result.from} now live here. The other account has been removed — sign in with this one on both devices.</p>
          )}
          {error && <div className="auth-error" role="alert">{error}</div>}
        </div>
        <div className="modal-actions">
          {mode === 'done'
            ? <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
            : <>
                <button type="button" className="btn btn-ghost glass" onClick={onClose} disabled={busy}>{mode === 'give' ? 'Done' : 'Cancel'}</button>
                {mode === 'take' && <button type="button" className="btn btn-primary" onClick={merge} disabled={busy || code.replace(/[^A-Z0-9]/g, '').length < 12}>{busy ? 'Merging…' : 'Merge into this account'}</button>}
              </>}
        </div>
      </div>
    </div>
  );
}
