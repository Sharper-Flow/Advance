/**
 * adv CLI — arch-scan debt-marker helper
 *
 * Pure scanner for TODO/FIXME/HACK/XXX comments within a bounded window
 * around a finding location. Parses deadline dates attached to those markers
 * and classifies whether deadlines are expired relative to `now`.
 *
 * Consumed by Rule 3 (report-only-header-with-deferred-todo) and future
 * deferred-state capability-consistency rules.
 *
 * Contract highlights:
 *   - Pure: no fs/network/async, no side effects.
 *   - All regexes are bounded alternations / fixed quantifiers — no nested
 *     quantifiers, no catastrophic backtracking risk.
 *   - Multiple deadlines: the chronologically earliest deadline across all
 *     in-window markers wins. This is the most conservative choice: any past
 *     deadline surfaces as expired.
 *   - Date comparison is calendar-date (both sides normalized to UTC midnight),
 *     so a deadline is "expired" only once its calendar day has passed.
 */

/** A single captured debt marker. */
export interface DebtMarkerMatch {
  readonly match: string;
  /** Rest of the source line after the matched marker word. */
  readonly comment: string;
  /** 1-indexed source line number. */
  readonly line: number;
}

/** Result of scanning a window of source for debt markers. */
export interface DebtMarkerResult {
  /** True iff at least one marker was found in the window. */
  readonly present: boolean;
  /** True iff the chosen deadline is before `now` (calendar-date). */
  readonly expired: boolean;
  /** ISO date string (`YYYY-MM-DD`) of the earliest deadline, or null. */
  readonly deadline: string | null;
  /** All markers found within the window, in source order. */
  readonly markers: readonly DebtMarkerMatch[];
}

/** Options for {@link scanDebtMarkers}. */
export interface DebtMarkerOptions {
  /** Lines of slack on each side of `aroundLine` (default: 20). */
  readonly windowLines?: number;
  /** Injectable clock for testing (default: `new Date()`). */
  readonly now?: Date;
}

const DEFAULT_WINDOW_LINES = 20;

// Case-sensitive per ADV convention. Bounded alternation among four literals;
// no nested quantifiers.
const MARKER_RE = /\b(TODO|FIXME|HACK|XXX)\b/g;

// Deadline patterns, checked in priority order per marker comment.
// All bounded: fixed {4,2,2} digit runs, no nested quantifiers.
const AT_DATE_RE = /@(\d{4}-\d{2}-\d{2})\b/;
const BY_DATE_RE = /\bby\s+(\d{4}-\d{2}-\d{2})\b/i;
const DEADLINE_COLON_RE = /\bdeadline:\s*(\d{4}-\d{2}-\d{2})\b/i;
const BARE_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;
// Bare-date fallback only fires when the comment also carries a deadline word.
const KEYWORD_RE = /\b(deadline|expire|due|by)\b/i;

/**
 * Parse the first deadline date from a marker comment, in priority order:
 *   1. `@YYYY-MM-DD`
 *   2. `by YYYY-MM-DD`
 *   3. `deadline: YYYY-MM-DD`
 *   4. bare `YYYY-MM-DD` — only if the comment also contains a deadline keyword
 *
 * @returns the ISO date string (`YYYY-MM-DD`) or `null`.
 */
function parseDeadline(comment: string): string | null {
  const at = AT_DATE_RE.exec(comment);
  if (at) return at[1];

  const by = BY_DATE_RE.exec(comment);
  if (by) return by[1];

  const deadlineColon = DEADLINE_COLON_RE.exec(comment);
  if (deadlineColon) return deadlineColon[1];

  if (KEYWORD_RE.test(comment)) {
    const bare = BARE_DATE_RE.exec(comment);
    if (bare) return bare[1];
  }

  return null;
}

const DATE_SHAPE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Convert a `YYYY-MM-DD` string to a UTC-midnight `Date`.
 * Returns `null` for invalid calendar dates (the regex already bounds the
 * digit shape; this rejects impossible month/day combinations).
 */
function toDate(iso: string): Date | null {
  const parts = DATE_SHAPE_RE.exec(iso);
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Normalize a Date to its UTC-midnight millisecond timestamp. */
function toUtcMidnightMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Scans source content for TODO/FIXME/HACK/XXX comments within a window around
 * the given line, parses any deadline dates, and classifies whether deadlines
 * are expired relative to `now`.
 *
 * The window is inclusive: `[aroundLine - windowLines, aroundLine + windowLines]`.
 * Line numbers are 1-indexed; markers outside the window are ignored.
 *
 * When multiple markers carry deadlines, the chronologically earliest deadline
 * wins for both `deadline` and `expired`. Comparison is calendar-date
 * (UTC midnight on both sides).
 *
 * @param source     full source file content (multiline string)
 * @param aroundLine 1-indexed line number to scan around
 * @param options    window + now override
 */
export function scanDebtMarkers(
  source: string,
  aroundLine: number,
  options?: DebtMarkerOptions,
): DebtMarkerResult {
  const windowLines = options?.windowLines ?? DEFAULT_WINDOW_LINES;
  const now = options?.now ?? new Date();
  const nowMs = toUtcMidnightMs(now);

  if (!source) {
    return { present: false, expired: false, deadline: null, markers: [] };
  }

  const lines = source.split(/\r?\n/);
  const lower = aroundLine - windowLines;
  const upper = aroundLine + windowLines;

  const markers: DebtMarkerMatch[] = [];
  let earliestDeadline: string | null = null;
  let earliestMs: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    if (lineNo < lower || lineNo > upper) continue;

    const text = lines[i];
    // MARKER_RE is /g and reused across lines — reset before each scan.
    MARKER_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MARKER_RE.exec(text)) !== null) {
      const markerWord = m[1];
      const comment = text.slice(m.index + m[0].length);
      markers.push({ match: markerWord, comment, line: lineNo });

      const deadline = parseDeadline(comment);
      if (!deadline) continue;
      const d = toDate(deadline);
      if (!d) continue;
      const ms = d.getTime();
      if (earliestMs === null || ms < earliestMs) {
        earliestMs = ms;
        earliestDeadline = deadline;
      }
    }
  }

  return {
    present: markers.length > 0,
    expired: earliestMs !== null && earliestMs < nowMs,
    deadline: earliestDeadline,
    markers,
  };
}
