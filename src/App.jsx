import { useState } from 'react';
import AuthGate from './components/AuthGate';
import Dashboard from './pages/Dashboard';
import Backtests from './pages/Backtests';
import StatusBanner from './components/StatusBanner';

// Two separate journals under one roof: the live trading journal, and the
// backtest journal. Which one you're in is remembered on this device.
function Workspace({ user, onSignOut }) {
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('ledgr:view') === 'backtests' ? 'backtests' : 'live'; } catch { return 'live'; }
  });
  const change = (next) => {
    setView(next);
    try { localStorage.setItem('ledgr:view', next); } catch { /* remembered only for this visit */ }
    window.scrollTo?.(0, 0);
  };
  return view === 'backtests'
    ? <Backtests user={user} onSignOut={onSignOut} view={view} onViewChange={change} />
    : <Dashboard user={user} onSignOut={onSignOut} journal={view} onJournalChange={change} />;
}

export default function App() {
  return (
    <>
      <StatusBanner />
      <AuthGate>
        {(user, signOut) => <Workspace user={user} onSignOut={signOut} />}
      </AuthGate>
    </>
  );
}
