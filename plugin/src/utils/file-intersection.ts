/**
 * Pure file-path intersection helper.
 *
 * Extracted from `plugin/src/validator/file-overlap.ts:91-99` so both the
 * worktree file-overlap validator (which applies its own archived-skip
 * policy) and the resume-freshness resolver (which scans archived entries
 * without skipping) can share the same primitive.
 *
 * Returns the intersection of `planned` and `peer`, deduped, preserving
 * `planned` order. Pure: no side effects, no I/O, no deps.
 */
export function intersectFileLists(
  planned: readonly string[],
  peer: readonly string[],
): string[] {
  const peerSet = new Set(peer);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of planned) {
    if (peerSet.has(path) && !seen.has(path)) {
      seen.add(path);
      result.push(path);
    }
  }
  return result;
}
