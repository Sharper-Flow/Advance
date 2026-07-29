/**
 * Terminal-workflow reconciliation.
 *
 * `changeWorkflow` already completes itself when it observes a terminal status
 * (`workflows.ts` — `wf.condition` wakes on `status === "archived" | "closed"`
 * and returns). That mechanism works.
 *
 * The leak is upstream of it. When `adv_change_archive` cannot reach the
 * workflow it falls back to `recover_via_disk`: the bundle is written, disk
 * state is converged, `success: true` is returned — and the terminal signal is
 * never fired. The workflow therefore never learns it is archived and blocks in
 * `wf.condition` forever, keeping its session task queue alive in the orphan
 * enumeration permanently.
 *
 * That fallback fires exactly when the workflow is unreachable, so the failure
 * is self-reinforcing: every archive during a blackout leaks a workflow, which
 * enlarges the orphan backlog, which slows adoption, which prolongs blackouts.
 * `RECOVERY_RECONCILIATION_WARNING` names the debt but nothing settles it, and
 * it cannot be settled passively — once archived, nothing touches that change
 * again. It requires an active sweep.
 *
 * Signals do NOT require a live poller to be accepted by the server, so this
 * sweep works against unadopted queues: the signal is durably queued and the
 * workflow completes as soon as adoption reaches it.
 *
 * SAFETY. Completing a workflow is irreversible, so reconciliation demands
 * POSITIVE terminal evidence and never infers it from absence:
 *   1. the change must have an archive bundle on disk, AND
 *   2. it must NOT be present as an active change.
 * Anything ambiguous is skipped, and the sweep is bounded and dry-runnable.
 */

import { CHANGE_WORKFLOW_PREFIX } from "./contracts";
import { escapeVisibilityValue } from "./lifecycle-visibility";

/** Hard cap on inspected workflows per sweep (safety bound). */
const INSPECTION_LIMIT = 500;

/** Default cap on terminal signals fired per sweep. */
const DEFAULT_MAX_RECONCILE_PER_SWEEP = 25;

/**
 * Minimal Visibility client shape. `@temporalio/client` Client satisfies this
 * structurally.
 */
export interface TerminalReconcileClient {
  workflow: {
    list: (opts: { query: string }) => AsyncIterable<{
      workflowId: string;
      status: { name: string };
    }>;
  };
}

export interface TerminalReconcileDeps {
  /**
   * Change ids that have an archive bundle on disk. This is the POSITIVE
   * terminal evidence — reconciliation never proceeds without a hit here.
   */
  listArchivedChangeIds(): Promise<ReadonlySet<string>>;
  /**
   * Change ids still present as active changes. A hit here is an absolute veto,
   * even when an archive bundle also exists (a re-opened or re-created change
   * must never be completed out from under the user).
   */
  listActiveChangeIds(): Promise<ReadonlySet<string>>;
  /**
   * Fire the reducer-only terminal signal for this change. Server ACK is
   * sufficient; the workflow completes once a poller drains the queue.
   */
  fireTerminal(changeId: string): Promise<void>;
}

export interface TerminalReconcileOptions {
  /** Report what would be reconciled without firing any signal. */
  dryRun?: boolean;
  /** Cap signals fired in one sweep (default 25). */
  maxPerSweep?: number;
}

export type TerminalReconcileSkipReason =
  | "still_active"
  | "no_archive_evidence";

export interface TerminalReconcileResult {
  /** RUNNING change workflows inspected. */
  inspected: number;
  /** Change ids reconciled (or that would be, under dryRun). */
  reconciled: string[];
  /** Change ids deliberately left alone, with the reason. */
  skipped: Array<{ changeId: string; reason: TerminalReconcileSkipReason }>;
  /** Change ids whose terminal signal threw. */
  failed: Array<{ changeId: string; error: string }>;
  /** True when the per-sweep cap stopped the sweep early. */
  capped: boolean;
  dryRun: boolean;
}

function summarize(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > 200 ? `${msg.slice(0, 197)}...` : msg;
}

/**
 * Sweep RUNNING change workflows and complete the ones whose change is
 * provably terminal on disk.
 *
 * Idempotent: the terminal signals are reducer-only status flips, so
 * re-signalling an already-archived workflow is a no-op.
 */
export async function reconcileTerminalWorkflows(
  client: TerminalReconcileClient,
  projectId: string,
  deps: TerminalReconcileDeps,
  options: TerminalReconcileOptions = {},
): Promise<TerminalReconcileResult> {
  const dryRun = options.dryRun === true;
  const maxPerSweep = options.maxPerSweep ?? DEFAULT_MAX_RECONCILE_PER_SWEEP;

  const result: TerminalReconcileResult = {
    inspected: 0,
    reconciled: [],
    skipped: [],
    failed: [],
    capped: false,
    dryRun,
  };

  if (maxPerSweep <= 0) return result;

  const [archived, active] = await Promise.all([
    deps.listArchivedChangeIds(),
    deps.listActiveChangeIds(),
  ]);

  // No archive bundles means no positive evidence for anything; skip the
  // Visibility round-trip entirely.
  if (archived.size === 0) return result;

  const safeProjectId = escapeVisibilityValue(projectId);
  const query = `AdvAffectedProjects = "${safeProjectId}"`;
  const projectPrefix = `${CHANGE_WORKFLOW_PREFIX}${projectId}/`;

  const candidates: string[] = [];
  for await (const wf of client.workflow.list({ query })) {
    if (result.inspected >= INSPECTION_LIMIT) break;

    // Change workflows only (exclude epics and anything else).
    if (!wf.workflowId.startsWith(projectPrefix)) continue;
    // Only RUNNING workflows can be leaked; terminal ones need nothing.
    if (wf.status.name !== "RUNNING") continue;

    result.inspected++;

    const changeId = wf.workflowId.slice(projectPrefix.length);
    if (changeId.length === 0 || changeId.includes("/")) continue;

    // Veto: an active change is never completed, even with a bundle present.
    if (active.has(changeId)) {
      result.skipped.push({ changeId, reason: "still_active" });
      continue;
    }
    // Require positive terminal evidence; absence is not evidence.
    if (!archived.has(changeId)) {
      result.skipped.push({ changeId, reason: "no_archive_evidence" });
      continue;
    }
    candidates.push(changeId);
  }

  for (const changeId of candidates) {
    if (result.reconciled.length >= maxPerSweep) {
      result.capped = true;
      break;
    }
    if (dryRun) {
      result.reconciled.push(changeId);
      continue;
    }
    try {
      await deps.fireTerminal(changeId);
      result.reconciled.push(changeId);
    } catch (err) {
      result.failed.push({ changeId, error: summarize(err) });
    }
  }

  return result;
}
