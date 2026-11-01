import { formatLong } from '../utils/dateHelpers';
import { useOffline } from '../hooks/useOffline';

export default function TopBar({ dateId, tradeCount, periodLabel = 'this month', onLogTrade, streak, isAggregate, accountSwitcher }) {
  const offline = useOffline();
  return (
    <div className="topbar">
      <div>
        <h1>Dashboard</h1>
        <div className="subtitle">
          {formatLong(dateId)} · {tradeCount} trade{tradeCount !== 1 ? 's' : ''} logged {periodLabel}
          {streak > 0 && (
            <span className="streak-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2c1 3-2 4-2 7a4 4 0 0 0 8 0c0-1-1-2-1-2 2 1 3 3 3 5a6 6 0 0 1-12 0c0-4 3-5 4-10z" />
              </svg>
              {streak}-day journaling streak
            </span>
          )}
        </div>
      </div>
      <div className="topbar-actions">
        {accountSwitcher}
        <button
          className="btn btn-primary" onClick={onLogTrade} disabled={isAggregate || offline}
          title={offline ? 'Logging a trade needs a connection' : isAggregate ? 'Pick a specific account to log a trade' : undefined}
        >
          + Log Trade
        </button>
      </div>
    </div>
  );
}
