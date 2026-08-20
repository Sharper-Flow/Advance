/** Epic-owner recovery actions for the store reconciliation dispatcher. */

import { readFile } from "node:fs/promises";
import { z } from "zod";

import {
  ChangeSchema,
  EpicMembershipSchema,
  EpicSchema,
  type Change,
  type Epic,
  type EpicEntry,
  type EpicMembership,
} from "../types";
import { convergeEpicMembership } from "../tools/epic-convergence";
import { createEpicDiskOps } from "./epics-disk";
import type {
  ActionContext,
  ActionExecutor,
  ActionOutcome,
} from "./reconcile-action-types";
import type { ReconcileAction, ReconcilePlanRecord } from "./reconcile-plan";
import {
  loadActiveEpicProjection,
  loadRetiredEpicProjection,
} from "./epic-projection";
import { listChangeDirs, loadChange } from "./json";

/**
 * Explicit provenance is kept on the reconstructed owner instead of relying
 * on EpicSchema's forward-compatible passthrough. The owner remains readable
 * by older consumers, while recovery tooling can prove how it was made.
 */
export const EpicReconstructionProvenanceSchema = z.object({
  reconstructed: z.literal(true),
  source: z.string().min(1),
  timestamp: z.string().datetime({ offset: true }),
  run_id: z.string().min(1),
  gap_flags: z.array(z.string().min(1)).min(1),
});

export type EpicReconstructionProvenance = z.infer<
  typeof EpicReconstructionProvenanceSchema
>;

export type ReconstructedEpic = Epic & {
  reconstruction: EpicReconstructionProvenance;
};

export type EpicRecoveryFragment = {
  change: Change;
  membership: EpicMembership;
};

export type EpicRecoveryEvidence = {
  epic_id: string;
  reconstructed?: true;
  converged?: true;
  fragment_count: number;
  gap_flags?: string[];
  convergence_statuses?: string[];
};

export type EpicRecoveryOutcome = ActionOutcome & {
  evidence?: EpicRecoveryEvidence;
};

const SOURCE = "child_epic_membership_fragments";
const GAP_FLAGS = [
  "narrative",
  "metadata",
  "epic_scope",
  "merged_into",
  "linked_by",
  "link_evidence",
  "terminal_summary",
] as const;

function failed(errorClass: string, residual: string): ActionOutcome {
  return { status: "failed", error_class: errorClass, residual };
}

function checkAction(
  record: ReconcilePlanRecord,
  action: ReconcileAction,
  expected: ReconcileAction["action"],
  expectedClass: ReconcileAction["class"] = "epic_owner_missing",
): ActionOutcome | null {
  if (
    record.class !== expectedClass ||
    action.class !== expectedClass ||
    action.action !== expected ||
    record.record_id.length === 0
  ) {
    return failed(
      "invalid_executor_context",
      `${record.record_id}: expected epic_owner_missing/${expected} action context`,
    );
  }
  return null;
}

