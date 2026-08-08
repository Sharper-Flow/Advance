/**
 * Directory names pruned from every scanner traversal.
 *
 * Keep scanner-owned implementation details out of this declaration so
 * arch-scan and opt-scan cannot silently drift apart.
 */
export const SCAN_IGNORE_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".cache",
  ".turbo",
  ".adv",
  "__tests__",
  "__mocks__",
]);
