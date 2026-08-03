/**
 * rq-doctorConsolidation01 (tk-dc21b6a3658d, design D5 / SC2 / SC4 / AC8 / AC9)
 *
 * adv_doctor is the single entry point for infrastructure recovery. It
 * performs diagnose → safe-fix → verify in one call. Unsafe escalations
 * (wrong-type SAs, suspect lock reclaim, ambiguous worker ownership)
 * REFUSE with typed approval-required proposals instead of auto-fixing.
 *
 * Doctor never:
 *   - purges, terminates/resets workflows, consolidates stores
 *   - closes/cancels work, retargets entries, deletes dirty worktrees
 *   - bypasses approval gates for suspect locks or wrong-type mutations
 *
 * The safe subset it CAN apply automatically (each backed by a proven
 * failure class, per design constraint C1):
 *   - stale transport         → STSL reinit
 *   - missing search attrs    → registerMissingAdvSearchAttributes (missing-only)
 *   - worker_down + owned      → worker restart (no lock reclaim)
 *   - phantom session pointer  → clear the session active-change pointer
 *                                (confirmed-absent only; indeterminate refuses)
 *
 * adv_doctor is the single routine recovery entry point. The former
 * per-operation recovery tools (adv_temporal_diagnose/reconnect/
 * register_search_attributes/worker_restart, adv_archive_repair,
 * adv_change_status_repair, adv_epic_repair_membership, adv_change_forget)
 * were retired and consolidated here (design D6 / rq-recoverySurfaceParity01).
 */
// rq-recoverySurfaceRetirement01: per-operation recovery tools retired and consolidated into adv_doctor.
import { z } from "zod";
import type { Store } from "../storage/store";
import { getService, getStslStats, reinitStsl } from "../temporal/service";
import {
  getTemporalHealth,
  isWorkerAffirmativelyAlive,
  type TemporalHealth,
} from "../temporal/health-probe";
import { makeTemporalLifecycleContext } from "../temporal/operations";

import {
  getOrphanQueueAdoptionStatus,
  getTemporalWorkerAliveness,
  getTemporalWorkerDiagnostics,
  restartCurrentProjectTemporalWorker,
} from "../plugin-init";
import { probeTaskQueuePollers } from "../temporal/queue-serviceability";
import { evaluateOrphanAdoptionHealth } from "../temporal/orphan-queue-adopter";
import {
  reconcileTerminalWorkflows,
  type TerminalReconcileResult,
} from "../temporal/reconcile-terminal-workflows";
import { buildTerminalReconcileDeps } from "../temporal/reconcile-terminal-deps";
import { buildProjectTaskQueue } from "../temporal/client";
import { basename, join } from "path";
import { existsSync } from "fs";
import { formatToolOutput } from "../utils/tool-output";
import {
  probeChangePhantomStatus,
  type PhantomProbeResult,
  type ReachabilityDeps,
} from "./_adapters";

/**
 * Typed classification of an infrastructure finding. The class name is
 * the stable identifier callers can branch on (no prose parsing).
 */
export type DoctorFindingClass =
  | "healthy"
  | "stale_transport"
  | "missing_search_attributes"
  | "wrong_type_search_attributes"
  | "worker_down_owned"
  | "suspect_lock"
  | "ambiguous_ownership"
  | "phantom_pointer"
  | "orphan_queue_adoption_degraded"
  | "leaked_terminal_workflow"
  | "unhealthy";

/**
 * A safe fix the doctor applied automatically. Bounded evidence per AC9.
 */
export interface DoctorFixApplied {
  class: DoctorFindingClass;
  action:
    | "stsl_reinit"
    | "register_missing"
    | "worker_restart"
    | "clear_session_pointer"
    | "reconcile_terminal_workflows";
  outcome: "applied" | "no_op" | "failed";
  before?: unknown;
  after?: unknown;
  evidence: string;
}

/**
 * A finding the doctor REFUSED to auto-fix. Carries the typed operator
 * action the user (or operator) must take — doctor never auto-approves.
 */
export interface DoctorFixRefused {
  class: DoctorFindingClass;
  outcome: "approval_required";
  /** Stable, typed operator action description (no prose parsing needed). */
  operator_action: string;
  /** Human-readable proposal restating operator_action with evidence context. */
  proposal: string;
  evidence: string;
}

