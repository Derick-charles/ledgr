import { useRef, useState } from 'react';
import { useEscape } from '../hooks/useEscape.js';
import { clickable } from '../utils/a11y.js';
import { ALL_ACCOUNTS } from '../hooks/useAccounts';
import { api } from '../api';
import { downloadAccountBackup } from '../utils/backup';
import { useOffline } from '../hooks/useOffline';
import ChallengeForm, { newPhase, phaseError, phaseForSave } from './ChallengeForm';

export default function AccountSwitcher({ accounts, activeAccountId, setActiveAccountId, addAccount, renameAccount, removeAccount, saveChallenge }) {
  const offline = useOffline();
  const [managing, setManaging] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameText, setRenameText] = useState('');
  const [busyId, setBusyId] = useState(null); // account currently backing up/restoring/deleting
  const [confirmDelete, setConfirmDelete] = useState(null); // { account, counts, loading, error } | null
  const [confirmText, setConfirmText] = useState('');
  const [newIsChallenge, setNewIsChallenge] = useState(false);
  const [newPhaseDraft, setNewPhaseDraft] = useState(null);
  const [formError, setFormError] = useState('');
  const [challengeEdit, setChallengeEdit] = useState(null); // { account, phase } | null
  useEscape(() => { setManaging(false); setConfirmDelete(null); setChallengeEdit(null); }, managing);
  const restoreInputRef = useRef(null);
  const restoreTargetId = useRef(null);

  function commitRename() {
    if (renamingId) renameAccount(renamingId, renameText);
    setRenamingId(null);
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    if (newIsChallenge) {
      const err = phaseError(newPhaseDraft);
      if (err) { setFormError(err); return; }
      try {
        await addAccount(newName, { phases: [phaseForSave(newPhaseDraft)] });
      } catch (e) { setFormError(e.message); return; }
    } else {
      addAccount(newName);
    }
    setFormError(''); setNewName(''); setNewIsChallenge(false); setNewPhaseDraft(null);
  }

  function toggleNewChallenge(on) {
    setNewIsChallenge(on); setFormError('');
    if (on && !newPhaseDraft) setNewPhaseDraft(newPhase('Phase 1'));
  }

  async function saveChallengeEdit() {
    const err = phaseError(challengeEdit.phase);
    if (err) { setFormError(err); return; }
    try {
      await saveChallenge(challengeEdit.account.id, { phases: [phaseForSave(challengeEdit.phase)] });
      setChallengeEdit(null); setFormError('');
    } catch (e) { setFormError(e.message); }
  }

  async function handleBackup(account) {
    setBusyId(account.id);
    try {
      await downloadAccountBackup(account);
    } catch (e) {
      alert(`Could not create backup: ${e.message}`);
    } finally {
      setBusyId(null);
    }
  }

  function handleRestoreClick(account) {
    restoreTargetId.current = account.id;
    restoreInputRef.current.click();
  }

  async function handleRestoreFile(e) {
    const file = e.target.files[0];
    const accountId = restoreTargetId.current;
    e.target.value = '';
    if (!file || !accountId) return;
    setBusyId(accountId);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !('trades' in data)) {
        throw new Error("That doesn't look like a LEDGR backup file.");
      }
      const result = await api.post(`/api/backup?account=${accountId}`, data);
      alert(
        `Restored ${result.restored.trades} trade${result.restored.trades !== 1 ? 's' : ''} and ` +
        `${result.restored.journal} journal ${result.restored.journal !== 1 ? 'entries' : 'entry'}. ` +
        `Reloading to show the restored data…`
      );
      window.location.reload(); // simplest way for every hook on the page to pick up restored data
    } catch (err) {
      alert(`Restore failed: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  }

  async function startDelete(account) {
    setConfirmText('');
    setConfirmDelete({ account, counts: null, loading: true, error: false });
    try {
      const data = await api.get(`/api/backup?account=${account.id}`);
      setConfirmDelete({ account, counts: data.counts, loading: false, error: false });
    } catch (e) {
      setConfirmDelete({ account, counts: null, loading: false, error: true });
    }
  }

  async function confirmDeleteNow() {
    if (!confirmDelete || confirmText !== confirmDelete.account.name) return;
    setBusyId(confirmDelete.account.id);
    try {
      await removeAccount(confirmDelete.account.id);
      setConfirmDelete(null);
    } finally {
      setBusyId(null);
    }
  }

  if (!accounts.length) return null;

  return (
    <>
      <div className="account-switcher">
        <select value={activeAccountId || ''} onChange={(e) => setActiveAccountId(e.target.value)}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          {accounts.length > 1 && <option value={ALL_ACCOUNTS}>All Accounts</option>}
        </select>
        {!offline && <button className="account-manage-btn" onClick={() => setManaging(true)} title="Manage accounts">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>}
      </div>

      {/* Hidden, shared across all accounts' restore buttons — which account
          it restores into is tracked separately in restoreTargetId. */}
      <input ref={restoreInputRef} type="file" accept="application/json" hidden onChange={handleRestoreFile} />

      {managing && (
        <div className="modal-overlay open" onClick={() => { setManaging(false); setConfirmDelete(null); }}>
          <div className="modal-card glass" role="dialog" aria-modal="true" aria-label="Manage accounts" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Manage Accounts</h3>
              <button className="modal-close" onClick={() => { setManaging(false); setConfirmDelete(null); }}>×</button>
            </div>
            <div className="modal-body">
              {challengeEdit ? (
                <>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Track <strong>{challengeEdit.account.name}</strong> as a prop-firm challenge. You can add later phases (Phase 2, Funded) from the dashboard once it's running.</p>
                  {formError && <div style={{ color: 'var(--negative)', fontSize: 12.5 }}>{formError}</div>}
                  <ChallengeForm phase={challengeEdit.phase} onChange={(phase) => setChallengeEdit({ ...challengeEdit, phase })} />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost glass" onClick={() => { setChallengeEdit(null); setFormError(''); }}>Back</button>
                    <button className="btn btn-primary" onClick={saveChallengeEdit}>Start tracking</button>
                  </div>
                </>
              ) : confirmDelete ? (
                <div className="delete-confirm-panel">
                  {confirmDelete.loading ? (
                    <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Checking what's in this account…</p>
                  ) : confirmDelete.error ? (
                    <p style={{ fontSize: 13, color: 'var(--negative)' }}>Couldn't check this account's data. Try again in a moment.</p>
                  ) : (
                    <>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        Deleting <strong style={{ color: 'var(--text-primary)' }}>{confirmDelete.account.name}</strong> permanently removes{' '}
                        <strong style={{ color: 'var(--negative)' }}>
                          {confirmDelete.counts.trades} trade{confirmDelete.counts.trades !== 1 ? 's' : ''}, {confirmDelete.counts.journal} journal {confirmDelete.counts.journal !== 1 ? 'entries' : 'entry'}, and {confirmDelete.counts.certificates} certificate{confirmDelete.counts.certificates !== 1 ? 's' : ''}
                        </strong>. This can't be undone.
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '8px 0 12px' }}>
                        Consider downloading a backup first — "Cancel" below, then the download icon next to this account.
                      </p>
                      <label style={{ fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                        Type "{confirmDelete.account.name}" to confirm
                      </label>
                      <input
                        autoFocus type="text" className="account-rename-input" style={{ width: '100%', marginTop: 6, marginBottom: 14 }}
                        value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && confirmText === confirmDelete.account.name) confirmDeleteNow(); }}
                      />
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost glass" onClick={() => setConfirmDelete(null)}>Cancel</button>
                    {!confirmDelete.loading && !confirmDelete.error && (
                      <button
                        className="btn" style={{ background: 'var(--negative)', color: '#fff' }}
                        disabled={confirmText !== confirmDelete.account.name || busyId === confirmDelete.account.id}
                        onClick={confirmDeleteNow}
                      >
                        {busyId === confirmDelete.account.id ? 'Deleting…' : 'Delete Permanently'}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {accounts.map((a) => (
                    <div className="check-item-row account-row" key={a.id}>
                      {renamingId === a.id ? (
                        <input
                          autoFocus className="account-rename-input" value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); }}
                          onBlur={commitRename}
                        />
                      ) : (
                        <span
                          className="check-item" style={{ cursor: 'text' }}
                          {...clickable(() => { setRenamingId(a.id); setRenameText(a.name); }, { label: `Rename ${a.name}` })}
                        >
                          {a.name}
                        </span>
                      )}
                      <div className="account-row-actions">
                        {a.challenge ? <span className="challenge-status" style={{ color: 'var(--cyan)', marginRight: 4 }} title="Tracked as a prop-firm challenge">Challenge</span> : (
                          <button className="account-icon-btn" style={{ width: 'auto', padding: '0 8px', fontSize: 11 }} title="Track this account as a prop-firm challenge" onClick={() => { setFormError(''); setChallengeEdit({ account: a, phase: newPhase('Phase 1') }); }}>Challenge</button>
                        )}
                        <button className="account-icon-btn" title="Download a backup of this account" disabled={busyId === a.id} onClick={() => handleBackup(a)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        </button>
                        <button className="account-icon-btn" title="Restore from a backup file into this account" disabled={busyId === a.id} onClick={() => handleRestoreClick(a)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                        </button>
                        {accounts.length > 1 && (
                          <button className="checklist-remove-btn" title="Delete account" onClick={() => startDelete(a)}>×</button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="checklist-add-row">
                    <input
                      type="text" placeholder="New account name…" value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !newIsChallenge) handleAdd(); }}
                    />
                    <button type="button" className="btn btn-ghost" onClick={handleAdd}>Add</button>
                  </div>
                  <label className="check-inline"><input type="checkbox" checked={newIsChallenge} onChange={(e) => toggleNewChallenge(e.target.checked)} /> This is a prop-firm challenge account</label>
                  {newIsChallenge && newPhaseDraft && (
                    <>
                      {formError && <div style={{ color: 'var(--negative)', fontSize: 12.5 }}>{formError}</div>}
                      <ChallengeForm phase={newPhaseDraft} onChange={setNewPhaseDraft} />
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
