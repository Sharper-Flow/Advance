/**
 * Disk-state diagnostics and the safe session-pointer repair.
 *
 * `adv_doctor` reports only conditions this process can inspect locally:
 * readable projections, valid snapshots, reachable worktree state, and
 * session-pointer sanity. It does not claim anything about a server,
 * transport, worker, queue, or remote index.
 */
import { existsSync } from "fs";
import { basename, dirname, join } from "path";
import type { Store } from "../storage/store";
import { formatToolOutput } from "../utils/tool-output";
import { getWorktreeCensus } from "../utils/worktree-census";
import { scanSnapshotHealth } from "./snapshot-scan";
import { findProjectionDivergences } from "../storage/projection-health";
import { reclaimDeadWorkerLock } from "../storage/worker-lock";
import {
  formatTargetProjectContext,
  withTargetPathStore,
} from "./target-project";

const DOCTOR_CHANGE_READ_CONCURRENCY = 4;
const DOCTOR_CHANGE_READ_LIMIT = 32;
const DOCTOR_PROJECTION_SCAN_LIMIT = 64;
const DOCTOR_PROJECTION_SCAN_BUDGET_MS = 1500;

export type DoctorFindingClass =
  | "healthy"
  | "phantom_pointer"
  | "informational"
  | "unhealthy";

export interface DoctorFixApplied {
  class: DoctorFindingClass;
  action: "clear_session_pointer" | "remove_dead_worker_lock";
  outcome: "applied" | "no_op" | "failed";
  before?: unknown;
  after?: unknown;
  evidence: string;
}

export interface DoctorFixRefused {
  class: DoctorFindingClass;
  outcome: "approval_required";
  operator_action: string;
  proposal: string;
  evidence: string;
}

export interface DoctorFinding {
  class: DoctorFindingClass;
  detail: string;
  finding?: string;
  severity?: "informational" | "error";
}

interface DoctorVerification {
  healthy: boolean;
  projection_readable: boolean;
  snapshot_integrity: boolean;
  session_pointer_sane: boolean;
  worktree_census_reachable: boolean;
  canonical_projection_consistent: boolean;
  worker_lock_sane: boolean;
  projection_scan: {
    status: "complete" | "partial" | "budget_exceeded";
    scanned: number;
    omitted: number;
    divergence_count: number;
  };
  rechecked_at: string;
}

interface DoctorInput {
  target_path?: string;
  target_confirmed?: true;
  confirmationEvidence?: string;
}

export interface DoctorPointerRepairProvider {
  getActivePointer(): string | null;
  clearActivePointer(): void;
}

let pointerRepairProvider: DoctorPointerRepairProvider | null = null;

export function setDoctorPointerRepairProvider(
  provider: DoctorPointerRepairProvider | null,
): void {
  pointerRepairProvider = provider;
}

export function getDoctorPointerRepairProvider(): DoctorPointerRepairProvider | null {
  return pointerRepairProvider;
}

function projectFromStore(store: Store): string | undefined {
  return store.paths.external ? basename(store.paths.external) : undefined;
}

function addNonHealthyFinding(
  findings: DoctorFinding[],
  finding: DoctorFinding,
): void {
  if (findings.length === 1 && findings[0].class === "healthy") {
    findings.splice(0, 1);
  }
  findings.push(finding);
}

interface DiskProbe {
  projectionReadable: boolean;
  snapshotIntegrity: boolean;
  worktreeCensusReachable: boolean;
  canonicalProjectionConsistent: boolean;
  projectionDivergences: Awaited<ReturnType<typeof findProjectionDivergences>>;
  workerLockSane: boolean;
  workerLockReclaimed: { pid: number } | null;
  errors: string[];
}

