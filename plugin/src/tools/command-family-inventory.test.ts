/**
 * RED inventory: typed ChangeWorkflow command-adapter inventory.
 *
 * Phase: RED/INVENTORY only. No production GREEN behavior.
 *
 * Architecture:
 *   - Tool handlers call CommandStore (Store.changes/tasks/gates/wisdom/specDeltas/...).
 *   - Aggregate-specific store adapters in storage/store-temporal/ own
 *     coordination.
 *   - ChangeWorkflow command adapters must migrate from direct signal+readback
 *     to a typed command-confirmation / projection-proof primitive
 *     (here expected as `changeCommand`), with stable `operationId` and
 *     projection-proof `commitChangeProjection` writer.
 *
 * This file inventories every storage module that directly signals
 * ChangeWorkflowState, listing the exported mutation method names and the
 * signal names they fire. It deliberately does NOT enumerate the ADV tool
 * registry; tool dispatch is the consumer of the storage surface.
 */

import { describe, test, expect } from "vitest";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_TEMPORAL_DIR = join(__dirname, "..", "storage", "store-temporal");

interface ChangeWorkflowAdapterRow {
  /** Source file name under storage/store-temporal/. */
  readonly module: string;
  /** Exported factory / entry point that owns the command surface. */
  readonly exportedFn: string;
  /** Command mutation method names on the returned aggregate surface. */
  readonly methods: readonly string[];
  /** ChangeWorkflow signal identifiers imported/used by the module. */
  readonly signals: readonly string[];
  /** Whether the adapter has migrated to the changeCommand primitive. */
  readonly migrated: boolean;
  /** Whether this row is part of the core command adapter migration set. */
  readonly core: boolean;
}

export const CHANGE_WORKFLOW_COMMAND_ADAPTERS: readonly ChangeWorkflowAdapterRow[] =
  [
    {
      module: "changes.ts",
      exportedFn: "createChangeOps",
      methods: [
        "create",
        "save",
        "updateArtifacts",
        "close",
        "closeBatch",
        "setEpicMembership",
        "clearEpicMembership",
      ],
      signals: [
        "proposalUpdatedSignal",
        "problemStatementUpdatedSignal",
        "agreementUpdatedSignal",
        "designUpdatedSignal",
        "executiveSummaryUpdatedSignal",
        "acceptanceUpdatedSignal",
        "updateArtifactMetadataSignal",
        "closeChangeSignal",
        "archiveChangeSignal",
        "archiveConvergedSignal",
        "archiveRequestedSignal",
        "commitBatchCloseSignal",
        "abortBatchCloseSignal",
        "prepareBatchCloseSignal",
        "epicMembershipSetSignal",
        "epicMembershipClearedSignal",
        "crossProjectCoordinationUpdatedSignal",
      ],
      migrated: true,
      core: true,
    },
    {
      module: "tasks.ts",
      exportedFn: "createTaskOps",
      methods: ["add", "update", "cancel", "reclassifyTdd"],
      signals: ["taskAddedSignal", "taskUpdatedSignal", "taskCancelledSignal"],
      migrated: true,
      core: true,
    },
    {
      module: "gates.ts",
      exportedFn: "createGateOps",
      methods: ["complete", "reopenFrom"],
      signals: ["gateCompletedSignal", "gateReenteredSignal"],
      migrated: true,
      core: true,
    },
    {
      module: "wisdom.ts",
      exportedFn: "createWisdomOps",
      methods: ["add"],
      signals: ["wisdomAddedSignal"],
      migrated: true,
      core: true,
    },
    {
      module: "spec-deltas.ts",
      exportedFn: "createSpecDeltaOps",
      methods: ["add", "modify", "amend", "retract", "remove", "rename"],
      signals: [
        "specDeltaAddedSignal",
        "specDeltaModifiedSignal",
        "specDeltaAmendedSignal",
        "specDeltaRetractedSignal",
        "specDeltaRemovedSignal",
        "specDeltaRenamedSignal",
      ],
      migrated: true,
      core: true,
    },
    {
      module: "index.ts",
      exportedFn: "createTemporalStoreBackend",
      methods: ["fireWorktreeAutoManagedMigrationIfNeeded"],
      signals: ["worktreeAutoManagedSignal"],
      migrated: false,
      core: false,
    },
  ];

/**
 * Storage modules that may directly interact with Temporal signals but are NOT
 * ChangeWorkflow command adapters. These are either:
 *   - generic shared helpers (shared.ts)
 *   - other workflow authorities (epics.ts)
 *   - terminal/operational coordinators (batch-close-coordinator.ts)
 *   - disk/read/hash utilities
 */
const CHANGE_WORKFLOW_NON_ADAPTER_ALLOWLIST = new Set([
  "batch-close-coordinator.ts",
  "shared.ts",
  "epics.ts",
  "disk-persist.ts",
  "hydrate-documents.ts",
  "read-context.ts",
  "creation-hash.ts",
]);

const EXPECTED_CHANGE_COMMAND_TOKENS = [
  "changeCommand", // typed command-confirmation / projection-proof primitive
  "operationId", // stable command identity
  "computeHostCommandPayloadHash", // host SHA-256 command payload authority
  "buildSummaryCommitProjection", // projection-proof atomic writer + summary shard
];

async function readAdapterSource(module: string): Promise<string> {
  return readFile(join(STORE_TEMPORAL_DIR, module), "utf-8");
}

async function listStoreTemporalSourceFiles(): Promise<string[]> {
  const entries = await readdir(STORE_TEMPORAL_DIR, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const name = entry.name;
    if (!name.endsWith(".ts")) continue;
    if (name.endsWith(".test.ts") || name.endsWith(".itest.ts")) continue;
    files.push(name);
  }
  return files;
}

