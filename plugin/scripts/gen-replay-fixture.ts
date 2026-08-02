/**
 * Replay-fixture generator (change addReplayReportBounds, task tk-86e9bd603c47).
 *
 * Drives CONTROLLED `changeWorkflow` executions against the local Temporal dev
 * server so that each uncovered patch branch in `workflows.ts` is exercised,
 * then prints the workflowId so the operator can export the history with:
 *
 *   temporal workflow show --address 127.0.0.1:7233 --namespace default \
 *     --workflow-id <id> --output json --no-json-shorthand-payloads
 *
 * No event history is hand-authored: every history is produced by Temporal
 * executing real workflow code. The `acceptance-executive-summary` branch is a
 * LEGACY branch reachable only when the STATE_BACKED_ACCEPTANCE_PROOF_PATCH
 * marker is absent, so it is generated with a controlled variant workflow
 * (current code with the state-backed-acceptance else-if removed) that takes
 * the preserved legacy disk-inspect path. The `acceptance-readiness-fence-legacy`
 * branch is a LEGACY branch that predates the ACCEPTANCE_READINESS_FENCE_PATCH
 * marker; it is generated with a controlled variant workflow that disables the
 * fence check so the marker is not recorded.
 * See the committed fixture metadata for full provenance.
 *
 * Identifiers are STABLE (no timestamps) so the exported history is
 * reproducible and needs only `identity` sanitization. Re-running terminates
 * any in-flight execution of the same workflowId first.
 *
 * Usage:
 *   pnpm exec tsx scripts/gen-replay-fixture.ts --branch <id>
 *
 * Branches:
 *   state-backed-gate-artifact   -> STATE_BACKED_GATE_ARTIFACT_PROOF_PATCH (proposal gate)
 *   state-backed-acceptance      -> STATE_BACKED_ACCEPTANCE_PROOF_PATCH (acceptance gate)
 *   acceptance-executive-summary -> ACCEPTANCE_EXECUTIVE_SUMMARY_PROOF_PATCH (legacy acceptance)
 *   acceptance-readiness-fence   -> ACCEPTANCE_READINESS_FENCE_PATCH (acceptance gate)
 *   acceptance-readiness-fence-legacy -> ACCEPTANCE_READINESS_FENCE_PATCH (legacy acceptance gate)
 *   worker-bundle-freshness-legacy -> WORKER_BUNDLE_FRESHNESS_PROVENANCE_PATCH (legacy release gate)
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  createTemporalScriptFacade,
  TemporalScriptOutcomeError,
} from "./temporal-script-facade";
import { NativeConnection, Worker } from "@temporalio/worker";

import {
  gateCompletedSignal,
  getChangeStateQuery,
} from "../src/temporal/messages";
import type { ChangeWorkflowInput } from "../src/temporal/contracts";
import { createDefaultGates } from "../src/types";
import {
  inspectArtifactActivity,
  writeArtifactActivity,
  writeChangeProjection,
} from "../src/temporal/activities";

const ADDRESS = process.env.REPLAY_FIXTURE_ADDRESS ?? "127.0.0.1:7233";
const NAMESPACE = "default";
const PROJECT_ID = "b".repeat(40);
const PROJECTION_ROOT = "/tmp/adv-replay-fixture";

const workflowsPath = fileURLToPath(
  new URL("../src/temporal/workflows.ts", import.meta.url),
);

type BranchId =
  | "state-backed-gate-artifact"
  | "state-backed-acceptance"
  | "acceptance-executive-summary"
  | "acceptance-readiness-fence"
  | "acceptance-readiness-fence-legacy"
  | "worker-bundle-freshness-legacy";

interface BranchConfig {
  gateId: "proposal" | "discovery" | "design" | "acceptance";
  patchMarker: string;
  label: string;
  /** Stable changeId (doubles as the fixture workflowId suffix). */
  changeId: string;
  /** Whether this branch needs a projectionChangesDir (acceptance gates do). */
  needsProjection: boolean;
}

