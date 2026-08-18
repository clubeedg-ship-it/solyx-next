// A pure, testable formatter for Sidebar.tsx's per-row timestamp. Kept
// completely separate from any component so the four boundary cases (just
// now / minutes / hours / days) can be pinned down without rendering
// anything — see relativeTime.test.ts.

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Formats `date` relative to `now` (defaults to the actual current time) as
 * a short label for a cramped sidebar row: "just now", "5m", "3h", "2d".
 * Deliberately coarse — this is a glance-at-the-list affordance, not a
 * precise timestamp, so it rounds down to whole units rather than showing
 * e.g. "1.5h".
 *
 * A `date` at or after `now` (clock skew between this browser and
 * whichever backend timestamp it came from, or `now` being read a moment
 * before `date` was captured) reads as "just now" rather than a negative
 * duration.
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));

  if (diffSeconds < MINUTE) return "just now";
  if (diffSeconds < HOUR) return `${Math.floor(diffSeconds / MINUTE)}m`;
  if (diffSeconds < DAY) return `${Math.floor(diffSeconds / HOUR)}h`;
  return `${Math.floor(diffSeconds / DAY)}d`;
}
