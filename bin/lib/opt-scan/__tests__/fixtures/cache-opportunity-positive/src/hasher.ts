/**
 * Positive fixture: cached pure computation with identity, ownership, and
 * invalidation evidence.
 */
export class Hasher {
  private cache = new Map<string, string>();

  computeHash(input: string): string {
    const key = `hash:${input}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const digest = this.expensiveHash(input);
    this.cache.set(key, digest);
    return digest;
  }

  invalidateCache(): void {
    this.cache.clear();
  }

  private expensiveHash(input: string): string {
    return input.split("").reverse().join("");
  }
}