const BRANCHES: Record<BranchId, BranchConfig> = {
  "state-backed-gate-artifact": {
    gateId: "proposal",
    patchMarker: "state-backed-gate-artifact-proof-v1",
    label: "STATE_BACKED_GATE_ARTIFACT_PROOF_PATCH",
    changeId: "replayFixtureStateBackedGateArtifact",
    needsProjection: false,
  },
  "state-backed-acceptance": {
    gateId: "acceptance",
    patchMarker: "state-backed-acceptance-proof-v1",
    label: "STATE_BACKED_ACCEPTANCE_PROOF_PATCH",
    changeId: "replayFixtureStateBackedAcceptance",
    needsProjection: true,
  },
  "acceptance-executive-summary": {
    gateId: "acceptance",
    patchMarker: "acceptance-executive-summary-proof-v1",
    label: "ACCEPTANCE_EXECUTIVE_SUMMARY_PROOF_PATCH",
    changeId: "replayFixtureLegacyAcceptanceExecSummary",
    needsProjection: true,
  },
  "acceptance-readiness-fence": {
    gateId: "acceptance",
    patchMarker: "acceptance-readiness-revision-v1",
    label: "ACCEPTANCE_READINESS_FENCE_PATCH",
    changeId: "replayFixtureAcceptanceReadinessFence",
    needsProjection: true,
  },
  "acceptance-readiness-fence-legacy": {
    gateId: "acceptance",
    patchMarker: "acceptance-readiness-revision-v1",
    label: "ACCEPTANCE_READINESS_FENCE_PATCH (legacy)",
    changeId: "replayFixtureAcceptanceReadinessFenceLegacy",
    needsProjection: true,
  },
  "worker-bundle-freshness-legacy": {
    gateId: "release",
    patchMarker: "worker-bundle-freshness-v1",
    label: "WORKER_BUNDLE_FRESHNESS_PROVENANCE_PATCH (legacy)",
    changeId: "replayFixtureWorkerBundleFreshnessLegacy",
    needsProjection: false,
  },
};

const EXEC_SUMMARY_CONTENT =
  "# Executive Summary\n\n" +
  "All contract review-matrix rows pass. The controlled replay fixture " +
  "exercises the acceptance gate proof branch deterministically. This body " +
  "exceeds the minimum non-whitespace threshold for gate artifact evidence.\n";

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function parseArgs(): { branch: BranchId } {
  const args = process.argv.slice(2);
  let branch = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--branch") branch = args[++i] ?? "";
  }
  if (!(branch in BRANCHES)) {
    throw new Error(
      `Invalid --branch "${branch}". Expected one of: ${Object.keys(BRANCHES).join(", ")}`,
    );
  }
  return { branch: branch as BranchId };
}

function buildContract() {
  const items = [
    {
      id: "AC1",
      kind: "acceptance_criterion" as const,
      text: "Controlled replay fixture exercises the target proof branch.",
      sourceArtifact: "agreement" as const,
      verificationRequired: true,
      evidencePolicy: "test" as const,
      status: "approved" as const,
    },
  ];
  return {
    version: 1 as const,
    rigor: "standard" as const,
    source: {
      artifact: "agreement" as const,
      approvedAt: "2026-07-13T00:00:00.000Z",
    },
    items,
    reviewMatrix: {
      reviewedAt: "2026-07-13T00:00:00.000Z",
      rows: items.map((item) => ({
        contractId: item.id,
        kind: item.kind,
        status: "pass" as const,
        evidencePolicy: item.evidencePolicy,
        evidence: "Controlled replay fixture verification passes.",
      })),
    },
    amendments: [],
  };
}

