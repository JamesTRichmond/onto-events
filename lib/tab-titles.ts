/**
 * The four visible tab names, in one place so the tab bar, each screen's
 * heading and any copy that points at a tab cannot drift apart.
 * "Going" became "Plans" (James, 2026-11-02): it shared a stem with
 * "Places To Go". Route names (`going`) stay so links and code are stable.
 */
export const TAB_TITLES = {
  index: 'Things To Do',
  going: 'Plans',
  places: 'Places To Go',
  account: 'Account',
} as const;
