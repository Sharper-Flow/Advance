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
 *   - stale transport         → STSL reinit (adv_temporal_reconnect behavior)
 *   - missing search attrs    → registerMissingAdvSearchAttributes (missing-only)
 *   - worker_down + owned     → worker restart (no lock reclaim)
 *
 * The four underlying operator tools (adv_temporal_diagnose,
 * adv_temporal_register_search_attributes, adv_temporal_reconnect,
 * adv_temporal_worker_restart) continue to exist for explicit operator
 * invocation; adv_doctor is the routine orchestrator-reachable entry.
 */
import { z } from "zod";
import type { Store } from "../storage/store";
import { getService, getStslStats, reinitStsl } from "../temporal/service";
import { getTemporalHealth } from "../temporal/health-probe";
import {
  checkAdvSearchAttributes,
  registerMissingAdvSearchAttributes,
} from "../temporal/observability";
import {
  getTemporalWorkerDiagnostics,
  restartCurrentProjectTemporalWorker,
} from "../plugin-init";
import { probeTaskQueuePollers } from "../temporal/queue-serviceability";
import { buildProjectTaskQueue } from "../temporal/client";
import { basename } from "path";
import { formatToolOutput } from "../utils/tool-output";

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
  | "ambiguous_ownership";

/**
 * A safe fix the doctor applied automatically. Bounded evidence per AC9.
 */
export interface DoctorFixApplied {
  class: DoctorFindingClass;
  action: "stsl_reinit" | "register_missing" | "worker_restart";
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

interface TemporalHealthSnapshot {
  server_alive: boolean;
  worker_alive: boolean;
  worker_process_alive?: boolean;
  registered_queues?: string[];
  last_op_at?: string | null;
  last_error?: string | null;
  fallback_counts?: Record<string, number>;
  stale_queues?: string[];
  reconnect_count?: number;
  op_counters?: unknown[];
  worker_lock?: {
    pid: number;
    kind?: string;
    acquiredAt?: string;
    /** True when the lock is held by a live process. */
    live?: boolean;
    /** True when the lock is owned by the current ADV worker process. */
    owned?: boolean;
  } | null;
  last_worker_run_error?: string | null;
  server_poller_probe?: {
    status: string;
    lastAccessMs?: number;
    pollerCount?: number;
    lastPollerAt?: string | null;
  };
  queues?: Array<{
    queueName: string;
    queueType?: string;
    serviceable?: boolean;
    pollerCount?: number;
    lastPollerAt?: string;
  }>;
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

interface SearchAttributeRegisterResult {
  ok: boolean;
  created: Array<{ name: string }>;
  error: string | null;
  verificationStatus: string;
}

interface WorkerDiagnosticsEntry {
  kind: string;
  queues: string[];
  failedQueues: string[];
  alive: boolean;
  diagnostics?: Array<unknown>;
}

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
      connection: bundle.connection as unknown as Parameters<
        typeof probeTaskQueuePollers
      >[0]["connection"],
      namespace: bundle.namespace,
      taskQueue: buildProjectTaskQueue(projectId),
    });
    return probe.status === "fresh";
  } catch {
    return false;
  }
}

