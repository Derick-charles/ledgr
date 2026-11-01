// Every milestone here is earned through discipline and consistency —
// journaling streaks, checklist/tier performance, and clean execution.
// Deliberately no P&L or account-size milestones: those live in the
// Certificates wall instead, as proof of outcomes, not as targets to chase.
//
// Each definition's evaluate(context) returns:
//   { achieved: boolean, progress: 0-1, progressLabel: string }
// context = { streak, trades, tierHistory, todayTier, entry, journalHistory }
//
// `trades` and `tierHistory` here are ALL-TIME (every trade/day ever
// logged), not scoped to the currently-viewed calendar month — a milestone
// is a permanent achievement, so it should never lose progress just
// because the month changed. See useMistakeTags/useTrades/useJournalHistory
// called with no date-range args in Dashboard.jsx.

function longestCleanTradeStreak(trades) {
  // trades are newest-first; walk from the most recent backwards
  let streak = 0;
  for (const t of trades) {
    if (!t.mistake) streak++;
    else break;
  }
  return streak;
}

function countTier(tierHistory, todayTier, tier) {
  const historyCount = tierHistory.filter((h) => h.tierComputed === tier).length;
  return historyCount + (todayTier === tier ? 1 : 0);
}

export const MILESTONE_CATEGORIES = [
  {
    label: 'Consistency',
    hint: 'Showing up every day, whether the day was good or bad',
    milestones: [
      {
        id: 'streak-7', title: '7-Day Journaling Streak', description: 'Logged a journal entry 7 days in a row.',
        evaluate: ({ streak }) => ({ achieved: streak >= 7, progress: Math.min(streak / 7, 1), progressLabel: `${Math.min(streak, 7)}/7 days` }),
      },
      {
        id: 'streak-30', title: '30-Day Journaling Streak', description: 'A full month of daily reflection, no gaps.',
        evaluate: ({ streak }) => ({ achieved: streak >= 30, progress: Math.min(streak / 30, 1), progressLabel: `${Math.min(streak, 30)}/30 days` }),
      },
      {
        id: 'streak-100', title: '100-Day Journaling Streak', description: 'Journaling has become identity, not a task.',
        evaluate: ({ streak }) => ({ achieved: streak >= 100, progress: Math.min(streak / 100, 1), progressLabel: `${Math.min(streak, 100)}/100 days` }),
      },
    ],
  },
  {
    label: 'Discipline',
    hint: 'How well you follow your own checklist, day after day',
    milestones: [
      {
        id: 'first-s-tier', title: 'First S-Tier Day', description: 'Every item on your trade checklist, checked.',
        evaluate: ({ tierHistory, todayTier }) => {
          const count = countTier(tierHistory, todayTier, 'S');
          return { achieved: count >= 1, progress: Math.min(count, 1), progressLabel: count >= 1 ? 'Achieved' : '0/1' };
        },
      },
      {
        id: 'five-s-tier', title: '5 S-Tier Days', description: 'Elite execution isn\u2019t a one-off for you anymore.',
        evaluate: ({ tierHistory, todayTier }) => {
          const count = countTier(tierHistory, todayTier, 'S');
          return { achieved: count >= 5, progress: Math.min(count / 5, 1), progressLabel: `${Math.min(count, 5)}/5 days` };
        },
      },
      {
        id: 'no-c-tier-week', title: 'No C-Tier Days in Recent History', description: 'Kept your process out of "poor" territory across your tracked days.',
        evaluate: ({ tierHistory, todayTier }) => {
          const all = [...tierHistory.map((h) => h.tierComputed), todayTier].filter(Boolean);
          const hasC = all.includes('C');
          return { achieved: all.length > 0 && !hasC, progress: hasC ? 0 : 1, progressLabel: hasC ? 'Broken by a C-tier day' : 'Clean' };
        },
      },
    ],
  },
  {
    label: 'Clean Trading',
    hint: 'Execution without the recurring mistakes that cost you money',
    milestones: [
      {
        id: 'first-clean-trade', title: 'First Mistake-Free Trade', description: 'One trade, executed exactly as planned.',
        evaluate: ({ trades }) => {
          const has = trades.some((t) => !t.mistake);
          return { achieved: has, progress: has ? 1 : 0, progressLabel: has ? 'Achieved' : '0/1' };
        },
      },
      {
        id: 'clean-streak-5', title: '5 Trades in a Row, No Mistakes', description: 'Your most recent trades, back to back, clean.',
        evaluate: ({ trades }) => {
          const streak = longestCleanTradeStreak(trades);
          return { achieved: streak >= 5, progress: Math.min(streak / 5, 1), progressLabel: `${Math.min(streak, 5)}/5 trades` };
        },
      },
      {
        id: 'no-revenge-trades', title: 'No Revenge Trades Logged', description: 'Every loss, across your whole history, was accepted — never chased.',
        evaluate: ({ trades }) => {
          const count = trades.filter((t) => t.mistake === 'Revenge Trade').length;
          return { achieved: count === 0, progress: count === 0 ? 1 : 0, progressLabel: count === 0 ? 'Clean' : `${count} logged` };
        },
      },
    ],
  },
  {
    label: 'Reflection',
    hint: 'The habit of actually writing things down, not just trading',
    milestones: [
      {
        id: 'first-affirmation', title: 'First Affirmations Entry', description: 'Wrote intentions down before the trading day.',
        evaluate: ({ entry, journalHistory }) => {
          const hasToday = (entry?.affirmationsSelected?.length || 0) > 0 || !!entry?.affirmationsNotes;
          // journalHistory here is the all-time *summary* (dateId/tierComputed/
          // hasAffirmations only) — `hasAffirmations` covers that shape, the
          // other two cover a full entry object, so either shape works.
          const hasAny = hasToday || (journalHistory || []).some(
            (e) => e.hasAffirmations || (e.affirmationsSelected?.length || 0) > 0 || !!e.affirmationsNotes
          );
          return { achieved: hasAny, progress: hasAny ? 1 : 0, progressLabel: hasAny ? 'Achieved' : '0/1' };
        },
      },
      {
        id: 'first-planned-trade', title: 'First Planned Entry Logged', description: 'Wrote the plan before taking the trade, not after.',
        evaluate: ({ trades }) => {
          const has = trades.some((t) => t.planned);
          return { achieved: has, progress: has ? 1 : 0, progressLabel: has ? 'Achieved' : '0/1' };
        },
      },
    ],
  },
];

export function evaluateAllMilestones(context) {
  return MILESTONE_CATEGORIES.map((cat) => ({
    ...cat,
    milestones: cat.milestones.map((m) => ({ ...m, result: m.evaluate(context) })),
  }));
}