function buildInput(
  config: BranchConfig,
  projectionChangesDir: string | undefined,
): ChangeWorkflowInput {
  const gates = createDefaultGates();
  const baseSeed: NonNullable<ChangeWorkflowInput["seedState"]> = {
    status: "active",
    tasks: [],
    wisdom: [],
    reentry_history: [],
  };

  if (config.gateId === "acceptance") {
    for (const gid of [
      "proposal",
      "discovery",
      "design",
      "planning",
      "execution",
    ] as const) {
      gates[gid] = { status: "done" };
    }
    gates.acceptance = { status: "in_progress" };
    baseSeed.gates = gates;
    baseSeed.contract = buildContract();
    baseSeed.documents = { executiveSummary: EXEC_SUMMARY_CONTENT };
    baseSeed.artifacts = {
      executiveSummary: {
        contentHash: sha256(EXEC_SUMMARY_CONTENT),
        source: "temporal",
      },
    };
  } else if (config.gateId === "release") {
    for (const gid of [
      "proposal",
      "discovery",
      "design",
      "planning",
      "execution",
      "acceptance",
    ] as const) {
      gates[gid] = { status: "done" };
    }
    gates.release = { status: "in_progress" };
    baseSeed.gates = gates;
  } else {
    gates[config.gateId] = { status: "in_progress" };
    baseSeed.gates = gates;
    baseSeed.documents = {
      [config.gateId]:
        `# ${config.label}\n\n` +
        "Controlled state-backed gate artifact content that comfortably " +
        "exceeds the minimum non-whitespace threshold for gate evidence.\n",
    } as NonNullable<typeof baseSeed.documents>;
  }

  return {
    projectId: PROJECT_ID,
    changeId: config.changeId,
    title: `Replay fixture: ${config.label}`,
    initializedAt: "2026-07-13T00:00:00.000Z",
    searchAttributesEnabled: false,
    ...(projectionChangesDir ? { projectionChangesDir } : {}),
    seedState: baseSeed,
  };
}

async function buildLegacyAcceptanceVariant(): Promise<string> {
  const src = await readFile(workflowsPath, "utf8");
  const startMarker =
    '      } else if (\n        artifactKind === "acceptance" &&\n        wf.patched(STATE_BACKED_ACCEPTANCE_PROOF_PATCH)\n      ) {\n';
  const endMarker = "      } else if (state.projectionChangesDir) {\n";
  const startIdx = src.indexOf(startMarker);
  const endIdx = src.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(
      `Variant surgery failed: startIdx=${startIdx} endIdx=${endIdx}`,
    );
  }
  const variant = src.slice(0, startIdx) + src.slice(endIdx);
  const variantPath = fileURLToPath(
    new URL(
      "../src/temporal/workflows.gen-legacy-acceptance.ts",
      import.meta.url,
    ),
  );
  await writeFile(variantPath, variant, "utf8");
  return variantPath;
}

async function buildLegacyFenceVariant(): Promise<string> {
  const src = await readFile(workflowsPath, "utf8");
  const marker =
    "const acceptanceReadinessFenceActive =\n" +
    '      payload.gateId === "acceptance" &&\n' +
    "      wf.patched(ACCEPTANCE_READINESS_FENCE_PATCH);";
  const replacement = "const acceptanceReadinessFenceActive = false;";
  if (!src.includes(marker)) {
    throw new Error(
      "Variant surgery failed: acceptance-readiness-fence block not found",
    );
  }
  const variant = src.replace(marker, replacement);
  const variantPath = fileURLToPath(
    new URL("../src/temporal/workflows.gen-legacy-fence.ts", import.meta.url),
  );
  await writeFile(variantPath, variant, "utf8");
  return variantPath;
}

async function buildLegacyWorkerBundleVariant(): Promise<string> {
  const src = await readFile(workflowsPath, "utf8");
  const marker = "wf.patched(WORKER_BUNDLE_FRESHNESS_PROVENANCE_PATCH)";
  if (!src.includes(marker)) {
    throw new Error(
      "Variant surgery failed: worker-bundle-freshness patch call not found",
    );
  }
  const variant = src.replace(marker, "false");
  const variantPath = fileURLToPath(
    new URL(
      "../src/temporal/workflows.gen-legacy-worker-bundle.ts",
      import.meta.url,
    ),
  );
  await writeFile(variantPath, variant, "utf8");
  return variantPath;
}

