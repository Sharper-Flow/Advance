/**
 * Mechanical inventory of allowed raw `saveChange` callers.
 *
 * Design D3 requires that every mutable active change-projection write route
 * through the storage-owned conditional commit primitive
 * (`commitChangeProjection`). Raw `saveChange` access is therefore restricted
 * to:
 *
 *   1. The conditional commit primitive itself.
 *   2. Disk-store internal methods that are part of the disk-only backend
 *      contract and are overridden by the Temporal store in production.
 *   3. Terminal / import / bootstrap paths where no active workflow exists.
 *   4. Tests that intentionally exercise the raw primitive.
 *
 * The test companion scans the source tree for every `saveChange(` call site and
 * verifies it appears in this inventory with a rationale. Any new raw caller
 * must either be added here (with justification) or be migrated to
 * `commitChangeProjection` / the typed mutation coordinator.
 */

export interface SaveChangeAllowListEntry {
  /** Source file path relative to the repo root. */
  file: string;
  /** Optional narrower context (function name). Null means any call in the file. */
  context: string | null;
  /** Inventory category. */
  category:
    | "projection_transaction"
    | "disk_store_internal"
    | "terminal_archive"
    | "terminal_without_bundle"
    | "import_bootstrap"
    | "test_raw_primitive"
    | "inventory_reference";
  /** Why this caller is exempt from the active-projection commit boundary. */
  rationale: string;
}

export const SAVE_CHANGE_ALLOW_LIST: SaveChangeAllowListEntry[] = [
  {
    file: "plugin/src/storage/change-projection-transaction.ts",
    context: null,
    category: "projection_transaction",
    rationale:
      "The storage-owned conditional commit primitive is the single authoritative active-projection writer; it wraps saveChange with lock/revision/CAS/readback/postcondition.",
  },
  {
    file: "plugin/src/storage/json.ts",
    context: "saveChange",
    category: "projection_transaction",
    rationale:
      "Definition of the low-level saveChange helper; actual call sites must appear in this inventory.",
  },
  {
    file: "plugin/src/storage/store-disk.ts",
    context: null,
    category: "disk_store_internal",
    rationale:
      "Disk-only store backend contract. Every method here is overridden by the Temporal store in production; active-projection production writes route through commitChangeProjection.",
  },
  {
    file: "plugin/src/tools/change.ts",
    context: "saveRecoveredArchiveConvergence",
    category: "terminal_archive",
    rationale:
      "Terminal archive convergence after shipped proof and archive bundle validation; writes the final archived projection and performs explicit read-after-write verification.",
  },
  {
    file: "plugin/src/tools/_recovery-writers.ts",
    context: "persistTerminalProjection",
    category: "terminal_without_bundle",
    rationale:
      "Sub-agent report fallback for closed/terminal-without-bundle changes. Active-projection sub-agent reports route through commitChangeProjection; this branch only handles the no-archive-bundle terminal case.",
  },
  {
    file: "plugin/src/storage/change-projection-transaction.test.ts",
    context: null,
    category: "test_raw_primitive",
    rationale:
      "RED-phase test intentionally exercises raw saveCall to reproduce the lost-update defect that commitChangeProjection fixes.",
  },
  {
    file: "plugin/src/storage/change-summary-shard.test.ts",
    context: null,
    category: "test_raw_primitive",
    rationale:
      "RED/GREEN tests for the per-change summary shard wrapper seed fixtures directly via raw saveChange.",
  },
  {
    file: "plugin/src/storage/json.test.ts",
    context: null,
    category: "test_raw_primitive",
    rationale: "Unit tests for the low-level saveChange JSON helper itself.",
  },
  {
    file: "plugin/src/storage/store-disk.test.ts",
    context: null,
    category: "test_raw_primitive",
    rationale: "Unit tests for the disk-only store backend contract.",
  },
  {
    file: "plugin/src/storage/save-change-allow-list.ts",
    context: null,
    category: "inventory_reference",
    rationale:
      "Inventory meta-reference; contains prose references to saveChange but no call sites.",
  },
  {
    file: "plugin/src/storage/save-change-allow-list.test.ts",
    context: null,
    category: "inventory_reference",
    rationale:
      "Inventory test scans call sites; its own source may contain the string for documentation.",
  },
];

/**
 * Tests scan callers as `(file, contexts)` pairs. A null context in the allow
 * list matches any call in the file.
 */
export function isAllowedSaveChangeCaller(
  file: string,
  contexts: string[],
): { allowed: boolean; entry?: SaveChangeAllowListEntry } {
  for (const entry of SAVE_CHANGE_ALLOW_LIST) {
    if (entry.file !== file) continue;
    if (entry.context === null) return { allowed: true, entry };
    for (const context of contexts) {
      if (context.includes(entry.context)) return { allowed: true, entry };
    }
  }
  return { allowed: false };
}
