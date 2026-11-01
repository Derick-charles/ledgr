import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { isOffline, OFFLINE_WRITE_MESSAGE } from '../utils/connection.js';
import { clearOfflineData, rememberUser } from '../utils/offlineCache.js';

// Shown once, right after sign-up or a password reset. Without email, this
// code is the only way back into a forgotten-password account.
export function RecoveryCodePanel({ code, saved, onSaved, onContinue, continueLabel = 'Continue' }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); } catch { /* user can still select it */ }
  }
  function download() {
    const blob = new Blob([`LEDGR recovery code\n\n${code}\n\nKeep this somewhere safe. It lets you reset your password if you forget it.\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ledgr-recovery-code.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <h2 className="auth-title">Save your recovery code</h2>
      <p className="auth-note">If you forget your password, this code is the only way back in — there's no email reset. It's shown once. Store it somewhere safe (a password manager is ideal).</p>
      <div className="recovery-code" aria-label="Recovery code">{code}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-ghost glass" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
        <button type="button" className="btn btn-ghost glass" onClick={download}>Download</button>
      </div>
      <label className="check-inline"><input type="checkbox" checked={saved} onChange={(e) => onSaved(e.target.checked)} /> I've saved my recovery code</label>
      <button type="button" className="btn btn-primary" disabled={!saved} onClick={onContinue}>{continueLabel}</button>
    </>
  );
}

// Shows the journal only once the server confirms who's signed in. This
// screen is a convenience — every /api/* endpoint checks the session itself,
// so nothing is readable or editable without signing in.
export default function AuthGate({ children }) {
  const [status, setStatus] = useState('loading'); // loading | login | app | error
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('login'); // login | signup
  const [form, setForm] = useState({ name: '', email: '', password: '', recoveryCode: '' });
  const [recoveryCode, setRecoveryCode] = useState(null); // shown once after sign-up / reset
  const [savedCode, setSavedCode] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const check = useCallback(async () => {
    try {
      const data = await api.get('/api/auth');
      setUser(data.user ? { ...data.user, config: data.config || null } : null);
      if (data.authenticated && data.user) rememberUser(data.user.id);
      else clearOfflineData();
      setStatus(data.authenticated ? 'app' : 'login');
    } catch (e) {
      setLoadError(e.message || '');
      setStatus('error');
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  // Any API call that comes back 401 (session expired) drops back to sign-in.
  useEffect(() => {
    const onUnauthorized = () => { clearOfflineData(); setStatus((s) => (s === 'app' ? 'login' : s)); };
    window.addEventListener('ledgr:unauthorized', onUnauthorized);
    return () => window.removeEventListener('ledgr:unauthorized', onUnauthorized);
  }, []);

  const set = (field) => (e) => { setForm((f) => ({ ...f, [field]: e.target.value })); setError(''); };

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const data = await api.post('/api/auth', mode === 'forgot'
        ? { action: 'reset_password', email: form.email, recoveryCode: form.recoveryCode, newPassword: form.password }
        : { action: mode, email: form.email, password: form.password, name: form.name });
      // Confirm the session actually stuck before showing the app. If the
      // browser didn't keep the cookie (or the server can't validate it), say
      // so here instead of flashing the dashboard and bouncing back.
      const me = await api.get('/api/auth');
      if (!me.authenticated) {
        const why = {
          no_cookie: "your browser didn't keep the sign-in cookie — check that cookies are enabled for this site",
          bad_signature: "the server couldn't verify the session",
          user_missing: "the server couldn't find your user record yet",
        }[me.reason] || 'the session was not accepted';
        throw new Error(`Signed in, but ${why}. Please try again.`);
      }
      setUser({ ...me.user, config: me.config || null });
      rememberUser(me.user.id);
      setForm({ name: '', email: '', password: '', recoveryCode: '' });
      // A new recovery code (sign-up, or after a reset) must be seen before moving on.
      if (data.recoveryCode) { setRecoveryCode(data.recoveryCode); setSavedCode(false); setStatus('recovery'); }
      else setStatus('app');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    // Signing out has to reach the server to end the session, so it can't be
    // done offline (reloading would just sign you straight back in).
    if (isOffline()) { window.alert(`Sign-out needs a connection. ${OFFLINE_WRITE_MESSAGE}`); return; }
    clearOfflineData();
    try { await api.del('/api/auth'); } catch { /* cookie is cleared server-side; reload regardless */ }
    // Don't carry one user's "active account" choice over to the next sign-in.
    try { localStorage.removeItem('ledgr:activeAccountId'); } catch { /* ignore */ }
    window.location.reload();
  }

  if (status === 'app') return children(user, signOut);

  const isSignup = mode === 'signup';
  const isForgot = mode === 'forgot';

  return (
    <div className="auth-screen">
      <form className="auth-card glass" onSubmit={handleSubmit}>
        <div className="brand" style={{ marginBottom: 14 }}>
          <div className="brand-mark"></div>
          <div className="brand-name">LEDGR</div>
        </div>

        {status === 'loading' && <p className="auth-note">Loading…</p>}

        {status === 'error' && (
          <>
            <p className="auth-note">Couldn't reach the server. Check your connection and try again.</p>
            {loadError && <p className="auth-error">{loadError}</p>}
            <button type="button" className="btn btn-primary" onClick={() => { setStatus('loading'); check(); }}>Retry</button>
          </>
        )}

        {status === 'recovery' && (
          <RecoveryCodePanel
            code={recoveryCode} saved={savedCode} onSaved={setSavedCode}
            onContinue={() => { setRecoveryCode(null); setStatus('app'); }}
          />
        )}

        {status === 'login' && (
          <>
            <h2 className="auth-title">{isSignup ? 'Create your account' : isForgot ? 'Reset your password' : 'Sign in'}</h2>
            {isForgot && <p className="auth-note">Enter your email and the recovery code you saved when you signed up, then choose a new password.</p>}
            {isSignup && (
              <>
                <label className="auth-label" htmlFor="ledgr-name">Name <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
                <input id="ledgr-name" className="auth-input" type="text" autoComplete="name" value={form.name} onChange={set('name')} />
              </>
            )}
            <label className="auth-label" htmlFor="ledgr-email">Email</label>
            <input id="ledgr-email" className="auth-input" type="email" autoFocus autoComplete="email" value={form.email} onChange={set('email')} />
            {isForgot && (
              <>
                <label className="auth-label" htmlFor="ledgr-code">Recovery code</label>
                <input id="ledgr-code" className="auth-input" type="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="XXXX-XXXX-XXXX-XXXX" value={form.recoveryCode} onChange={set('recoveryCode')} />
              </>
            )}
            <label className="auth-label" htmlFor="ledgr-password">{isForgot ? 'New password' : 'Password'}{(isSignup || isForgot) && <span style={{ textTransform: 'none', fontWeight: 400 }}> (8+ characters)</span>}</label>
            <div className="auth-pw-wrap">
              <input
                id="ledgr-password" className="auth-input" type={showPassword ? 'text' : 'password'}
                autoComplete={isSignup || isForgot ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')}
              />
              <button
                type="button" className="auth-pw-toggle" onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={busy || !form.email || !form.password || (isForgot && !form.recoveryCode)}>
              {busy ? 'Please wait…' : (isSignup ? 'Create account' : isForgot ? 'Reset password' : 'Sign in')}
            </button>
            {mode === 'login' && (
              <button type="button" className="auth-switch" onClick={() => { setMode('forgot'); setError(''); setShowPassword(false); }}>
                Forgot your password?
              </button>
            )}
            <button type="button" className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setShowPassword(false); }}>
              {mode === 'login' ? 'New here? Create an account' : isSignup ? 'Already have an account? Sign in' : 'Back to sign in'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
