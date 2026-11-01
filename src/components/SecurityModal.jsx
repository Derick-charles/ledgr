import { useState } from 'react';
import { useEscape } from '../hooks/useEscape.js';
import { api } from '../api';
import { RecoveryCodePanel } from './AuthGate';

// Password box with a show/hide eye, so a mistyped password is visible.
function PwInput({ value, onChange, placeholder, label, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="auth-pw-wrap">
      <input className="auth-input" type={show ? 'text' : 'password'} autoComplete={autoComplete} placeholder={placeholder} aria-label={label} value={value} onChange={onChange} />
      <button type="button" className="auth-pw-toggle" onClick={() => setShow((v) => !v)} aria-pressed={show} aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
          {show && <line x1="1" y1="1" x2="23" y2="23" />}
        </svg>
      </button>
    </div>
  );
}

// Account security: change password, end other sessions, recovery code, and
// (for the person who owns the original data) server setup checks.
export default function SecurityModal({ user, onClose, onRecoveryMade }) {
  const [hasRecovery, setHasRecovery] = useState(!!user.hasRecovery);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwMsg, setPwMsg] = useState(null); // { ok, text }
  const [recPw, setRecPw] = useState('');
  const [recMsg, setRecMsg] = useState(null);
  const [newCode, setNewCode] = useState(null);
  const [savedCode, setSavedCode] = useState(false);
  const [soMsg, setSoMsg] = useState(null);
  const [busy, setBusy] = useState('');

  async function run(name, fn) {
    setBusy(name);
    try { await fn(); } finally { setBusy(''); }
  }

  const changePassword = (e) => {
    e.preventDefault();
    return run('pw', async () => {
      setPwMsg(null);
      try {
        await api.post('/api/auth', { action: 'change_password', currentPassword: pw.current, newPassword: pw.next });
        setPw({ current: '', next: '' });
        setPwMsg({ ok: true, text: 'Password changed. Your other devices have been signed out.' });
      } catch (err) { setPwMsg({ ok: false, text: err.message }); }
    });
  };

  const signOutEverywhere = () => run('so', async () => {
    if (!window.confirm('Sign out of every other device and browser? This device stays signed in.')) return;
    setSoMsg(null);
    try {
      await api.post('/api/auth', { action: 'sign_out_everywhere' });
      setSoMsg({ ok: true, text: 'Done — every other session has been signed out.' });
    } catch (err) { setSoMsg({ ok: false, text: err.message }); }
  });

  const generateCode = (e) => {
    e.preventDefault();
    return run('rec', async () => {
      setRecMsg(null);
      try {
        const data = await api.post('/api/auth', { action: 'generate_recovery', password: recPw });
        setRecPw(''); setNewCode(data.recoveryCode); setSavedCode(false); setHasRecovery(true); onRecoveryMade && onRecoveryMade();
      } catch (err) { setRecMsg({ ok: false, text: err.message }); }
    });
  };

  useEscape(() => { if (!busy) onClose(); });

  const cfg = user.config;
  const warnings = cfg ? [
    !cfg.ownerEmailSet && 'LEDGR_OWNER_EMAIL isn’t set. Until it is, the first person to sign up on a fresh deploy could claim your journal data. Set it to your email in Netlify → Site configuration → Environment variables.',
    !cfg.sessionSecretSet && 'LEDGR_SESSION_SECRET isn’t set. If storage hiccups, a new secret could be generated and sign everyone out. Set it to a long random string in Netlify.',
  ].filter(Boolean) : [];

  return (
    <div className="modal-overlay open" onClick={() => !busy && onClose()}>
      <div className="modal-card glass" style={{ maxWidth: 460 }} role="dialog" aria-modal="true" aria-label="Security" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Security</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          {newCode ? (
            <div className="security-section">
              <RecoveryCodePanel code={newCode} saved={savedCode} onSaved={setSavedCode} onContinue={() => setNewCode(null)} continueLabel="Done" />
            </div>
          ) : (
            <>
              <form className="security-section" onSubmit={changePassword}>
                <h4>Change password</h4>
                <PwInput autoComplete="current-password" placeholder="Current password" label="Current password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
                <PwInput autoComplete="new-password" placeholder="New password (8+ characters)" label="New password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
                {pwMsg && <div className={pwMsg.ok ? 'security-ok' : 'auth-error'} role="status">{pwMsg.text}</div>}
                <button className="btn btn-primary" type="submit" disabled={busy === 'pw' || !pw.current || pw.next.length < 8}>{busy === 'pw' ? 'Saving…' : 'Change password'}</button>
              </form>

              <div className="security-section">
                <h4>Sign out everywhere</h4>
                <p className="auth-note" style={{ margin: 0 }}>Sessions last 30 days. If you signed in on a shared or lost device, this ends every other session.</p>
                {soMsg && <div className={soMsg.ok ? 'security-ok' : 'auth-error'} role="status">{soMsg.text}</div>}
                <button className="btn btn-ghost glass" type="button" onClick={signOutEverywhere} disabled={busy === 'so'}>Sign out other devices</button>
              </div>

              <form className="security-section" onSubmit={generateCode}>
                <h4>Recovery code</h4>
                <p className={hasRecovery ? 'auth-note' : 'security-warn'} style={{ margin: 0 }}>
                  {hasRecovery
                    ? 'You have a recovery code. Making a new one replaces the old one.'
                    : 'You don’t have a recovery code yet. Without one, a forgotten password means losing access to your data — make one now.'}
                </p>
                <PwInput autoComplete="off" placeholder="Confirm with your sign-in password" label="Your sign-in password" value={recPw} onChange={(e) => setRecPw(e.target.value)} />
                {recMsg && <div className="auth-error" role="status">{recMsg.text}</div>}
                <button className="btn btn-ghost glass" type="submit" disabled={busy === 'rec' || !recPw}>{hasRecovery ? 'Make a new recovery code' : 'Make a recovery code'}</button>
              </form>

              {cfg && (
                <div className="security-section">
                  <h4>Setup checks</h4>
                  {warnings.length === 0 ? <div className="security-ok">Owner email and session secret are both set.</div> : warnings.map((w) => <div className="security-warn" key={w}>{w}</div>)}
                  {!cfg.signupsClosed && <div className="auth-note" style={{ margin: 0 }}>Sign-ups are open. Once everyone you want has registered, set LEDGR_ALLOW_SIGNUP to false.</div>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
