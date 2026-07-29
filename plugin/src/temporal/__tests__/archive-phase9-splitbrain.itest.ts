/**
 * AC3 — Phase 9 split-brain recovery via the idempotent archive re-run.
 *
 * The #216 split-brain: a durable archive bundle exists on disk but
 * `phase9_status` is unset (the Temporal-only `recordPhase9Status` could not
 * fire because the disk-only timeout classifier deliberately avoids signals to
 * prevent a double-hang — see `archive-gate.ts` `recordPhase9Status`, which
 * throws "Temporal service not available" when STSL is down). Recovery is the
 * classifier-directed idempotent re-run: `reconcileArchivedBundleRetry`.
 *
 * This test proves that re-run DURABLY records `phase9_status` through a LIVE
 * Temporal service. It MUST NOT use a disk-only mock store: every
 * `recordPhase9Status` branch routes through `getService()` → a real Temporal
 * signal, so a disk stub would false-green (never exercise the throw path) or
 * spuriously fail. The harness boots a real `TestWorkflowEnvironment`, a real
 * in-process worker, and a real Temporal-backed store, then drives
 * `reconcileArchivedBundleRetry` end-to-end.
 *
 * Harness pattern: mirrors `src/__tests__/e2e-tool-calls.itest.ts` (real STSL +
 * Temporal-backed store) and `src/temporal/__tests__/concurrent-signaling.itest.ts`
 * (raw `changeWorkflow` start with a seed state).
 *
 * RED/GREEN: the assertion `phase9_status.status === "done"` fails against the
 * unfixed guard (`change.phase9_status?.status && ... !== "done"` skips the
 * unset case) and passes once the re-run records the unset status.
 */

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { WorkflowHandle } from "@temporalio/client";

import { createDefaultGates } from "../../types";
import type { Change, ChangeContract, WorkerBundleImpact } from "../../types";
import type { ChangeWorkflowInput, ChangeWorkflowState } from "../contracts";
import { buildChangeWorkflowId, buildProjectTaskQueue } from "../client";
import { getChangeStateQuery } from "../messages";
import { createInProcessWorker } from "../in-process-worker";
import { initStsl, closeStsl, resetStsl } from "../service";
import { createTemporalStoreBackend } from "../../storage/store-temporal";
import { createDiskStore as createLegacyStore } from "../../storage/store-disk";
import { reconcileArchivedBundleRetry } from "../../tools/change/archive-gate";
import { getProjectId } from "../../utils/project-id";
import {
  createTempDir,
  cleanupTempDir,
  parseToolOutput,
} from "../../__tests__/setup";
import { withTimeSkippingTestWorkflowEnvironment } from "./with-test-env";

const CHANGE_ID = "splitbrainPhase9Recovery";

type ChangeWorkflowHandle = WorkflowHandle<
  typeof import("../workflows").changeWorkflow
>;

const fixtureContract: ChangeContract = {
  version: 1,
  rigor: "minimal",
  source: {
    artifact: "agreement",
    approvedAt: "2026-05-05T00:00:00.000Z",
  },
  items: [
    {
      id: "AC3",
      kind: "acceptance_criterion",
      text: "Idempotent archive re-run durably records phase9_status for the split-brain change.",
      sourceArtifact: "agreement",
      verificationRequired: false,
      evidencePolicy: "not_applicable",
      status: "approved",
      notRequiredReason:
        "Integration fixture exercises the phase9 recording signal, not contract proof.",
    },
  ],
  amendments: [],
};

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "pipe" });
}

/**
 * Build a local (no-remote) git repo at `root` whose `change/{changeId}` branch
 * is fully merged into the default branch. With no origin remote,
 * `verifyReleaseEvidenceFromMain` classifies the route as `no_remote` and
 * reaches `verifyChangeBranchReachable`; an empty `main..change/{id}` range
 * yields a `shipped` finalization — the exact evidence the re-run reconciles.
 */
async function setupMergedChangeBranchRepo(
  root: string,
  changeId: string,
): Promise<void> {
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "phase9-test@example.com"]);
  git(root, ["config", "user.name", "phase9-test"]);
  await writeFile(join(root, "README.md"), "root\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "init"]);
  git(root, ["checkout", "-b", `change/${changeId}`]);
  await writeFile(join(root, "change.md"), "change\n");
  git(root, ["add", "change.md"]);
  git(root, ["commit", "-m", "change"]);
  git(root, ["checkout", "main"]);
  git(root, ["merge", "--no-ff", `change/${changeId}`, "-m", "merge change"]);
}

/**
 * Seed gates: all six gates prior to `release` are done; release stays pending
 * so the re-run's `completeReleaseGateAfterFinalization` has real work to do.
 * Release readiness requires every prior gate done (gate-readiness
 * PRIOR_GATE_INCOMPLETE), so a bare `createDefaultGates()` seed would strand
 * the release gate at stuck and fail the re-run before the phase9 step.
 */
function makeSeedGates(): ReturnType<typeof createDefaultGates> {
  const gates = createDefaultGates();
  const prior = [
    "proposal",
    "discovery",
    "design",
    "planning",
    "execution",
    "acceptance",
  ] as const;
  for (const id of prior) {
    gates[id] = {
      status: "done",
      completed_at: "2026-05-05T00:01:00.000Z",
      completed_by: "seed",
      approval_evidence: "seed gate completion",
    };
  }
  return gates;
}

