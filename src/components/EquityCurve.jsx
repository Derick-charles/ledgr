import { useMemo, useState } from 'react';
import { fmtMoney } from '../utils/stats';
import InfoTooltip from './InfoTooltip';

const W = 640, H = 160, padL = 46, padT = 14, padB = 14, padR = 16;

export default function EquityCurve({ trades, periodLabel = 'this month' }) {
  const [mode, setMode] = useState('line');

  // Cumulative equity, oldest first
  const points = useMemo(() => {
    const sorted = [...trades].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return aTime - bTime;
    });
    let running = 0;
    return sorted.map((t) => { running += t.pnl; return running; });
  }, [trades]);

  const data = points.length ? [0, ...points] : [0];
  const rawMax = Math.max(...data);
  const rawMin = Math.min(0, ...data); // baseline is always included, even if every trade is a win
  const maxV = rawMax > 0 ? rawMax * 1.12 : 1;
  const minV = rawMin < 0 ? rawMin * 1.12 : 0; // symmetric 12% headroom below the lowest dip, same as above the peak
  const stepX = (W - padL - padR) / Math.max(data.length - 1, 1);
  const scaleY = (H - padT - padB) / (maxV - minV);
  const xAt = (i) => padL + i * stepX;
  const yAt = (v) => padT + (maxV - v) * scaleY;
  const baselineY = yAt(0);
  const total = data[data.length - 1];

  const linePath = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ');
  const areaPath = `M${xAt(0)},${baselineY} ${linePath} L${xAt(data.length - 1)},${baselineY} Z`;
  const lastX = xAt(data.length - 1), lastY = yAt(total);

  return (
    <div className="glass panel equity-figure" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <h2>Equity Curve <InfoTooltip text="Cumulative P&L across every trade you've logged in the month shown. Toggle between line and bar view." /></h2>
        <div className="equity-head-actions">
          <div className="equity-readout-inline">
            <span className="amt mono">{fmtMoney(total)}</span>
            <span className="lbl">cumulative</span>
          </div>
          <div className="chart-toggle">
            <button className={mode === 'line' ? 'active' : ''} onClick={() => setMode('line')}>Line</button>
            <button className={mode === 'bar' ? 'active' : ''} onClick={() => setMode('bar')}>Bar</button>
          </div>
        </div>
      </div>

      <div className="equity-chart-frame">
        <svg
          viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none"
          style={{ overflow: 'hidden', marginTop: 6, display: 'block' }}
        >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--positive)' }} stopOpacity="0.28" /><stop offset="100%" style={{ stopColor: 'var(--positive)' }} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="barPosGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--positive)' }} /><stop offset="100%" style={{ stopColor: 'var(--positive)' }} stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="barNegGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--negative)' }} stopOpacity="0.55" /><stop offset="100%" style={{ stopColor: 'var(--negative)' }} stopOpacity="0.15" />
          </linearGradient>
          <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {[0, maxV * 0.5, maxV].map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={yAt(v)} y2={yAt(v)} style={{ stroke: 'rgba(var(--tint-rgb),0.08)' }} strokeWidth="1" />
            <text x={0} y={yAt(v) + 3} fontSize="9.5" style={{ fill: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              ${Math.round(v).toLocaleString()}
            </text>
          </g>
        ))}
        <line x1={padL} x2={W - padR} y1={baselineY} y2={baselineY} style={{ stroke: 'rgba(var(--tint-rgb),0.18)' }} strokeWidth="1" />

        {mode === 'bar' ? (
          data.map((v, i) => {
            const barWidth = stepX * 0.5;
            const barY = yAt(v);
            const isUp = i === 0 ? true : v >= data[i - 1];
            return (
              <rect
                key={i}
                x={xAt(i) - barWidth / 2} y={Math.min(barY, baselineY)}
                width={barWidth} height={Math.max(Math.abs(baselineY - barY), 2)} rx={3}
                fill={isUp ? 'url(#barPosGrad)' : 'url(#barNegGrad)'}
                filter={i === data.length - 1 ? 'url(#glow)' : undefined}
              />
            );
          })
        ) : (
          <>
            <path d={areaPath} fill="url(#areaGrad)" />
            <path d={linePath} fill="none" style={{ stroke: 'var(--positive)' }} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" filter="url(#glow)" />
            <circle cx={lastX} cy={lastY} r={4.5} style={{ fill: 'var(--positive)' }} filter="url(#glow)" />
          </>
        )}
      </svg>
      </div>
    </div>
  );
}
