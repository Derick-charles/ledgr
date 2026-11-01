import { useMemo, useState } from 'react';
import { fmtMoney, fmtR, tradeR } from '../utils/stats';
import { EMPTY_FILTERS, downloadCSV, filterTrades, tradesToCSV } from '../utils/csv';
import InfoTooltip from './InfoTooltip';

export default function RecentTrades({ trades, mistakeColorMap = {}, accountNameById, showAccount = false, periodLabel = 'this month', scope = 'month', onScopeChange, exportName = 'trades', onEdit, onDelete }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const hasActions = !!(onEdit || onDelete);
  const colCount = showAccount ? 11 : 10;

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const filtersActive = Object.values(filters).some(Boolean);
  const visible = useMemo(() => filterTrades(trades, filters), [trades, filters]);
  const visibleNet = visible.filter((t) => t.side !== 'missed').reduce((s, t) => s + t.pnl, 0);

  // Dropdown options come from what's actually in the list.
  const poiOptions = useMemo(() => [...new Set(trades.map((t) => t.poi).filter(Boolean))].sort(), [trades]);
  const mistakeOptions = useMemo(() => [...new Set(trades.map((t) => t.mistake).filter(Boolean))].sort(), [trades]);

  const tagOptions = useMemo(() => [...new Set(trades.flatMap((t) => t.tags || []))].sort(), [trades]);

  function handleExport() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCSV(`ledgr-${exportName}-${stamp}.csv`, tradesToCSV(visible, { accountNameById }));
  }

  function handleDelete(t) {
    if (window.confirm(`Delete the ${t.sym} trade from ${t.date}? This also removes any attached images/clips and can't be undone.`)) {
      onDelete(t);
    }
  }

  return (
    <div className="glass panel" style={{ marginBottom: 14 }}>
      <div className="panel-head">
        <h2>Recent Trades <InfoTooltip text="Trades for the month shown (or your whole history — switch with the toggle), including mistake tags and planned-vs-actual notes. Search and filter, then export what you see to CSV." /></h2>
        <div className="equity-head-actions">
          {onScopeChange && (
            <div className="chart-toggle">
              <button className={scope === 'month' ? 'active' : ''} onClick={() => onScopeChange('month')}>Month</button>
              <button className={scope === 'all' ? 'active' : ''} onClick={() => onScopeChange('all')}>All time</button>
            </div>
          )}
          <button className="btn btn-ghost month-nav-today" onClick={handleExport} disabled={visible.length === 0} title="Download the trades shown as a CSV file">Export CSV</button>
        </div>
      </div>

      <div className="filter-bar">
        <input type="search" className="filter-input" placeholder="Search symbol, POI, mistake, notes…" value={filters.q} onChange={setFilter('q')} aria-label="Search trades" />
        <select className="filter-select" value={filters.side} onChange={setFilter('side')} aria-label="Filter by side">
          <option value="">All sides</option><option value="long">Long</option><option value="short">Short</option>
          <option value="breakeven">Breakeven</option><option value="missed">Missed</option>
        </select>
        <select className="filter-select" value={filters.result} onChange={setFilter('result')} aria-label="Filter by result">
          <option value="">Wins &amp; losses</option><option value="win">Wins</option><option value="loss">Losses</option>
        </select>
        <select className="filter-select" value={filters.poi} onChange={setFilter('poi')} aria-label="Filter by POI">
          <option value="">All POIs</option><option value="__none">No POI</option>
          {poiOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="filter-select" value={filters.mistake} onChange={setFilter('mistake')} aria-label="Filter by mistake">
          <option value="">All mistakes</option><option value="__clean">Clean trades</option>
          {mistakeOptions.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {tagOptions.length > 0 && (
          <select className="filter-select" value={filters.tag} onChange={setFilter('tag')} aria-label="Filter by tag">
            <option value="">All tags</option>
            {tagOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <select className="filter-select" value={filters.rating} onChange={setFilter('rating')} aria-label="Filter by rating">
          <option value="">All ratings</option><option value="high">High rated (4–5★)</option><option value="low">Low rated (1–2★)</option><option value="unrated">Not rated</option>
        </select>
        {trades.some((t) => t.incomplete) && (
          <select className="filter-select" value={filters.incomplete} onChange={setFilter('incomplete')} aria-label="Filter by completeness">
            <option value="">All trades</option><option value="yes">Needs details</option>
          </select>
        )}
        {filtersActive && <button className="btn btn-ghost month-nav-today" onClick={() => setFilters(EMPTY_FILTERS)}>Clear</button>}
      </div>
      {filtersActive && (
        <div className="filter-summary mono">
          Showing {visible.length} of {trades.length} · net {fmtMoney(visibleNet)}
        </div>
      )}

      <div className="scroll-hint">← Swipe to see full row →</div>
      <div className="trades-split">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>{showAccount && <th>Account</th>}<th>Symbol</th><th>Side</th><th>Mistake</th>
              <th className="num hide-md">Entry</th><th className="num hide-md">Exit</th><th className="num hide-md">Size</th>
              <th className="num">P&amp;L</th><th className="num">R</th><th>Review</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={colCount} style={{ color: 'var(--text-tertiary)', padding: '18px 10px' }}>
                {trades.length > 0 ? 'No trades match these filters.' : (scope === 'all' ? 'No trades logged yet.' : `No trades logged ${periodLabel === 'this month' ? 'yet this month' : periodLabel}.`)}
              </td></tr>
            )}
            {visible.map((t) => {
              const color = t.mistake ? (mistakeColorMap[t.mistake] || 'var(--negative)') : null;
              return (
                <tr key={t.id}>
                  <td className="mono">{t.date}{t.time && <span className="row-time">{t.time}</span>}</td>
                  {showAccount && <td>{accountNameById?.[t.accountId] || '—'}</td>}
                  <td className="sym">{t.sym}{t.incomplete && <span className="needs-details" title="Quick-logged — open Edit to add prices, notes and screenshots">needs details</span>}</td>
                  <td><span className={`side ${t.side}`}>{t.side.toUpperCase()}</span></td>
                  <td>
                    {t.mistake ? (
                      <span className="mistake-tag" style={{ color, background: `${color}1A`, borderColor: `${color}55` }}>
                        {t.mistake}
                      </span>
                    ) : (
                      <span className="mistake-tag clean">Clean</span>
                    )}
                  </td>
                  <td className="num hide-md">{t.entry ? `$${t.entry}` : '—'}</td>
                  <td className="num hide-md">{t.exit ? `$${t.exit}` : '—'}</td>
                  <td className="num hide-md">{t.size || '—'}</td>
                  <td className={`num pnl ${t.pnl >= 0 ? 'pos' : 'neg'}`}>{t.side === 'missed' ? '—' : fmtMoney(t.pnl)}</td>
                  <td className="num mono">{fmtR(tradeR(t))}</td>
                  <td className="review-cell">
                    {(t.ratingExec || t.ratingDisc) ? (
                      <span className="rating-pill" title={`Execution ${t.ratingExec || '–'}/5 · Discipline ${t.ratingDisc || '–'}/5`}>
                        E {t.ratingExec ? `${t.ratingExec}★` : '–'} · D {t.ratingDisc ? `${t.ratingDisc}★` : '–'}
                      </span>
                    ) : <span className="review-none">—</span>}
                    {(t.tags || []).length > 0 && <span className="trade-tags" title={t.tags.join(', ')}>{t.tags.slice(0, 2).map((x) => <span className="trade-tag" key={x}>{x}</span>)}{t.tags.length > 2 && <span className="trade-tag">+{t.tags.length - 2}</span>}</span>}
                    {t.notes && <span className="has-notes" title={t.notes}>note</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasActions && visible.length > 0 && (
        <div className="row-actions-col" aria-label="Trade actions">
          <div className="row-actions-head" />
          {visible.map((t) => (
            <div className="row-actions-cell" key={t.id}>
                      {onEdit && (
                        <button className="row-edit-btn" title="Edit trade" onClick={() => onEdit(t)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                      )}
                      {onDelete && <button className="row-delete-btn" title="Delete trade" onClick={() => handleDelete(t)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>}
                    </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
