/**
 * Positive fixture: chained collection transformations.
 */
export function summarize(items: { price: number }[]): number {
  return items
    .map((i) => i.price)
    .filter((p) => p > 0)
    .reduce((a, b) => a + b, 0);
}