async function readChild(
  record: ReconcilePlanRecord,
): Promise<{ bytes: Buffer; change: Change } | ActionOutcome> {
  let bytes: Buffer;
  try {
    bytes = await readFile(record.source_path);
  } catch (error) {
    return failed(
      "source_read_failed",
      `${record.record_id}: could not read child projection: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    return failed(
      "source_parse_failed",
      `${record.record_id}: child projection is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = ChangeSchema.safeParse(raw);
  if (!parsed.success) {
    return failed(
      "source_schema_invalid",
      `${record.record_id}: child projection failed ChangeSchema validation`,
    );
  }
  return { bytes, change: parsed.data };
}

function isActionOutcome(
  value: { bytes: Buffer; change: Change } | ActionOutcome,
): value is ActionOutcome {
  return "status" in value;
}

async function findFragments(
  changesDir: string,
  epicId: string,
  localProjectId?: string | null,
): Promise<EpicRecoveryFragment[]> {
  const fragments: EpicRecoveryFragment[] = [];
  for (const changeId of await listChangeDirs(changesDir)) {
    const loaded = await loadChange(changesDir, changeId);
    if (!loaded.success || !loaded.data?.epic_membership) continue;
    const membership = EpicMembershipSchema.safeParse(
      loaded.data.epic_membership,
    );
    if (
      membership.success &&
      membership.data.epic_id === epicId &&
      !(
        typeof localProjectId === "string" &&
        typeof membership.data.epic_project_id === "string" &&
        membership.data.epic_project_id.length > 0 &&
        membership.data.epic_project_id !== localProjectId
      )
    ) {
      fragments.push({ change: loaded.data, membership: membership.data });
    }
  }
  return fragments;
}

function fragmentFailureReason(
  fragments: EpicRecoveryFragment[],
): string | null {
  if (fragments.length === 0) return "no surviving child membership fragments";
  const seen = new Map<string, string>();
  for (const { membership } of fragments) {
    if (
      !membership.entry_id.trim() ||
      !membership.title.trim() ||
      !membership.linked_at.trim() ||
      !Number.isInteger(membership.order) ||
      membership.order < 0
    ) {
      return "one or more child fragments lack recoverable entry fields";
    }
    const fingerprint = JSON.stringify([
      membership.order,
      membership.title,
      membership.linked_at,
    ]);
    const prior = seen.get(membership.entry_id);
    if (prior) {
      return prior === fingerprint
        ? `duplicate surviving fragments for entry ${membership.entry_id}`
        : `conflicting surviving fragments for entry ${membership.entry_id}`;
    }
    seen.set(membership.entry_id, fingerprint);
  }
  return null;
}

function childEntry(
  fragment: EpicRecoveryFragment,
): Extract<EpicEntry, { kind: "change" }> | null {
  const isTerminal =
    fragment.change.status === "archived" ||
    fragment.change.status === "closed";
  // Boundary narrowing: archived_at/closed_at/updated_at arrive via the
  // ChangeSchema .passthrough() as unknown. A terminal fragment without a
  // usable string completion timestamp is corrupt evidence — refuse it
  // (fail-closed) rather than emitting an entry that EpicSchema would reject.
  const completedAt =
    fragment.change.archived_at ??
    fragment.change.closed_at ??
    fragment.change.updated_at;
  if (isTerminal && typeof completedAt !== "string") return null;
  return {
    kind: "change",
    entry_id: fragment.membership.entry_id,
    order: fragment.membership.order,
    change_id: fragment.change.id,
    title: fragment.membership.title,
    membership_status:
      fragment.change.status === "archived" ||
      fragment.change.status === "closed"
        ? "terminal"
        : "linked",
    linked_at: fragment.membership.linked_at,
    ...(fragment.membership.epic_project_id && {
      change_ref: {
        change_id: fragment.change.id,
        project_id: fragment.membership.epic_project_id,
      },
      linked_by: "store-reconcile-recovery",
      link_evidence: `reconstructed from ${SOURCE}`,
    }),
    ...(isTerminal
      ? {
          terminal_summary: {
            status: fragment.change.status as "archived" | "closed",
            completed_at: completedAt as string,
          },
        }
      : {}),
  };
}

/** Build an owner only when every entry field has surviving fragment evidence. */
export function buildReconstructedEpic(
  epicId: string,
  fragments: readonly EpicRecoveryFragment[],
  runId: string,
  timestamp = new Date().toISOString(),
):
  | { kind: "ok"; epic: ReconstructedEpic }
  | { kind: "insufficient"; reason: string } {
  const reason = fragmentFailureReason([...fragments]);
  if (reason) return { kind: "insufficient", reason };

  const sorted = [...fragments].sort(
    (left, right) =>
      left.membership.order - right.membership.order ||
      left.membership.entry_id.localeCompare(right.membership.entry_id),
  );
  const mapped = sorted.map(childEntry);
  if (mapped.some((entry) => entry === null)) {
    return {
      kind: "insufficient",
      reason:
        "one or more terminal child fragments lack a usable completion timestamp",
    };
  }
  const entries = mapped as Extract<EpicEntry, { kind: "change" }>[];
  const completedEntries = sorted.filter(
    ({ change }) => change.status === "archived" || change.status === "closed",
  ).length;
  const activeEntries = entries.length - completedEntries;
  const next = entries.find((entry) => entry.membership_status !== "terminal");
  const linkedTimes = sorted.map(({ membership }) => membership.linked_at);
  const createdAt = [...linkedTimes].sort()[0] ?? timestamp;
  const updatedAt = [...linkedTimes].sort().at(-1) ?? timestamp;
  const provenance = EpicReconstructionProvenanceSchema.parse({
    reconstructed: true,
    source: SOURCE,
    timestamp,
    run_id: runId,
    gap_flags: [...GAP_FLAGS],
  });

  // The identifier is the sole surviving owner identity. Narrative and owner
  // metadata are deliberately empty/absent and explicitly marked as gaps;
  // no child title is promoted into fabricated Epic narrative.
  const candidate = {
    id: epicId,
    title: epicId,
    narrative: "",
    entries,
    progress: {
      status: "active" as const,
      total_entries: entries.length,
      completed_entries: completedEntries,
      active_entries: activeEntries,
      next_entry_id: next?.entry_id ?? null,
      updated_at: updatedAt,
    },
    created_at: createdAt,
    updated_at: updatedAt,
    version: 0,
    reconstruction: provenance,
  };
  const parsed = EpicSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      kind: "insufficient",
      reason: `reconstructed owner failed EpicSchema validation: ${parsed.error.message}`,
    };
  }
  return { kind: "ok", epic: parsed.data as ReconstructedEpic };
}

