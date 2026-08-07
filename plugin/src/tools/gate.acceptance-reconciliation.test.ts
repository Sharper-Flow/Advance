/**
 * Acceptance gate reconciliation integration tests.
 *
 * Verifies that adv_gate_complete reconciles recovered design-concern and
 * verification-evidence dispositions into the reachable workflow before firing
 * gateCompletedSignal, and surfaces a single actionable block when
 * reconciliation fails.
 */

import { describe, expect, test, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Store } from "../storage/store";
import { gateTools } from "./gate";
import { createTempDir } from "../__tests__/setup";
import { fileExists, loadChange } from "../storage/json";
import type { Change, ContractReviewMatrix } from "../types";

vi.mock("./target-project", () => ({
  formatTargetProjectContext: vi.fn((ctx) => ctx),
  resolveTargetAwareMutationCwd: vi.fn(({ store }) => store.paths.root),
  withOptionalTargetPathStore: vi.fn(async (_input, fn) =>
    fn(_input.store, undefined),
  ),
  withTargetPathStore: vi.fn(),
}));

vi.mock("./worktree-auto-manage", () => ({
  ensureWorktreeForMutation: vi.fn(async () => ({ decision: "ALLOW" })),
  buildWorktreeAutoManageDeps: vi.fn(async () => ({
    resumeRuntime: {
      projectRoot: "/tmp/test",
      database: {},
      log: {},
      store: {},
    },
  })),
}));

vi.mock("../utils/workflow-directive", async () => {
  const actual = await vi.importActual<
    typeof import("../utils/workflow-directive")
  >("../utils/workflow-directive");
  return {
    ...actual,
    deriveDirectiveSafe: vi.fn(() => undefined),
  };
});

const HEALTHY_GATES = {
  proposal: { status: "done" },
  discovery: { status: "done" },
  design: { status: "done" },
  planning: { status: "done" },
  execution: { status: "done" },
  acceptance: { status: "done" },
  release: { status: "pending" },
} as import("../types").Gates;

function baseChange(overrides: Partial<Change> = {}): Change {
  return {
    id: "test-change",
    title: "Test Change",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: HEALTHY_GATES,
    ...overrides,
  } as Change;
}

function createStore(changesDir: string, change: Change): Store {
  return {
    paths: {
      root: "/tmp/test",
      changes: changesDir,
    } as Store["paths"],
    config: null,
    init: vi.fn(),
    sync: vi.fn(),
    close: vi.fn(),
    flush: vi.fn(),
    specs: {} as Store["specs"],
    changes: {
      list: vi.fn(),
      get: vi.fn(async () => ({ success: true, data: change })),
      create: vi.fn(),
      save: vi.fn(),
      close: vi.fn(),
      closeBatch: vi.fn(),
      refresh: vi.fn(async () => undefined),
      invalidate: vi.fn(async () => undefined),
    } as Store["changes"],
    tasks: {} as Store["tasks"],
    wisdom: {} as Store["wisdom"],
    gates: {
      get: vi.fn(async () => change.gates),
      complete: vi.fn(),
      reopenFrom: vi.fn(),
    } as unknown as Store["gates"],
    artifacts: {} as Store["artifacts"],
  } as Store;
}

async function seedProjection(
  changesDir: string,
  change: Change,
): Promise<void> {
  const changeDir = `${changesDir}/${change.id}`;
  await mkdir(changeDir, { recursive: true });
  await writeFile(
    `${changeDir}/change.json`,
    JSON.stringify(change, null, 2),
    "utf-8",
  );
}

function recoveryAudit() {
  return {
    reason: "poisoned_history",
    evidence: "workflow completed before signal landed",
    recovered_at: "2026-01-01T00:00:00Z",
  };
}

function disposition(family: "design" | "verification") {
  const base = {
    taskId: family === "design" ? "tk-design" : "tk-verify",
    concernKey:
      family === "design" ? "component_correctness" : "verification_mismatch",
    disposition: "fixed" as const,
    evidence: "Fixed.",
    dispositionedAt: "2026-01-01T00:00:00Z",
  };
  return base;
}

function reviewMatrix(): ContractReviewMatrix {
  return {
    reviewedAt: "2026-01-01T00:00:00Z",
    rows: [
      {
        contractId: "AC1",
        kind: "acceptance_criterion" as const,
        status: "pass" as const,
        evidencePolicy: "test" as const,
        evidence: "Acceptance suite passes.",
      },
    ],
  };
}

function baseContract(
  overrides: Partial<NonNullable<Change["contract"]>> = {},
): NonNullable<Change["contract"]> {
  return {
    version: 1,
    rigor: "standard" as const,
    source: { artifact: "agreement", approvedAt: "2026-01-01T00:00:00Z" },
    items: [
      {
        id: "AC1",
        kind: "acceptance_criterion" as const,
        text: "Criterion one",
        sourceArtifact: "agreement",
        verificationRequired: true,
        evidencePolicy: "test" as const,
        status: "approved" as const,
      },
    ],
    amendments: [],
    ...overrides,
  } as NonNullable<Change["contract"]>;
}

