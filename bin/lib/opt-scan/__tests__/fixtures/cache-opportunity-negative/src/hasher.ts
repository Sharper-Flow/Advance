/**
 * Negative fixture: pure computation without cache identity, ownership, or
 * invalidation evidence. The detector must reject this case.
 */
export function computeHash(input: string): string {
  return input.split("").reverse().join("");
}