/** The convergence gate is pure and runs before an owner is counted as rebuilt. */
export function verifyEpicReconstructionConvergence(
  epic: Epic,
  children: readonly Change[],
  checkedAt = new Date().toISOString(),
):
  | { ok: true; statuses: string[] }
  | { ok: false; failures: string[]; statuses: string[] } {
  const statuses: string[] = [];
  const failures: string[] = [];
  for (const rawEntry of epic.entries) {
    if (rawEntry.kind !== "change") continue;
    const childId = rawEntry.change_id ?? rawEntry.change_ref?.change_id;
    const child = children.find((candidate) => candidate.id === childId);
    if (!child) {
      statuses.push("conflict");
      failures.push(
        `${childId ?? rawEntry.entry_id}: child projection unavailable`,
      );
      continue;
    }
    const convergence = convergeEpicMembership({
      entry: rawEntry,
      epic_id: epic.id,
      child: { kind: "present", change: child },
      checkedAt,
    });
    statuses.push(convergence.status);
    if (convergence.status !== "ok") {
      failures.push(
        `${child.id}: ${convergence.status}: ${convergence.message}`,
      );
    }
  }
  return failures.length === 0
    ? { ok: true, statuses }
    : { ok: false, failures, statuses };
}

async function targetEpic(
  record: ReconcilePlanRecord,
  child: Change,
): Promise<string | null> {
  return (
    child.epic_membership?.epic_id ??
    (record.record_id !== child.id ? record.record_id : null)
  );
}

async function ownerState(
  ctx: ActionContext,
  epicId: string,
): Promise<
  { kind: "ok"; epic: Epic | null } | { kind: "failed"; reason: string }
> {
  const loaded = await loadActiveEpicProjection(
    ctx.storePaths.activeEpics,
    epicId,
  );
  if (!loaded.success) return { kind: "failed", reason: loaded.error };
  return { kind: "ok", epic: loaded.data };
}

export const reconstructFromChildFragmentsExecutor: ActionExecutor = async (
  record,
  action,
  ctx,
): Promise<EpicRecoveryOutcome> => {
  const invalid = checkAction(
    record,
    action,
    "reconstruct_from_child_fragments",
  );
  if (invalid) return invalid;
  const source = await readChild(record);
  if (isActionOutcome(source)) return source;
  const epicId = await targetEpic(record, source.change);
  if (!epicId) {
    return {
      status: "skipped",
      residual: `${record.record_id}: no Epic id survived in child membership`,
    };
  }
  const owner = await ownerState(ctx, epicId);
  if (owner.kind === "failed") return failed("owner_read_failed", owner.reason);
  const fragments = await findFragments(
    ctx.storePaths.changes,
    epicId,
    ctx.localProjectId,
  );
  if (owner.epic) {
    const gate = verifyEpicReconstructionConvergence(
      owner.epic,
      fragments.map(({ change }) => change),
    );
    return gate.ok
      ? {
          status: "skipped",
          evidence: {
            epic_id: epicId,
            converged: true,
            fragment_count: fragments.length,
            convergence_statuses: gate.statuses,
          },
        }
      : failed(
          "convergence_refused",
          `${epicId}: existing owner failed convergence: ${gate.failures.join("; ")}`,
        );
  }

  const built = buildReconstructedEpic(epicId, fragments, ctx.runId);
  if (built.kind === "insufficient") {
    return {
      status: "skipped",
      residual: `${epicId}: reconstruction deferred: ${built.reason}`,
      evidence: { epic_id: epicId, fragment_count: fragments.length },
    };
  }
  const gate = verifyEpicReconstructionConvergence(
    built.epic,
    fragments.map(({ change }) => change),
  );
  if (!gate.ok) {
    return failed(
      "convergence_refused",
      `${epicId}: reconstruction convergence gate failed: ${gate.failures.join("; ")}`,
    );
  }
  const saved = await ctx.saveEpicOptimistic(epicId, built.epic);
  if (saved.status !== "saved") {
    return {
      status: "failed",
      error_class: "owner_save_refused",
      residual: `${epicId}: owner save refused: ${saved.reason ?? "unknown reason"}`,
    };
  }
  return {
    status: "mutated",
    evidence: {
      epic_id: epicId,
      reconstructed: true,
      converged: true,
      fragment_count: fragments.length,
      gap_flags: built.epic.reconstruction.gap_flags,
      convergence_statuses: gate.statuses,
    },
  };
};

