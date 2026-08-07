/**
 * Bounded-concurrency async mapping.
 *
 * Used by filesystem-heavy maintenance scans such as store-cleanup.
 * that must probe hundreds of store directories within the fixed tool timeout.
 * A serial `for…of await` loop over N stores performs N × per-store I/O ops
 * sequentially and blows the budget; an unbounded `Promise.all` over N stores
 * opens N descriptors at once and risks EMFILE. This helper bounds the number
 * of in-flight tasks while preserving input order in the results array.
 */

/**
 * Default in-flight concurrency for per-store maintenance-scan probing.
 * Chosen to saturate filesystem I/O while staying well below typical OS
 * file-descriptor limits (DONT1: never unbounded).
 */
export const STORE_SCAN_CONCURRENCY = 16;

/**
 * Map `items` through async `fn` with at most `concurrency` invocations in
 * flight at any time. Results are returned in the same order as `items`
 * (position `i` holds the result of `fn(items[i], i)`), independent of
 * completion order.
 *
 * - `concurrency` is clamped to `[1, items.length]`; non-finite or `< 1`
 *   values fall back to a single worker.
 * - Empty input resolves to `[]` without invoking `fn`.
 * - A rejection from any `fn` invocation rejects the returned promise with the
 *   first such error (other already-started tasks are not cancelled).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = items.length;
  const results = new Array<R>(n);
  if (n === 0) return results;

  const limit = Number.isFinite(concurrency)
    ? Math.max(1, Math.min(Math.floor(concurrency), n))
    : 1;

  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= n) return;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