async function main(): Promise<void> {
  const { branch } = parseArgs();
  const config = BRANCHES[branch];
  const workflowId = `adv/change/${PROJECT_ID}/${config.changeId}`;
  const taskQueue = `replay-fixture-gen-${branch}`;

  const projectionChangesDir = config.needsProjection
    ? join(PROJECTION_ROOT, config.changeId)
    : undefined;
  if (projectionChangesDir) {
    await rm(projectionChangesDir, { recursive: true, force: true });
    await mkdir(join(projectionChangesDir, config.changeId), {
      recursive: true,
    });
    if (branch === "acceptance-executive-summary") {
      // Path C reads executive-summary.md from disk; pre-write with matching hash.
      await writeFile(
        join(projectionChangesDir, config.changeId, "executive-summary.md"),
        EXEC_SUMMARY_CONTENT,
        "utf8",
      );
    }
  }

  const input = buildInput(config, projectionChangesDir);

  let activeWorkflowsPath = workflowsPath;
  let variantPath: string | undefined;
  if (branch === "acceptance-executive-summary") {
    variantPath = await buildLegacyAcceptanceVariant();
    activeWorkflowsPath = variantPath;
  } else if (branch === "acceptance-readiness-fence-legacy") {
    variantPath = await buildLegacyFenceVariant();
    activeWorkflowsPath = variantPath;
  } else if (branch === "worker-bundle-freshness-legacy") {
    variantPath = await buildLegacyWorkerBundleVariant();
    activeWorkflowsPath = variantPath;
  }

  const owner = await createTemporalScriptFacade({
    projectId: PROJECT_ID,
    address: ADDRESS,
    namespace: NAMESPACE,
  });
  const nativeConnection = await NativeConnection.connect({ address: ADDRESS });

  // Terminate any in-flight execution of the same workflowId for repeatability.
  try {
    await owner.terminateWorkflow(
      workflowId,
      "replay-fixture regeneration",
    );
  } catch {
    // No prior execution; ignore.
  }

  const worker = await Worker.create({
    connection: nativeConnection,
    namespace: NAMESPACE,
    taskQueue,
    workflowsPath: activeWorkflowsPath,
    activities: {
      inspectArtifactActivity,
      writeArtifactActivity,
      writeChangeProjection,
    },
  });

  let finalStatus = "unknown";
  let gateEvidence: unknown = null;
  try {
    await worker.runUntil(async () => {
      await owner.startWorkflow({
        workflowType: "changeWorkflow",
        workflowId,
        taskQueue,
        args: [input],
      });

      await owner.signalWorkflow(workflowId, gateCompletedSignal, {
        gateId: config.gateId,
        completedBy: "replay-fixture-generator",
        completedAt: "2026-07-13T00:00:01.000Z",
      });

      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const state = (await owner.queryWorkflow(
          workflowId,
          getChangeStateQuery,
        )) as {
          gates: Record<string, { status: string; artifactEvidence?: unknown }>;
        };
        const gate = state.gates[config.gateId];
        if (gate?.status === "done" || gate?.status === "stuck") {
          finalStatus = gate.status;
          gateEvidence = gate.artifactEvidence ?? null;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      // Drain fire-and-forget projection activity so the history settles.
      await new Promise((resolve) => setTimeout(resolve, 3000));
    });
  } finally {
    if (variantPath) await rm(variantPath, { force: true });
    await owner.close();
  }

  const exportCmd =
    `temporal workflow show --address ${ADDRESS} --namespace ${NAMESPACE} ` +
    `--workflow-id ${workflowId} --output json --no-json-shorthand-payloads`;

  console.log(
    JSON.stringify(
      {
        branch,
        label: config.label,
        gateId: config.gateId,
        patchMarker: config.patchMarker,
        workflowId,
        changeId: config.changeId,
        projectionChangesDir: projectionChangesDir ?? null,
        finalGateStatus: finalStatus,
        gateEvidence,
        exportCmd,
      },
      null,
      2,
    ),
  );

  if (finalStatus !== "done") {
    throw new Error(
      `Gate did not complete (status=${finalStatus}); refusing to emit a non-target history.`,
    );
  }
}

main().catch((err) => {
  if (err instanceof TemporalScriptOutcomeError) {
    console.error(
      JSON.stringify(
        {
          error: "Temporal script outcome",
          kind: err.kind,
          message: err.message,
          cause: err.causeError instanceof Error ? err.causeError.message : String(err.causeError),
        },
        null,
        2,
      ),
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});
