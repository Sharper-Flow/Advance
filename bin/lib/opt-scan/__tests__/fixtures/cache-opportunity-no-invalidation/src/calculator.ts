/**
 * Negative fixture: cache ownership and identity exist, but there is no
 * invalidation policy. The detector must reject this case.
 */
export class Calculator {
  private cache = new Map<string, number>();

  compute(x: number): number {
    const key = `square:${x}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const result = x * x;
    this.cache.set(key, result);
    return result;
  }
}