async function probeDiskState(
  store: Store,
  projectId: string | undefined,
): Promise<DiskProbe> {
  const errors: string[] = [];
  let projectionReadable = false;
  try {
    await Promise.all([
      store.status({ recentLimit: 10, sourceRanked: true }),
      store.specs.list(),
      store.changes.list({
        maxCandidates: DOCTOR_CHANGE_READ_LIMIT,
        validationConcurrency: DOCTOR_CHANGE_READ_CONCURRENCY,
      }),
    ]);
    projectionReadable = true;
  } catch (err) {
    errors.push(
      `projection read failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let snapshotIntegrity = false;
  try {
    const snapshot = await scanSnapshotHealth({
      scope: "project",
      projectId: projectId ?? "unknown",
    });
    snapshotIntegrity = snapshot.summary.critical === 0;
    if (!snapshotIntegrity) {
      errors.push(
        `snapshot integrity reported ${snapshot.summary.critical} critical issue(s)`,
      );
    }
  } catch (err) {
    errors.push(
      `snapshot probe failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let worktreeCensusReachable = false;
  try {
    worktreeCensusReachable =
      (await getWorktreeCensus(store.paths.root)) !== null;
    if (!worktreeCensusReachable) {
      errors.push("worktree census is unavailable");
    }
  } catch (err) {
    errors.push(
      `worktree census failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const projectionDivergences = await findProjectionDivergences(
    {
      changesDir: store.paths.changes,
      summariesDir:
        store.paths.summariesDir ??
        join(dirname(store.paths.changes), "summaries"),
    },
    {
      maxChanges: DOCTOR_PROJECTION_SCAN_LIMIT,
      budgetMs: DOCTOR_PROJECTION_SCAN_BUDGET_MS,
    },
  );
  if (projectionDivergences.divergences.length > 0) {
    errors.push(
      projectionDivergences.divergences
        .map(
          (divergence) =>
            `${divergence.change_id}: ${divergence.reasons.join(", ")}`,
        )
        .join("; "),
    );
  }
  if (projectionDivergences.truncated || projectionDivergences.budgetExceeded) {
    errors.push(
      `projection divergence scan was ${projectionDivergences.budgetExceeded ? "budget-exhausted" : "bounded"}; ${projectionDivergences.omitted} projection(s) were not inspected`,
    );
  }

  const workerLock = await reclaimDeadWorkerLock(
    join(store.paths.external ?? dirname(store.paths.changes), "worker.lock"),
  );
  const workerLockSane =
    workerLock.status === "absent" || workerLock.status === "removed";
  if (!workerLockSane) {
    errors.push(
      workerLock.status === "live"
        ? `worker.lock is held by live PID ${workerLock.pid}`
        : workerLock.reason,
    );
  }

  return {
    projectionReadable,
    snapshotIntegrity,
    worktreeCensusReachable,
    canonicalProjectionConsistent:
      projectionDivergences.divergences.length === 0 &&
      !projectionDivergences.truncated &&
      !projectionDivergences.budgetExceeded,
    projectionDivergences,
    workerLockSane,
    workerLockReclaimed:
      workerLock.status === "removed" ? { pid: workerLock.pid } : null,
    errors,
  };
}

async function probeSessionPointer(
  store: Store,
  projectId: string | undefined,
  enabled = true,
): Promise<{
  sane: boolean;
  probe: {
    status: "confirmed_present" | "confirmed_absent" | "indeterminate";
    evidence: string;
  } | null;
}> {
  if (!enabled) return { sane: true, probe: null };

  const activePointer = pointerRepairProvider?.getActivePointer() ?? null;
  if (!pointerRepairProvider || !activePointer || !projectId) {
    return { sane: true, probe: null };
  }

  const onDisk = existsSync(
    join(store.paths.changes, activePointer, "change.json"),
  );
  if (!onDisk) {
    return {
      sane: false,
      probe: {
        status: "confirmed_absent",
        evidence: `change projection is absent at ${store.paths.changes}/${activePointer}`,
      },
    };
  }
  try {
    const result = await store.changes.get(activePointer);
    return result.success
      ? {
          sane: true,
          probe: {
            status: "confirmed_present",
            evidence: "change projection is readable from disk",
          },
        }
      : {
          sane: false,
          probe: {
            status: "indeterminate",
            evidence: "change projection exists but could not be read",
          },
        };
  } catch (err) {
    return {
      sane: false,
      probe: {
        status: "indeterminate",
        evidence: `change projection read failed: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
}

export const doctorHandler = async (
  args: DoctorInput,
  store: Store,
): Promise<string> => {
  if (!args.target_path) {
    return executeDoctor(store, projectFromStore(store));
  }

  return withTargetPathStore(
    {
      currentProjectPath: store.paths.root,
      target_path: args.target_path,
      mutation: true,
      stateRequirement: "snapshot-ok",
      target_confirmed: args.target_confirmed,
      confirmationEvidence: args.confirmationEvidence,
    },
    async ({ context, store: targetStore }) =>
      executeDoctor(
        targetStore,
        projectFromStore(targetStore),
        formatTargetProjectContext(context),
        context.trustSource === "current_project",
      ),
  );
};

async function executeDoctor(
  store: Store,
  projectId: string | undefined,
  projectContext?: unknown,
  sessionPointerEnabled = true,
): Promise<string> {
  const findings: DoctorFinding[] = [];
  const fixesApplied: DoctorFixApplied[] = [];
  const fixesRefused: DoctorFixRefused[] = [];
  const startedAt = new Date().toISOString();

  const initialDisk = await probeDiskState(store, projectId);
  const initialPointer = await probeSessionPointer(
    store,
    projectId,
    sessionPointerEnabled,
  );
  const initialChecks = {
    projectionReadable: initialDisk.projectionReadable,
    snapshotIntegrity: initialDisk.snapshotIntegrity,
    sessionPointerSane: initialPointer.sane,
    worktreeCensusReachable: initialDisk.worktreeCensusReachable,
    canonicalProjectionConsistent: initialDisk.canonicalProjectionConsistent,
    workerLockSane: initialDisk.workerLockSane,
  };

  if (initialDisk.workerLockReclaimed) {
    fixesApplied.push({
      class: "informational",
      action: "remove_dead_worker_lock",
      outcome: "applied",
      evidence: `Removed retired worker.lock for dead PID ${initialDisk.workerLockReclaimed.pid}.`,
    });
  }

  for (const [name, passed] of Object.entries(initialChecks)) {
    if (!passed) {
      if (name === "canonicalProjectionConsistent") {
        for (const divergence of initialDisk.projectionDivergences
          .divergences) {
          addNonHealthyFinding(findings, {
            class: "unhealthy",
            finding: "canonical_projection_divergence",
            detail: `${divergence.change_id}: ${divergence.reasons.join("; ")}`,
            severity: "error",
          });
        }
        continue;
      }
      addNonHealthyFinding(findings, {
        class: "unhealthy",
        finding: name,
        detail:
          initialDisk.errors.join("; ") ||
          "disk probe reported an unhealthy state",
      });
    }
  }

  if (!sessionPointerEnabled) {
    addNonHealthyFinding(findings, {
      class: "informational",
      finding: "session_pointer_out_of_scope",
      detail:
        "Current-session pointer was not probed or repaired for a foreign target project.",
    });
  } else if (initialPointer.probe && !initialPointer.sane) {
    addNonHealthyFinding(findings, {
      class: "phantom_pointer",
      detail: `Session active-change pointer is not sane (${initialPointer.probe.evidence})`,
    });
  }

  if (findings.length === 0) {
    findings.push({ class: "healthy", detail: "All disk checks passed" });
  }

  const activePointer = sessionPointerEnabled
    ? (pointerRepairProvider?.getActivePointer() ?? null)
    : null;
  const phantomProbe = initialPointer.probe;
  for (const finding of findings) {
    if (finding.class !== "phantom_pointer") continue;
    if (phantomProbe?.status === "confirmed_absent" && pointerRepairProvider) {
      const before = activePointer;
      try {
        pointerRepairProvider.clearActivePointer();
        fixesApplied.push({
          class: "phantom_pointer",
          action: "clear_session_pointer",
          outcome: "applied",
          before,
          after: null,
          evidence: `Cleared phantom session pointer '${before}': ${phantomProbe.evidence}`,
        });
      } catch (err) {
        fixesApplied.push({
          class: "phantom_pointer",
          action: "clear_session_pointer",
          outcome: "failed",
          before,
          evidence: `clearActivePointer threw: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else {
      fixesRefused.push({
        class: "phantom_pointer",
        outcome: "approval_required",
        operator_action:
          "Confirm the session pointer target or clear it explicitly, then rerun adv_doctor.",
        proposal: `Session pointer '${activePointer ?? "unknown"}' could not be proven sane. Doctor refuses to clear an indeterminate pointer.`,
        evidence: phantomProbe?.evidence ?? "no probe result",
      });
    }
  }

  const appliedCount = fixesApplied.filter(
    (fix) => fix.outcome === "applied",
  ).length;
  const shouldRecheck =
    appliedCount > 0 &&
    !initialDisk.projectionDivergences.budgetExceeded &&
    !initialDisk.projectionDivergences.truncated;
  const recheckDisk = shouldRecheck
    ? await probeDiskState(store, projectId)
    : initialDisk;
  const recheckPointer = shouldRecheck
    ? await probeSessionPointer(store, projectId, sessionPointerEnabled)
    : initialPointer;
  const verification: DoctorVerification = {
    healthy:
      recheckDisk.projectionReadable &&
      recheckDisk.snapshotIntegrity &&
      recheckPointer.sane &&
      recheckDisk.worktreeCensusReachable &&
      recheckDisk.canonicalProjectionConsistent &&
      recheckDisk.workerLockSane,
    projection_readable: recheckDisk.projectionReadable,
    snapshot_integrity: recheckDisk.snapshotIntegrity,
    session_pointer_sane: recheckPointer.sane,
    worktree_census_reachable: recheckDisk.worktreeCensusReachable,
    canonical_projection_consistent: recheckDisk.canonicalProjectionConsistent,
    worker_lock_sane: recheckDisk.workerLockSane,
    projection_scan: {
      status: recheckDisk.projectionDivergences.budgetExceeded
        ? "budget_exceeded"
        : recheckDisk.projectionDivergences.truncated
          ? "partial"
          : "complete",
      scanned: recheckDisk.projectionDivergences.scanned,
      omitted: recheckDisk.projectionDivergences.omitted,
      divergence_count: recheckDisk.projectionDivergences.divergences.length,
    },
    rechecked_at: new Date().toISOString(),
  };

  const failedCount = fixesApplied.filter(
    (fix) => fix.outcome === "failed",
  ).length;
  const refusedCount = fixesRefused.length;
  const success =
    verification.healthy && failedCount === 0 && refusedCount === 0;

  return formatToolOutput({
    success,
    started_at: startedAt,
    findings,
    fixes_applied: fixesApplied,
    fixes_refused: fixesRefused,
    verification,
    ...(projectContext ? { _projectContext: projectContext } : {}),
    ...(appliedCount > 0
      ? {
          note: "Disk repair applied; verification reflects the repaired state.",
        }
      : {}),
    recommendedNextAction:
      refusedCount > 0
        ? `${refusedCount} approval-required proposal(s) returned; resolve them and rerun adv_doctor.`
        : failedCount > 0
          ? `${failedCount} disk repair(s) failed; rerun adv_doctor after resolving the reported error.`
          : verification.healthy
            ? "System healthy; no action needed."
            : "Disk state is unhealthy; inspect the reported predicates and rerun adv_doctor.",
  });
}
