/**
 * Negative fixture: a single collection transformation, not a chain.
 */
export function names(users: { name: string }[]): string[] {
  return users.map((u) => u.name);
}
