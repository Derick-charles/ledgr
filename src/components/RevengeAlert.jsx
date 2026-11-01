import { useState } from 'react';
import { fmtMoney } from '../utils/stats';

export default function RevengeAlert({ trades, periodLabel = 'this month' }) {
  const [dismissed, setDismissed] = useState(false);
  const revengeTrades = trades.filter((t) => t.mistake === 'Revenge Trade');

  if (dismissed || revengeTrades.length === 0) return null;

  const losses = revengeTrades.filter((t) => t.pnl < 0).length;
  const totalPnl = revengeTrades.reduce((s, t) => s + t.pnl, 0);
  const lossRate = Math.round((losses / revengeTrades.length) * 100);
  const dateList = revengeTrades.map((t) => `${t.date} (${t.sym})`).join(', ');

  return (
    <div className="alert-card">
      <div className="alert-icon">⚠</div>
      <div className="alert-body">
        <div className="alert-title">Revenge Trading Check</div>
        <div className="alert-text">
          {revengeTrades.length} trade{revengeTrades.length !== 1 ? 's' : ''} tagged <strong>Revenge Trade</strong> {periodLabel} — {dateList}.
          {' '}Loss rate on these: <strong>{lossRate}%</strong>, net <strong>{fmtMoney(totalPnl)}</strong>.
          {' '}Consider a mandatory cooldown before re-entering right after a loss.
        </div>
      </div>
      <button className="alert-dismiss" onClick={() => setDismissed(true)} title="Dismiss">×</button>
    </div>
  );
}
