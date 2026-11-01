import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import BacktestCard from '../components/BacktestCard';
import BacktestDetail from '../components/BacktestDetail';
import BacktestForm from '../components/BacktestForm';
import E8Prep from '../components/E8Prep';
import PeriodCalendar from '../components/PeriodCalendar';
import { useBacktests } from '../hooks/useBacktests';
import { useOffline } from '../hooks/useOffline';
import { STATUS_META, monthLabel } from '../utils/backtestView';

const FILTERS = [['all', 'All'], ['validated', 'Validated'], ['review', 'To review'], ['rejected', 'Rejected']];

export default function Backtests({ user, onSignOut, view, onViewChange }) {
  const offline = useOffline();
  const bt = useBacktests();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(null); // null | { initial }

  // The sidebar's "All backtests" link.
  useEffect(() => {
    const home = () => { setSelectedId(null); window.scrollTo?.(0, 0); document.querySelector('.main')?.scrollTo?.({ top: 0 }); };
    window.addEventListener('ledgr:bt-home', home);
    return () => window.removeEventListener('ledgr:bt-home', home);
  }, []);

  const counts = useMemo(() => {
    const c = { all: bt.items.length, validated: 0, review: 0, rejected: 0 };
    bt.items.forEach((i) => { if (c[i.status] !== undefined) c[i.status]++; });
    return c;
  }, [bt.items]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bt.items.filter((i) => {
      if (filter !== 'all' && i.status !== filter) return false;
      if (!q) return true;
      return [i.title, i.strategy, i.symbol, i.timeframe, monthLabel(i.month), i.month, ...(i.tags || [])].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [bt.items, filter, query]);

  const pooled = useMemo(() => {
    const m = {};
    bt.items.forEach((i) => Object.entries(i.daily || {}).forEach(([d, x]) => { const c = m[d] || (m[d] = { v: 0, count: 0 }); c.v += x.v; c.count += x.count; }));
    return m;
  }, [bt.items]);
  const index = shown.findIndex((i) => i.id === selectedId);
  const selected = index >= 0 ? shown[index] : bt.items.find((i) => i.id === selectedId) || null;

  async function save(payload) {
    if (form.initial) await bt.update(form.initial.id, payload);
    else { const made = await bt.create(payload); setSelectedId(made.id); }
    setForm(null);
  }

  return (
    <div className="app">
      <Sidebar user={user} onSignOut={onSignOut} view={view} onViewChange={onViewChange} />
      <main className="main">
        {selected ? (
          <BacktestDetail
            key={selected.id} item={selected} rules={bt.prep.rules}
            index={Math.max(index, 0)} total={index >= 0 ? shown.length : 1}
            onBack={() => setSelectedId(null)}
            onPrev={index > 0 ? () => setSelectedId(shown[index - 1].id) : null}
            onNext={index >= 0 && index < shown.length - 1 ? () => setSelectedId(shown[index + 1].id) : null}
            onEdit={(item) => setForm({ initial: item })}
            onNewFrom={(item) => { setSelectedId(null); setForm({ initial: null, template: item }); }}
            fetchOne={bt.fetchOne} update={bt.update} remove={bt.remove}
            addEntry={bt.addEntry} editEntry={bt.editEntry} removeEntry={bt.removeEntry}
          />
        ) : (
          <div className="bt-home">
            <div className="bt-library">
              <div className="bt-head">
                <h1>Backtest sessions</h1>
                <button type="button" className="btn btn-ghost glass" onClick={() => setForm({ initial: null })} disabled={offline} title={offline ? 'Adding a session needs a connection' : undefined}>+ New session</button>
              </div>
              <input
                type="search" className="bt-search" placeholder="Search name, strategy, month, tag" aria-label="Search sessions"
                value={query} onChange={(e) => setQuery(e.target.value)}
              />
              <div className="bt-filters" role="group" aria-label="Filter by status">
                {FILTERS.map(([key, label]) => (
                  <button key={key} type="button" className={`bt-filter${filter === key ? ' active' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                    {label} <span>{counts[key]}</span>
                  </button>
                ))}
              </div>

              {bt.loading ? (
                <p className="bt-empty">Loading…</p>
              ) : shown.length === 0 ? (
                <div className="bt-empty glass panel">
                  {bt.items.length === 0
                    ? <>No sessions yet. Start one with <b>+ New session</b> — name it, pick the month, set your prop firm rules, then log each trade as an entry.</>
                    : <>Nothing matches{query ? ` “${query}”` : ''}{filter !== 'all' ? ` in ${STATUS_META[filter].label}` : ''}.</>}
                </div>
              ) : (
                <div className="bt-grid">
                  {shown.map((i) => <BacktestCard key={i.id} item={i} rules={i.rules || bt.prep.rules} onOpen={setSelectedId} />)}
                </div>
              )}
              {bt.items.length > 0 && <PeriodCalendar daily={pooled} title="P&L calendar — all sessions" />}
            </div>
            <aside className="bt-side">
              <E8Prep items={bt.items} prep={bt.prep} savePrep={bt.savePrep} />
            </aside>
          </div>
        )}
      </main>
      {form && <BacktestForm initial={form.initial} template={form.template} defaultRules={bt.prep.rules} onSave={save} onClose={() => setForm(null)} />}
    </div>
  );
}