export interface DoctorFinding {
  class: DoctorFindingClass;
  detail: string;
  finding?: string;
}

interface DoctorVerification {
  healthy: boolean;
  server_alive: boolean;
  worker_alive: boolean;
  queue_serviceable: boolean;
  search_attributes_ok: boolean;
  rechecked_at: string;
}

interface DoctorInput {
  target_path?: string;
  target_confirmed?: true;
  confirmationEvidence?: string;
}

// rq-doctorConsolidation01 option B: phantom-pointer safe-fix.
// rq-doctorPhantomPointer01: module-level provider interface for clearing the active-change session pointer.
// Module-level provider following the getCurrentSessionId pattern.
// Injected by plugin-host (index.ts) only; tests and MCP-server see null,
// so the phantom_pointer check is skipped in those contexts.
export interface DoctorPointerRepairProvider {
  /** Returns the current active-change changeId, or null if none. */
  getActivePointer(): string | null;
  /** Clears the active-change pointer (sets to null). */
  clearActivePointer(): void;
}

let pointerRepairProvider: DoctorPointerRepairProvider | null = null;

/**
 * Set the pointer-repair provider. Called once during plugin-host
 * initialization (index.ts). Pass null to disable (tests, MCP-server).
 */
export function setDoctorPointerRepairProvider(
  provider: DoctorPointerRepairProvider | null,
): void {
  pointerRepairProvider = provider;
}

/**
 * Read the current pointer-repair provider. Test/integration hook so the
 * plugin-host wiring (index.ts) can be verified end-to-end.
 */
export function getDoctorPointerRepairProvider(): DoctorPointerRepairProvider | null {
  return pointerRepairProvider;
}

interface SearchAttributeCheck {
  ok: boolean;
  present: Array<{ name: string }>;
  missing: Array<{ name: string }>;
  wrongType: Array<{
    name: string;
    expectedType?: string;
    actualType?: string;
  }>;
}

interface WorkerDiagnosticsEntry {
  kind: string;
  queues: string[];
  failedQueues: string[];
  alive: boolean;
  diagnostics?: Array<unknown>;
}

const ORPHAN_QUEUE_DIAGNOSTIC_DISPLAY_LIMIT = 50;

function projectFromStore(store: Store): string | undefined {
  // Prefer the external ADV state dir basename (ADV project id), then
  // fall back to undefined — doctor will surface the gap as a finding.
  return store.paths.external ? basename(store.paths.external) : undefined;
}

async function probeQueue(
  projectId: string,
  bundle: ReturnType<typeof getService>,
): Promise<boolean> {
  if (!bundle) return false;
  try {
    const probe = await probeTaskQueuePollers({
      owner: bundle,
      projectId,
      taskQueue: buildProjectTaskQueue(projectId),
    });
    return probe.status === "fresh";
  } catch {
    return false;
  }
}

/**
 * Push a finding that supersedes an optimistic `healthy` finding. If the
 * findings list only contains `healthy`, it is replaced; otherwise the new
 * finding is appended. Keeps the phantom-pointer check (which runs after the
 * healthy default is set) from producing a contradictory `healthy` +
 * `phantom_pointer` result.
 */
function addNonHealthyFinding(
  findings: DoctorFinding[],
  finding: DoctorFinding,
): void {
  if (findings.length === 1 && findings[0].class === "healthy") {
    findings.splice(0, 1);
  }
  findings.push(finding);
}

function isSuspectLock(health: TemporalHealth, workerAlive: boolean): boolean {
  // A "suspect" lock is one that blocks restart but is held by a live
  // process the current ADV worker does NOT own. Doctor must refuse so
  // the operator decides whether to forcibly reclaim.
  if (workerAlive) return false;
  const lock = health.worker_lock;
  if (!lock) return false;
  // The shared health snapshot identifies the lock holder, so a lock held by
  // this process is safe to reclaim; any peer-held lock remains suspect.
  return lock.holder_pid !== process.pid;
}

