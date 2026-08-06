/**
 * Disk-state diagnostics and the safe session-pointer repair.
 *
 * `adv_doctor` reports only conditions this process can inspect locally:
 * readable projections, valid snapshots, reachable worktree state, and
 * session-pointer sanity. It does not claim anything about a server,
 * transport, worker, queue, or remote index.
 */
import { existsSync } from "fs";
import { basename, join } from "path";
import { z } from "zod";
import type { Store } from "../storage/store";
import { formatToolOutput } from "../utils/tool-output";
import { getWorktreeCensus } from "../utils/worktree-census";
import { scanSnapshotHealth } from "./snapshot-scan";

export type DoctorFindingClass =
  | "healthy"
  | "phantom_pointer"
  | "informational"
  | "unhealthy";

export interface DoctorFixApplied {
  class: DoctorFindingClass;
  action: "clear_session_pointer";
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
      store.status(),
      store.specs.list(),
      store.changes.list({}),
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

  return {
    projectionReadable,
    snapshotIntegrity,
    worktreeCensusReachable,
    errors,
  };
}

async function probeSessionPointer(
  store: Store,
  projectId: string | undefined,
): Promise<{
  sane: boolean;
  probe: { status: "confirmed_present" | "confirmed_absent" | "indeterminate"; evidence: string } | null;
}> {
  const activePointer = pointerRepairProvider?.getActivePointer() ?? null;
  if (!pointerRepairProvider || !activePointer || !projectId) {
    return { sane: true, probe: null };
  }

  const onDisk = existsSync(join(store.paths.changes, activePointer, "change.json"));
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

export const doctorTools = {
  adv_doctor: {
    description:
      "Diagnose disk-backed ADV state and apply the safe session-pointer repair. Reports projection readability, snapshot integrity, worktree-census reachability, and pointer sanity.",
    args: {
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, routes diagnostics through that project.",
        ),
      target_confirmed: z
        .literal(true)
        .optional()
        .describe(
          "Required for untrusted target_path mutation. Confirms the target project was explicitly approved.",
        ),
      confirmationEvidence: z
        .string()
        .optional()
        .describe(
          "Required with target_confirmed for untrusted target_path mutation. Cite user approval evidence.",
        ),
    },
    execute: async (_args: DoctorInput, store: Store): Promise<string> => {
      const projectId = projectFromStore(store);
      const findings: DoctorFinding[] = [];
      const fixesApplied: DoctorFixApplied[] = [];
      const fixesRefused: DoctorFixRefused[] = [];
      const startedAt = new Date().toISOString();

      const initialDisk = await probeDiskState(store, projectId);
      const initialPointer = await probeSessionPointer(store, projectId);
      const initialChecks = {
        projectionReadable: initialDisk.projectionReadable,
        snapshotIntegrity: initialDisk.snapshotIntegrity,
        sessionPointerSane: initialPointer.sane,
        worktreeCensusReachable: initialDisk.worktreeCensusReachable,
      };

      for (const [name, passed] of Object.entries(initialChecks)) {
        if (!passed) {
          addNonHealthyFinding(findings, {
            class: "unhealthy",
            finding: name,
            detail:
              initialDisk.errors.join("; ") ||
              "disk probe reported an unhealthy state",
          });
        }
      }

      if (initialPointer.probe && !initialPointer.sane) {
        addNonHealthyFinding(findings, {
          class: "phantom_pointer",
          detail: `Session active-change pointer is not sane (${initialPointer.probe.evidence})`,
        });
      }

      if (findings.length === 0) {
        findings.push({ class: "healthy", detail: "All disk checks passed" });
      }

      const activePointer = pointerRepairProvider?.getActivePointer() ?? null;
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

      const recheckDisk = await probeDiskState(store, projectId);
      const recheckPointer = await probeSessionPointer(store, projectId);
      const verification: DoctorVerification = {
        healthy:
          recheckDisk.projectionReadable &&
          recheckDisk.snapshotIntegrity &&
          recheckPointer.sane &&
          recheckDisk.worktreeCensusReachable,
        projection_readable: recheckDisk.projectionReadable,
        snapshot_integrity: recheckDisk.snapshotIntegrity,
        session_pointer_sane: recheckPointer.sane,
        worktree_census_reachable: recheckDisk.worktreeCensusReachable,
        rechecked_at: new Date().toISOString(),
      };

      const appliedCount = fixesApplied.filter(
        (fix) => fix.outcome === "applied",
      ).length;
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
        ...(appliedCount > 0
          ? { note: "Disk repair applied; verification reflects the repaired state." }
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
    },
  },
};