// =============================================================================
// Inventory tests (must pass).
// =============================================================================

describe("ChangeWorkflow command adapter inventory", () => {
  test("inventory is non-empty and every row is well-formed", () => {
    expect(CHANGE_WORKFLOW_COMMAND_ADAPTERS.length).toBeGreaterThan(0);
    for (const row of CHANGE_WORKFLOW_COMMAND_ADAPTERS) {
      expect(row.module).toMatch(/\.ts$/);
      expect(row.exportedFn.length).toBeGreaterThan(0);
      expect(row.methods.length).toBeGreaterThan(0);
      expect(row.signals.length).toBeGreaterThan(0);
      expect(typeof row.migrated).toBe("boolean");
      expect(typeof row.core).toBe("boolean");
    }
  });

  test.each(CHANGE_WORKFLOW_COMMAND_ADAPTERS)(
    "$module exists and exports $exportedFn",
    async (row) => {
      const fileStat = await stat(join(STORE_TEMPORAL_DIR, row.module));
      expect(fileStat.isFile()).toBe(true);
      const source = await readAdapterSource(row.module);
      expect(source).toContain(`export function ${row.exportedFn}`);
    },
  );

  test.each(CHANGE_WORKFLOW_COMMAND_ADAPTERS)(
    "$module imports all declared signals",
    async (row) => {
      const source = await readAdapterSource(row.module);
      for (const signal of row.signals) {
        expect(source).toContain(signal);
      }
    },
  );

  test.each(CHANGE_WORKFLOW_COMMAND_ADAPTERS)(
    "$module declares all exported mutation methods",
    async (row) => {
      const source = await readAdapterSource(row.module);
      for (const method of row.methods) {
        // The worktree marker is a local function, not an aggregate method.
        if (row.module === "index.ts") {
          expect(source).toContain(method);
        } else {
          expect(source).toContain(`${method}: async`);
        }
      }
    },
  );
});

// =============================================================================
// Structural check: no direct ChangeWorkflow signal path is hidden.
// =============================================================================

describe("ChangeWorkflow signal-path coverage", () => {
  test("every store-temporal source that signals ChangeWorkflow is inventoried or allow-listed", async () => {
    const files = await listStoreTemporalSourceFiles();
    const inventoried = new Set(
      CHANGE_WORKFLOW_COMMAND_ADAPTERS.map((r) => r.module),
    );
    const uncovered: string[] = [];
    for (const file of files) {
      if (
        inventoried.has(file) ||
        CHANGE_WORKFLOW_NON_ADAPTER_ALLOWLIST.has(file)
      ) {
        continue;
      }
      const source = await readAdapterSource(file);
      // Detect direct ChangeWorkflow signal use: import from temporal/messages
      // plus concrete signal identifiers (not only generic helper types).
      if (
        source.includes('from "../../temporal/messages"') &&
        source.includes("Signal")
      ) {
        uncovered.push(file);
      }
    }
    expect(uncovered).toEqual([]);
  });
});

// =============================================================================
// ChangeWorkflow adapter migration tracker (explicit legacy RED rows).
// =============================================================================

const CORE_CHANGE_COMMAND_ADAPTERS = CHANGE_WORKFLOW_COMMAND_ADAPTERS.filter(
  (r) => r.core,
);

describe("ChangeWorkflow adapter migration (RED)", () => {
  test("all core change command adapters are migrated to the typed command primitive", () => {
    const legacy = CORE_CHANGE_COMMAND_ADAPTERS.filter((a) => !a.migrated);
    expect(legacy.map((a) => `${a.module} (${a.exportedFn})`)).toEqual([]);
  });

  test.each(CORE_CHANGE_COMMAND_ADAPTERS)(
    "$module uses the typed command-confirmation/projection-proof primitive",
    async (adapter) => {
      const source = await readAdapterSource(adapter.module);
      const missing = EXPECTED_CHANGE_COMMAND_TOKENS.filter(
        (token) => !source.includes(token),
      );
      expect(missing).toEqual([]);
    },
  );

  test.each(CORE_CHANGE_COMMAND_ADAPTERS)(
    "$module wires every command call to the summary-proof commit callback",
    async (adapter) => {
      const source = await readAdapterSource(adapter.module);
      const commandStarts = [...source.matchAll(/changeCommand\(\{/g)].map(
        (match) => match.index ?? 0,
      );
      expect(commandStarts.length).toBeGreaterThan(0);
      expect(source).not.toContain("commitChangeProjection(");

      for (const [index, start] of commandStarts.entries()) {
        const end = commandStarts[index + 1] ?? source.length;
        const commandBlock = source.slice(start, end);
        expect(commandBlock).toMatch(
          /commitProjection:\s*buildSummaryCommitProjection\(/,
        );
      }
    },
  );
});

// =============================================================================
// RED behavior: operation IDs and projection failure for representative
// change adapters (artifact/task/gate/wisdom/delta).
// =============================================================================

describe("ChangeWorkflow adapter projection-proof plumbing (RED)", () => {
  test.each(CORE_CHANGE_COMMAND_ADAPTERS)(
    "$module emits operation IDs and handles projection failure",
    async (adapter) => {
      const source = await readAdapterSource(adapter.module);
      const missing: string[] = [];
      if (!source.includes("operationId")) missing.push("operationId");
      if (!source.includes("payloadHash") && !source.includes("payload_hash")) {
        missing.push("payloadHash / payload_hash");
      }
      // Non-blind-retry typed outcome for projection failure.
      if (
        !source.includes("operator_required") &&
        !source.includes("projection_failure") &&
        !source.includes("outcome_unknown_readback_unavailable")
      ) {
        missing.push("non-blind-retry projection failure outcome");
      }
      expect(missing).toEqual([]);
    },
  );
});
