import { useEffect, useMemo, useState } from 'react';
import { clickable } from '../utils/a11y.js';
import { buildMonthGrid, toDateId } from '../utils/dateHelpers';
import { fmtMoney } from '../utils/stats';
import InfoTooltip from './InfoTooltip';
import MonthTiles from './MonthTiles';

function bucket(v) {
  const abs = Math.abs(v);
  const tier = abs > 500 ? 3 : abs > 200 ? 2 : 1;
  return (v > 0 ? 'pos-' : 'neg-') + tier;
}

export default function DailyPnLCalendar({ trades, allTrades = [], year, monthIndex, onDayClick, onMonthPick }) {
  const [mode, setMode] = useState('days');
  const [yr, setYr] = useState(year);
  useEffect(() => setYr(year), [year]);
  const byMonth = useMemo(() => {
    const m = {};
    allTrades.forEach((t) => { if (!t.date) return; const k = t.date.slice(0, 7); (m[k] = m[k] || { v: 0, count: 0 }); m[k].v += t.pnl || 0; m[k].count++; });
    return m;
  }, [allTrades]);
  const today = toDateId();
  const weeks = useMemo(() => buildMonthGrid(year, monthIndex), [year, monthIndex]);

  // Aggregate trades into { dateId: { pnl, count } }
  const byDay = useMemo(() => {
    const map = {};
    trades.forEach((t) => {
      if (!map[t.date]) map[t.date] = { pnl: 0, count: 0 };
      map[t.date].pnl += t.pnl;
      map[t.date].count += 1;
    });
    return map;
  }, [trades]);

  const monthTotal = useMemo(() => trades.reduce((s, t) => s + t.pnl, 0), [trades]);

  return (
    <div className="glass panel" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <h2>{mode === 'days' ? 'Daily' : 'Monthly'} P&amp;L <InfoTooltip text="Days: one box per trading day — click any day to see its trades and journal. Months: the whole year at a glance — click a month to jump to its days." /></h2>
        <div className="cal-toggle" role="group" aria-label="Calendar view">
          <button type="button" className={mode === 'days' ? 'active' : ''} aria-pressed={mode === 'days'} onClick={() => setMode('days')}>Days</button>
          <button type="button" className={mode === 'months' ? 'active' : ''} aria-pressed={mode === 'months'} onClick={() => setMode('months')}>Months</button>
        </div>
      </div>
      {mode === 'months' ? (
        <MonthTiles year={yr} byMonth={byMonth} fmt={fmtMoney} onYear={(n) => setYr((y) => y + n)} onPick={(y, m) => { onMonthPick && onMonthPick(y, m); setMode('days'); }} />
      ) : (<>
      <div className="scroll-hint">← Swipe to see full week + totals →</div>
      <div className="cal-scroll">
        <div className="cal-weekdays">
          <span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span>
          <span className="week-label">WEEK</span>
        </div>
        <div className="cal-grid" key={`${year}-${monthIndex}`}>
          {weeks.map((week, wi) => {
            let weekTotal = 0;
            let weekHasTrading = false;

            const dayCells = week.map((cell, di) => {
              if (!cell) return <div key={di} className="cal-cell empty" />;
              const { dateId, dayNum } = cell;
              const openDay = () => onDayClick && onDayClick(dateId);

              const isPast = dateId < today;
              const isToday = dateId === today;
              const dayData = byDay[dateId];

              if (!dayData) {
                if (isPast) {
                  weekHasTrading = true;
                  return (
                    <div key={di} className={`cal-cell missed clickable${isToday ? ' today' : ''}`} {...clickable(openDay, { label: `${dateId}: no entry, missed day` })}>
                      <div className="cell-top"><span className="d">{dayNum}</span></div>
                      <span className="v">Missed</span>
                    </div>
                  );
                }
                // Future day — nothing to show yet, not clickable
                return (
                  <div key={di} className={`cal-cell${isToday ? ' today' : ''}`}>
                    <div className="cell-top"><span className="d">{dayNum}</span></div>
                    <span className="status" style={{ color: 'var(--text-tertiary)' }}>—</span>
                  </div>
                );
              }

              weekHasTrading = true;
              const { pnl, count } = dayData;
              if (pnl === 0) {
                return (
                  <div key={di} className={`cal-cell breakeven clickable${isToday ? ' today' : ''}`} {...clickable(openDay, { label: `${dateId}: ${count} trade${count !== 1 ? 's' : ''}, breakeven` })}>
                    <div className="cell-top">
                      <span className="d">{dayNum}</span>
                      <span className="trades">{count} trade{count !== 1 ? 's' : ''}</span>
                    </div>
                    <span className="v">$0.00</span>
                  </div>
                );
              }
              weekTotal += pnl;
              return (
                <div key={di} className={`cal-cell clickable ${bucket(pnl)}${isToday ? ' today' : ''}`} {...clickable(openDay, { label: `${dateId}: ${count} trade${count !== 1 ? 's' : ''}, ${fmtMoney(pnl)}` })}>
                  <div className="cell-top">
                    <span className="d">{dayNum}</span>
                    <span className="trades">{count} trade{count !== 1 ? 's' : ''}</span>
                  </div>
                  <span className="v">{fmtMoney(pnl)}</span>
                </div>
              );
            });

            return (
              <div key={wi} style={{ display: 'contents' }}>
                {dayCells}
                <div className={`cal-cell week-total${weekHasTrading ? '' : ' empty-week'}`}>
                  <span className="wk-label">Week Total</span>
                  <span className="wk-value">{weekHasTrading ? fmtMoney(weekTotal) : '—'}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="cal-footer-row">
          <div className="cal-footer-label">Month Total</div>
          <div className="cal-footer-total">
            <span className="wk-label">Month Total</span>
            <span className="wk-value">{fmtMoney(monthTotal)}</span>
          </div>
        </div>
      </div>

      <div className="cal-legend">
        <span><span className="sw" style={{ background: 'rgba(var(--positive-rgb),0.35)' }}></span>Win</span>
        <span><span className="sw" style={{ background: 'rgba(var(--negative-rgb),0.35)' }}></span>Loss</span>
        <span><span className="sw" style={{ background: 'rgba(var(--neutral-rgb),0.35)' }}></span>Breakeven</span>
        <span><span className="sw" style={{ background: 'rgba(var(--amber-rgb),0.35)' }}></span>Missed</span>
      </div>
      </>)}
    </div>
  );
}