describe("adv_gate_complete acceptance reconciliation", () => {
  test("blocks recovery when the persisted acceptance projection cannot be read back", async () => {
    const changesDir = await createTempDir("adv-gate-acceptance-missing-");
    const change = baseChange();
    await seedProjection(changesDir, change);
    const { resolveAcceptanceRecoveryArtifactEvidence } =
      await import("./gate");
    const result = await resolveAcceptanceRecoveryArtifactEvidence({
      store: createStore(changesDir, change),
      changeId: "test-change",
      recoveryState: {
        contract: {
          version: 1,
          rigor: "standard",
          source: {
            artifact: "agreement",
            approvedAt: "2026-01-01T00:00:00Z",
          },
          items: [],
          reviewMatrix: {
            reviewedAt: "2026-01-01T00:00:00Z",
            rows: [],
          },
          amendments: [],
        },
        artifacts: {
          executiveSummary: { contentHash: "executive-summary-hash" },
        },
      } as import("../types/change-state").ChangeState,
      fallbackEvidence: undefined,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected acceptance recovery to block");
    expect(JSON.parse(result.response)).toMatchObject({
      stuckReason: "ACCEPTANCE_EXECUTIVE_SUMMARY_MISSING",
      readinessBlockers: [
        expect.objectContaining({
          code: "ACCEPTANCE_EXECUTIVE_SUMMARY_MISSING",
        }),
      ],
    });
  });

  // KD6: post-KD2 the active change directory holds no narrative markdown, so
  // acceptance recovery must resolve the executive-summary proof and persist
  // the acceptance projection through the artifact-authority chain
  // (change.documents), not through active-dir .md round-trips.
  test("resolves acceptance recovery evidence from the projection when no active-dir markdown exists", async () => {
    const changesDir = await createTempDir("adv-gate-acceptance-projection-");
    const executiveSummaryText = "# Executive Summary\n\nDelivered outcome.\n";
    const change = baseChange({
      documents: { executiveSummary: executiveSummaryText },
    } as Partial<Change>);
    await seedProjection(changesDir, change);
    const store = createStore(changesDir, change);
    const { resolveAcceptanceRecoveryArtifactEvidence } =
      await import("./gate");
    const result = await resolveAcceptanceRecoveryArtifactEvidence({
      store,
      changeId: change.id,
      recoveryState: {
        contract: {
          version: 1,
          rigor: "standard",
          source: { artifact: "agreement", approvedAt: "2026-01-01T00:00:00Z" },
          items: [],
          reviewMatrix: reviewMatrix(),
          amendments: [],
        },
        artifacts: {
          executiveSummary: {
            contentHash: createHash("sha256")
              .update(executiveSummaryText)
              .digest("hex"),
          },
        },
      } as unknown as import("../types/change-state").ChangeState,
      fallbackEvidence: undefined,
    });

    if (!result.ok) {
      throw new Error(
        `expected acceptance recovery to resolve from the projection, got: ${result.response}`,
      );
    }
    expect(result.artifactEvidence).toMatchObject({
      kind: "acceptance",
    });
    expect(result.artifactEvidence?.path).toBeUndefined();
    // The acceptance projection is persisted through the locked projection
    // transaction, and no acceptance.md is materialized in the active change
    // directory.
    expect(store.changes.save).not.toHaveBeenCalled();
    const persisted = await loadChange(changesDir, change.id);
    expect(
      (persisted.data as Change | undefined)?.documents?.acceptance,
    ).toBeTruthy();
    expect(await fileExists(`${changesDir}/${change.id}/acceptance.md`)).toBe(
      false,
    );
  });

  test("clears recovered design-concern and verification-evidence markers before completing acceptance", async () => {
    const changesDir = await createTempDir("adv-gate-reconciliation-");
    const change = baseChange({
      design_concern_dispositions: [
        { ...disposition("design"), recovery_audit: recoveryAudit() },
      ],
      verification_evidence_dispositions: [
        { ...disposition("verification"), recovery_audit: recoveryAudit() },
      ],
    });
    await seedProjection(changesDir, change);
    const result = await gateTools.adv_gate_complete.execute(
      {
        changeId: "test-change",
        gateId: "acceptance",
        completedBy: "agent",
      },
      createStore(changesDir, change),
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.gateId).toBe("acceptance");
    const disk = await loadChange(changesDir, "test-change");
    expect(disk.success).toBe(true);
    expect(
      disk.data?.design_concern_dispositions?.[0].recovery_audit,
    ).toBeUndefined();
    expect(
      disk.data?.verification_evidence_dispositions?.[0].recovery_audit,
    ).toBeUndefined();
  });

  test("clears a recovered contract review matrix before completing acceptance", async () => {
    const changesDir = await createTempDir("adv-gate-reconciliation-");
    const change = baseChange({
      contract: baseContract({
        reviewMatrix: { ...reviewMatrix(), recovery_audit: recoveryAudit() },
      }),
    });
    await seedProjection(changesDir, change);
    const result = await gateTools.adv_gate_complete.execute(
      {
        changeId: "test-change",
        gateId: "acceptance",
        completedBy: "agent",
      },
      createStore(changesDir, change),
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.gateId).toBe("acceptance");
    const disk = await loadChange(changesDir, "test-change");
    expect(disk.success).toBe(true);
    expect(disk.data?.contract?.reviewMatrix?.recovery_audit).toBeUndefined();
  });

  test("skips reconciliation and completes acceptance when no recovery markers exist", async () => {
    const changesDir = await createTempDir("adv-gate-reconciliation-");
    const change = baseChange({
      design_concern_dispositions: [disposition("design")],
    });
    await seedProjection(changesDir, change);

    const result = await gateTools.adv_gate_complete.execute(
      {
        changeId: "test-change",
        gateId: "acceptance",
        completedBy: "agent",
      },
      createStore(changesDir, change),
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.gateId).toBe("acceptance");
  });
});
