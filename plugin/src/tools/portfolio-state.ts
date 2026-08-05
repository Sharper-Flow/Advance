/**
 * Bounded portfolio state for adv_change_create results
 * (rq-createPortfolioLine01 / AC4).
 *
 * Change creation is where reflexive change creation happens. Surfacing the
 * portfolio at that moment — non-terminal count, never-terminal share, and a
 * soft nudge above threshold — gives the creating agent the state it needs to
 * consider the durable middle tier (`adv_backlog_add`) instead of minting yet
 * another never-terminal change.
 *
 * The read is deadline-capped (DDC3) and degrades to an explicit
 * `{ available: false }` marker on any failure: creation is never blocked by
 * the portfolio read (R4). Host-side tool code, not workflow code — timers
 * are allowed here.
 */

import type { ChangePortfolioState } from "../storage/store-types";

export type { ChangePortfolioState };

/** Deadline for the portfolio read inside create (DDC3 — well under the 8s store budget). */
export const PORTFOLIO_READ_DEADLINE_MS = 2000;
/** Minimum non-terminal count before the nudge can fire (tiny portfolios stay quiet). */
export const PORTFOLIO_NUDGE_MIN_OPEN = 5;
/** Never-terminal share above which the nudge fires. */
export const PORTFOLIO_NUDGE_SHARE = 0.5;

interface PortfolioRow {
  status?: string;
  lifecycleState?: string;
}

interface PortfolioListResult {
  changes: PortfolioRow[];
}

/** Minimal store surface needed for the portfolio read. */
export interface PortfolioStore {
  changes: {
    listSummary?: (criteria: {
      includeArchived: boolean;
      includeClosed: boolean;
    }) => Promise<PortfolioListResult>;
    list: (criteria: {
      includeArchived: boolean;
      includeClosed: boolean;
    }) => Promise<PortfolioListResult>;
  };
}

function isTerminalRow(row: PortfolioRow): boolean {
  if (row.lifecycleState !== undefined) {
    return row.lifecycleState !== "open";
  }
  return row.status === "archived" || row.status === "closed";
}

/**
 * Pure derivation: non-terminal count + never-terminal share + soft nudge.
 * The nudge fires only above BOTH thresholds so small portfolios stay quiet.
 */
export function derivePortfolioState(
  rows: readonly PortfolioRow[],
): ChangePortfolioState {
  const total = rows.length;
  const open = rows.filter((row) => !isTerminalRow(row)).length;
  const share = total === 0 ? 0 : open / total;
  const state: ChangePortfolioState = {
    available: true,
    open_count: open,
    never_terminal_share: share,
  };
  if (open >= PORTFOLIO_NUDGE_MIN_OPEN && share > PORTFOLIO_NUDGE_SHARE) {
    state.nudge =
      "consider adv_backlog_add — portfolio has a high never-terminal share";
  }
  return state;
}

/**
 * Deadline-capped portfolio read. Any throw, non-resolution within the
 * deadline, or malformed result degrades to `{ available: false }` — the
 * marker is explicit so callers can distinguish "no stats" from "zero".
 */
export async function readPortfolioState(
  store: PortfolioStore,
  deadlineMs: number = PORTFOLIO_READ_DEADLINE_MS,
): Promise<ChangePortfolioState> {
  try {
    const criteria = { includeArchived: true, includeClosed: true };
    const read = store.changes.listSummary
      ? store.changes.listSummary(criteria)
      : store.changes.list(criteria);
    const result = await Promise.race([
      read,
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), deadlineMs);
      }),
    ]);
    if (!result || !Array.isArray(result.changes)) {
      return { available: false };
    }
    return derivePortfolioState(result.changes);
  } catch {
    return { available: false };
  }
}
