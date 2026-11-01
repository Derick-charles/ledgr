// Maps each sidebar nav label to the DOM id of the section it should
// scroll to. Kept in one place so Sidebar.jsx and Dashboard.jsx can't drift
// out of sync with each other.
export const SECTION_IDS = {
  Dashboard: 'section-overview',
  'Trade Log': 'section-trades',
  'Daily Journal': 'section-journal',
  Notebook: 'section-notebook',
  Reports: 'section-reports',
  Calendar: 'section-calendar',
  Achievements: 'section-achievements',
};

export function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