function makeChangeInput(
  projectId: string,
  changeId: string,
): ChangeWorkflowInput {
  return {
    projectId,
    changeId,
    title: `Split-brain phase9 recovery: ${changeId}`,
    initializedAt: "2026-05-05T00:00:00.000Z",
    searchAttributesEnabled: false,
    seedState: {
      // Non-terminal ("draft") so the workflow stays RUNNING and accepts the
      // re-run's signals. The archived/phase9-unset split-brain lives on the
      // `change` object handed to reconcileArchivedBundleRetry, not the
      // workflow seed. (Workflow seed status is archived|closed|draft; "draft"
      // is the non-terminal value — see concurrent-signaling.itest.ts.)
      status: "draft",
      tasks: [],
      wisdom: [],
      gates: makeSeedGates(),
      contract: fixtureContract,
      reentry_history: [],
      worker_bundle_impact: {
        kind: "not_applicable",
        rationale:
          "archive phase9 split-brain recovery fixture; no worker bundle change",
      } satisfies WorkerBundleImpact,
    },
  };
}

/** The disk/archived change handed to the re-run: archived, phase9_status unset. */
function makeSplitBrainChange(changeId: string): Change {
  return {
    id: changeId,
    title: `Split-brain phase9 recovery: ${changeId}`,
    status: "archived",
    created_at: "2026-05-05T00:00:00.000Z",
    created_by: "phase9-test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: createDefaultGates(),
    phase9_status: undefined,
  };
}

describe("AC3 — phase9 split-brain recovery via archive re-run (live Temporal)", () => {
  it("re-run durably records phase9_status when a bundle exists but phase9_status is unset", async () => {
    const tempDir = await createTempDir("phase9-splitbrain-");
    try {
      // Real git repo so test-mode getProjectId(root) resolves and
      // verifyReleaseEvidenceFromMain returns a shipped (no_remote) outcome.
      await setupMergedChangeBranchRepo(tempDir, CHANGE_ID);
      const legacy = await createLegacyStore(tempDir);
      const root = legacy.paths.root;
      const projectId = await getProjectId(root);
      expect(projectId).toBeTruthy();

      // Durable archive bundle on disk (the split-brain invariant).
      const bundleDir = join(root, ".adv", "archive", CHANGE_ID);
      await mkdir(bundleDir, { recursive: true });
      await writeFile(join(bundleDir, "change.json"), "{}\n");

      await withTimeSkippingTestWorkflowEnvironment(async (env) => {
        const namespace = "default";
        const taskQueue = buildProjectTaskQueue(projectId!);

        const worker = await createInProcessWorker({
          address: env.address ?? "127.0.0.1:7233",
          namespace,
          queues: [taskQueue],
          workflowsPath: fileURLToPath(
            new URL("../workflows.ts", import.meta.url),
          ),
          artifactPolicy: {
            mode: "development_source",
            rationale: "Temporal integration test",
          },
          connection: env.nativeConnection,
        });

        try {
          // Real STSL so getService() inside recordPhase9Status resolves and
          // the phase9 signal routes through a live Temporal client.
          resetStsl();
          const bundle = await initStsl({
            ADV_TEMPORAL_ADDRESS: env.address ?? "127.0.0.1:7233",
            ADV_TEMPORAL_NAMESPACE: namespace,
            ADV_TEMPORAL_ALLOW_REMOTE: "true",
          });

          const store = createTemporalStoreBackend({
            legacy,
            temporal: { client: bundle.client as unknown as never },
            projectId: projectId!,
          });
          await store.init();

          // Live change workflow the re-run will signal.
          const handle = (await env.client.workflow.start("changeWorkflow", {
            workflowId: buildChangeWorkflowId(projectId!, CHANGE_ID),
            taskQueue,
            args: [makeChangeInput(projectId!, CHANGE_ID)],
          })) as ChangeWorkflowHandle;

          const change = makeSplitBrainChange(CHANGE_ID);
          const output = await reconcileArchivedBundleRetry({
            store,
            change,
            changeId: CHANGE_ID,
            archiveMode: "direct",
            phase9: "run",
            existingBundlePath: bundleDir,
            openOpsObligationsPayload: {},
            validationWarnings: [],
          });

          const parsed = parseToolOutput<{
            success?: boolean;
            noOp?: boolean;
            error?: string;
            releaseGate?: { status?: string };
          }>(output);
          // The re-run itself must succeed (reached the phase9 recording step).
          expect(
            parsed.error,
            `re-run errored: ${parsed.error}`,
          ).toBeUndefined();
          expect(parsed.success).toBe(true);

          // The release gate reconciled to done through live Temporal.
          const stateAfter: ChangeWorkflowState =
            await handle.query(getChangeStateQuery);
          expect(stateAfter.gates.release?.status).toBe("done");

          // AC1: the poll-confirmed release gate is durably projected into the
          // active disk snapshot so the store.gates.get proof observes done
          // without a second workflow query.
          const gatesAfter = await store.gates.get(CHANGE_ID);
          expect(gatesAfter?.release?.status).toBe("done");
          expect(gatesAfter?.release?.approval_evidence).toBeTruthy();

          // AC3 core: phase9_status is durably recorded as done via the live
          // Temporal phase9StatusUpdatedSignal. RED against the unfixed guard
          // (unset phase9_status is skipped), GREEN once recorded.
          expect(stateAfter.phase9_status?.status).toBe("done");
          expect(stateAfter.phase9_status?.completedAt).toBeTruthy();
        } finally {
          await worker.shutdown();
          await closeStsl();
        }
      });
    } finally {
      await cleanupTempDir(tempDir);
    }
  }, 90_000);
});
