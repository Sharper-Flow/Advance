/**
 * Bounded optional-enrichment wrapper for bin/adv read commands.
 *
 * Primary CLI output (the status table, the epic list) must never wait on an
 * advisory enrichment. Awaiting an enrichment inside the same `Promise.all` as
 * the primary read makes the slowest member gate the whole command — which is
 * how a resume projection with zero polling workers hung `adv status` for
 * N x timeout.
 *
 * This wrapper converts "enrichment might never finish" into "enrichment is
 * either present or explicitly absent, within a fixed budget". It never throws
 * and never resolves later than `budgetMs`.
 *
 * Note the asymmetry with `withTimeout`: that helper REJECTS on expiry, which
 * is correct for a primary read that must fail closed. Enrichment must degrade
 * instead, so this helper resolves with a typed outcome.
 *
 * rq-statusCliWorkerFree01 (fixWorkerDependentResume) — AC1, AC2, AC4, AC5
 */

/** Result of attempting an advisory enrichment within a fixed time budget. */
export type EnrichmentOutcome<T> =
  | { settled: true; value: T }
  | { settled: false; reason: string };

/** Reason prefix used when the budget expired rather than the work failing. */
export const ENRICHMENT_TIMEOUT_REASON = "enrichment exceeded budget";

/**
 * Resolve `promise` if it settles within `budgetMs`, otherwise resolve an
 * explicit unsettled outcome.
 *
 * Guarantees:
 * - never rejects (a rejected input becomes `{ settled: false }`)
 * - never resolves later than `budgetMs`
 * - distinguishes timeout from failure via `reason`
 * - clears its timer, so a fast result does not hold the process open
 */
export async function settleWithinBudget<T>(
  promise: Promise<T>,
  budgetMs: number,
): Promise<EnrichmentOutcome<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const budget = new Promise<EnrichmentOutcome<T>>((resolve) => {
    timer = setTimeout(() => {
      resolve({
        settled: false,
        reason: `${ENRICHMENT_TIMEOUT_REASON} of ${budgetMs}ms`,
      });
    }, budgetMs);
  });

  const attempted = promise.then(
    (value): EnrichmentOutcome<T> => ({ settled: true, value }),
    (err): EnrichmentOutcome<T> => ({
      settled: false,
      reason: err instanceof Error ? err.message : String(err),
    }),
  );

  try {
    return await Promise.race([attempted, budget]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
