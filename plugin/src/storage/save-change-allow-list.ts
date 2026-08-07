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
 *      contract and are implemented by the disk store.
 *   3. Terminal / import / bootstrap paths where no active workflow exists.
 *   4. Tests that intentionally exercise the raw primitive.
 *
 * The test companion scans the source tree for every `saveChange(` call site and
 * verifies it appears in this inventory with a rationale. Any new raw caller
 * must either be added here (with justification) or be migrated to
 * `commitChangeProjection` / the typed mutation coordinator.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import ts from "typescript";

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
      "Disk store backend contract. Active-projection writes route through commitChangeProjection.",
  },
  {
    file: "plugin/src/tools/change.ts",
    context: "saveRecoveredArchiveConvergence",
    category: "terminal_archive",
    rationale:
      "Terminal archive convergence after shipped proof and archive bundle validation; writes the final archived projection and performs explicit read-after-write verification.",
  },
  {
    file: "plugin/src/tools/change/archive-gate.ts",
    context: "writeActiveReleaseGateProjection",
    category: "terminal_archive",
    rationale:
      "Create-when-missing fallback for the poll-confirmed release-gate projection during Phase 9 finalization. commitChangeProjection is attempted first and owns every update path; this branch runs only when that commit reports the active projection absent, which the conditional-commit primitive cannot create. Followed by an explicit loadChange read-after-write verification.",
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
    file: "plugin/src/storage/reconcile-action-summary.test.ts",
    context: null,
    category: "test_raw_primitive",
    rationale:
      "Summary-reconcile action executor tests seed canonical change fixtures directly via raw saveChange, mirroring the change-summary-shard.test.ts precedent.",
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
  {
    file: "plugin/src/storage/read-command-boundary.test.ts",
    context: null,
    category: "inventory_reference",
    rationale:
      "Scanner self-reference: the read/command boundary test contains a documentation snippet of the saveChange scanner rule, not a live call site.",
  },
];

export interface SaveChangeCallSite {
  /** Source file path relative to the repo root. */
  file: string;
  /** 1-indexed line number of the `saveChange` identifier. */
  line: number;
  /** 1-indexed column number of the `saveChange` identifier. */
  column: number;
  /** Enclosing function/method/arrow-function names for context narrowing. */
  contexts: string[];
  /** The full source line containing the call. */
  content: string;
}

/**
 * Walk ancestor nodes to collect the names of enclosing functions, methods, and
 * arrow-function variable declarations. Used by both guard tests to preserve the
 * existing `(file, contexts)` allow-list matching.
 */
export function enclosingContextNames(node: ts.Node): string[] {
  const names: string[] = [];
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      names.push(current.name.text);
    } else if (ts.isMethodDeclaration(current) && current.name) {
      names.push(current.name.getText().replace(/["']/g, ""));
    } else if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      current.parent
    ) {
      const parent = current.parent;
      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        names.push(parent.name.text);
      } else if (
        (ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) &&
        parent.name
      ) {
        names.push(parent.name.getText().replace(/["']/g, ""));
      }
    }
    current = current.parent;
  }
  return names;
}

function createSaveChangeSourceFile(
  fileName: string,
  text: string,
): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
}

export function collectSaveChangeCallSitesFromSource(
  source: ts.SourceFile,
  file: string,
): SaveChangeCallSite[] {
  const calls: SaveChangeCallSite[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && callee.text === "saveChange") {
        const start = node.getStart(source);
        const { line, character } = source.getLineAndCharacterOfPosition(start);
        const lines = source.text.split("\n");
        calls.push({
          file,
          line: line + 1,
          column: character + 1,
          contexts: enclosingContextNames(node),
          content: lines[line] ?? "",
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return calls;
}

export function collectSaveChangeCallSitesFromText(
  text: string,
  file = "fixture.ts",
): SaveChangeCallSite[] {
  const source = createSaveChangeSourceFile(file, text);
  return collectSaveChangeCallSitesFromSource(source, file);
}

/** Source subtree scanned for raw `saveChange` call sites. */
const SAVE_CHANGE_SCAN_ROOT = "plugin/src";

/**
 * Cheap content prefilter applied before TypeScript parsing. A file that never
 * mentions the symbol cannot contain a call to it, so it is skipped without
 * being parsed — which also keeps intentionally malformed fixtures out of the
 * AST path.
 */
const SAVE_CHANGE_PREFILTER = "saveChange";

/**
 * Recursively collect `.ts` files using pure Node.js.
 *
 * Deliberately dependency-free: ripgrep is not installed on GitHub Actions
 * runners, so shelling out to `rg` fails there with `spawnSync rg ENOENT`.
 * Same correctness, zero external deps.
 */
async function collectTypeScriptFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    // Scan root may not exist (e.g. a fixture repo without plugin/src).
    return results;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectTypeScriptFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Bounded read fan-out. The scan root holds ~900 files / ~11 MB, so reading
 * them one await at a time dominates the runtime; batching keeps the guard
 * well inside the default test timeout without raising it.
 */
const SAVE_CHANGE_READ_CONCURRENCY = 32;

export async function findExecutableSaveChangeCalls(
  repoRoot: string,
): Promise<SaveChangeCallSite[]> {
  const scanRoot = resolve(repoRoot, SAVE_CHANGE_SCAN_ROOT);
  const candidates = (await collectTypeScriptFiles(scanRoot)).sort();

  const calls: SaveChangeCallSite[] = [];
  for (let i = 0; i < candidates.length; i += SAVE_CHANGE_READ_CONCURRENCY) {
    const batch = candidates.slice(i, i + SAVE_CHANGE_READ_CONCURRENCY);
    const texts = await Promise.all(
      batch.map((file) => readFile(file, "utf-8")),
    );
    for (let j = 0; j < batch.length; j += 1) {
      const text = texts[j];
      if (!text.includes(SAVE_CHANGE_PREFILTER)) continue;
      const absoluteFile = batch[j];
      const source = createSaveChangeSourceFile(absoluteFile, text);
      const relFile = relative(repoRoot, absoluteFile).replace(/\\/g, "/");
      calls.push(...collectSaveChangeCallSitesFromSource(source, relFile));
    }
  }
  return calls;
}

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