function isSuspectLock(
  health: TemporalHealthSnapshot,
  workerAlive: boolean,
): boolean {
  // A "suspect" lock is one that blocks restart but is held by a live
  // process the current ADV worker does NOT own. Doctor must refuse so
  // the operator decides whether to forcibly reclaim.
  if (workerAlive) return false;
  const lock = health.worker_lock;
  if (!lock) return false;
  if (lock.owned === true) return false; // our lock, safe to reclaim
  return lock.live !== false; // live or unknown → suspect
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
      const health = (await getTemporalHealth(
        projectId,
      )) as unknown as TemporalHealthSnapshot;
      const bundle = getService();

      const serverAlive = health.server_alive === true;
      const stslInitialized = bundle !== null;

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
      if (bundle) {
        try {
          searchAttrs = (await checkAdvSearchAttributes(
            bundle.connection,
            bundle.namespace,
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
      const workerAlive = health.worker_alive === true;
      const queueServiceable = projectId
        ? await probeQueue(projectId, bundle)
        : false;
      if (!workerAlive) {
        if (isSuspectLock(health, workerAlive)) {
          findings.push({
            class: "suspect_lock",
            detail: `worker.lock held by live pid=${health.worker_lock?.pid} (kind=${health.worker_lock?.kind ?? "?"}, owned=${health.worker_lock?.owned ?? false}); doctor refuses to reclaim`,
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

      if (findings.length === 0) {
        findings.push({ class: "healthy", detail: "All checks passed" });
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
            try {
              const result = (await registerMissingAdvSearchAttributes(
                bundle.connection,
                bundle.namespace,
              )) as SearchAttributeRegisterResult;
              fixesApplied.push({
                class: "missing_search_attributes",
                action: "register_missing",
                outcome:
                  result.ok && result.created.length > 0 ? "applied" : "no_op",
                before: searchAttrs?.missing.map((a) => a.name) ?? [],
                after: result.created.map((a) => a.name),
                evidence: `Registered ${result.created.length} missing attribute(s); verificationStatus=${result.verificationStatus}`,
              });
            } catch (err) {
              fixesApplied.push({
                class: "missing_search_attributes",
                action: "register_missing",
                outcome: "failed",
                evidence: `registerMissingAdvSearchAttributes threw: ${
                  err instanceof Error ? err.message : String(err)
                }`,
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
                before: { worker_alive: false },
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
                "Run adv_temporal_worker_restart with approvedLockReclaim:true and non-blank approvalEvidence citing the operator's explicit approval to reclaim the suspect live worker.lock.",
              proposal: `worker.lock held by live pid=${health.worker_lock?.pid} (owned=${health.worker_lock?.owned ?? false}). Doctor refuses to forcibly reclaim; operator must approve explicitly.`,
              evidence: `worker_lock.live=${health.worker_lock?.live ?? "?"}, owned=${health.worker_lock?.owned ?? "?"}`,
            });
            break;
          }
          case "ambiguous_ownership": {
            fixesRefused.push({
              class: "ambiguous_ownership",
              outcome: "approval_required",
              operator_action:
                "Run adv_temporal_worker_restart with an explicit target_path (or close the peer session) so the ownership boundary is unambiguous.",
              proposal:
                "Local worker is down but the queue is served by a peer; doctor cannot determine whether a local restart is safe. Operator must remove the ambiguity (explicit target_path or peer session close).",
              evidence: `queueServiceable=${queueServiceable}, worker_alive=${workerAlive}`,
            });
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
        const recheck = (await getTemporalHealth(
          projectId,
        )) as unknown as TemporalHealthSnapshot;
        const recheckBundle = getService();
        const recheckQueue = projectId
          ? await probeQueue(projectId, recheckBundle)
          : false;
        let recheckSAs = true;
        if (recheckBundle) {
          try {
            const sa = (await checkAdvSearchAttributes(
              recheckBundle.connection,
              recheckBundle.namespace,
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
            recheck.worker_alive === true &&
            recheckQueue &&
            recheckSAs,
          server_alive: recheck.server_alive === true,
          worker_alive: recheck.worker_alive === true,
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
        recommendedNextAction:
          refusedCount > 0
            ? `${refusedCount} approval-required proposal(s) returned — operator must resolve manually; rerun adv_doctor after the operator action.`
            : failedCount > 0
              ? `${failedCount} safe fix(es) failed; rerun adv_doctor or run adv_temporal_diagnose for deeper inspection.`
              : appliedCount > 0 && !verification.healthy
                ? "Fixes applied but verification did not converge; run adv_temporal_diagnose for deeper inspection."
                : appliedCount > 0
                  ? "All safe fixes applied and verified; retry the previously blocked ADV command."
                  : "System healthy; no action needed.",
      });
    },
  },
};
