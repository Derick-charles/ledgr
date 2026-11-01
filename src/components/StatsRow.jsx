import { computeStats, fmtMoney, fmtR } from '../utils/stats';
import { formatShort } from '../utils/dateHelpers';

export default function StatsRow({ trades, periodLabel = 'this month' }) {
  const stats = computeStats(trades);
  const ringCirc = 2 * Math.PI * 24;
  const ringOffset = ringCirc * (1 - stats.winRate / 100);
  const pfPct = Math.min((stats.profitFactor / 3) * 100, 100);

  return (
    <div className="stats-row">
      <div className="glass stat-card">
        <div className="stat-icon pos">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="2" x2="12" y2="22" /><path d="M17 6.5c0-1.9-2-3-5-3s-5 1.4-5 3.2c0 4 10 2 10 6 0 2-2.2 3.3-5 3.3s-5-1.2-5-3.3" />
          </svg>
        </div>
        <div className="stat-label">Net P&amp;L</div>
        <div className={`stat-value mono ${stats.netPnl >= 0 ? 'pos' : ''}`}>{fmtMoney(stats.netPnl)}</div>
        <div className="stat-sub">{stats.wins}W · {stats.losses}L {periodLabel}</div>
      </div>

      <div className="glass stat-card ring-card">
        <div className="ring-figure">
          <svg width="58" height="58" viewBox="0 0 58 58">
            <circle cx="29" cy="29" r="24" fill="none" style={{ stroke: 'rgba(var(--tint-rgb),0.10)' }} strokeWidth="5" />
            <circle
              cx="29" cy="29" r="24" fill="none" stroke="url(#ringGrad)" strokeWidth="5" strokeLinecap="round"
              style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', filter: 'drop-shadow(0 0 6px rgba(var(--cyan-rgb),0.35))' }}
              strokeDasharray={ringCirc} strokeDashoffset={ringOffset}
            />
            <defs>
              <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" style={{ stopColor: 'var(--cyan)' }} /><stop offset="100%" style={{ stopColor: 'var(--violet)' }} />
              </linearGradient>
            </defs>
          </svg>
          <div className="ring-value">{stats.winRate}%</div>
        </div>
        <div className="ring-text">
          <div className="stat-label" style={{ marginBottom: 5 }}>Win Rate</div>
          <div className="stat-sub" style={{ marginTop: 0 }}>{stats.wins}W · {stats.losses}L</div>
        </div>
      </div>

      <div className="glass stat-card">
        <div className="stat-label">Profit Factor</div>
        <div className="stat-value brand mono">{stats.profitFactor || '—'}</div>
        <div className="stat-bar-track"><div className="stat-bar-fill" style={{ width: `${pfPct}%` }} /></div>
        <div className="stat-bar-scale"><span>0</span><span>1.0</span><span>3.0</span></div>
      </div>

      <div className="glass stat-card">
        <div className="stat-icon brand">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 16 10 10 14 14 20 6" /><polyline points="14 6 20 6 20 12" />
          </svg>
        </div>
        <div className="stat-label">Avg R-Multiple</div>
        <div className="stat-value mono">{fmtR(stats.avgR)}</div>
        <div className="stat-sub">
          {stats.rCount === 0
            ? 'Add $ risked to a trade to track R'
            : `across ${stats.rCount} of ${trades.length} trade${trades.length !== 1 ? 's' : ''} with $ risked`}
        </div>
      </div>

      <div className="glass stat-card">
        <div className="stat-label">Best Day</div>
        <div className="stat-value pos mono">{stats.bestDay ? fmtMoney(stats.bestDay.pnl) : '—'}</div>
        <div className="stat-sub">{stats.bestDay ? formatShort(stats.bestDay.date) : 'No trades yet'}</div>
      </div>
    </div>
  );
}