export const doctorTools = {
  adv_doctor: {
    description:
      "Single entry point for routine infrastructure recovery: diagnose → safe fix → verify. Auto-applies the safe subset (STSL reconnect, missing search-attribute registration, exclusively-owned worker restart). Refuses wrong-type search attributes, suspect worker.lock reclaim, and ambiguous worker ownership with typed approval-required proposals — doctor never bypasses those gates. Does NOT purge, terminate/reset workflows, consolidate stores, close/cancel work, retarget entries, or delete dirty worktrees.",
    args: {
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. Routes the diagnose→fix→verify cycle through that project's expected task queue.",
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

      // ── Step 1: diagnose ─────────────────────────────────────────────
      const health = await getTemporalHealth(projectId);
      const bundle = getService();

      const serverAlive = health.server_alive === true;
      const stslInitialized = bundle !== null;
      const orphanQueueAdoptionStatus = getOrphanQueueAdoptionStatus();
      const orphanQueueAdoption = orphanQueueAdoptionStatus.diagnostics;

      if (!serverAlive || !stslInitialized) {
        findings.push({
          class: "stale_transport",
          detail: !stslInitialized
            ? "STSL bundle is null; service layer not initialized"
            : `Temporal server unreachable: last_error=${health.last_error ?? "n/a"}`,
        });
      }

      // Search attributes probe (cheap; cheap to fail too).
      let searchAttrs: SearchAttributeCheck | null = null;
      if (bundle && projectId) {
        try {
          searchAttrs = (await bundle.checkSearchAttributes(
            makeTemporalLifecycleContext(
              projectId,
              "adv_doctor.checkSearchAttributes",
              5_000,
            ),
          )) as SearchAttributeCheck;
        } catch {
          searchAttrs = null;
        }
      }
      if (searchAttrs && searchAttrs.wrongType.length > 0) {
        // Wrong-type SAs are a hard refuse — the operator must resolve
        // the type mismatch on the server; auto-registering missing SAs
        // alongside a wrong-type row could mask the operator decision.
        findings.push({
          class: "wrong_type_search_attributes",
          detail: `Wrong-type search attributes: ${searchAttrs.wrongType
            .map((a) => `${a.name}(${a.expectedType}→${a.actualType})`)
            .join(", ")}`,
        });
      } else if (searchAttrs && searchAttrs.missing.length > 0) {
        findings.push({
          class: "missing_search_attributes",
          detail: `Missing search attributes: ${searchAttrs.missing
            .map((a) => a.name)
            .join(", ")}`,
        });
      }

      // Worker + queue probe.
      // adv_doctor runs host-side and always resolves a worker role, so the
      // unavailable arm is unreachable at this boundary.
      const workerAlive = isWorkerAffirmativelyAlive(health.worker_alive);
      const queueServiceable = projectId
        ? await probeQueue(projectId, bundle)
        : false;
      if (!workerAlive) {
        if (isSuspectLock(health, workerAlive)) {
          findings.push({
            class: "suspect_lock",
            detail: `worker.lock held by peer pid=${health.worker_lock?.holder_pid} (schema_version=${health.worker_lock?.schema_version}); doctor refuses to reclaim`,
          });
        } else {
          // Distinguish "exclusively owned" (safe to restart) from
          // "ambiguous ownership" (peer workers might be serving the
          // queue from another OpenCode session).
          const workerDiagnostics =
            (await getTemporalWorkerDiagnostics()) as WorkerDiagnosticsEntry[];
          const ourWorkerDown = workerDiagnostics.some(
            (w) => w.kind === "out_of_process" && !w.alive,
          );
          const peerServing =
            queueServiceable &&
            !workerDiagnostics.some(
              (w) => w.kind === "out_of_process" && w.alive,
            );
          if (ourWorkerDown && !peerServing) {
            findings.push({
              class: "worker_down_owned",
              detail:
                "Local worker is down and no peer worker is serving the expected queue; safe to restart",
            });
          } else if (queueServiceable && peerServing) {
            findings.push({
              class: "ambiguous_ownership",
              detail:
                "Local worker is down but the queue is being served by a peer; doctor cannot determine whether a restart is safe",
            });
          } else {
            // Default: worker is down with no peer and no suspect lock.
            findings.push({
              class: "worker_down_owned",
              detail:
                "Local worker is down; no suspect lock and no peer contention",
            });
          }
        }
      }

      // AC4: a live worker without active orphan-queue adoption is an
      // unhealthy condition unless adoption is explicitly disabled.
      if (
        getTemporalWorkerAliveness() &&
        !orphanQueueAdoptionStatus.enabled &&
        orphanQueueAdoptionStatus.reason !== "kill_switch"
      ) {
        findings.push({
          class: "unhealthy",
          finding: "orphan_queue_adoption_not_active",
          detail: orphanQueueAdoptionStatus.reason ?? "unknown",
        });
      }

      // A constructed adopter is not a working adopter. The AC4 check above
      // only asks whether an adopter EXISTS; #327 ran enabled and live while
      // every probe reported healthy, because nothing asserted that scans were
      // completing. Assert forward progress, not just presence.
      if (orphanQueueAdoptionStatus.enabled && orphanQueueAdoption) {
        const adoptionHealth = evaluateOrphanAdoptionHealth(
          orphanQueueAdoption,
          Date.now(),
        );
        if (adoptionHealth.state !== "ok") {
          const because = adoptionHealth.lastScanError
            ? `; last error: ${adoptionHealth.lastScanError}`
            : "";
          findings.push({
            class: "orphan_queue_adoption_degraded",
            finding: adoptionHealth.state,
            detail:
              adoptionHealth.state === "stuck_scan"
                ? `orphan enumeration in flight ${adoptionHealth.stuckForMs}ms without settling — prior-session workflows are unreachable${because}`
                : `${adoptionHealth.consecutiveScanFailures} consecutive orphan enumeration failures — prior-session workflows may be unreachable${because}`,
          });
        }
      }

      // Settle workflows leaked by archive's disk-recovery fallback. That path
      // writes the bundle and converges disk state but never fires the terminal
      // signal, so the workflow blocks in `wf.condition` forever and keeps its
      // session queue alive in the orphan enumeration permanently. It cannot be
      // settled passively — nothing touches an archived change again — so an
      // active sweep is required. Idempotent, and gated on positive archive
      // evidence plus an active-change veto.
      let terminalReconcile: TerminalReconcileResult | null = null;
      if (bundle && projectId) {
        try {
          terminalReconcile = await reconcileTerminalWorkflows(
            bundle,
            projectId,
            buildTerminalReconcileDeps({
              projectId,
              archiveDir: store.paths.archive,
              changesDir: store.paths.changes,
              owner: bundle,
            }),
          );
          if (terminalReconcile.reconciled.length > 0) {
            fixesApplied.push({
              class: "leaked_terminal_workflow",
              action: "reconcile_terminal_workflows",
              outcome: "applied",
              after: { reconciled: terminalReconcile.reconciled.length },
              evidence: `sent terminal signal to ${terminalReconcile.reconciled.length} RUNNING workflow(s) whose change is archived on disk`,
            });
          }
          if (terminalReconcile.failed.length > 0) {
            findings.push({
              class: "leaked_terminal_workflow",
              finding: "terminal_reconcile_partial",
              detail: `${terminalReconcile.failed.length} terminal signal(s) failed; rerun adv_doctor once the worker is reachable`,
            });
          }
        } catch (err) {
          findings.push({
            class: "leaked_terminal_workflow",
            finding: "terminal_reconcile_failed",
            detail: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (findings.length === 0) {
        findings.push({ class: "healthy", detail: "All checks passed" });
      }

      // rq-doctorConsolidation01 option B: phantom session-pointer check.
      // Only runs in the plugin-host (provider injected); tests and MCP
      // server see a null provider and skip this entirely. Uses a tri-state
      // probe so the pointer is cleared ONLY on confirmed-absent evidence,
      // never on a transport failure / timeout (indeterminate → refuse).
      let phantomProbe: PhantomProbeResult | null = null;
      const activePointer = pointerRepairProvider?.getActivePointer() ?? null;
      if (pointerRepairProvider && activePointer && projectId) {
        try {
          // Conservative tri-state deps: disk is the deterministic absent
          // signal (existsSync); store lookups PROPAGATE errors so a
          // transport failure classifies as indeterminate rather than a
          // false "absent" (the isChangeReachable deps swallow errors to
          // false — unsafe for a clearing decision).
          const phantomDeps: ReachabilityDeps = {
            visibilityLister: async (_pid: string, cid: string) => {
              const result = await store.changes.get(cid);
              return result.success;
            },
            diskChecker: async (_dir: string, cid: string) =>
              existsSync(join(store.paths.changes, cid, "change.json")),
            workflowStateGetter: async (cid: string) => {
              const result = await store.changes.get(cid);
              return result.success;
            },
          };
          phantomProbe = await probeChangePhantomStatus(
            projectId,
            activePointer,
            phantomDeps,
            store.paths.changes,
          );
          if (phantomProbe.status === "confirmed_absent") {
            addNonHealthyFinding(findings, {
              class: "phantom_pointer",
              detail: `Session active-change pointer references '${activePointer}' which is confirmed absent (${phantomProbe.evidence})`,
            });
          } else if (phantomProbe.status === "indeterminate") {
            addNonHealthyFinding(findings, {
              class: "phantom_pointer",
              detail: `Session pointer '${activePointer}' could not be confirmed present or absent (${phantomProbe.evidence})`,
            });
          }
          // confirmed_present → pointer is valid; no finding.
        } catch (err) {
          phantomProbe = {
            status: "indeterminate",
            evidence: `phantom probe threw: ${
              err instanceof Error ? err.message : String(err)
            }`,
          };
          addNonHealthyFinding(findings, {
            class: "phantom_pointer",
            detail: `Session pointer '${activePointer}' probe failed (${phantomProbe.evidence})`,
          });
        }
      }

      // ── Step 2: safe fix (or refuse) ────────────────────────────────
      for (const finding of findings) {
        switch (finding.class) {
          case "stale_transport": {
            const before = getStslStats();
            try {
              await reinitStsl();
              const after = getStslStats();
              fixesApplied.push({
                class: "stale_transport",
                action: "stsl_reinit",
                outcome: "applied",
                before,
                after,
                evidence: `STSL reinit applied: reconnectCount ${before.reconnectCount}→${after.reconnectCount}`,
              });
            } catch (err) {
              fixesApplied.push({
                class: "stale_transport",
                action: "stsl_reinit",
                outcome: "failed",
                before,
                evidence: `STSL reinit threw: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              });
            }
            break;
          }
          case "missing_search_attributes": {
            if (!bundle) {
              fixesRefused.push({
                class: "missing_search_attributes",
                outcome: "approval_required",
                operator_action:
                  "Restore the Temporal service (the STSL bundle is null) then rerun adv_doctor.",
                proposal:
                  "Cannot register search attributes without a Temporal service connection. Operator must restore connectivity first.",
                evidence: "STSL bundle is null",
              });
              break;
            }
            if (bundle && projectId) {
              try {
                const ctx = makeTemporalLifecycleContext(
                  projectId,
                  "adv_doctor.registerSearchAttributes",
                  5_000,
                );
                const before = searchAttrs?.missing.map((a) => a.name) ?? [];
                await bundle.registerSearchAttributes(ctx);
                const recheck = (await bundle.checkSearchAttributes(
                  ctx,
                )) as SearchAttributeCheck;
                const after = recheck.missing.map((a) => a.name);
                const created = before.filter((n) => !after.includes(n));
                fixesApplied.push({
                  class: "missing_search_attributes",
                  action: "register_missing",
                  outcome: created.length > 0 ? "applied" : "no_op",
                  before,
                  after: created,
                  evidence: `Registered ${created.length} missing attribute(s); remainingMissing=${after.length}`,
                });
              } catch (err) {
                fixesApplied.push({
                  class: "missing_search_attributes",
                  action: "register_missing",
                  outcome: "failed",
                  evidence: `registerSearchAttributes threw: ${
                    err instanceof Error ? err.message : String(err)
                  }`,
                });
              }
            } else {
              fixesRefused.push({
                class: "missing_search_attributes",
                outcome: "approval_required",
                operator_action:
                  "Provide a valid project id so search attributes can be registered.",
                proposal:
                  "Cannot register search attributes without a project id. Ensure the store exposes a valid ADV project id.",
                evidence: "projectId is undefined",
              });
            }
            break;
          }
          case "worker_down_owned": {
            try {
              const result = await restartCurrentProjectTemporalWorker(
                store.paths.root,
                { approvedLockReclaim: false, approvalEvidence: undefined },
              );
              fixesApplied.push({
                class: "worker_down_owned",
                action: "worker_restart",
                outcome: "applied",
                before: {
                  worker_alive: { status: "available", value: false },
                },
                after: {
                  projectId: result.projectId,
                  expectedQueue: result.expectedQueue,
                  queues: result.queues,
                },
                evidence: `Worker restarted; expectedQueue=${result.expectedQueue ?? "n/a"}`,
              });
            } catch (err) {
              fixesApplied.push({
                class: "worker_down_owned",
                action: "worker_restart",
                outcome: "failed",
                evidence: `worker restart threw: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              });
            }
            break;
          }
          case "wrong_type_search_attributes": {
            fixesRefused.push({
              class: "wrong_type_search_attributes",
              outcome: "approval_required",
              operator_action:
                "Manually resolve the wrong-type search attributes on the Temporal server (doctor refuses to mutate existing types).",
              proposal: `Wrong-type search attributes detected: ${searchAttrs?.wrongType
                .map(
                  (a) =>
                    `${a.name} expected=${a.expectedType ?? "?"} actual=${a.actualType ?? "?"}`,
                )
                .join(
                  ", ",
                )}. Operator must realign the server schema; doctor does not auto-mutate existing types.`,
              evidence: `wrongType=${searchAttrs?.wrongType.length ?? 0}`,
            });
            break;
          }
          case "suspect_lock": {
            fixesRefused.push({
              class: "suspect_lock",
              outcome: "approval_required",
              operator_action:
                "Operator must reclaim the suspect live worker.lock explicitly (stop the holding process, or restart OpenCode). Doctor never forcibly reclaims a live lock it does not own.",
              proposal: `worker.lock held by peer pid=${health.worker_lock?.holder_pid} (schema_version=${health.worker_lock?.schema_version}). Doctor refuses to forcibly reclaim; operator must approve explicitly.`,
              evidence: `worker_lock.holder_pid=${health.worker_lock?.holder_pid}, schema_version=${health.worker_lock?.schema_version}`,
            });
            break;
          }
          case "ambiguous_ownership": {
            fixesRefused.push({
              class: "ambiguous_ownership",
              outcome: "approval_required",
              operator_action:
                "Resolve the ownership ambiguity (close the peer OpenCode session, or target the specific project) before restarting the worker. Doctor cannot determine whether a local restart is safe while a peer serves the queue.",
              proposal:
                "Local worker is down but the queue is served by a peer; doctor cannot determine whether a local restart is safe. Operator must remove the ambiguity (close the peer session or scope to the specific project).",
              evidence: `queueServiceable=${queueServiceable}, worker_alive=${workerAlive}`,
            });
            break;
          }
          case "phantom_pointer": {
            // rq-doctorConsolidation01 option B: clear the session pointer
            // ONLY on confirmed-absent evidence. Indeterminate → refuse
            // (transport failure could mask a live change; clearing would
            // lose the operator's working context).
            if (
              phantomProbe?.status === "confirmed_absent" &&
              pointerRepairProvider
            ) {
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
                  evidence: `clearActivePointer threw: ${
                    err instanceof Error ? err.message : String(err)
                  }`,
                });
              }
            } else {
              fixesRefused.push({
                class: "phantom_pointer",
                outcome: "approval_required",
                operator_action:
                  "Restore Temporal/store connectivity (adv_doctor's transport fixes, or restart OpenCode) then rerun adv_doctor. If the change genuinely no longer exists, the next run will confirm absence and clear the pointer.",
                proposal: `Session pointer '${activePointer}' could not be confirmed absent (probe was indeterminate: ${phantomProbe?.evidence ?? "no probe result"}). Doctor refuses to clear on ambiguous evidence — a transport failure must not be mistaken for a deleted change.`,
                evidence: phantomProbe?.evidence ?? "no probe result",
              });
            }
            break;
          }
          case "healthy":
            // Nothing to fix.
            break;
        }
      }

      // ── Step 3: verify ───────────────────────────────────────────────
      // Re-probe after fixes. Best-effort: a verify failure does not
      // mask the fix outcomes above.
      let verification: DoctorVerification;
      try {
        const recheck = await getTemporalHealth(projectId);
        const recheckBundle = getService();
        const recheckQueue = projectId
          ? await probeQueue(projectId, recheckBundle)
          : false;
        let recheckSAs = true;
        if (recheckBundle && projectId) {
          try {
            const sa = (await recheckBundle.checkSearchAttributes(
              makeTemporalLifecycleContext(
                projectId,
                "adv_doctor.verify.checkSearchAttributes",
                5_000,
              ),
            )) as SearchAttributeCheck;
            recheckSAs = sa.ok;
          } catch {
            recheckSAs = false;
          }
        } else {
          recheckSAs = false;
        }
        verification = {
          healthy:
            recheck.server_alive === true &&
            isWorkerAffirmativelyAlive(recheck.worker_alive) &&
            recheckQueue &&
            recheckSAs,
          server_alive: recheck.server_alive === true,
          // adv_doctor is host-side and always resolves a worker role; retain
          // boolean verification output at this boundary.
          worker_alive: isWorkerAffirmativelyAlive(recheck.worker_alive),
          queue_serviceable: recheckQueue,
          search_attributes_ok: recheckSAs,
          rechecked_at: new Date().toISOString(),
        };
      } catch {
        verification = {
          healthy: false,
          server_alive: false,
          worker_alive: false,
          queue_serviceable: false,
          search_attributes_ok: false,
          rechecked_at: new Date().toISOString(),
        };
      }

      const appliedCount = fixesApplied.filter(
        (f) => f.outcome === "applied",
      ).length;
      const failedCount = fixesApplied.filter(
        (f) => f.outcome === "failed",
      ).length;
      const refusedCount = fixesRefused.length;

      return formatToolOutput({
        success:
          appliedCount > 0 ||
          (findings.every((f) => f.class === "healthy") && refusedCount === 0),
        started_at: startedAt,
        findings,
        fixes_applied: fixesApplied,
        fixes_refused: fixesRefused,
        verification,
        orphan_queue_adoption: orphanQueueAdoptionStatus.enabled
          ? {
              enabled: true,
              scanInFlight: orphanQueueAdoption!.scanInFlight,
              // Enumeration-phase health. Without these an operator cannot
              // distinguish "adoption is working" from "adoption is silently
              // failing" — the ambiguity that made #327 hard to classify.
              health: evaluateOrphanAdoptionHealth(
                orphanQueueAdoption!,
                Date.now(),
              ).state,
              scanFailureCount: orphanQueueAdoption!.scanFailureCount,
              consecutiveScanFailures:
                orphanQueueAdoption!.consecutiveScanFailures,
              lastScanError: orphanQueueAdoption!.lastScanError,
              lastScanStartedAt: orphanQueueAdoption!.lastScanStartedAt,
              lastScanDurationMs: orphanQueueAdoption!.lastScanDurationMs,
              suppressedShutdownCount:
                orphanQueueAdoption!.suppressedShutdownCount,
              trackedQueues: orphanQueueAdoption!.trackedQueues.slice(
                0,
                ORPHAN_QUEUE_DIAGNOSTIC_DISPLAY_LIMIT,
              ),
              omittedTrackedQueues: Math.max(
                0,
                orphanQueueAdoption!.trackedQueues.length -
                  ORPHAN_QUEUE_DIAGNOSTIC_DISPLAY_LIMIT,
              ),
            }
          : {
              enabled: false,
              ...(orphanQueueAdoptionStatus.reason
                ? { reason: orphanQueueAdoptionStatus.reason }
                : {}),
              note: "orphan-queue adoption: disabled (no active adopter)",
            },
        ...(terminalReconcile
          ? {
              terminal_reconciliation: {
                inspected: terminalReconcile.inspected,
                reconciled: terminalReconcile.reconciled.length,
                skipped: terminalReconcile.skipped.length,
                failed: terminalReconcile.failed.length,
                capped: terminalReconcile.capped,
              },
            }
          : {}),
        recommendedNextAction:
          refusedCount > 0
            ? `${refusedCount} approval-required proposal(s) returned — operator must resolve manually; rerun adv_doctor after the operator action.`
            : failedCount > 0
              ? `${failedCount} safe fix(es) failed; rerun adv_doctor. If it persists, restart OpenCode to clear stale plugin/worker state.`
              : appliedCount > 0 && !verification.healthy
                ? "Fixes applied but verification did not converge; rerun adv_doctor. If it persists, restart OpenCode."
                : appliedCount > 0
                  ? "All safe fixes applied and verified; retry the previously blocked ADV command."
                  : "System healthy; no action needed.",
      });
    },
  },
};