export const backfillEpicEntryFromFragmentExecutor: ActionExecutor = async (
  record,
  action,
  ctx,
): Promise<EpicRecoveryOutcome> => {
  const invalid = checkAction(
    record,
    action,
    "backfill_epic_entry_from_fragment",
    "epic_entry_missing",
  );
  if (invalid) return invalid;

  const source = await readChild(record);
  if (isActionOutcome(source)) return source;
  const epicId = await targetEpic(record, source.change);
  if (!epicId) {
    return {
      status: "failed",
      error_class: "epic_id_missing",
      residual: `${record.record_id}: no Epic id survived in child membership`,
    };
  }

  const owner = await ownerState(ctx, epicId);
  if (owner.kind === "failed") return failed("owner_read_failed", owner.reason);
  if (!owner.epic) {
    const retired = await loadRetiredEpicProjection(
      ctx.storePaths.retiredEpics,
      epicId,
    );
    if (!retired.success) return failed("owner_read_failed", retired.error);
    return retired.data
      ? failed(
          "owner_not_active",
          `${epicId}: retired Epic cannot be backfilled`,
        )
      : failed("owner_missing", `${epicId}: active Epic was not found`);
  }
  if (
    owner.epic.progress.status === "archived" ||
    owner.epic.progress.status === "merged" ||
    owner.epic.merged_into
  ) {
    return failed(
      "owner_not_active",
      `${epicId}: retired or merged Epic cannot be backfilled`,
    );
  }

  const fragments = await findFragments(
    ctx.storePaths.changes,
    epicId,
    ctx.localProjectId,
  );
  const fragmentReason = fragmentFailureReason(fragments);
  if (fragmentReason) {
    return failed(
      "fragment_refused",
      `${epicId}: backfill refused: ${fragmentReason}`,
    );
  }
  const fragment = fragments.find(
    ({ change }) => change.id === source.change.id,
  );
  if (!fragment) {
    return failed(
      "fragment_missing",
      `${epicId}: source fragment ${source.change.id} was not recoverable`,
    );
  }
  const entry = childEntry(fragment);
  if (!entry) {
    return failed(
      "fragment_refused",
      `${epicId}: backfill refused: terminal child fragment lacks a usable completion timestamp`,
    );
  }

  try {
    const linkEpicChange =
      ctx.linkEpicChange ??
      createEpicDiskOps({
        activeEpicsDir: ctx.storePaths.activeEpics,
        retiredEpicsDir: ctx.storePaths.retiredEpics,
      }).linkChange;
    await linkEpicChange(epicId, {
      entryId: entry.entry_id,
      changeId: source.change.id,
      title: entry.title ?? fragment.membership.title,
      order: entry.order,
      linkedAt: entry.linked_at,
      membershipStatus: entry.membership_status,
      ...(entry.terminal_summary && {
        terminalSummary: {
          status: entry.terminal_summary.status,
          completedAt: entry.terminal_summary.completed_at,
        },
      }),
      linkedBy: entry.linked_by,
      linkEvidence: entry.link_evidence,
      changeProjectId: entry.change_ref?.project_id,
    });
    return {
      status: "mutated",
      evidence: {
        epic_id: epicId,
        fragment_count: fragments.length,
        convergence_statuses: [entry.membership_status ?? "linked"],
      },
    };
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "unknown";
    if (code === "entry_already_exists") {
      const latest = await ownerState(ctx, epicId);
      if (latest.kind === "ok" && latest.epic) {
        if (
          latest.epic.entries.some(
            (candidate) => candidate.entry_id === entry.entry_id,
          )
        ) {
          return {
            status: "skipped",
            residual: `${epicId}: entry ${entry.entry_id} already exists`,
            evidence: { epic_id: epicId, fragment_count: fragments.length },
          };
        }
        const duplicateChange = latest.epic.entries.find(
          (candidate) =>
            candidate.kind === "change" &&
            (candidate.change_id ?? candidate.change_ref?.change_id) ===
              source.change.id,
        );
        if (duplicateChange) {
          return failed(
            "entry_already_exists",
            `${epicId}: change ${source.change.id} already exists under entry ${duplicateChange.entry_id}`,
          );
        }
      }
    }
    return failed(
      code,
      `${epicId}: backfill refused: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const formallyLostReportExecutor: ActionExecutor = async (
  record,
  action,
  ctx,
): Promise<EpicRecoveryOutcome> => {
  const invalid = checkAction(record, action, "formally_lost_report");
  if (invalid) return invalid;
  const source = await readChild(record);
  if (isActionOutcome(source)) return source;
  const epicId = await targetEpic(record, source.change);
  if (!epicId) {
    return {
      status: "skipped",
      residual: `${record.record_id}: no Epic id survived`,
    };
  }
  const owner = await ownerState(ctx, epicId);
  if (owner.kind === "failed") return failed("owner_read_failed", owner.reason);
  if (owner.epic)
    return {
      status: "skipped",
      evidence: { epic_id: epicId, fragment_count: 0 },
    };
  const fragments = await findFragments(
    ctx.storePaths.changes,
    epicId,
    ctx.localProjectId,
  );
  const reason = fragmentFailureReason(fragments);
  if (!reason)
    return {
      status: "skipped",
      evidence: { epic_id: epicId, fragment_count: fragments.length },
    };
  const residual =
    `formally_lost: epic=${epicId}; reason=${reason}; fragments=${fragments.length}`.slice(
      0,
      1024,
    );
  const audit = await ctx.auditWriter({
    event: "store_reconcile",
    run_id: ctx.runId,
    record_id: epicId,
    class: "epic_owner_missing",
    action: "formally_lost_report",
    ts: new Date().toISOString(),
  });
  if (audit && !audit.ok) {
    return {
      status: "skipped",
      residual: `${residual}; audit_warning=${audit.warning}`.slice(0, 1024),
      evidence: { epic_id: epicId, fragment_count: fragments.length },
    };
  }
  return {
    status: "skipped",
    residual,
    evidence: { epic_id: epicId, fragment_count: fragments.length },
  };
};

export const clearDanglingMembershipExecutor: ActionExecutor = async (
  record,
  action,
  ctx,
): Promise<EpicRecoveryOutcome> => {
  const invalid = checkAction(record, action, "clear_dangling_membership");
  if (invalid) return invalid;
  const source = await readChild(record);
  if (isActionOutcome(source)) return source;
  const membership = source.change.epic_membership;
  if (!membership) return { status: "skipped" };
  const owner = await ownerState(ctx, membership.epic_id);
  if (owner.kind === "failed") return failed("owner_read_failed", owner.reason);
  if (owner.epic)
    return {
      status: "skipped",
      residual: `${membership.epic_id}: owner exists`,
    };
  const fragments = await findFragments(
    ctx.storePaths.changes,
    membership.epic_id,
    ctx.localProjectId,
  );
  if (!fragmentFailureReason(fragments)) {
    return {
      status: "skipped",
      residual: `${membership.epic_id}: fragments are recoverable`,
    };
  }

  await ctx.writeBeforeState(record.record_id, source.bytes);
  const mutation = await ctx.coordinateChangeMutation<Change>({
    changeId: source.change.id,
    mutationKind: "store-reconcile:clear-dangling-epic-membership",
    mutateLatestProjection: (latest) => {
      const current = latest.epic_membership;
      if (!current) return latest;
      if (current.epic_id !== membership.epic_id) {
        throw new Error("child membership changed to a different Epic");
      }
      return { ...latest, epic_membership: undefined };
    },
    verifyProjection: (readback) => ({
      ok: readback.epic_membership === undefined,
      ...(readback.epic_membership !== undefined && {
        error: "dangling Epic membership remains after clear",
      }),
    }),
  });
  if (mutation.kind !== "verified") {
    return failed(
      `mutation_${mutation.kind}`,
      `${record.record_id}: membership clear refused: ${"reason" in mutation ? mutation.reason : "mutation was not verified"}`,
    );
  }
  const afterBytes = await readFile(record.source_path);
  return {
    status: "mutated",
    before_bytes: source.bytes,
    after_bytes: afterBytes,
    evidence: { epic_id: membership.epic_id, fragment_count: fragments.length },
  };
};
