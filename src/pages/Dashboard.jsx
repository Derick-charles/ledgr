import { useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import AccountSwitcher from '../components/AccountSwitcher';
import RevengeAlert from '../components/RevengeAlert';
import BackupReminder from '../components/BackupReminder';
import StatsRow from '../components/StatsRow';
import EquityCurve from '../components/EquityCurve';
import TradeStreaks from '../components/TradeStreaks';
import DailyPnLCalendar from '../components/DailyPnLCalendar';
import RecentTrades from '../components/RecentTrades';
import MistakeFrequency from '../components/MistakeFrequency';
import POIPerformance from '../components/POIPerformance';
import TimingPerformance from '../components/TimingPerformance';
import RatingPerformance from '../components/RatingPerformance';
import MindsetPerformance from '../components/MindsetPerformance';
import TradeReview from '../components/TradeReview';
import WeeklyLessons from '../components/WeeklyLessons';
import Affirmations from '../components/Affirmations';
import DailyJournal from '../components/DailyJournal';
import LogTradeModal from '../components/LogTradeModal';
import DayDetailModal from '../components/DayDetailModal';
import MonthNav from '../components/MonthNav';
import ChallengeTracker from '../components/ChallengeTracker';
import MilestonesPanel from '../components/MilestonesPanel';
import CertificatesWall from '../components/CertificatesWall';
import { useAccounts, ALL_ACCOUNTS } from '../hooks/useAccounts';
import { useTrades } from '../hooks/useTrades';
import { useJournalEntry } from '../hooks/useJournalEntry';
import { useJournalHistory } from '../hooks/useJournalHistory';
import { useJournalSummary } from '../hooks/useJournalSummary';
import { useTradeSummary } from '../hooks/useTradeSummary';
import { useCertificates } from '../hooks/useCertificates';
import { useChecklistTemplate } from '../hooks/useChecklistTemplate';
import { useMistakeTags } from '../hooks/useMistakeTags';
import { usePOITags } from '../hooks/usePOITags';
import { toDateId } from '../utils/dateHelpers';
import { tierFromChecklist } from '../utils/stats';
import { reportError } from '../utils/errorBus';
import { useOffline } from '../hooks/useOffline';

export default function Dashboard({ user, onSignOut, journal, onJournalChange }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null); // trade being edited, or null when logging a new one
  const [selectedDay, setSelectedDay] = useState(null);
  const today = new Date();
  const todayId = toDateId(today);
  const [journalDateId, setJournalDateId] = useState(todayId); // which day Daily Journal/Affirmations are browsing
  // Which month the dashboard is showing — today's month by default, and
  // movable with the month switcher. Stats, equity curve, calendar, trades
  // list and the month's reports all follow it.
  const [view, setView] = useState({ year: today.getFullYear(), monthIndex: today.getMonth() });
  const viewPrefix = `${view.year}-${String(view.monthIndex + 1).padStart(2, '0')}`;
  const monthStartId = `${viewPrefix}-01`;
  // "-31" isn't always a real date, but string comparison still works correctly
  // for the range queries below since it's always >= every real day in the month.
  const monthEndId = `${viewPrefix}-31`;
  const isCurrentMonth = view.year === today.getFullYear() && view.monthIndex === today.getMonth();
  const monthLabel = new Date(view.year, view.monthIndex, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  // Wording for panels that say "this month" — switches to the month's name
  // when browsing a different one, so nothing mislabels old data.
  const periodLabel = isCurrentMonth ? 'this month' : `in ${monthLabel}`;

  const accounts = useAccounts();
  const { activeAccountId } = accounts;
  const isAggregate = activeAccountId === ALL_ACCOUNTS;
  // null while "All Accounts" is selected, or while accounts are still loading —
  // every per-account-only hook below treats a null/falsy accountId as "nothing
  // to fetch yet" and just keeps its default empty state, which is exactly the
  // right behavior for sections that get hidden in aggregate mode anyway.
  const perAccountId = isAggregate ? null : activeAccountId;

  const activeAccount = accounts.accounts.find((a) => a.id === activeAccountId);

  const accountNameById = useMemo(
    () => Object.fromEntries(accounts.accounts.map((a) => [a.id, a.name])),
    [accounts.accounts]
  );

  // Main dashboard trades — this is the one place activeAccountId (which
  // may legitimately be 'all') gets passed directly, since it's the only
  // hook that actually supports the combined view.
  const { trades, addTrade, updateTrade, deleteTrade } = useTrades(activeAccountId, monthStartId, monthEndId);
  // "Missed" trades (a setup seen but never taken) have no real P&L outcome
  // to measure — they're excluded from win rate, profit factor, streaks,
  // and milestones, but still fully visible in Recent Trades, the calendar,
  // and Mistake Frequency, since reviewing *why* you missed one is exactly
  // the point of logging it. Breakeven trades stay included everywhere —
  // they were genuinely taken, they just netted to zero.
  const executedTrades = useMemo(() => trades.filter((t) => t.side !== 'missed'), [trades]);
  // The day currently being browsed in Daily Journal/Affirmations — defaults
  // to today, but can be navigated to any past (or future) day to review or
  // edit that day's entry specifically.
  const { entry, saveEntry, saveError } = useJournalEntry(perAccountId, journalDateId);
  // Separate from the above on purpose: Milestones' "today's live tier" must
  // always reflect literal today's checklist, regardless of which day the
  // journal is currently browsing.
  const { entry: todayEntry } = useJournalEntry(perAccountId, todayId);
  // The viewed month's entries — feeds the day-detail popup and Mindset vs.
  // Performance, so they match whichever month is on screen.
  const { entries: journalHistory } = useJournalHistory(perAccountId, monthStartId, monthEndId);
  // One small all-time request feeds the streak, tier history and the
  // affirmations milestone (was: all-time entries + a separate streak request).
  const { items: allJournalHistory, streak } = useJournalSummary(perAccountId);
  const { certificates, addCertificate, removeCertificate } = useCertificates(perAccountId);
  const checklistTemplate = useChecklistTemplate(perAccountId);
  const mistakeTags = useMistakeTags(perAccountId);
  const poiTags = usePOITags(perAccountId);

  // All-time trades/journal history for this account (no month filter) —
  // milestones are permanent achievements, so they shouldn't lose progress
  // just because the calendar page moved into a new month. Not meaningful
  // in aggregate mode (perAccountId is null there), so these just stay empty.
  const { trades: allTrades, reload: reloadAllTrades } = useTradeSummary(perAccountId);

  // The trades list can show the viewed month or your whole history (this
  // works in the combined All Accounts view too). Only fetched once you ask
  // for "All time" — passing no account makes the hook skip loading.
  const [tradeScope, setTradeScope] = useState('month');
  const { trades: historyTrades, reload: reloadHistoryTrades } = useTrades(tradeScope === 'all' ? activeAccountId : null);
  const listedTrades = tradeScope === 'all' ? historyTrades : trades;
  const executedAllTrades = useMemo(() => allTrades.filter((t) => t.side !== 'missed'), [allTrades]);

  // Last 6 days before today, for the Trade Quality trend sparkline. Drawn
  // from all-time history (not the viewed month) so it stays put while
  // browsing other months.
  const tierHistory = useMemo(() => {
    return allJournalHistory.filter((e) => e.dateId < todayId).slice(-6);
  }, [allJournalHistory, todayId]);

  // Every day before today, unbounded — for milestone evaluation only.
  const milestoneTierHistory = useMemo(() => {
    return allJournalHistory.filter((e) => e.dateId < todayId);
  }, [allJournalHistory, todayId]);

  // Today's live tier, derived from the checklist — same logic TradeChecklist
  // uses internally, needed here too since Milestones checks it against history.
  // Checklist state is keyed by item LABEL (not position), so it stays valid
  // even as items are added/removed from the template. Uses todayEntry (not
  // the browsable `entry`) so this never shifts just because Daily Journal
  // is currently showing a different day.
  const todayTier = useMemo(() => {
    const checklistState = todayEntry.checklist || {};
    const checkedCount = checklistTemplate.items.filter((item) => !!checklistState[item.label]).length;
    return tierFromChecklist(checkedCount, checklistTemplate.items.length).tier;
  }, [todayEntry.checklist, checklistTemplate.items]);

  // Extra tags already used on earlier trades — offered as quick picks.
  const knownTags = useMemo(() => [...new Set(allTrades.flatMap((t) => t.tags || []))].sort(), [allTrades]);

  function openNewTrade() { setEditingTrade(null); setModalOpen(true); }
  function openEditTrade(trade) { setSelectedDay(null); setEditingTrade(trade); setModalOpen(true); }
  function closeTradeModal() { setModalOpen(false); setEditingTrade(null); }

  async function handleSaveTrade(payload) {
    if (editingTrade) await updateTrade(editingTrade, payload);
    else await addTrade(payload);
    // The all-time list (POI Performance, milestones) is its own fetch —
    // refresh it too so an edit or new trade shows up there immediately.
    reloadAllTrades();
    reloadHistoryTrades();
    closeTradeModal();
  }

  async function handleDeleteTrade(trade) {
    try {
      await deleteTrade(trade);
    } catch (e) {
      // Used to fail silently, leaving the trade on screen with no
      // explanation. Network/server failures are already bannered by api.js.
      reportError(`Couldn't delete that trade: ${e.message}`);
      return;
    }
    reloadAllTrades();
    reloadHistoryTrades();
  }

  // Editing needs that account's own mistake/POI tag lists, which aren't
  // loaded in the combined "All Accounts" view — so edit is per-account only.
  const offline = useOffline();
  // Offline = read-only: no edit/delete buttons on trades.
  const canEdit = !isAggregate && !offline;

  return (
    <div className="app">
      <Sidebar user={user} onSignOut={onSignOut} view={journal} onViewChange={onJournalChange} />
      <main className="main">
        <TopBar
          dateId={todayId} tradeCount={trades.length} periodLabel={periodLabel} onLogTrade={openNewTrade}
          streak={streak} isAggregate={isAggregate}
          accountSwitcher={<AccountSwitcher {...accounts} />}
        />

        {!isAggregate && (
          <BackupReminder
            account={accounts.accounts.find((a) => a.id === activeAccountId)}
            hasTrades={allTrades.length > 0}
          />
        )}

        {!isAggregate && activeAccount?.challenge && (
          <ChallengeTracker account={activeAccount} trades={allTrades} saveChallenge={accounts.saveChallenge} />
        )}

        <MonthNav
          year={view.year} monthIndex={view.monthIndex} isCurrentMonth={isCurrentMonth}
          onChange={(year, monthIndex) => setView({ year, monthIndex })}
          onToday={() => setView({ year: today.getFullYear(), monthIndex: today.getMonth() })}
        />

        <RevengeAlert trades={trades} periodLabel={periodLabel} />

        <div id="section-overview">
          <StatsRow trades={executedTrades} periodLabel={periodLabel} />
          <div className="split-2col">
            <div>
              <EquityCurve trades={executedTrades} periodLabel={periodLabel} />
              <TradeStreaks trades={executedTrades} />
            </div>
            <div id="section-calendar">
              <DailyPnLCalendar
                trades={trades}
                allTrades={executedAllTrades}
                onMonthPick={(year, monthIndex) => setView({ year, monthIndex })}
                year={view.year}
                monthIndex={view.monthIndex}
                onDayClick={setSelectedDay}
              />
            </div>
          </div>
        </div>

        <div className="trades-block">
          <div id="section-trades">
            <RecentTrades
              trades={listedTrades} mistakeColorMap={mistakeTags.colorMap}
              showAccount={isAggregate} accountNameById={accountNameById}
              periodLabel={periodLabel}
              scope={tradeScope} onScopeChange={setTradeScope}
              exportName={tradeScope === 'all' ? 'trades-all-time' : `trades-${viewPrefix}`}
              onEdit={canEdit ? openEditTrade : undefined}
              onDelete={offline ? undefined : handleDeleteTrade}
            />
          </div>
          <div id="section-reports" className="reports-flow">
            {isAggregate ? (
              <div className="glass panel aggregate-notice">
                Mistake Frequency, POI Performance, and Mindset vs. Performance need one specific account selected —
                each account keeps its own tags and journal history.
              </div>
            ) : (
              <>
                <MistakeFrequency trades={trades} mistakeColorMap={mistakeTags.colorMap} periodLabel={periodLabel} />
                <POIPerformance trades={executedAllTrades} poiColorMap={poiTags.colorMap} />
                <TimingPerformance trades={executedAllTrades} />
                <RatingPerformance trades={executedAllTrades} />
                <MindsetPerformance trades={trades} journalEntries={journalHistory} />
              </>
            )}
          </div>
        </div>

        <div className="split-notebook" id="section-notebook">
          <div>
            <TradeReview trades={trades} periodLabel={periodLabel} />
            {!isAggregate && <WeeklyLessons trades={trades} accountId={perAccountId} />}
          </div>
          <div>
            {!isAggregate && <Affirmations dateId={journalDateId} entry={entry} saveEntry={saveEntry} saveError={saveError} />}
          </div>
        </div>

        <div id="section-journal">
          {isAggregate ? (
            <div className="glass panel aggregate-notice">
              The Daily Journal is tracked per account — pick a specific account above to write today's entry.
            </div>
          ) : (
            <DailyJournal
              dateId={journalDateId} onDateChange={setJournalDateId}
              entry={entry} saveEntry={saveEntry} saveError={saveError}
              tierHistory={tierHistory} checklistTemplate={checklistTemplate} poiTags={poiTags}
            />
          )}
        </div>

        <div id="section-achievements">
          {isAggregate ? (
            <div className="glass panel aggregate-notice">
              Milestones and Certificates are tracked per account — pick a specific account above to view them.
            </div>
          ) : (
            <>
              <MilestonesPanel
                streak={streak} trades={executedAllTrades} tierHistory={milestoneTierHistory}
                todayTier={todayTier} entry={todayEntry} journalHistory={allJournalHistory}
              />
              <CertificatesWall certificates={certificates} onAdd={addCertificate} onRemove={removeCertificate} />
            </>
          )}
        </div>
      </main>

      {/* Mounted only while open so every open starts from a fresh form
          (blank for a new trade, pre-filled for an edit). */}
      {modalOpen && (
        <LogTradeModal
          open
          trade={editingTrade}
          onClose={closeTradeModal}
          onSubmit={handleSaveTrade}
          mistakeTags={mistakeTags}
          poiTags={poiTags}
          knownTags={knownTags}
        />
      )}

      {selectedDay && (
        <DayDetailModal
          dateId={selectedDay}
          trades={trades}
          journalHistory={journalHistory}
          onClose={() => setSelectedDay(null)}
          mistakeColorMap={mistakeTags.colorMap}
          onEdit={canEdit ? openEditTrade : undefined}
          onDelete={offline ? undefined : handleDeleteTrade}
          onOpenJournal={(d) => {
            setJournalDateId(d);
            setSelectedDay(null);
            requestAnimationFrame(() => document.getElementById('section-journal')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
          }}
        />
      )}
    </div>
  );
}
