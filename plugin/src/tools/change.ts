// rq-prop-context1: Durable Proposal Context for adv-task
/**
 * Change Tools
 *
 * Tools for managing change proposals.
 */
import { z } from "zod";
import { createHash } from "crypto";
import { rm } from "fs/promises";
import { basename, join, relative, resolve } from "path";
import type { FastFollowOf, ChangeOrigin } from "../types";
import {
  createDefaultGates,
  allGatesSatisfied,
  GATE_ORDER,
  GateIdSchema,
  ChangeListStatusFilterSchema,
  ChangeOriginKindSchema,
  ChangeRepoScopeSchema,
  BriefingPacketLaneSchema,
  BRIEFING_PACKET_SESSION_METADATA_MAX_LENGTH,
  type GateId,
  type ArtifactKind,
  type Change,
  type ChangeLifecycleState,
  type ChangeRepoScope,
  type ScopedSubagentReport,
  type BriefingPacketLane,
} from "../types";
import type { ChangeCreateInitialMetadata, Store } from "../storage/store";
import { loadAllSpecs } from "../storage/json";
import { getReflection } from "../storage/reflection";
import { getProjectId } from "../utils/project-id";
import { validateChange } from "../validator";
import { createLogger } from "../utils/debug-log";
import {
  subagentReportImplementationCycleId,
  subagentReportKey,
} from "../types/subagent-reports";
import { projectLoopLedger } from "../utils/loop-ledger";
import { advWorktreeCleanup } from "./worktree";
import { initStateDb as initWorktreeStateDb } from "./worktree/state";
import {
  compactOpsFollowupAnnotation,
  compactOpsFollowupLinkAnnotations,
} from "./ops-followup-readback";
import {
  normalizeArtifactMetadataForReadback,
  normalizeGateArtifactEvidenceForReadback,
  loadProposalForContext,
  readArtifacts,
} from "./change/artifacts";
import {
  checkActiveDuplicateChange,
  ChangeCreateProviders,
  DEFAULT_CLAIM_RACE_CHECK_MS,
  defaultClaimChecker,
  extractContextMismatch,
  isSyntheticValidationDraftSummary,
  buildSyntheticValidationDraftError,
  collectBlankCreateArtifactOrLinkageFields,
  validateCreateOriginLinkage,
  invalidGitHubIssueUrls,
  applyIssueUpdates,
  applyClarifyReadinessToChangeOutput,
  appendClarifyNeededForCreatedChange,
  buildEpicMembershipFromSeed,
  createCrossProjectFollowUp,
  validateParentChange,
  resolveScopeRepos,
  filterChangesForProductScope,
  productContextOutput,
  loadValidationContext,
} from "./change/create-clarify";
import {
  getArchiveTaskPreflightError,
  resolveArchiveGateState,
  getArchiveGatePreflightError,
  buildReleaseCompletionEvidence,
  buildPendingMergePhase9Status,
  preservePhase9Evidence,
  reconcileArchivedBundleRetry,
  buildFailedPhase9Classification,
  recordPhase9Status,
  projectEpicTerminalSummaryAfterArchive,
  verifyReleaseEvidenceFromMain,
  ArchiveReleaseGateResult,
  verifyReleaseGateDurableForArchive,
  completeReleaseGateAfterFinalization,
} from "./change/archive-gate";
import {
  getGateDivergenceHint,
  ARCHIVE_SEARCH_ATTRIBUTE_RECOVERY_HINT,
  isSearchAttributeArchiveFailure,
  verifyStatusRepairReadAfterWrite,
  loadSpecsMap,
  buildReentryResult,
  closeLinkedIssue,
  ChangeCloseRecoveryMode,
  buildChangeClosePayload,
  validateChangeCloseRecoveryArgs,
  recoverCompletedWorkflowClose,
} from "./change/recovery";
import { reconcileRecoveredGates } from "./gate";
const logger = createLogger("change");
const STATUS_REPAIR_PHASE9_EVIDENCE_RE =
  /phase9_status\s*(?::|=|\.)\s*failed|phase9 status failed|phase9_status\.failed/i;

// adv_change_workflow_terminate: shipped proof = acceptance AND release gates
// done on the disk projection. Only a fully-shipped change may have its
// wedged workflow terminated — the disk projection is authoritative for
// everything the change still needs.
const WORKFLOW_TERMINATE_SHIPPED_GATES = ["acceptance", "release"] as const;

// Run statuses that are already terminal server-side: nothing left to
// terminate, so the tool reports idempotent success (after eligibility).
const TERMINAL_WORKFLOW_RUN_STATUSES: ReadonlySet<string> = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "TERMINATED",
  "CONTINUED_AS_NEW",
  "TIMED_OUT",
]);

// Run statuses eligible for termination. Anything else (UNSPECIFIED,
// UNKNOWN, absent) is refused — never act on an unclassifiable run.
const TERMINABLE_WORKFLOW_RUN_STATUSES: ReadonlySet<string> = new Set([
  "RUNNING",
  "PAUSED",
]);

/**
 * Structural narrowing of a `describe()` result into the exact run pin
 * (runId + status name). Accepts both the SDK status object shape
 * (`status.name`) and a plain string status; anything absent stays
 * undefined so the caller can refuse instead of guessing.
 */
function workflowRunPinFromDescription(description: unknown): {
  runId?: string;
  statusName?: string;
} {
  if (typeof description !== "object" || description === null) return {};
  const record = description as Record<string, unknown>;
  const runId =
    typeof record.runId === "string" && record.runId.length > 0
      ? record.runId
      : undefined;
  let statusName: string | undefined;
  const status = record.status;
  if (typeof status === "object" && status !== null) {
    const name = (status as Record<string, unknown>).name;
    if (typeof name === "string" && name.length > 0) statusName = name;
  } else if (typeof status === "string" && status.length > 0) {
    statusName = status;
  }
  return { runId, statusName };
}

async function getChangeWorkflowHandleForStore(store: Store, changeId: string) {
  const { getService } = await import("../temporal/service");
  const service = getService();
  const projectId = service ? await getProjectId(store.paths.root) : null;
  if (!service || !projectId) return undefined;
  const { getChangeHandle } = await import("./_adapters");
  return getChangeHandle(service.client, projectId, changeId);
}

async function classifyCompletedOrPoisonedChangeRecovery(
  store: Store,
  changeId: string,
  error: unknown,
): Promise<{ completedWorkflow: boolean; recover: boolean }> {
  const { isWorkflowCompletedError } =
    await import("../temporal/recovery-classification");
  const completedWorkflow = isWorkflowCompletedError(error);
  if (completedWorkflow) return { completedWorkflow, recover: true };

  const handle = await getChangeWorkflowHandleForStore(store, changeId);
  if (!handle) return { completedWorkflow: false, recover: false };

  const { classifyCompletedOrPoisonedRecovery } =
    await import("./recovery-probe");
  return classifyCompletedOrPoisonedRecovery(handle, error);
}

function subagentReportTaskId(
  report: ScopedSubagentReport,
): string | undefined {
  if (typeof report.scope !== "string" && report.scope.kind === "task") {
    return report.scope.task_id;
  }
  return "task_id" in report ? report.task_id : undefined;
}
function subagentReportReadbackKey(report: ScopedSubagentReport): string {
  return subagentReportKey({
    changeId: report.change_id,
    taskId: subagentReportTaskId(report),
    scope: typeof report.scope === "string" ? undefined : report.scope,
    agent: report.agent,
    attempt: report.attempt,
    implementationCycleId: subagentReportImplementationCycleId(report),
  });
}
const DEFAULT_BRIEFING_PACKET_LANE: BriefingPacketLane = "engineer";

function briefingPacketGeneratedBy(
  lane: BriefingPacketLane,
  request?: string,
): string {
  const generatedBy = request
    ? `adv_change_show:${lane}:${request}`
    : `adv_change_show:${lane}`;
  return generatedBy.slice(0, BRIEFING_PACKET_SESSION_METADATA_MAX_LENGTH);
}

function collectBriefingFactsForReadback(change: Change) {
  const facts: BriefingPacketRendererInput["durable_facts"] = [];
  const seenIds = new Set<string>();

  const pushUnique = (
    fact: NonNullable<BriefingPacketRendererInput["durable_facts"]>[number],
  ): void => {
    if (seenIds.has(fact.id)) return;
    seenIds.add(fact.id);
    facts.push(fact);
  };

  for (const task of change.tasks ?? []) {
    for (const report of task.subagent_reports ?? []) {
      for (const fact of classifyBriefingFacts({ report })) {
        pushUnique(fact);
      }
    }
  }

  for (const report of change.subagent_reports ?? []) {
    for (const fact of classifyBriefingFacts({ report })) {
      pushUnique(fact);
    }
  }

  return facts;
}

/**
 * Storage-backed adapter that hydrates existing ADV structured state into the
 * pure briefing-packet renderer. Reads artifact content only when a packet is
 * requested; never mutates workflow state or persists live packet bodies.
 */
async function buildBriefingPacketForChange(
  store: Store,
  change: Change,
  lane: BriefingPacketLane = DEFAULT_BRIEFING_PACKET_LANE,
  request?: string,
): Promise<BriefingPacketRendererInput> {
  const changeId = change.id;
  const artifacts = await readArtifacts(store, changeId, [
    "proposal",
    "problemStatement",
    "acceptance",
  ]);

  const verificationExpectations: string[] = [];
  if (change.contract) {
    for (const item of change.contract.items) {
      if (item.kind === "acceptance_criterion") {
        verificationExpectations.push(item.text);
      }
    }
  }
  if (artifacts.acceptance) {
    for (const line of artifacts.acceptance.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !verificationExpectations.includes(trimmed)) {
        verificationExpectations.push(trimmed);
      }
    }
  }

  const affectedFiles = new Set<string>();
  if (change.affectedPaths) {
    for (const f of change.affectedPaths) affectedFiles.add(f);
  }
  for (const task of change.tasks ?? []) {
    for (const f of task.touched_files ?? []) affectedFiles.add(f);
  }

  const reviewMatrixById = new Map(
    change.contract?.reviewMatrix?.rows.map((row) => [row.contractId, row]),
  );
  const contractItems: NonNullable<
    BriefingPacketRendererInput["contract"]
  >["items"] =
    change.contract?.items.map((item) => {
      const row = reviewMatrixById.get(item.id);
      const status =
        row?.status ??
        (item.status === "approved" ? ("pass" as const) : ("unknown" as const));
      return {
        id: item.id,
        kind: item.kind,
        text: item.text,
        status,
      };
    }) ?? [];

  return {
    change_id: changeId,
    title: change.title,
    lane,
    origin: change.origin
      ? {
          kind: change.origin.kind,
          issue_number: change.origin.issue_number,
          source_artifact: change.origin.source_artifact,
        }
      : undefined,
    scope: {
      proposal: artifacts.proposal,
      problem_statement: artifacts.problemStatement,
    },
    contract: contractItems.length ? { items: contractItems } : undefined,
    tasks: change.tasks?.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      touched_files: task.touched_files,
    })),
    affected_files: Array.from(affectedFiles),
    epic_membership: change.epic_membership ?? null,
    verification_expectations:
      verificationExpectations.length > 0
        ? verificationExpectations
        : undefined,
    durable_facts: collectBriefingFactsForReadback(change),
    archive_digest: undefined,
    generated_by: briefingPacketGeneratedBy(lane, request),
    generated_at: new Date().toISOString(),
  };
}
import { fileExists, removeChangeDir } from "../storage/json";
import {
  archiveChange,
  findArchiveBundle,
  getArchiveContractProofErrors,
  reconcileInRepoArchive,
  readProjectionManifest,
  verifyProjectionAtGitCommit,
  reconcileHistoricalArchiveDeltas,
  canonicalSha256,
  resolveGitCommitSha,
  HistoricalConflictDispositionSchema,
  type HistoricalConflictDisposition,
} from "../archive";
import { formatToolOutput, paginate } from "../utils/tool-output";
import { withTimeout, TimeoutError } from "../utils/with-timeout";
import {
  buildTodoProjection,
  formatValidationOutput,
  formatSmellReport,
} from "../utils/tool-formatters";
import { checkRequirementSmells } from "../validator/prep-readiness";
import { buildChangeContextSnapshot } from "../utils/context-snapshot";
import {
  changeToDirectiveState,
  normalizeChangeLifecycleState,
} from "../temporal/change-state";
import { deriveDirectiveSafe } from "../utils/workflow-directive";
import { degradedPhasePlan, derivePhasePlanSafe } from "../utils/phase-plan";
import {
  renderBriefingPacket,
  type BriefingPacketRendererInput,
} from "../utils/briefing-packet-renderer";
import { classifyBriefingFacts } from "../utils/briefing-fact-classifier";
import { resolveChangeSelection } from "../storage/change-selection";
import { sweepClosedChangesFromDisk } from "../storage/disk-sweep";
import { BulkCloseSelectorSchema } from "../types";
import { collectErrorText } from "../temporal/retry-wrapper";
import {
  formatTargetProjectContext,
  type TargetProjectContext,
  type TargetProjectOutputContext,
  withOptionalTargetPathStore,
  withTargetPathStore,
  targetPathSchema,
  appendTargetProjectContextOutput,
  EPIC_OWNER_ROUTING_ERROR_CODES,
} from "./target-project";
import { buildExternalDependencyStatus } from "./external-dependency-status";
import { getService } from "../temporal/service";
import { fireSignalAndRefresh, getChangeHandle } from "./_adapters";
import {
  changeCancelledSignal,
  gateReenteredSignal,
  originRepairedSignal,
} from "../temporal/messages";
import { getOpenOpsFollowupObligations } from "../temporal/gate-readiness";
import {
  detectDefaultBranch,
  detectArchiveMode,
  deleteChangeBranch,
  resolveMainCheckout,
  finalizeRelease,
  validateChangeWorktree,
  detectArchivedUnmergedBranches,
  redriveArchivedUnmergedBranch,
  detectArchivedMergedBranches,
  type GitFinalizeOutcome,
} from "./archive-helpers/git-finalize";

// =============================================================================
// adv_change_list phase derivation
// =============================================================================

/**
 * Progress phase rendered on adv_change_list rows. Open changes report the
 * current gate; "released" marks the all-gates-done-but-still-open wedge
 * (release gate complete, archive not yet finalized), kept distinct from the
 * in-flight "release" gate; terminal lifecycle states report themselves.
 */
type ChangePhase = GateId | "released" | "archived" | "closed";

/**
 * Derive a row's progress phase from the store-supplied gate/lifecycle hints.
 * Pure derivation over the list read model — no workflow state, no signals.
 * Rows from legacy/mock stores that lack a gate hint omit `phase` entirely
 * rather than fabricating progress from the permanently-"draft" status.
 */
function deriveChangePhase(row: {
  status: Change["status"];
  lifecycleState?: ChangeLifecycleState;
  currentGate?: GateId | "done";
}): ChangePhase | undefined {
  const lifecycle =
    row.lifecycleState ?? normalizeChangeLifecycleState(row.status);
  if (lifecycle === "archived") return "archived";
  if (lifecycle === "closed") return "closed";
  if (row.currentGate === undefined) return undefined;
  return row.currentGate === "done" ? "released" : row.currentGate;
}

// =============================================================================
// Tool Definitions
// =============================================================================

/**
 * Internal time budget for adv_change_validate's authoritative input load
 * (change read + validation context: specs, active peers, proposal).
 *
 * Sits below the safeExecute 10s tool ceiling (same safe-budget convention
 * as WORKTREE_TOOL_SAFE_TIMEOUT_MS in tools/adv-worktree.ts) so a slow
 * Temporal query or peer hydration surfaces as an explicit typed degraded
 * response instead of an unclassified whole-tool ToolExecutionTimeout.
 * When the budget is exceeded no validation verdict is produced — the
 * response is typed degraded metadata, never a complete-looking partial.
 */
export const CHANGE_VALIDATE_CONTEXT_TIMEOUT_MS = 8_000;

export const changeTools = {
  adv_change_list: {
    description:
      "List active changes with optional filtering, recency enrichment, and sorting",
    args: {
      status: ChangeListStatusFilterSchema.optional().describe(
        'Filter by status. Use "in-flight" for open changes (draft).',
      ),
      includeArchived: z
        .boolean()
        .optional()
        .describe("Include archived changes (default: false)"),
      includeClosed: z
        .boolean()
        .optional()
        .describe("Include closed changes (default: false)"),
      sort: z
        .enum(["recency", "stalest", "default"])
        .optional()
        .describe(
          'Sort order: "recency" (most recent first), "stalest" (oldest first), "default" (created_at desc)',
        ),
      limit: z
        .number()
        .optional()
        .describe("Max changes to return (default: 50)"),
      offset: z
        .number()
        .optional()
        .describe("Offset for pagination (default: 0)"),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, reads that project as a disk snapshot and returns _projectContext.",
        ),
      scope: z
        .enum(["repo", "product"])
        .optional()
        .default("repo")
        .describe(
          "Product-linked visibility scope. `repo` (default) shows changes scoped to the current repo; `product` shows all product changes.",
        ),
    },
    execute: async (
      {
        status,
        includeArchived,
        includeClosed,
        sort,
        limit,
        offset,
        target_path,
        scope = "repo",
      }: {
        status?: string;
        includeArchived?: boolean;
        includeClosed?: boolean;
        sort?: "recency" | "stalest" | "default";
        limit?: number;
        offset?: number;
        target_path?: string;
        scope?: "repo" | "product";
      },
      store: Store,
    ) => {
      // Reject "active"/"pending" at the boundary — they are never stored on
      // changes and would silently return an empty list. The Zod schema also
      // rejects them at parse time; this check is defense-in-depth for direct
      // handler invocation (tests, internal callers).
      if (status === "active" || status === "pending") {
        return formatToolOutput({
          error: `status: "${status}" is not a valid filter for adv_change_list. "active" and "pending" are never stored on changes. Use "in-flight" (or no status filter) for open changes; "archived"/"closed" for terminal changes.`,
        });
      }
      return withOptionalTargetPathStore(
        { store, target_path },
        async (activeStore, projectContext) => {
          // rq-changeSummaryReadModel01: default warm path uses
          // `changes.listSummary` when available so unchanged callers
          // benefit from memo/cache short-circuits without forcing every
          // candidate through full hydration. Falls back to the legacy
          // `changes.list` when the store does not implement the optional
          // summary surface (e.g. legacy/mock stores).
          const summaryList = activeStore.changes.listSummary;
          const result = summaryList
            ? await summaryList({
                status: status === "in-flight" ? undefined : status,
                includeArchived,
                includeClosed,
              })
            : await activeStore.changes.list({
                status: status === "in-flight" ? undefined : status,
                includeArchived,
                includeClosed,
              });
          // Enrich with last-activity data from the store-computed timestamp.
          const now = new Date();
          const withLastActivity = result.changes.map((change) => {
            // currentGate/lifecycleState are internal derivation hints for
            // `phase`; only the derived phase is exposed on the row.
            const { currentGate, lifecycleState, ...row } = change;
            const phase = deriveChangePhase({
              status: change.status,
              lifecycleState,
              currentGate,
            });
            const lastActivityAt = new Date(change.lastActivityAt);
            const minutesSince = Math.max(
              0,
              Math.floor((now.getTime() - lastActivityAt.getTime()) / 60000),
            );
            return {
              ...row,
              ...(phase ? { phase } : {}),
              lastActivity: change.lastActivityAt,
              lastActivityAgeMinutes: minutesSince,
              ...(change.fast_follow_of
                ? { parent_change_id: change.fast_follow_of.parent_change_id }
                : {}),
              ops_followup: compactOpsFollowupAnnotation(change.ops_followup),
              ops_followup_links: compactOpsFollowupLinkAnnotations(
                change.ops_followup_links,
              ),
              epic: change.epic_membership
                ? {
                    id: change.epic_membership.epic_id,
                    title: change.epic_membership.title,
                    entry_id: change.epic_membership.entry_id,
                  }
                : undefined,
            };
          });
          let filtered = await filterChangesForProductScope(
            withLastActivity,
            activeStore,
            scope,
          );
          if (status === "in-flight") {
            const inFlightStatuses = new Set(["draft"]);
            filtered = filtered.filter((c) => inFlightStatuses.has(c.status));
          }
          // Sort: stalest (asc by lastActivity) or recency (desc by lastActivity)
          if (sort === "stalest") {
            filtered.sort((a, b) => {
              const cmp = a.lastActivity.localeCompare(b.lastActivity);
              return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
            });
          } else if (sort === "recency") {
            filtered.sort((a, b) => {
              const cmp = b.lastActivity.localeCompare(a.lastActivity);
              return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
            });
          }
          // sort === "default" or omitted: preserve store order (created_at desc)
          const paged = paginate(filtered, {
            limit,
            offset,
            tool: "adv_change_list",
            args: status ? `status: "${status}"` : undefined,
          });
          return formatToolOutput({
            changes: paged.items,
            pagination: paged.pagination,
            ...(result.warnings ? { warnings: result.warnings } : {}),
            ...(result.hydrationStats
              ? { hydrationStats: result.hydrationStats }
              : {}),
            ...(productContextOutput(activeStore, scope)
              ? { _productContext: productContextOutput(activeStore, scope) }
              : {}),
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        },
      );
    },
  },
  // rq-advChangeShowInclude01 — adv_change_show accepts opt-in include flags
  adv_change_show: {
    description:
      "Get full change details including tasks and deltas. " +
      "Supports optional include flags to collapse the phase-start " +
      "tool quartet: include.ledger pulls the in-progress task's " +
      "durable run state; include.snapshot returns the rendered " +
      "context snapshot at top-level (matches mutation-tool convention); " +
      "include.readyTasks returns the unblocked ready queue (top-N " +
      "by priority then created_at; default 10, max 50). " +
      "include.phasePlan attaches the typed PhasePlan read projection " +
      "as `_phasePlan` (read-only; non-authorizing variants carry no " +
      "route/command). " +
      "include.proposal / include.problemStatement / include.agreement / include.design / include.executiveSummary / include.acceptance " +
      "return the raw markdown content for each artifact (GH #21). " +
      "Defaults are unchanged when include is omitted.",
    args: {
      changeId: z.string().describe("Change ID"),
      limit: z
        .number()
        .optional()
        .describe("Max tasks to return (default: 50)"),
      offset: z
        .number()
        .optional()
        .describe("Task offset for pagination (default: 0)"),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When artifact include flags are requested, routes reads through the target project's Temporal store/documents; otherwise reads a disk snapshot and returns _projectContext.",
        ),
      include: z
        .object({
          ledger: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches the in-progress task's durable run ledger as `_ledger`.",
            ),
          loopLedger: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches the compact typed loop-ledger summary as `_loopLedger`.",
            ),
          loopLedgerDetails: z
            .boolean()
            .optional()
            .describe(
              "When true, includes bounded detailed loop-ledger entries in `_loopLedger`.",
            ),
          loopLedgerLimit: z
            .number()
            .min(1)
            .max(100)
            .optional()
            .describe(
              "Maximum detailed loop-ledger entries. Range 1-100; default 20.",
            ),
          snapshot: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches the rendered context snapshot as top-level `_contextSnapshot`.",
            ),
          readyTasks: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches the unblocked ready queue as `_readyTasks` (top-N by priority then created_at).",
            ),
          readyTasksLimit: z
            .number()
            .min(1)
            .max(50)
            .optional()
            .describe("Override default top-10 ready-task slice. Range 1-50."),
          phasePlan: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches the typed PhasePlan read projection as `_phasePlan`. Read-only and non-authorizing: degraded/blocked/terminal variants carry provenance and no route/command.",
            ),
          artifactOnly: z
            .boolean()
            .optional()
            .describe(
              "When true with artifact include flags, returns a bounded artifact-only readback instead of full change/task context.",
            ),
          proposal: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches raw proposal.md content as `_proposal`.",
            ),
          problemStatement: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches raw problem-statement.md content as `_problemStatement`.",
            ),
          agreement: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches raw agreement.md content as `_agreement`.",
            ),
          design: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches raw design.md content as `_design`.",
            ),
          executiveSummary: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches raw executive-summary.md content as `_executiveSummary`.",
            ),
          acceptance: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches raw acceptance.md content as `_acceptance`.",
            ),
          subagentReports: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches persisted task sub-agent reports as `_subagentReports`.",
            ),
          briefingPacket: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches a generated lane-specific briefing packet as `_briefingPacket`.",
            ),
          briefingPacketLane: z
            .preprocess(
              (value) => (value === "" ? undefined : value),
              BriefingPacketLaneSchema.optional(),
            )
            .optional()
            .describe(
              "Lane to render when include.briefingPacket is true. Defaults to engineer.",
            ),
          briefingPacketRequest: z
            .string()
            .max(BRIEFING_PACKET_SESSION_METADATA_MAX_LENGTH)
            .optional()
            .describe(
              "Optional request context included in the generated packet metadata.",
            ),
        })
        .optional()
        .describe(
          "Optional include flags to attach extra fields. Defaults preserve current behavior.",
        ),
    },
    execute: async (
      {
        changeId,
        limit,
        offset,
        target_path,
        include,
      }: {
        changeId: string;
        limit?: number;
        offset?: number;
        target_path?: string;
        include?: {
          ledger?: boolean;
          loopLedger?: boolean;
          loopLedgerDetails?: boolean;
          loopLedgerLimit?: number;
          snapshot?: boolean;
          readyTasks?: boolean;
          readyTasksLimit?: number;
          phasePlan?: boolean;
          artifactOnly?: boolean;
          proposal?: boolean;
          problemStatement?: boolean;
          agreement?: boolean;
          design?: boolean;
          executiveSummary?: boolean;
          acceptance?: boolean;
          subagentReports?: boolean;
          briefingPacket?: boolean;
          briefingPacketLane?: BriefingPacketLane;
          briefingPacketRequest?: string;
        };
      },
      store: Store,
    ) => {
      const requestedKinds: ArtifactKind[] = [];
      if (include?.proposal) requestedKinds.push("proposal");
      if (include?.problemStatement) requestedKinds.push("problemStatement");
      if (include?.agreement) requestedKinds.push("agreement");
      if (include?.design) requestedKinds.push("design");
      if (include?.executiveSummary) requestedKinds.push("executiveSummary");
      if (include?.acceptance) requestedKinds.push("acceptance");

      const runShow = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        const result = await activeStore.changes.get(changeId);
        if (!result.success) {
          return formatToolOutput({ error: result.error });
        }
        if (!result.data) {
          return formatToolOutput({ error: `Change not found: ${changeId}` });
        }
        const change = result.data;
        const { test_runs, ...publicChange } = change;
        const displayChange: Change = {
          ...publicChange,
          artifacts: await normalizeArtifactMetadataForReadback(
            change.artifacts,
          ),
          gates: await normalizeGateArtifactEvidenceForReadback(change.gates),
        };
        if (include?.artifactOnly) {
          const output: Record<string, unknown> = {
            id: displayChange.id,
            title: displayChange.title,
            status: displayChange.status,
            artifacts: displayChange.artifacts,
            _artifactOnly: true,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          };
          if (requestedKinds.length > 0) {
            const artifactContent = await readArtifacts(
              activeStore,
              changeId,
              requestedKinds,
            );
            if (artifactContent.proposal !== undefined)
              output._proposal = artifactContent.proposal;
            if (artifactContent.problemStatement !== undefined)
              output._problemStatement = artifactContent.problemStatement;
            if (artifactContent.agreement !== undefined)
              output._agreement = artifactContent.agreement;
            if (artifactContent.design !== undefined)
              output._design = artifactContent.design;
            if (artifactContent.executiveSummary !== undefined)
              output._executiveSummary = artifactContent.executiveSummary;
            if (artifactContent.acceptance !== undefined)
              output._acceptance = artifactContent.acceptance;
          }
          return formatToolOutput(output);
        }
        const { content: proposalText } = await loadProposalForContext(
          activeStore,
          changeId,
          change.title,
        );
        const paged = paginate(change.tasks, {
          limit,
          offset,
          tool: "adv_change_show",
          args: `changeId: "${changeId}"`,
        });
        const output: Record<string, unknown> = {
          ...displayChange,
          tasks: paged.items,
          _taskPagination: paged.pagination,
          ...(projectContext ? { _projectContext: projectContext } : {}),
        };
        // Surface linked ops follow-up state structurally. The full profile
        // remains on the change; this just guarantees it is visible even when
        // downstream formatters would otherwise drop undefined keys.
        output.ops_followup = change.ops_followup ?? null;
        output.ops_followup_links = change.ops_followup_links ?? [];
        const changeDir = join(activeStore.paths.changes, changeId);
        const problemStatementPath = join(changeDir, "problem-statement.md");
        const problemStatementExists = await fileExists(problemStatementPath);
        output.problemStatementExists = problemStatementExists;
        if (problemStatementExists) {
          output.problemStatementPath = problemStatementPath;
        }
        await applyClarifyReadinessToChangeOutput({
          output,
          change,
          proposalText,
          changeId,
          store: activeStore,
        });
        // Surface cross-project origin prominently when present
        if (change.cross_project_origin) {
          output._crossProjectOrigin = {
            note: `⚠️ Cross-project follow-up from ${change.cross_project_origin.source_project}`,
            ...change.cross_project_origin,
          };
        }
        // Surface same-project fast-follow origin prominently when present
        if (change.fast_follow_of) {
          output._fastFollowOrigin = {
            note: `↳ Fast-follow from ${change.fast_follow_of.parent_change_id}`,
            ...change.fast_follow_of,
          };
        }
        const dependencyStatus = await buildExternalDependencyStatus(
          change.external_dependencies,
        );
        if (dependencyStatus) {
          output._externalDependencyStatus = dependencyStatus;
        }
        // Include reflection data for archived changes
        if (change.status === "archived") {
          const reflection = await getReflection(
            activeStore.paths.external ?? activeStore.paths.root,
            changeId,
          );
          if (reflection) {
            output._reflection = reflection;
          }
        }
        // include flags (AC3) — opt-in attachments. Defaults preserve
        // current behavior.
        if (include) {
          // Lazy shared projection-state loader: the snapshot and phase-plan
          // read projections derive from the SAME reconciled gates projection
          // so one durable snapshot yields one consistent directive/plan view
          // (SC1). Loaded at most once per call and only when a projection
          // that needs it is requested.
          const buildProjectionState = async () => {
            let gates: Awaited<ReturnType<typeof activeStore.gates.get>> = null;
            try {
              const rawGates = await activeStore.gates.get(changeId);
              if (rawGates) {
                const reconciliation = await reconcileRecoveredGates({
                  store: activeStore,
                  changeId,
                  current: rawGates,
                });
                gates = reconciliation.gates;
              }
            } catch {
              // best-effort: missing gates → projections still useful
            }
            const normalizedGates = gates
              ? await normalizeGateArtifactEvidenceForReadback(gates)
              : undefined;
            return {
              directiveState: changeToDirectiveState({
                projectId: displayChange.adv_project_id ?? "unknown",
                change: displayChange,
                gates: normalizedGates ?? undefined,
              }),
              normalizedGates,
            };
          };
          let projectionStatePromise:
            | ReturnType<typeof buildProjectionState>
            | undefined;
          const loadProjectionState = () =>
            (projectionStatePromise ??= buildProjectionState());
          // Snapshot — matches mutation-tool convention (top-level
          // `_contextSnapshot`). Uses the same formatter live emission
          // and compaction use, ensuring fidelity parity.
          if (include.snapshot) {
            try {
              const { directiveState, normalizedGates } =
                await loadProjectionState();
              // AC5: derive the authoritative directive from the same change
              // projection + gates the snapshot renders, so the change-show
              // packet carries the `Next:` orientation line. Best effort: a
              // derivation failure must not break change-show; the snapshot
              // omits the `Next:` line.
              const directive = deriveDirectiveSafe(directiveState, Date.now());
              if (!directive) {
                logger.warn(
                  `deriveWorkflowDirective failed in change-show for ${changeId}; snapshot omits Next line`,
                );
              }
              output._contextSnapshot = buildChangeContextSnapshot({
                change: displayChange,
                proposalText,
                gates: normalizedGates,
                workdir: activeStore.paths.root,
                directive,
              });
            } catch (e) {
              output._contextSnapshotError =
                e instanceof Error ? e.message : String(e);
            }
          }
          // Phase plan — typed, read-only current-action projection (SC1,
          // AC3, AC8). `derivePhasePlanSafe` never throws: missing,
          // conflicting, or unsupported state degrades into a typed
          // non-authorizing plan with provenance and no route/command.
          if (include.phasePlan) {
            try {
              const { directiveState } = await loadProjectionState();
              output._phasePlan = derivePhasePlanSafe(
                directiveState,
                Date.now(),
              );
            } catch (e) {
              output._phasePlan = degradedPhasePlan(
                changeId,
                "missing_state",
                e instanceof Error ? e.message : String(e),
              );
            }
          }
          if (include.ledger) {
            output._ledger = null;
          }
          // rq-loopLedger01 — opt-in compact/detail _loopLedger readback;
          // legacy include.ledger above stays _ledger:null and is not aliased.
          if (include.loopLedger || include.loopLedgerDetails) {
            output._loopLedger = projectLoopLedger(
              {
                changeId: change.id,
                tasks: change.tasks,
                subagent_reports: change.subagent_reports,
                testRuns: test_runs,
              },
              {
                details: include.loopLedgerDetails === true,
                limit: include.loopLedgerLimit,
              },
            );
          }
          if (include.subagentReports) {
            const legacyTaskReports = change.tasks.flatMap((task) =>
              (task.subagent_reports ?? []).map((report) => report),
            );
            const reportsByKey = new Map<string, ScopedSubagentReport>();
            for (const report of [
              ...(change.subagent_reports ?? []),
              ...legacyTaskReports,
            ]) {
              reportsByKey.set(subagentReportReadbackKey(report), report);
            }
            const reports = Array.from(reportsByKey.values());
            output._subagentReports = reports;
            output._subagentReportsMeta = {
              total: reports.length,
              sidecar: change.subagent_reports?.length ?? 0,
              legacyTask: legacyTaskReports.length,
            };
          }
          // Ready tasks — unblocked queue, sliced to top-N. Avoids the
          // separate adv_task_ready round-trip on phase boundaries.
          if (include.readyTasks) {
            try {
              const readyResult = await activeStore.tasks.ready(changeId);
              const readyLimit = include.readyTasksLimit ?? 10;
              output._readyTasks = readyResult.ready.slice(0, readyLimit);
              output._readyTasksMeta = {
                total: readyResult.ready.length,
                limit: readyLimit,
                blockedCount: readyResult.blocked.length,
              };
              output._todoProjection = buildTodoProjection({
                current:
                  change.tasks.find((task) => task.status === "in_progress") ??
                  null,
                ready: readyResult.ready.map((task) => ({
                  id: task.id,
                  title: task.title,
                  status: task.status,
                })),
              });
            } catch (e) {
              output._readyTasksError =
                e instanceof Error ? e.message : String(e);
            }
          }
          // Briefing packet — generated read projection over existing
          // structured state. No live packet state is persisted.
          if (include.briefingPacket) {
            try {
              const lane =
                include.briefingPacketLane ?? DEFAULT_BRIEFING_PACKET_LANE;
              const packetInput = await buildBriefingPacketForChange(
                activeStore,
                change,
                lane,
                include.briefingPacketRequest,
              );
              output._briefingPacket = renderBriefingPacket(packetInput);
            } catch (e) {
              output._briefingPacketError =
                e instanceof Error ? e.message : String(e);
            }
          }

          // GH #21: Artifact content include flags — read raw markdown
          // from the change directory. Only reads when explicitly
          // requested to avoid unnecessary I/O. Falls back to the
          // latest archive bundle for archived changes.
          // Batched multi-include read per C9 — single store.changes.get()
          // query covers all requested kinds (KD-6 readArtifacts).
          if (requestedKinds.length > 0) {
            const artifactContent = await readArtifacts(
              activeStore,
              changeId,
              requestedKinds,
            );
            if (artifactContent.proposal !== undefined)
              output._proposal = artifactContent.proposal;
            if (artifactContent.problemStatement !== undefined)
              output._problemStatement = artifactContent.problemStatement;
            if (artifactContent.agreement !== undefined)
              output._agreement = artifactContent.agreement;
            if (artifactContent.design !== undefined)
              output._design = artifactContent.design;
            if (artifactContent.executiveSummary !== undefined)
              output._executiveSummary = artifactContent.executiveSummary;
            if (artifactContent.acceptance !== undefined)
              output._acceptance = artifactContent.acceptance;
          }
        }
        return formatToolOutput(output);
      };

      if (target_path && requestedKinds.length > 0) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path,
            stateRequirement: "temporal-required",
            mutation: false,
          },
          async ({ context, store: targetStore }) =>
            runShow(targetStore, formatTargetProjectContext(context)),
        );
      }

      return withOptionalTargetPathStore(
        { store, target_path },
        async (activeStore, projectContext) =>
          runShow(activeStore, projectContext),
      );
    },
  },
  adv_change_create: {
    description: "Create a new change proposal",
    args: {
      summary: z
        .string()
        .describe(
          "2-5 word summary used as the change title and ID. " +
            "Start with an action verb (add, fix, update, remove, refactor). " +
            "Be specific, not generic. " +
            'Good: "Add rate limiting", "Fix auth token refresh". ' +
            'Bad: "Implement comprehensive authentication system", "Full update".',
        ),
      capability: z.string().optional().describe("Primary capability affected"),
      proposal: z
        .string()
        .optional()
        .describe(
          "Optional proposal.md content to persist during change creation",
        ),
      problemStatement: z
        .string()
        .optional()
        .describe(
          "Optional confirmed problem statement text to persist as problem-statement.md artifact",
        ),
      agreement: z
        .string()
        .optional()
        .describe(
          "Optional agreement.md content (objectives, AC, constraints, avoidances)",
        ),
      design: z
        .string()
        .optional()
        .describe(
          "Optional design.md content (architecture, LBP decisions, implementation strategy)",
        ),
      executiveSummary: z
        .string()
        .optional()
        .describe(
          "Optional executive-summary.md content (post-acceptance outcome narrative)",
        ),
      target_path: z
        .string()
        .optional()
        .describe(
          "Absolute path to the target project directory for cross-project change creation. " +
            "When provided, creates the change in that project instead of the current one.",
        ),
      source_project: z
        .string()
        .optional()
        .describe(
          "Name of the source project creating this follow-up. " +
            "Auto-detected from current store config when target_path is provided.",
        ),
      source_change_id: z
        .string()
        .optional()
        .describe(
          "Change ID in the source project that triggered this follow-up.",
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
      epic_owner_target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to the Epic owner ADV project. When provided with epic_id/entry_id/epic_title, seeds Epic membership in a remote-owner Epic instead of the current project.",
        ),
      epic_owner_target_confirmed: z
        .literal(true)
        .optional()
        .describe(
          "Required for untrusted epic_owner_target_path mutation. Confirms the Epic owner project was explicitly approved.",
        ),
      epic_owner_confirmationEvidence: z
        .string()
        .optional()
        .describe(
          "Required with epic_owner_target_confirmed for untrusted epic_owner_target_path mutation. Cite user approval evidence.",
        ),
      parent_change_id: z
        .string()
        .optional()
        .describe(
          "Same-project parent change ID for fast-follow lineage. " +
            "Mutually exclusive with target_path (cross-project follow-up). " +
            "Parent must exist in the current project.",
        ),
      scope_repos: z
        .array(ChangeRepoScopeSchema)
        .optional()
        .describe(
          "Product-linked repo scope for this change. Repo IDs must exist in the product config. Defaults to the current repo when product linking is enabled.",
        ),
      epic_id: z
        .string()
        .min(1)
        .optional()
        .describe("Parent Epic ID for create-time Epic membership seeding."),
      entry_id: z
        .string()
        .min(1)
        .optional()
        .describe("Epic entry ID for create-time Epic membership seeding."),
      epic_order: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Advisory order within the Epic roadmap."),
      epic_title: z
        .string()
        .min(1)
        .optional()
        .describe("Display title for the Epic entry."),
      origin_kind: ChangeOriginKindSchema.optional().describe(
        "Origin provenance kind. " +
          "'roadmap' = READABLE LEGACY ONLY — retired for new writes by reshapeTriagePortfolioBalance; archived changes still carry this kind. Use 'triage' for new issue-linked changes. " +
          "'discovery' = surfaced mid-session (bug found, drive-by improvement). " +
          "'triage' = promoted by /adv-triage from wisdom/notes (origin_source_artifact recommended). " +
          "'adhoc' = explicit, no upstream artifact. " +
          "Omit to leave origin unset (legacy/backward-compatible).",
      ),
      origin_issue_number: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "GitHub issue number for kind=roadmap (required) or kind=triage (optional). " +
            "Rejected for discovery, adhoc, and omitted origin_kind.",
        ),
      origin_source_artifact: z
        .string()
        .optional()
        .describe(
          "Stable reference to the upstream artifact for kind=triage or kind=discovery. " +
            "Examples: wisdom-id, task-id, or note-line ref. " +
            "Parse-only legacy: agenda-id ('ag-...') values remain readable for historical records.",
        ),
    },
    execute: async (
      {
        summary,
        capability,
        proposal,
        problemStatement,
        agreement,
        design,
        executiveSummary,
        target_path,
        source_project,
        source_change_id,
        target_confirmed,
        confirmationEvidence,
        epic_owner_target_path,
        epic_owner_target_confirmed,
        epic_owner_confirmationEvidence,
        parent_change_id,
        scope_repos,
        epic_id,
        entry_id,
        epic_order,
        epic_title,
        origin_kind,
        origin_issue_number,
        origin_source_artifact,
      }: {
        summary: string;
        capability?: string;
        proposal?: string;
        problemStatement?: string;
        agreement?: string;
        design?: string;
        executiveSummary?: string;
        target_path?: string;
        source_project?: string;
        source_change_id?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
        epic_owner_target_path?: string;
        epic_owner_target_confirmed?: true;
        epic_owner_confirmationEvidence?: string;
        parent_change_id?: string;
        scope_repos?: ChangeRepoScope[];
        epic_id?: string;
        entry_id?: string;
        epic_order?: number;
        epic_title?: string;
        origin_kind?: ChangeOrigin["kind"];
        origin_issue_number?: number;
        origin_source_artifact?: string;
      },
      store: Store,
      _maybeOverridePath?: string,
      providers: ChangeCreateProviders = {},
    ) => {
      if (isSyntheticValidationDraftSummary(summary)) {
        return formatToolOutput(buildSyntheticValidationDraftError(summary));
      }
      if (target_path && parent_change_id) {
        return formatToolOutput({
          error: "target_path and parent_change_id are mutually exclusive",
        });
      }
      if (epic_owner_target_path) {
        const ownerRoot = resolve(epic_owner_target_path);
        const childRoot = resolve(target_path ?? store.paths.root);
        if (
          ownerRoot !== childRoot &&
          childRoot === resolve(store.paths.root)
        ) {
          return formatToolOutput({
            error:
              "Owner remote + child local routing is not supported for change creation. Create the change in the Epic owner project or a different remote project.",
            code: EPIC_OWNER_ROUTING_ERROR_CODES.OWNER_CHILD_ROUTING_UNSUPPORTED,
          });
        }
      }
      const blankCreateFields = collectBlankCreateArtifactOrLinkageFields({
        proposal,
        problemStatement,
        agreement,
        design,
        executiveSummary,
        origin_source_artifact,
      });
      if (blankCreateFields.length > 0) {
        return formatToolOutput({
          error: "Blank artifact or linkage fields are not allowed.",
          fields: blankCreateFields,
          hint: "Provide non-blank strings for fields you intend to set, or omit fields you do not intend to set.",
        });
      }
      const originLinkageError = validateCreateOriginLinkage({
        origin_kind,
        origin_issue_number,
        origin_source_artifact,
      });
      if (originLinkageError) {
        return formatToolOutput(originLinkageError);
      }
      // Origin validation: the linkage matrix has already been validated.
      // Origin is typed-state only — behavior automation (auto-create issue,
      // auto-close on archive) lands in a follow-up change.
      let origin: ChangeOrigin | undefined;
      if (origin_kind) {
        origin = {
          kind: origin_kind,
          ...(origin_issue_number !== undefined
            ? { issue_number: origin_issue_number }
            : {}),
          ...(origin_source_artifact
            ? { source_artifact: origin_source_artifact }
            : {}),
        };
      }
      // Validate create-time Epic membership seed fields up-front so both
      // same-project and cross-project creates share one completeness gate.
      const epicSeedResult = buildEpicMembershipFromSeed({
        epic_id,
        entry_id,
        epic_order,
        epic_title,
      });
      if (epicSeedResult.error) {
        return formatToolOutput(epicSeedResult.error);
      }
      const epicMembership = epicSeedResult.membership;
      // rq-backlogCoord02 — Pre-create claim collision check.
      // Fires for any origin that carries a concrete `issue_number` (kind
      // roadmap requires it; triage may carry it when promoting from a
      // backlog item). Skipped for adhoc/discovery without issue_number.
      // Skipped entirely when no Temporal service is available (legacy /
      // test mode) UNLESS an explicit `claimChecker` provider is injected.
      const claimChecker = providers.claimChecker ?? defaultClaimChecker;
      const claimRaceCheckMs =
        providers.claimRaceCheckMs ?? DEFAULT_CLAIM_RACE_CHECK_MS;
      const claimCoordinationEnabled =
        providers.claimChecker !== undefined || getService() !== null;
      const shouldClaimCheck =
        claimCoordinationEnabled &&
        origin?.issue_number !== undefined &&
        (origin.kind === "roadmap" || origin.kind === "triage");
      if (shouldClaimCheck && origin?.issue_number !== undefined) {
        const projectId = (await getProjectId(store.paths.root)) ?? "";
        const existing = await claimChecker(projectId, origin.issue_number);
        if (existing.length > 0) {
          const first = existing[0];
          return formatToolOutput({
            error: `Issue #${origin.issue_number} is already claimed by change ${first.changeId} (status: ${first.status})`,
            code: "CLAIM_CONFLICT",
            issue_number: origin.issue_number,
            existing_change_id: first.changeId,
            existing_change_status: first.status,
            hint: `Resume that change with /adv-apply ${first.changeId}, or omit origin_issue_number to create an unlinked change.`,
          });
        }
      }
      if (target_path) {
        return createCrossProjectFollowUp({
          summary,
          capability,
          proposal,
          problemStatement,
          agreement,
          design,
          executiveSummary,
          target_path,
          target_confirmed,
          confirmationEvidence,
          source_project,
          source_change_id,
          epicMembership,
          epic_owner_target_path,
          epic_owner_target_confirmed,
          epic_owner_confirmationEvidence,
          store,
        });
      }
      let fastFollowOf: FastFollowOf | undefined;
      if (parent_change_id) {
        const parentValidation = await validateParentChange(
          store,
          parent_change_id,
        );
        if (!parentValidation.ok) {
          return formatToolOutput({
            error: `Parent change not found: ${parent_change_id}`,
            validParentIds: parentValidation.validParentIds,
          });
        }
        fastFollowOf = {
          parent_change_id,
          linked_at: new Date().toISOString(),
        };
      }
      const scopeResolution = resolveScopeRepos(store, scope_repos);
      if (!scopeResolution.ok) {
        return formatToolOutput({ error: scopeResolution.error });
      }
      const duplicateError = await checkActiveDuplicateChange(store, summary);
      if (duplicateError) {
        return formatToolOutput(duplicateError);
      }
      const initialMetadata: ChangeCreateInitialMetadata = {};
      if (origin) initialMetadata.origin = origin;
      if (fastFollowOf) initialMetadata.fast_follow_of = fastFollowOf;
      if (scopeResolution.scope)
        initialMetadata.scope_repos = scopeResolution.scope;
      if (epicMembership) {
        initialMetadata.epic_membership = epicMembership;
      }
      const createOptions =
        Object.keys(initialMetadata).length > 0
          ? { initialMetadata }
          : undefined;
      // rq-backlogCoord08: seed creation metadata before workflow start so
      // origin/search attributes are authoritative Temporal state, not a late
      // disk-only patch.
      const result = await store.changes.create(summary, {
        capability,
        artifacts: {
          ...(proposal !== undefined ? { proposal } : {}),
          ...(problemStatement !== undefined ? { problemStatement } : {}),
          ...(agreement !== undefined ? { agreement } : {}),
          ...(design !== undefined ? { design } : {}),
          ...(executiveSummary !== undefined ? { executiveSummary } : {}),
        },
        ...(createOptions?.initialMetadata
          ? { initialMetadata: createOptions.initialMetadata }
          : {}),
      });
      const output: Record<string, unknown> = { ...result };
      if (fastFollowOf) {
        output.fast_follow_of = fastFollowOf;
      }
      // Surface duplicate warning prominently if present
      if (result.duplicateWarning) {
        output._duplicateWarning = result.duplicateWarning;
      }
      if (origin) {
        output.origin = origin;
      }
      if (initialMetadata.epic_membership) {
        output.epic_membership = initialMetadata.epic_membership;
      }
      if (scopeResolution.scope) {
        output.scope_repos = scopeResolution.scope;
      }
      await appendClarifyNeededForCreatedChange(store, result.changeId, output);
      const createdChangeResult = await store.changes.get(result.changeId);
      if (!createdChangeResult.success) {
        // rq-schemaDriftToolLayer: a load failure on the just-created change
        // (e.g. schema validation) is a real corruption signal — the
        // change.json written by create is unreadable. Propagate verbatim
        // instead of silently omitting the snapshot and returning a
        // misleading success.
        return formatToolOutput({
          error: createdChangeResult.error,
          changeId: result.changeId,
        });
      }
      if (createdChangeResult.data) {
        const { content: proposalText } = await loadProposalForContext(
          store,
          result.changeId,
          createdChangeResult.data.title,
        );
        const createdGates =
          createdChangeResult.data.gates ?? createDefaultGates();
        // AC5: created-change snapshot carries the `Next:` orientation line.
        // Best effort: a derivation failure must not break change-create; the
        // snapshot omits the `Next:` line.
        const createdDirective = deriveDirectiveSafe(
          changeToDirectiveState({
            projectId: createdChangeResult.data.adv_project_id ?? "unknown",
            change: createdChangeResult.data,
            gates: createdGates,
          }),
          Date.now(),
        );
        if (!createdDirective) {
          logger.warn(
            `deriveWorkflowDirective failed in change-create for ${result.changeId}; snapshot omits Next line`,
          );
        }
        output._contextSnapshot = buildChangeContextSnapshot({
          change: createdChangeResult.data,
          proposalText,
          gates: createdGates,
          workdir: store.paths.root,
          directive: createdDirective,
        });
      }
      // rq-backlogCoord03 — Post-create double-check for race tolerance.
      // Temporal Visibility is eventually consistent; concurrent creates may
      // both pass the pre-create check. Re-query after the propagation window
      // and surface CLAIM_RACE_DETECTED if N>1 changes share the issue. The
      // new change is NOT rolled back — the caller decides resolution.
      if (
        shouldClaimCheck &&
        origin?.issue_number !== undefined &&
        result.changeId
      ) {
        if (claimRaceCheckMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, claimRaceCheckMs));
        }
        try {
          const projectId = (await getProjectId(store.paths.root)) ?? "";
          const racers = await claimChecker(projectId, origin.issue_number);
          if (racers.length > 1) {
            output.warning = "CLAIM_RACE_DETECTED";
            output.race_change_ids = racers.map((r) => r.changeId);
            output.race_hint = `Concurrent change-create detected for issue #${origin.issue_number}. Changes: [${racers
              .map((r) => r.changeId)
              .join(", ")}]. Resolve by archiving duplicates.`;
          }
        } catch (err) {
          // Post-create check failure is non-fatal — the change exists.
          logger.warn(
            `Post-create claim race-check failed for ${result.changeId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      return formatToolOutput(output);
    },
  },
  adv_change_update: {
    description:
      "Update narrative artifacts (proposal.md, problem-statement.md, agreement.md, design.md, executive-summary.md) for an existing change. Does NOT create a new change or modify change.json metadata (status, tasks, deltas). Use this instead of calling adv_change_create again when refining a proposal or persisting the post-acceptance executive summary. Only provided fields are written — omitted fields are left unchanged.",
    args: {
      changeId: z
        .string()
        .describe(
          "Change ID to update — must match an existing change from `adv_change_list`. Unknown IDs are rejected with a hint. This tool writes artifact files only; it does NOT modify change.json metadata (status, tasks, deltas).",
        ),
      proposal: z
        .string()
        .optional()
        .describe(
          "New proposal.md content (overwrites existing). Omit to leave unchanged. At least one of `proposal`, `problemStatement`, `agreement`, `design`, or `executiveSummary` MUST be provided.",
        ),
      problemStatement: z
        .string()
        .optional()
        .describe(
          "New problem-statement.md content (overwrites existing). Omit to leave unchanged. At least one of `proposal`, `problemStatement`, `agreement`, `design`, or `executiveSummary` MUST be provided.",
        ),
      agreement: z
        .string()
        .optional()
        .describe(
          "New agreement.md content (overwrites existing). Omit to leave unchanged. At least one of `proposal`, `problemStatement`, `agreement`, `design`, or `executiveSummary` MUST be provided.",
        ),
      design: z
        .string()
        .optional()
        .describe(
          "New design.md content (overwrites existing). Omit to leave unchanged. At least one of `proposal`, `problemStatement`, `agreement`, `design`, or `executiveSummary` MUST be provided.",
        ),
      executiveSummary: z
        .string()
        .optional()
        .describe(
          "New executive-summary.md content (overwrites existing). Omit to leave unchanged. At least one of `proposal`, `problemStatement`, `agreement`, `design`, or `executiveSummary` MUST be provided.",
        ),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, mutates that project through a Temporal-backed target store.",
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
      recoveryMode: z.enum(["normal", "poisoned_history"]).optional(),
      recoveryEvidence: z
        .string()
        .optional()
        .describe(
          "Required when recoveryMode='poisoned_history'. Must cite precise poisoned-history or completed-workflow evidence.",
        ),
      recoveryReason: z
        .string()
        .optional()
        .describe("Required recovery rationale for artifact metadata repair."),
      priorApprovalEvidence: z
        .string()
        .optional()
        .describe(
          "Required prior user approval evidence for acceptance-proof artifact recovery.",
        ),
    },
    execute: async (
      {
        changeId,
        proposal,
        problemStatement,
        agreement,
        design,
        executiveSummary,
        target_path,
        target_confirmed,
        confirmationEvidence,
        recoveryMode,
        recoveryEvidence,
        recoveryReason,
        priorApprovalEvidence,
      }: {
        changeId: string;
        proposal?: string;
        problemStatement?: string;
        agreement?: string;
        design?: string;
        executiveSummary?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
        recoveryMode?: "normal" | "poisoned_history";
        recoveryEvidence?: string;
        recoveryReason?: string;
        priorApprovalEvidence?: string;
      },
      store: Store,
    ) => {
      const runUpdate = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        // P1.12 Scope C: at-least-one-field guard with agent-facing hint
        // naming the valid fields so the next call can be constructed without
        // a schema lookup.
        if (
          proposal === undefined &&
          problemStatement === undefined &&
          agreement === undefined &&
          design === undefined &&
          executiveSummary === undefined
        ) {
          return formatToolOutput({
            error:
              "At least one of 'proposal', 'problemStatement', 'agreement', 'design', or 'executiveSummary' must be provided.",
            hint: "Pass one or more of: proposal, problemStatement, agreement, design, executiveSummary. See the tool description for which file each field writes.",
          });
        }
        const artifactInputs = [
          { field: "proposal", value: proposal },
          { field: "problemStatement", value: problemStatement },
          { field: "agreement", value: agreement },
          { field: "design", value: design },
          { field: "executiveSummary", value: executiveSummary },
        ] as const;
        const blankArtifactFields = artifactInputs
          .filter(
            ({ value }) =>
              value !== undefined &&
              typeof value === "string" &&
              value.trim().length === 0,
          )
          .map(({ field }) => field);
        if (blankArtifactFields.length > 0) {
          return formatToolOutput({
            error: "Blank artifact fields are not allowed.",
            fields: blankArtifactFields,
            hint: "Provide non-blank strings for artifact fields, or omit fields you do not intend to change.",
          });
        }
        // P1.12 Scope C: verify changeId exists before writing. Surface a
        // structured error that names the source-of-truth tools so the
        // agent can self-correct without guessing.
        const existing = await activeStore.changes.get(changeId);
        if (!existing.success) {
          // rq-schemaDriftToolLayer: propagate LoadResult errors (including
          // schema validation failures) verbatim instead of masking them as
          // "Change not found" — the store layer (T2) already formats these.
          return formatToolOutput({ error: existing.error });
        }
        if (!existing.data) {
          return formatToolOutput({
            error: `Change '${changeId}' not found.`,
            hint: "Fetch valid change IDs with 'adv_change_list' or confirm the target with 'adv_change_show changeId: <id>' before retrying.",
          });
        }
        if (recoveryMode === "poisoned_history") {
          const { isPreciseWorkflowRecoveryEvidence } =
            await import("../temporal/recovery-classification");
          if (!recoveryEvidence?.trim()) {
            return formatToolOutput({
              error:
                "artifact metadata recovery requires non-empty recoveryEvidence when recoveryMode='poisoned_history'",
              changeId,
            });
          }
          if (!isPreciseWorkflowRecoveryEvidence(recoveryEvidence)) {
            return formatToolOutput({
              error:
                "artifact metadata recoveryEvidence must cite precise poisoned-history or completed-workflow evidence",
              changeId,
            });
          }
          if (!recoveryReason?.trim() || !priorApprovalEvidence?.trim()) {
            return formatToolOutput({
              error:
                "artifact metadata recovery requires recoveryReason and priorApprovalEvidence",
              changeId,
            });
          }
        }
        let result;
        try {
          result = await activeStore.changes.updateArtifacts(changeId, {
            ...(proposal !== undefined ? { proposal } : {}),
            ...(problemStatement !== undefined ? { problemStatement } : {}),
            ...(agreement !== undefined ? { agreement } : {}),
            ...(design !== undefined ? { design } : {}),
            ...(executiveSummary !== undefined ? { executiveSummary } : {}),
          });
        } catch (error) {
          if (
            recoveryMode !== "poisoned_history" ||
            executiveSummary === undefined
          ) {
            throw error;
          }
          const { RECOVERY_RECONCILIATION_WARNING } =
            await import("../temporal/recovery-classification");
          const { recover } = await classifyCompletedOrPoisonedChangeRecovery(
            activeStore,
            changeId,
            error,
          );
          if (!recover) throw error;
          const { saveRecoveredArtifactMetadata } =
            await import("./_recovery-writers");
          const executiveSummaryPath = join(
            activeStore.paths.changes,
            changeId,
            "executive-summary.md",
          );
          const executiveSummaryReadable =
            await fileExists(executiveSummaryPath);
          await saveRecoveredArtifactMetadata({
            store: activeStore,
            change: existing.data,
            authorization: {
              reason: recoveryReason ?? "artifact_metadata_recovery",
              evidence: recoveryEvidence ?? String(error),
            },
            kind: "executiveSummary",
            metadata: {
              ...(executiveSummaryReadable
                ? { path: executiveSummaryPath }
                : {}),
              updatedAt: new Date().toISOString(),
              contentHash: createHash("sha256")
                .update(executiveSummary)
                .digest("hex"),
              source: "recovery",
              readable: executiveSummaryReadable,
            },
          });
          return formatToolOutput({
            changeId,
            ...(executiveSummaryReadable ? { executiveSummaryPath } : {}),
            executiveSummaryReadable,
            _recoveryMutation: true,
            recoveryReason,
            priorApprovalEvidence,
            reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        }
        if (!result.success) {
          return formatToolOutput({ error: result.error });
        }
        return formatToolOutput({
          changeId,
          proposalPath: result.proposalPath,
          problemStatementPath: result.problemStatementPath,
          agreementPath: result.agreementPath,
          designPath: result.designPath,
          executiveSummaryPath: result.executiveSummaryPath,
          ...(projectContext ? { _projectContext: projectContext } : {}),
        });
      };
      if (target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path,
            stateRequirement: "temporal-required",
            target_confirmed,
            confirmationEvidence,
          },
          async ({ context, store: targetStore }) =>
            runUpdate(targetStore, formatTargetProjectContext(context)),
        );
      }
      return runUpdate(store);
    },
  },
  adv_change_close: {
    description:
      "Close an active change with required user approval and audit metadata",
    args: {
      changeId: z.string().describe("Change ID to close"),
      reason: z
        .enum(["cancelled", "superseded", "not_planned"])
        .describe("Why the change is being closed"),
      approvedByUser: z
        .literal(true)
        .describe("Must be true — confirms user explicitly approved"),
      approvalEvidence: z
        .string()
        .describe("Evidence of user approval (e.g. question tool response)"),
      supersededBy: z
        .string()
        .optional()
        .describe("Surviving change ID when reason is superseded"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview close without firing signals or removing files."),
      recoveryMode: z
        .enum(["normal", "poisoned_history"])
        .optional()
        .describe(
          "Optional completed-workflow recovery mode. Default 'normal'. 'poisoned_history' authorizes an audited disk-projection close only after the normal signal path fails with completed-workflow evidence; requires recoveryEvidence.",
        ),
      recoveryEvidence: z
        .string()
        .optional()
        .describe(
          "Required when recoveryMode='poisoned_history'. Must cite precise completed-workflow evidence such as WorkflowExecutionAlreadyCompleted, WorkflowNotFoundError, or `workflow execution already completed`.",
        ),
      target_path: targetPathSchema.shape.target_path,
      target_confirmed: targetPathSchema.shape.target_confirmed,
      confirmationEvidence: targetPathSchema.shape.confirmationEvidence,
    },
    execute: async (
      {
        changeId,
        reason,
        approvedByUser: _approvedByUser,
        approvalEvidence,
        supersededBy,
        dryRun,
        recoveryMode,
        recoveryEvidence,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        changeId: string;
        reason: "cancelled" | "superseded" | "not_planned";
        approvedByUser: true;
        approvalEvidence: string;
        supersededBy?: string;
        dryRun?: boolean;
        recoveryMode?: ChangeCloseRecoveryMode;
        recoveryEvidence?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const runClose = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        if (reason === "superseded" && !supersededBy) {
          return formatToolOutput({
            error: "supersededBy is required when reason is 'superseded'.",
          });
        }
        const result = await activeStore.changes.get(changeId);
        if (!result.success) {
          return formatToolOutput({ error: result.error });
        }
        if (!result.data) {
          return formatToolOutput({ error: `Change not found: ${changeId}` });
        }
        // Tool-layer enforcement: cancellation requires explicit approval evidence
        if (!approvalEvidence || approvalEvidence.trim().length === 0) {
          return formatToolOutput({
            error: "approvalEvidence is required for change close",
            changeId,
            hint: "Obtain user approval via question tool, then call adv_change_close with approvalEvidence.",
          });
        }
        const recoveryValidation = await validateChangeCloseRecoveryArgs({
          changeId,
          recoveryMode,
          recoveryEvidence,
        });
        if (recoveryValidation) {
          return formatToolOutput(recoveryValidation);
        }
        if (dryRun) {
          return formatToolOutput({
            success: true,
            dryRun: true,
            changeId,
            reason,
            supersededBy,
            message: `Would close change ${changeId} as ${reason}.`,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        }
        try {
          const bundle = getService();
          if (!bundle) {
            return formatToolOutput({
              error: "Temporal service not available",
              changeId,
            });
          }
          const projectId =
            projectContext?.projectId ??
            (await getProjectId(activeStore.paths.root));
          if (!projectId) {
            return formatToolOutput({
              error: "Could not resolve project ID",
              changeId,
            });
          }
          const handle = getChangeHandle(bundle.client, projectId, changeId);
          const closeInput = {
            approvalEvidence,
            reason,
            supersededBy,
            cancelledAt: new Date().toISOString(),
          };
          // rq-cacheRefresh01: refresh AFTER cancel so subsequent reads
          // see the closed/cancelled state, not the stale active state.
          await fireSignalAndRefresh(
            handle,
            activeStore,
            changeId,
            changeCancelledSignal,
            buildChangeClosePayload(closeInput),
          );
          // Remove source `changes/<id>/` directory after successful close.
          // Best-effort: failure surfaces as a warning but does NOT flip success
          // to false — the closed status is durable.
          let cleanupWarning: string | undefined;
          if (activeStore.paths?.changes) {
            try {
              await removeChangeDir(activeStore.paths.changes, changeId);
            } catch (err) {
              cleanupWarning = `Source cleanup warning: failed to remove changes/${changeId}: ${err instanceof Error ? err.message : String(err)}`;
            }
          }
          return formatToolOutput({
            success: true,
            changeId,
            message: cleanupWarning
              ? `Closed change ${changeId} as ${reason}. ${cleanupWarning}`
              : `Closed change ${changeId} as ${reason}.`,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        } catch (error) {
          const closeInput = {
            approvalEvidence,
            reason,
            supersededBy,
            cancelledAt: new Date().toISOString(),
          };
          const recovery = await recoverCompletedWorkflowClose({
            store: activeStore,
            change: result.data,
            closeInput,
            recoveryMode,
            recoveryEvidence,
            signalError: error,
          });
          if (recovery.recovered) {
            return formatToolOutput({
              success: true,
              _recoveryMutation: true,
              diskProjectionRetained: true,
              changeId,
              reason,
              message: `Closed change ${changeId} as ${reason} via completed-workflow recovery. Retained closed disk projection for stale-visibility reconciliation.`,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
          }
          const contextMismatch = extractContextMismatch(error);
          return formatToolOutput({
            error: error instanceof Error ? error.message : String(error),
            ...contextMismatch,
          });
        }
      };

      if (target_path) {
        try {
          return await withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path,
              stateRequirement: "temporal-required",
              mutation: !dryRun,
              target_confirmed,
              confirmationEvidence,
            },
            async ({ context, store: targetStore }) =>
              runClose(targetStore, formatTargetProjectContext(context)),
          );
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error);
          return formatToolOutput({
            success: false,
            error: `Target project close unavailable: ${errorText}`,
            changeId,
            target_path,
          });
        }
      }
      return runClose(store);
    },
  },
  // rq-bulkClose01: Filter-Aware Bulk Close
  adv_change_bulk_close: {
    description:
      "Close multiple changes in a single approved operation. Supports explicit IDs or filter-based selection. Requires either a status filter or a staleness filter. Fail-all if any target is protected or invalid.",
    args: {
      selector: BulkCloseSelectorSchema.describe(
        "Explicit IDs or filter criteria",
      ),
      reason: z
        .enum(["cancelled", "superseded", "not_planned"])
        .describe("Why changes are being closed"),
      approvedByUser: z
        .literal(true)
        .describe("Must be true — confirms user explicitly approved"),
      approvalEvidence: z
        .string()
        .describe("Evidence of user approval (e.g. question tool response)"),
      supersededBy: z
        .string()
        .optional()
        .describe("Surviving change ID when reason is superseded (max 1)"),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "Preview bulk close without firing signals or removing files.",
        ),
      recoveryMode: z
        .enum(["normal", "poisoned_history"])
        .optional()
        .describe(
          "Optional completed-workflow recovery mode. Default 'normal'. 'poisoned_history' authorizes audited disk-projection close for each selected change only after its normal signal path fails with completed-workflow evidence; requires recoveryEvidence.",
        ),
      recoveryEvidence: z
        .string()
        .optional()
        .describe(
          "Required when recoveryMode='poisoned_history'. Must cite precise completed-workflow evidence such as WorkflowExecutionAlreadyCompleted, WorkflowNotFoundError, or `workflow execution already completed`.",
        ),
      target_path: targetPathSchema.shape.target_path,
      target_confirmed: targetPathSchema.shape.target_confirmed,
      confirmationEvidence: targetPathSchema.shape.confirmationEvidence,
    },
    execute: async (
      {
        selector,
        reason,
        approvedByUser: _approvedByUser,
        approvalEvidence,
        supersededBy,
        dryRun,
        recoveryMode,
        recoveryEvidence,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        selector: import("../types").BulkCloseSelector;
        reason: "cancelled" | "superseded" | "not_planned";
        approvedByUser: true;
        approvalEvidence: string;
        supersededBy?: string;
        dryRun?: boolean;
        recoveryMode?: ChangeCloseRecoveryMode;
        recoveryEvidence?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      if (reason === "superseded") {
        if (selector.kind === "filter") {
          return formatToolOutput({
            error:
              "Filter-based bulk close with reason 'superseded' is not supported. Use explicit IDs.",
          });
        }
        if (!supersededBy) {
          return formatToolOutput({
            error: "supersededBy is required when reason is 'superseded'.",
          });
        }
      }
      const runBulkClose = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        const contextOutput = projectContext
          ? { _projectContext: projectContext }
          : {};
        const selection = await resolveChangeSelection(selector, {
          list: activeStore.changes.list.bind(activeStore.changes),
          get: activeStore.changes.get.bind(activeStore.changes),
        });
        if (!selection.ok) {
          return formatToolOutput({
            error: selection.error,
            ...contextOutput,
          });
        }
        const recoveryValidation = await validateChangeCloseRecoveryArgs({
          recoveryMode,
          recoveryEvidence,
        });
        if (recoveryValidation) {
          return formatToolOutput({
            ...recoveryValidation,
            ...contextOutput,
          });
        }
        if (selection.changeIds.length === 0) {
          return formatToolOutput({
            error: "SELECTION_ERROR: No changes matched the provided criteria.",
            ...contextOutput,
          });
        }
        if (dryRun) {
          return formatToolOutput({
            success: true,
            dryRun: true,
            closed: 0,
            wouldClose: selection.changeIds,
            results: selection.changeIds.map((id) => ({
              changeId: id,
              success: true,
              dryRun: true,
            })),
            diskRemoved: [],
            diskFailed: [],
            message: `Would close ${selection.changeIds.length} change(s).`,
            ...contextOutput,
          });
        }
        try {
          const bundle = getService();
          if (!bundle) {
            return formatToolOutput({
              error: "Temporal service not available",
              ...contextOutput,
            });
          }
          const projectId =
            projectContext?.projectId ??
            (await getProjectId(activeStore.paths.root));
          if (!projectId) {
            return formatToolOutput({
              error: "Could not resolve project ID",
              ...contextOutput,
            });
          }
          const results: {
            changeId: string;
            success: boolean;
            error?: string;
            recovered?: boolean;
          }[] = [];
          let closed = 0;
          for (const id of selection.changeIds) {
            try {
              const handle = getChangeHandle(bundle.client, projectId, id);
              const closeInput = {
                approvalEvidence,
                reason,
                supersededBy,
                cancelledAt: new Date().toISOString(),
              };
              // rq-cacheRefresh01: refresh per-change after each cancel
              // so subsequent reads of any cancelled change see closed state.
              await fireSignalAndRefresh(
                handle,
                activeStore,
                id,
                changeCancelledSignal,
                buildChangeClosePayload(closeInput),
              );
              results.push({ changeId: id, success: true });
              closed++;
            } catch (err) {
              const existing = await activeStore.changes.get(id);
              if (!existing.success) {
                // rq-schemaDriftToolLayer: load failure on change.json (e.g.
                // schema validation) — propagate verbatim. Recovery cannot
                // proceed without a readable change, and the load error is
                // more informative than the original signal error.
                results.push({
                  changeId: id,
                  success: false,
                  error: existing.error,
                });
                continue;
              }
              if (existing.success && existing.data) {
                const closeInput = {
                  approvalEvidence,
                  reason,
                  supersededBy,
                  cancelledAt: new Date().toISOString(),
                };
                const recovery = await recoverCompletedWorkflowClose({
                  store: activeStore,
                  change: existing.data,
                  closeInput,
                  recoveryMode,
                  recoveryEvidence,
                  signalError: err,
                });
                if (recovery.recovered) {
                  results.push({
                    changeId: id,
                    success: true,
                    recovered: true,
                  });
                  closed++;
                  continue;
                }
              }
              results.push({
                changeId: id,
                success: false,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          // D3: Compose with sweepClosedChangesFromDisk for unified per-id
          // disk-removal reporting. Only run when close succeeded overall
          // — partial workflow-close failures preserve source dirs as the
          // rollback / recovery path. (rq-bulkCloseDiskSweep01)
          let diskRemoved: string[] = [];
          let diskFailed: Array<{
            id: string;
            error: string;
          }> = [];
          const successfulIds = results
            .filter((r) => r.success && !r.recovered)
            .map((r) => r.changeId);
          if (successfulIds.length > 0 && activeStore.paths?.changes) {
            const sweep = await sweepClosedChangesFromDisk(
              successfulIds,
              activeStore.paths.changes,
            );
            diskRemoved = sweep.removed;
            diskFailed = sweep.failed;
          }
          const allSuccess = closed === selection.changeIds.length;
          let message = allSuccess
            ? `Successfully closed ${closed} change(s).`
            : `Closed ${closed} of ${selection.changeIds.length} change(s). See results for details.`;
          if (diskFailed.length > 0) {
            const warnings = diskFailed
              .map(
                (f) =>
                  `Source cleanup warning: failed to remove changes/${f.id}: ${f.error}`,
              )
              .join(" ");
            message += ` ${warnings}`;
          }
          return formatToolOutput({
            success: allSuccess,
            closed,
            results,
            diskRemoved,
            diskFailed,
            message,
            ...contextOutput,
          });
        } catch (error) {
          const contextMismatch = extractContextMismatch(error);
          return formatToolOutput({
            error: error instanceof Error ? error.message : String(error),
            ...contextMismatch,
            ...contextOutput,
          });
        }
      };

      if (target_path) {
        try {
          return await withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path,
              stateRequirement: "temporal-required",
              mutation: !dryRun,
              target_confirmed,
              confirmationEvidence,
            },
            async ({ context, store: targetStore }) =>
              runBulkClose(targetStore, formatTargetProjectContext(context)),
          );
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error);
          return formatToolOutput({
            success: false,
            error: `Target project bulk close unavailable: ${errorText}`,
            target_path,
          });
        }
      }
      return runBulkClose(store);
    },
  },
  adv_change_validate: {
    description:
      "Validate change against existing specs (specs as laws) and check for conflicts with other active changes",
    args: {
      changeId: z.string().describe("Change ID to validate"),
      strict: z
        .boolean()
        .optional()
        .describe("Run strict validation checks; only errors block by default"),
      strictWarnings: z
        .boolean()
        .optional()
        .describe(
          "Opt in to treating warnings as blocking failures during strict validation",
        ),
    },
    execute: async (
      {
        changeId,
        strict,
        strictWarnings,
      }: {
        changeId: string;
        strict?: boolean;
        strictWarnings?: boolean;
      },
      store: Store,
    ) => {
      // tk-f4a18a9705ef: bound the authoritative input load (change read +
      // validation context) so a slow Temporal read degrades structurally
      // below the 10s safeExecute ceiling instead of surfacing as an
      // unclassified whole-tool ToolExecutionTimeout. Early-return
      // responses travel through the union so existing error output shapes
      // are preserved exactly.
      type ValidateInputs =
        | { kind: "response"; response: string }
        | {
            kind: "ok";
            change: Change;
            context: Awaited<ReturnType<typeof loadValidationContext>>;
          };
      let inputs: ValidateInputs;
      try {
        inputs = await withTimeout(
          (async (): Promise<ValidateInputs> => {
            const result = await store.changes.get(changeId);
            if (!result.success) {
              return {
                kind: "response",
                response: formatToolOutput({ error: result.error }),
              };
            }
            if (!result.data) {
              return {
                kind: "response",
                response: formatToolOutput({
                  error: `Change not found: ${changeId}`,
                }),
              };
            }
            const change = result.data;
            const context = await loadValidationContext(
              store,
              changeId,
              change.title,
            );
            return { kind: "ok", change, context };
          })(),
          CHANGE_VALIDATE_CONTEXT_TIMEOUT_MS,
          `adv_change_validate input load exceeded ${CHANGE_VALIDATE_CONTEXT_TIMEOUT_MS}ms budget`,
        );
      } catch (err) {
        if (!(err instanceof TimeoutError)) throw err;
        return formatToolOutput({
          passed: false,
          degraded: true,
          error: "VALIDATION_TIME_BUDGET_EXHAUSTED",
          reason: "time_budget_exhausted",
          stage: "load-inputs",
          timeoutMs: CHANGE_VALIDATE_CONTEXT_TIMEOUT_MS,
          changeId,
          strict: strict === true,
          hint:
            "Validation input load exceeded its internal time budget (below the 10s tool ceiling). " +
            "No validation verdict was produced and authoritative state is untouched. " +
            "Likely a slow Temporal query or peer hydration — retry; if persistent, run adv_status and adv_temporal_diagnose to check worker/workflow health.",
        });
      }
      if (inputs.kind === "response") {
        return inputs.response;
      }
      const { change, context } = inputs;
      const {
        specs,
        activeChanges,
        conflictInventory,
        proposalText,
        changedSpecFiles,
      } = context;
      // Run full validation with typed conflict inventory for conflict detection
      const validationResult = await validateChange(change, {
        specs,
        activeChanges,
        conflictInventory,
        proposalText,
        changedSpecFiles,
      });
      // Check for requirement smells in spec deltas
      const smellIssues = checkRequirementSmells(change);
      const hasSmells = smellIssues.length > 0;
      // In strict mode, fail on blocking errors by default. Warnings remain
      // advisory unless caller explicitly opts into warning escalation.
      const passed = strict
        ? validationResult.errors.length === 0 &&
          (!strictWarnings || validationResult.warnings.length === 0)
        : validationResult.passed;
      const formatted = formatValidationOutput({
        passed,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
      });
      // If smells found, format and attach smell report
      if (hasSmells) {
        const smellInputs = smellIssues.map((issue) => ({
          type: issue.code,
          text: (issue.details?.requirementId as string) ?? issue.message,
          suggestion:
            (issue.details?.remediation as string) ??
            "Review and rewrite requirement",
        }));
        const smellReport = formatSmellReport(smellInputs);
        Object.assign(formatted, smellReport);
      }
      return formatToolOutput({
        passed,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        strictWarnings: strict ? Boolean(strictWarnings) : undefined,
        checksPerformed: validationResult.checksPerformed,
        checkedAt: validationResult.checkedAt,
        formatted,
      });
    },
  },
  adv_change_archive: {
    description: "Archive a completed change (applies deltas to specs)",
    args: {
      changeId: z.string().describe("Change ID to archive"),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "Preview changes without writing. With dryRun: true, this tool is read-only and safe to invoke without approval.",
        ),
      worktreePath: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to a git worktree where the in-repo bundle should be written. Defaults to the project root (main checkout). Used by /adv-archive Phase 9 Step 1 so bundles land in the worktree's .adv/archive/ and can be staged on the change branch without cp -r workarounds.",
        ),
      noCloseIssue: z
        .boolean()
        .optional()
        .describe("Skip automatic linked GitHub issue closure"),
      closeIssue: z
        .boolean()
        .optional()
        .describe(
          "Backward-compatible explicit affirmative (no-op, closure is default-on)",
        ),
      phase9: z
        .enum(["run", "skip"])
        .optional()
        .describe(
          "Phase 9 git finalization mode. Defaults to run. 'skip' is a compatibility/manual-recovery escape hatch; release gate completion must happen only after reachability/push evidence exists.",
        ),
      recoveryMode: z
        .enum(["normal", "poisoned_history"])
        .optional()
        .describe(
          "Optional recovery mode. 'poisoned_history' authorizes a disk-projection fallback for the final status transition when the workflow is poisoned or already completed and the archive bundle is already present/written. Requires recoveryEvidence.",
        ),
      recoveryEvidence: z
        .string()
        .optional()
        .describe(
          "Required when recoveryMode='poisoned_history'. Must cite precise poisoned-history evidence.",
        ),
      ...targetPathSchema.shape,
    },
    execute: async (
      {
        changeId,
        dryRun,
        worktreePath,
        noCloseIssue,
        closeIssue: _closeIssue,
        phase9,
        recoveryMode,
        recoveryEvidence,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        changeId: string;
        dryRun?: boolean;
        worktreePath?: string;
        noCloseIssue?: boolean;
        closeIssue?: boolean;
        phase9?: "run" | "skip";
        recoveryMode?: "normal" | "poisoned_history";
        recoveryEvidence?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const runArchive = async (activeStore: Store): Promise<string> => {
        const store = activeStore;
        if (recoveryMode === "poisoned_history") {
          if (!recoveryEvidence || !recoveryEvidence.trim()) {
            return formatToolOutput({
              error:
                "archive recovery requires non-empty recoveryEvidence when recoveryMode='poisoned_history'",
            });
          }
          const { isPreciseWorkflowRecoveryEvidence } =
            await import("../temporal/recovery-classification");
          if (!isPreciseWorkflowRecoveryEvidence(recoveryEvidence)) {
            return formatToolOutput({
              error:
                "archive recoveryEvidence must cite precise poisoned-history or completed-workflow evidence (TMPRL1100 / Nondeterminism / NonDeterministic / WorkflowExecutionUpdateAccepted / No command scheduled / WorkflowNotFoundError / workflow execution already completed)",
            });
          }
        }
        // rq-harden-archive-flow AC1: refresh the change from the workflow
        // before reading. Earlier signals (release-gate completion, review
        // matrix set) can leave the store cache stale and surface as false
        // contract-proof failures. Refresh is best-effort; failures fall
        // through to the existing read (which still has its own poisoned-
        // history fallback) so we don't mask real outages.
        try {
          await store.changes.refresh(changeId);
        } catch {
          // intentionally swallowed; the next get() will surface a real error.
        }
        const result = await store.changes.get(changeId);
        if (!result.success) {
          return formatToolOutput({ error: result.error });
        }
        if (!result.data) {
          return formatToolOutput({ error: `Change not found: ${changeId}` });
        }
        const change = result.data;
        const openOpsObligations = getOpenOpsFollowupObligations(
          change.ops_followup_links,
        );
        const openOpsObligationsPayload =
          openOpsObligations.length > 0
            ? { openOpsObligations }
            : ({} as Record<string, unknown>);
        const taskPreflightError = getArchiveTaskPreflightError(change);
        if (taskPreflightError) {
          return taskPreflightError;
        }
        const gateState = await resolveArchiveGateState(
          store,
          changeId,
          change,
        );
        const divergenceHint =
          gateState.source === "store" &&
          !allGatesSatisfied(gateState.storeGates)
            ? await getGateDivergenceHint(store, changeId, change)
            : null;
        const gatePreflightError = getArchiveGatePreflightError(
          changeId,
          gateState,
          phase9 !== "skip",
          divergenceHint,
        );
        if (gatePreflightError) {
          return gatePreflightError;
        }
        const { archiveMode, autoPush } = detectArchiveMode(store.config ?? {});
        if (!dryRun && phase9 === "skip") {
          const releaseEvidence = verifyReleaseEvidenceFromMain({
            store,
            changeId,
            archiveMode,
            change,
          });
          if (releaseEvidence.status === "blocked") {
            return formatToolOutput({
              success: false,
              error: `Phase 9 skip blocked: ${releaseEvidence.blocked?.reason}`,
              requirement: "rq-releaseFinalization01",
              changeId,
              remediation: releaseEvidence.blocked?.remediation,
              details: releaseEvidence.blocked?.details,
              finalization: releaseEvidence,
            });
          }
        }
        // rq-archiveValidate01: run completeness validation before bundle creation.
        let validationResult: Awaited<ReturnType<typeof validateChange>>;
        try {
          const validationContext = await loadValidationContext(
            store,
            changeId,
            change.title,
          );
          validationResult = await validateChange(change, {
            specs: validationContext.specs,
            activeChanges: validationContext.activeChanges,
            conflictInventory: validationContext.conflictInventory,
            proposalText: validationContext.proposalText,
            changedSpecFiles: validationContext.changedSpecFiles,
          });
        } catch (validationError) {
          const validationErrorText = collectErrorText(validationError);
          return formatToolOutput({
            success: false,
            error: `Archive blocked: validation could not run: ${validationErrorText}`,
            validationErrors: [
              {
                code: "VALIDATION_CONTEXT_FAILED",
                message: validationErrorText,
              },
            ],
            changeId,
          });
        }
        if (validationResult.errors.length > 0) {
          return formatToolOutput({
            error: `Archive blocked: ${validationResult.errors.length} validation error(s). Fix errors and retry.`,
            validationErrors: validationResult.errors.map((e) => ({
              code: e.code,
              message: e.message,
              path: e.path,
            })),
            changeId,
          });
        }
        const contractProofErrors = getArchiveContractProofErrors(change);
        if (contractProofErrors.length > 0) {
          return formatToolOutput({
            error: `Archive blocked: ${contractProofErrors.length} contract proof error(s). Fix proof and retry.`,
            contractProofErrors,
            changeId,
          });
        }
        // Run the archive operation
        // Include in-repo archive path: resolves within the repo at .adv/archive/.
        // When worktreePath is provided (e.g. /adv-archive Phase 9 from a worktree),
        // the bundle lands inside the worktree so it can be staged on the change
        // branch. Without worktreePath, falls back to store.paths.root (main
        // checkout) for backward compatibility.
        const inRepoBase = worktreePath ?? store.paths.root;
        const inRepoArchive = join(inRepoBase, ".adv", "archive");
        const projectionSpecs = join(inRepoBase, ".adv", "specs");
        const projectionDocs = join(inRepoBase, "docs", "specs");
        const specs = worktreePath
          ? await loadAllSpecs(projectionSpecs)
          : await loadSpecsMap(store);
        const archivePaths =
          store.config?.features?.wisdom_accumulation === false
            ? {
                ...store.paths,
                specs: projectionSpecs,
                docs: projectionDocs,
                wisdom: undefined,
                inRepoArchive,
              }
            : {
                ...store.paths,
                specs: projectionSpecs,
                docs: projectionDocs,
                inRepoArchive,
              };
        const existingBundlePath = !dryRun
          ? await findArchiveBundle(archivePaths.archive, changeId)
          : null;
        if (!dryRun) {
          if (
            !worktreePath &&
            Object.values(change.deltas).some((deltas) => deltas.length > 0)
          ) {
            return formatToolOutput({
              success: false,
              error:
                "Archive delta projection requires worktreePath; tracked specs and docs are never written through the main checkout.",
              requirement: "rq-archiveDeltaReconciliation01",
              changeId,
            });
          }
          if (
            !worktreePath &&
            phase9 !== "skip" &&
            existingBundlePath === null
          ) {
            return formatToolOutput({
              success: false,
              error:
                "Archive finalization requires worktreePath so archive artifacts are written to the change worktree before merge.",
              requirement: "rq-releaseFinalization01",
              changeId,
            });
          }
        }
        if (!dryRun && worktreePath) {
          const worktreeValidation = validateChangeWorktree(
            worktreePath,
            changeId,
            { requireCleanWorktree: true },
          );
          if (
            !worktreeValidation.valid ||
            worktreeValidation.mainCheckout !== store.paths.root
          ) {
            return formatToolOutput({
              success: false,
              error: "Archive finalization requires a trusted change worktree.",
              requirement: "rq-releaseFinalization01",
              changeId,
              remediation:
                worktreeValidation.error ??
                `Worktree belongs to ${worktreeValidation.mainCheckout}, expected ${store.paths.root}.`,
            });
          }
        }
        // rq-archiveRetryIdempotence01 (AC7): If the change is already
        // archived and the archive bundle is present, run a bounded metadata
        // reconciliation only. Do not repeat finalization, branch deletion,
        // issue closure, or cleanup.
        if (
          !dryRun &&
          change.status === "archived" &&
          existingBundlePath !== null
        ) {
          if (
            Object.values(change.deltas).some((deltas) => deltas.length > 0)
          ) {
            const manifest = await readProjectionManifest(existingBundlePath);
            const release = verifyReleaseEvidenceFromMain({
              store,
              changeId,
              archiveMode,
              change,
            });
            if (
              !manifest ||
              release.status !== "shipped" ||
              !release.mergeCommitSha
            ) {
              return formatToolOutput({
                success: false,
                error:
                  "Archived retry cannot prove accepted delta projection; run approved archive delta reconciliation in a trusted repair worktree.",
                requirement: "rq-archiveDeltaReconciliation01",
                changeId,
                archivePath: existingBundlePath,
              });
            }
            const proof = await verifyProjectionAtGitCommit({
              manifest,
              repo: release.mainCheckout,
              releasedCommitSha: release.mergeCommitSha,
              manifestGitPath: `.adv/archive/${basename(existingBundlePath)}/spec-projection.json`,
              expectedChangeId: change.id,
              expectedDeltaSetSha256: canonicalSha256(change.deltas),
              expectedDeltaIdsByCapability: Object.fromEntries(
                Object.entries(change.deltas).map(([capability, deltas]) => [
                  capability,
                  deltas.map((delta) => delta.id),
                ]),
              ),
            });
            if (!proof.ok) {
              return formatToolOutput({
                success: false,
                error: `Archived retry projection proof failed: ${proof.code}: ${proof.message}`,
                requirement: "rq-archiveDeltaReconciliation01",
                changeId,
                archivePath: existingBundlePath,
                projectionFailure: proof,
              });
            }
          }
          return reconcileArchivedBundleRetry({
            store,
            change,
            changeId,
            archiveMode,
            phase9,
            existingBundlePath,
            openOpsObligationsPayload,
            validationWarnings: validationResult.warnings,
          });
        }
        // rq-archiveOrdering01: Archive State Transition Must Be Resilient
        // to Failed Disk Bundle Write. Idempotent retry: if the bundle already
        // exists on disk, skip the disk write. Two sub-cases:
        //   1. status === "archived"  → no-op success (archive already
        //      complete; both disk + state already transitioned).
        //   2. status !== "archived"  → recovery path; previous attempt
        //      wrote the bundle but the status transition failed. Build a
        //      synthetic result without re-writing disk; let the status
        //      transition (below) complete the recovery.
        let archiveResult: import("../archive/types").ArchiveOperationResult;
        if (existingBundlePath !== null) {
          let reconciledInRepoPath: string | undefined;
          if (
            !dryRun &&
            archivePaths.inRepoArchive &&
            (worktreePath || phase9 === "skip")
          ) {
            reconciledInRepoPath = await reconcileInRepoArchive(
              change,
              archivePaths.inRepoArchive,
              archivePaths.changes
                ? join(archivePaths.changes, changeId)
                : undefined,
            );
          }
          archiveResult = Object.values(change.deltas).some(
            (deltas) => deltas.length > 0,
          )
            ? await archiveChange({
                change,
                specs,
                paths: archivePaths,
                dryRun,
                productId: store.productContext?.productId,
                reuseExistingBundlePath: existingBundlePath,
              })
            : {
                success: true,
                changeId,
                specsUpdated: [],
                docsGenerated: [],
                commitPaths: reconciledInRepoPath ? [reconciledInRepoPath] : [],
                archivePath: existingBundlePath,
                errors: [],
                archivedAt: new Date().toISOString(),
              };
        } else {
          archiveResult = await archiveChange({
            change,
            specs,
            paths: archivePaths,
            dryRun,
            productId: store.productContext?.productId,
          });
        }
        // rq-releaseFinalization01 AC1: Phase 9 finalization and release gate
        // completion MUST happen BEFORE archive status transition (change.status =
        // "archived" + store.changes.save). This ordering guarantee ensures that
        // release evidence is durable before the change workflow is retired.
        // If finalization or release gate completion fails, the change stays
        // active so it can be retried.
        let finalization: GitFinalizeOutcome | undefined;
        let releaseGateCompletion:
          | Extract<
              ArchiveReleaseGateResult,
              {
                ok: true;
              }
            >
          | undefined;
        if (!dryRun && archiveResult.success && phase9 !== "skip") {
          // Sync mode (existing behavior) — phase9 === "run" routes through
          // this same awaited finalization path; there is no detached async
          // dispatch, so the call returns a terminal outcome. A THROWN
          // finalization (git op failure) is caught here and recorded as
          // durable phase9_status="failed" with actionable recovery evidence
          // (rq-releaseFinalization01 AC2); the change stays active so the
          // operator can recover and re-run adv_change_archive instead of
          // the failure being swallowed or leaving a residual "pending".
          try {
            finalization = worktreePath
              ? await finalizeRelease({
                  changeId,
                  workdir: worktreePath,
                  expectedMainCheckout: store.paths.root,
                  archiveMode,
                  autoPush,
                  artifactPaths: (archiveResult.commitPaths ?? []).map((path) =>
                    relative(worktreePath, path),
                  ),
                })
              : verifyReleaseEvidenceFromMain({
                  store,
                  changeId,
                  archiveMode,
                  change,
                });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            const now = new Date().toISOString();
            await recordPhase9Status({
              store,
              changeId,
              status: preservePhase9Evidence(change.phase9_status, {
                status: "failed",
                startedAt: change.phase9_status?.startedAt ?? now,
                completedAt: now,
                error: message,
              }),
            });
            return formatToolOutput({
              success: false,
              error: `Archive finalization failed: ${message}`,
              requirement: "rq-releaseFinalization01",
              remediation:
                "Finalize the release manually (merge the change branch into the default branch and push, or resolve the underlying git error), then re-run adv_change_archive to complete the archive. The change remains active and the archive bundle is preserved for retry.",
              changeId,
              archivePath: archiveResult.archivePath,
              phase9Failure: {
                status: "failed",
                error: message,
                recoverable: false,
                remediation:
                  "Resolve the git error, then re-run adv_change_archive.",
              },
              ...openOpsObligationsPayload,
            });
          }
          if (finalization.status === "blocked") {
            return formatToolOutput({
              success: false,
              error: `Archive finalization blocked: ${finalization.blocked?.reason}`,
              requirement: "rq-releaseFinalization01",
              remediation: finalization.blocked?.remediation,
              details: finalization.blocked?.details,
              ...buildFailedPhase9Classification({ change, finalization }),
              changeId,
              archivePath: archiveResult.archivePath,
              specsUpdated: archiveResult.specsUpdated.map((s) => ({
                capability: s.capability,
                version: `${s.originalVersion} → ${s.newVersion}`,
                deltas: s.deltaResults.length,
              })),
              ...openOpsObligationsPayload,
            });
          }
          if (finalization.status === "pending_merge") {
            await recordPhase9Status({
              store,
              changeId,
              status: buildPendingMergePhase9Status({
                finalization,
                startedAt:
                  change.phase9_status?.startedAt ?? new Date().toISOString(),
                previous: change.phase9_status,
              }),
            });
            return formatToolOutput({
              success: true,
              specsUpdated: archiveResult.specsUpdated.map((s) => ({
                capability: s.capability,
                version: `${s.originalVersion} → ${s.newVersion}`,
                deltas: s.deltaResults.length,
              })),
              docsGenerated: archiveResult.docsGenerated,
              archivePath: archiveResult.archivePath,
              errors: archiveResult.errors,
              dryRun: false,
              ...(archiveResult.multiRepo
                ? { multiRepo: archiveResult.multiRepo }
                : {}),
              phase9: "pending_merge",
              finalization,
              continueFrom: {
                path: finalization.mainCheckout,
                branch: finalization.defaultBranch,
              },
              ...openOpsObligationsPayload,
              ...(validationResult.warnings.length > 0
                ? {
                    validationWarnings: validationResult.warnings.map((w) => ({
                      code: w.code,
                      message: w.message,
                      path: w.path,
                    })),
                  }
                : {}),
            });
          }
          const releaseResult = await completeReleaseGateAfterFinalization({
            store,
            change,
            changeId,
            finalization,
          });
          if (!releaseResult.ok) {
            return formatToolOutput({
              success: false,
              error: `Archive release gate completion blocked: ${releaseResult.error}`,
              requirement: "rq-releaseFinalization01",
              changeId,
              archivePath: archiveResult.archivePath,
              finalization,
              continueFrom: {
                path: finalization.mainCheckout,
                branch: finalization.defaultBranch,
              },
              workflowGateStatus: releaseResult.workflowGateStatus,
              stuckReason: releaseResult.stuckReason,
              readinessBlockers: releaseResult.readinessBlockers,
              specsUpdated: archiveResult.specsUpdated.map((s) => ({
                capability: s.capability,
                version: `${s.originalVersion} → ${s.newVersion}`,
                deltas: s.deltaResults.length,
              })),
              ...openOpsObligationsPayload,
            });
          }
          const releaseEvidence = buildReleaseCompletionEvidence(finalization);
          const durableProof = await verifyReleaseGateDurableForArchive({
            store,
            changeId,
            evidence: releaseEvidence,
          });
          if (!durableProof.ok) {
            return formatToolOutput({
              success: false,
              error: `Archive durable release gate proof blocked: ${durableProof.error}`,
              requirement: "rq-releaseProjectionDurability01",
              changeId,
              archivePath: archiveResult.archivePath,
              finalization,
              continueFrom: {
                path: finalization.mainCheckout,
                branch: finalization.defaultBranch,
              },
              releaseGateStatus: durableProof.releaseGateStatus,
              stuckReason: durableProof.stuckReason,
              readinessBlockers: durableProof.readinessBlockers,
              specsUpdated: archiveResult.specsUpdated.map((s) => ({
                capability: s.capability,
                version: `${s.originalVersion} → ${s.newVersion}`,
                deltas: s.deltaResults.length,
              })),
              ...openOpsObligationsPayload,
            });
          }
          // rq-releaseFinalization01 / AC3 split-brain recovery: record Phase 9
          // done whenever it is not already done — INCLUDING when unset. Same
          // defect class as the reconcile path (archive-gate.ts): the prior
          // guard (`phase9_status?.status && ...`) skipped the unset case, so a
          // bundle-present re-run with an unset phase9_status never recorded the
          // terminal status. `preservePhase9Evidence(undefined, next)` returns
          // `next`, recording an unset status cleanly.
          //
          // Guard on `!releaseResult.recoveryMutation`: a disk-projection release
          // recovery means the change workflow already completed and cannot
          // accept the phase9 signal; skip there to preserve poisoned-recovery.
          if (
            change.phase9_status?.status !== "done" &&
            !releaseResult.recoveryMutation
          ) {
            await recordPhase9Status({
              store,
              changeId,
              status: preservePhase9Evidence(change.phase9_status, {
                status: "done",
                startedAt:
                  change.phase9_status?.startedAt ?? new Date().toISOString(),
                completedAt: new Date().toISOString(),
              }),
            });
          }
          releaseGateCompletion = {
            ...releaseResult,
            gate: durableProof.gate,
          };
        }
        const hasAcceptedDeltas = Object.values(change.deltas).some(
          (deltas) => deltas.length > 0,
        );
        if (!dryRun && archiveResult.success && hasAcceptedDeltas) {
          const committedBundlePath = archiveResult.commitPaths.find((path) =>
            relative(inRepoBase, path)
              .replaceAll("\\", "/")
              .startsWith(".adv/archive/"),
          );
          const proofOutcome =
            finalization ??
            verifyReleaseEvidenceFromMain({
              store,
              changeId,
              archiveMode,
              change,
            });
          if (
            proofOutcome.status !== "shipped" ||
            !proofOutcome.mergeCommitSha ||
            !archiveResult.projectionManifest ||
            !committedBundlePath
          ) {
            return formatToolOutput({
              success: false,
              error:
                "Archive projection proof requires a manifest and immutable released commit SHA.",
              requirement: "rq-archiveDeltaReconciliation01",
              changeId,
              archivePath: archiveResult.archivePath,
              finalization: proofOutcome,
            });
          }
          const projectionProof = await verifyProjectionAtGitCommit({
            manifest: archiveResult.projectionManifest,
            repo: proofOutcome.mainCheckout,
            releasedCommitSha: proofOutcome.mergeCommitSha,
            manifestGitPath: `${relative(inRepoBase, committedBundlePath).replaceAll("\\", "/")}/spec-projection.json`,
            expectedChangeId: change.id,
            expectedDeltaSetSha256: canonicalSha256(change.deltas),
            expectedDeltaIdsByCapability: Object.fromEntries(
              Object.entries(change.deltas).map(([capability, deltas]) => [
                capability,
                deltas.map((delta) => delta.id),
              ]),
            ),
          });
          if (!projectionProof.ok) {
            return formatToolOutput({
              success: false,
              error: `Archive released projection proof failed: ${projectionProof.code}: ${projectionProof.message}`,
              requirement: "rq-archiveDeltaReconciliation01",
              changeId,
              archivePath: archiveResult.archivePath,
              projectionFailure: projectionProof,
            });
          }
          change.archive_projection_proof = projectionProof.receipt;
        }
        // rq-releaseFinalization01 AC1: Archive status transition happens AFTER
        // release gate completion and durable proof verification. This is the
        // structural ordering guarantee: release evidence → release gate → durable
        // proof → archive status → cleanup. Changing this order breaks AC1.
        // Update change status in store (unless dry run)
        if (!dryRun && archiveResult.success) {
          const statusAlreadyArchived = change.status === "archived";
          if (!statusAlreadyArchived) {
            const archivedAt = new Date().toISOString();
            change.status = "archived";
            try {
              await store.changes.save(change);
              const epicProjection =
                await projectEpicTerminalSummaryAfterArchive({
                  store,
                  change,
                  completedAt: archivedAt,
                });
              if (epicProjection.status === "warning") {
                archiveResult.errors.push(
                  `Epic terminal projection warning: failed to update ${epicProjection.epicId}/${epicProjection.entryId}: ${epicProjection.error}`,
                );
              }
            } catch (saveError) {
              const saveErrorText = collectErrorText(saveError);
              const contextMismatch = extractContextMismatch(saveError);
              if (contextMismatch) {
                return formatToolOutput({
                  success: false,
                  error: `Failed to update change status to archived: ${saveErrorText}`,
                  archivePath: archiveResult.archivePath,
                  ...contextMismatch,
                });
              }
              // rq-extend-poisoned-recovery AC5: poisoned-workflow disk fallback
              // for final status. Bundle is already written; only the workflow
              // signal that flips the status field fails. Probe + recover.
              if (recoveryMode === "poisoned_history") {
                try {
                  const {
                    RECOVERY_RECONCILIATION_WARNING,
                    isWorkflowCompletedError,
                  } = await import("../temporal/recovery-classification");
                  const completedWorkflow = isWorkflowCompletedError(saveError);
                  let poisoned = false;
                  if (!completedWorkflow) {
                    const { workflowHasPoisonedRecoveryEvidence } =
                      await import("./recovery-probe");
                    const handle = await getChangeWorkflowHandleForStore(
                      store,
                      changeId,
                    );
                    poisoned = handle
                      ? await workflowHasPoisonedRecoveryEvidence(handle)
                      : false;
                  }
                  if (completedWorkflow || poisoned) {
                    const { saveRecoveredChangeStatus } =
                      await import("./_recovery-writers");
                    await saveRecoveredChangeStatus({
                      store,
                      change,
                      authorization: {
                        reason: completedWorkflow
                          ? "completed_workflow_status_recovery"
                          : "poisoned_history_status_recovery",
                        evidence: recoveryEvidence ?? saveErrorText,
                      },
                      status: "archived",
                    });
                    return formatToolOutput({
                      success: true,
                      archivePath: archiveResult.archivePath,
                      ...(finalization ? { finalization } : {}),
                      ...(finalization
                        ? {
                            continueFrom: {
                              path: finalization.mainCheckout,
                              branch: finalization.defaultBranch,
                            },
                          }
                        : {}),
                      ...(releaseGateCompletion
                        ? {
                            releaseGate: releaseGateCompletion.gate,
                            releaseGateAlreadyDone:
                              releaseGateCompletion.alreadyDone,
                          }
                        : {}),
                      specsUpdated: archiveResult.specsUpdated.map((s) => ({
                        capability: s.capability,
                        version: `${s.originalVersion} → ${s.newVersion}`,
                        deltas: s.deltaResults.length,
                      })),
                      ...openOpsObligationsPayload,
                      _recoveryMutation: true,
                      reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
                    });
                  }
                } catch {
                  // Fall through to the standard error response.
                }
              }
              const searchAttributeRecovery = isSearchAttributeArchiveFailure(
                saveErrorText,
              )
                ? {
                    recoveryHint: ARCHIVE_SEARCH_ATTRIBUTE_RECOVERY_HINT,
                    retrySafe: true,
                  }
                : {};
              // Surface the full cause chain (e.g. WorkflowUpdateFailedError →
              // the real reason) so the caller can diagnose the failure.
              return formatToolOutput({
                success: false,
                error: `Failed to update change status to archived: ${saveErrorText}`,
                archivePath: archiveResult.archivePath,
                ...searchAttributeRecovery,
                specsUpdated: archiveResult.specsUpdated.map((s) => ({
                  capability: s.capability,
                  version: `${s.originalVersion} → ${s.newVersion}`,
                  deltas: s.deltaResults.length,
                })),
              });
            }
          }
          // rq-archiveRetirement01: final source cleanup happens AFTER the archived status transition.
          // This prevents the archive flow from deleting changes/<id>/ and then
          // recreating it via store.changes.save(change). Cleanup failures are
          // warning-only after durable archive + status transition; sweep can
          // retry the disk removal later.
          try {
            await removeChangeDir(store.paths.changes, change.id);
          } catch (err) {
            archiveResult.errors.push(
              `Source cleanup warning: failed to remove changes/${change.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          try {
            await advWorktreeCleanup("archive", {
              projectRoot: store.paths.root,
              database: await initWorktreeStateDb(store.paths.root),
              log: logger,
              store,
              forceAttempts: false,
            });
          } catch (err) {
            archiveResult.errors.push(
              `Worktree cleanup warning: failed to run archive cleanup discovery: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          // Branch cleanup — delete change/{changeId} from local + remote.
          // Only in direct/merge mode; PR-mode branches must survive for PR creation.
          // Runs after worktree removal (can't delete a checked-out branch).
          if (
            finalization?.status === "shipped" &&
            finalization.mainCheckout &&
            finalization.route !== "pr_auto_merge" &&
            archiveMode === "direct"
          ) {
            try {
              const branchResult = deleteChangeBranch(
                finalization.mainCheckout,
                change.id,
              );
              if (!branchResult.localDeleted && branchResult.error) {
                archiveResult.errors.push(
                  `Branch cleanup warning: ${branchResult.error}`,
                );
              } else if (
                branchResult.localDeleted &&
                !branchResult.remoteDeleted &&
                branchResult.error
              ) {
                archiveResult.errors.push(
                  `Branch cleanup warning (remote): ${branchResult.error}`,
                );
              }
            } catch (err) {
              archiveResult.errors.push(
                `Branch cleanup warning: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
        }
        // Issue closure — after archive state is durable (or previewed in dryRun)
        const issueClosure = await closeLinkedIssue({
          change,
          store,
          noCloseIssue,
          dryRun,
          existingBundlePath: existingBundlePath ?? undefined,
          worktreePath,
        });
        return formatToolOutput({
          success: archiveResult.success,
          changeId: change.id,
          specsUpdated: archiveResult.specsUpdated.map((s) => ({
            capability: s.capability,
            version: `${s.originalVersion} → ${s.newVersion}`,
            deltas: s.deltaResults.length,
          })),
          docsGenerated: archiveResult.docsGenerated,
          archivePath: archiveResult.archivePath,
          errors: archiveResult.errors,
          dryRun: dryRun ?? false,
          ...(archiveResult.multiRepo
            ? { multiRepo: archiveResult.multiRepo }
            : {}),
          ...(issueClosure.issue_closed.length > 0
            ? { issue_closed: issueClosure.issue_closed }
            : {}),
          ...(issueClosure.close_eligible
            ? { close_eligible: issueClosure.close_eligible }
            : {}),
          ...(issueClosure.issue_closure_error
            ? { issue_closure_error: issueClosure.issue_closure_error }
            : {}),
          ...(finalization ? { finalization } : {}),
          ...(finalization
            ? {
                continueFrom: {
                  path: finalization.mainCheckout,
                  branch: finalization.defaultBranch,
                },
              }
            : {}),
          ...openOpsObligationsPayload,
          ...(releaseGateCompletion
            ? {
                releaseGate: releaseGateCompletion.gate,
                releaseGateAlreadyDone: releaseGateCompletion.alreadyDone,
                ...(releaseGateCompletion.recoveryMutation
                  ? { _recoveryMutation: true }
                  : {}),
                ...(releaseGateCompletion.reconciliationWarning
                  ? {
                      reconciliationWarning:
                        releaseGateCompletion.reconciliationWarning,
                    }
                  : {}),
              }
            : {}),
          ...(validationResult.warnings.length > 0
            ? {
                validationWarnings: validationResult.warnings.map((w) => ({
                  code: w.code,
                  message: w.message,
                  path: w.path,
                })),
              }
            : {}),
        });
      };
      // rq-archiveTargetPathRouting01: route terminal archive through the
      // target project's store and queue when target_path is approved.
      if (target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path,
            stateRequirement: "temporal-required",
            mutation: dryRun ? false : undefined,
            target_confirmed,
            confirmationEvidence,
          },
          async ({ context, store: targetStore }) => {
            const result = await runArchive(targetStore);
            return appendTargetProjectContextOutput(result, context);
          },
        );
      }
      return runArchive(store);
    },
  },
  adv_archive_repair: {
    description:
      "Scan/redrive archived change branches, or reconcile bundle-present fully-shipped changes whose terminal archived projection is wedged. Branch cleanup is NOT here: post-merge local change/* branch deletion is git hygiene owned by adv_worktree_cleanup mode=archived_branches. Repair decision matrix: use action=reconcile for batch terminal-projection repair across all release-stuck candidates (branch-merge evidence gate); use adv_change_status_repair for a single wedged change (precise workflow-evidence gate, no branch requirement, target_path routing).",
    args: {
      action: z
        .enum(["scan", "redrive", "reconcile", "reconcile_deltas"])
        .describe(
          "scan = list candidates; redrive = open/reuse PR and arm auto-merge for one archived change; " +
            "reconcile = audited terminal-status repair; reconcile_deltas = audited current-repo spec projection repair in a trusted change worktree",
        ),
      changeId: z
        .string()
        .optional()
        .describe("Archived change ID to re-drive when action='redrive'"),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "Preview redrive or reconcile without creating PRs, arming auto-merge, or writing status repairs",
        ),
      approvedByUser: z
        .literal(true)
        .optional()
        .describe(
          "Required for action='reconcile'. Confirms explicit operator approval for audited terminal-projection repair.",
        ),
      approvalEvidence: z
        .string()
        .optional()
        .describe(
          "Required for action='reconcile'. Cite explicit operator approval and terminal interruption evidence.",
        ),
      recoveryReason: z
        .string()
        .optional()
        .describe(
          "Required for action='reconcile'. Explain why bundle-anchored terminal-projection recovery is appropriate.",
        ),
      worktreePath: z
        .string()
        .optional()
        .describe(
          "Trusted active repair change worktree required for action='reconcile_deltas'.",
        ),
      expectedSeedHeadSha: z
        .string()
        .regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)
        .optional()
        .describe(
          "Reviewed dry-run seed HEAD required to execute reconcile_deltas.",
        ),
      expectedSeedProjectionSha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional()
        .describe(
          "Reviewed dry-run canonical seed projection digest required to execute reconcile_deltas.",
        ),
      conflictDispositions: z
        .array(HistoricalConflictDispositionSchema)
        .optional()
        .describe(
          "Exact add-only preserve-current conflict dispositions; every row must bind a planner-proven conflict.",
        ),
    },
    execute: async (
      {
        action,
        changeId,
        dryRun,
        approvedByUser,
        approvalEvidence,
        recoveryReason,
        worktreePath,
        expectedSeedHeadSha,
        expectedSeedProjectionSha256,
        conflictDispositions,
      }: {
        action: "scan" | "redrive" | "reconcile" | "reconcile_deltas";
        changeId?: string;
        dryRun?: boolean;
        approvedByUser?: true;
        approvalEvidence?: string;
        recoveryReason?: string;
        worktreePath?: string;
        expectedSeedHeadSha?: string;
        expectedSeedProjectionSha256?: string;
        conflictDispositions?: HistoricalConflictDisposition[];
      },
      store: Store,
    ) => {
      const mainCheckout = resolveMainCheckout(store.paths.root);
      const { branch: defaultBranch } = detectDefaultBranch(mainCheckout);
      if (action === "reconcile_deltas") {
        if (!changeId || !worktreePath) {
          return formatToolOutput({
            success: false,
            action,
            error:
              "reconcile_deltas requires the active repair changeId and worktreePath",
          });
        }
        if (!dryRun) {
          if (approvedByUser !== true || !approvalEvidence?.trim()) {
            return formatToolOutput({
              success: false,
              action,
              error:
                "approvedByUser and approvalEvidence are required to execute reconcile_deltas",
            });
          }
          if (!recoveryReason?.trim()) {
            return formatToolOutput({
              success: false,
              action,
              error: "recoveryReason is required to execute reconcile_deltas",
            });
          }
        }
        const worktree = validateChangeWorktree(worktreePath, changeId, {
          requireCleanWorktree: true,
        });
        if (!worktree.valid || worktree.mainCheckout !== mainCheckout) {
          return formatToolOutput({
            success: false,
            action,
            changeId,
            error:
              worktree.error ??
              "reconcile_deltas requires a trusted clean worktree for this project",
          });
        }
        try {
          const result = await reconcileHistoricalArchiveDeltas({
            archiveDir: store.paths.archive,
            repairWorktree: worktreePath,
            dryRun: dryRun === true,
            expectedSeedHeadSha,
            expectedSeedProjectionSha256,
            conflictDispositions,
          });
          return formatToolOutput({
            action,
            changeId,
            approved: dryRun === true ? false : true,
            approvalEvidence: dryRun === true ? undefined : approvalEvidence,
            recoveryReason: dryRun === true ? undefined : recoveryReason,
            ...result,
          });
        } catch (error) {
          return formatToolOutput({
            success: false,
            action,
            changeId,
            error: `Archive delta reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
      if (action === "reconcile") {
        const evidence = approvalEvidence?.trim() ?? "";
        const reason = recoveryReason?.trim() ?? "";
        if (approvedByUser !== true) {
          return formatToolOutput({
            success: false,
            action,
            error: "approvedByUser must be true when action='reconcile'",
            hint: "Bundle-anchored terminal-projection recovery requires explicit operator approval.",
          });
        }
        if (!evidence) {
          return formatToolOutput({
            success: false,
            action,
            error: "approvalEvidence is required when action='reconcile'",
            hint: "Cite the terminal interruption evidence and explicit operator approval.",
          });
        }
        if (!reason) {
          return formatToolOutput({
            success: false,
            action,
            error: "recoveryReason is required when action='reconcile'",
            hint: "Explain why the durable bundle proves this terminal-projection recovery is appropriate.",
          });
        }

        // The default list is the release-stuck candidate set: changes still
        // projected as in-flight. Archived changes are already terminal and
        // intentionally excluded; this is a repair-only operation.
        const inFlight = await store.changes.list({});
        const candidateSummaries = inFlight.changes.filter(
          (change) =>
            change.status !== "archived" && change.status !== "closed",
        );
        const merged = detectArchivedMergedBranches({
          mainCheckout,
          defaultBranch,
          archivedChangeIds: candidateSummaries.map((change) => change.id),
        });
        if (merged.status === "blocked") {
          return formatToolOutput({
            success: false,
            action,
            error: `Archive reconcile scan blocked: ${merged.reason}`,
            requirement: "rq-archiveRecoveryConsistency01",
            details: merged.details,
          });
        }
        const mergedByChangeId = new Map(
          merged.branches.map((branch) => [branch.changeId, branch]),
        );
        const results: Array<Record<string, unknown>> = [];

        for (const candidate of candidateSummaries) {
          // List returns compact summaries by design. Fetch the full durable
          // change before evaluating gates or writing recovery state; a stale
          // or unavailable record is a non-mutating disposition, never a
          // reason to infer shipment from the summary.
          let loaded: Awaited<ReturnType<Store["changes"]["get"]>>;
          try {
            loaded = await store.changes.get(candidate.id);
          } catch (error) {
            results.push({
              changeId: candidate.id,
              fromStatus: candidate.status,
              disposition: "skipped_unreadable_change",
              detail: error instanceof Error ? error.message : String(error),
            });
            continue;
          }
          if (!loaded.success || !loaded.data) {
            results.push({
              changeId: candidate.id,
              fromStatus: candidate.status,
              disposition: "skipped_unreadable_change",
              detail: loaded.success
                ? `Change not found: ${candidate.id}`
                : loaded.error,
            });
            continue;
          }
          const change = loaded.data;
          const incompleteGates = GATE_ORDER.filter(
            (gateId) => change.gates?.[gateId]?.status !== "done",
          );
          if (incompleteGates.length > 0) {
            results.push({
              changeId: change.id,
              fromStatus: change.status,
              disposition: "skipped_incomplete_gates",
              incompleteGates,
            });
            continue;
          }

          let archivePath: string | null;
          try {
            archivePath = await findArchiveBundle(
              store.paths.archive,
              change.id,
            );
          } catch (error) {
            results.push({
              changeId: change.id,
              fromStatus: change.status,
              disposition: "skipped_bundle_probe_failed",
              detail: error instanceof Error ? error.message : String(error),
            });
            continue;
          }
          if (!archivePath) {
            results.push({
              changeId: change.id,
              fromStatus: change.status,
              disposition: "skipped_no_bundle",
            });
            continue;
          }

          const branch = mergedByChangeId.get(change.id);
          if (!branch) {
            results.push({
              changeId: change.id,
              fromStatus: change.status,
              archivePath,
              disposition: "skipped_unmerged_branch",
            });
            continue;
          }
          if (
            Object.values(change.deltas).some((deltas) => deltas.length > 0)
          ) {
            const manifest = await readProjectionManifest(archivePath);
            const releasedCommitSha =
              branch.mergeProof.kind === "tree-identical"
                ? branch.mergeProof.trunkCommitSha
                : resolveGitCommitSha(mainCheckout, defaultBranch);
            if (!releasedCommitSha) {
              results.push({
                changeId: change.id,
                fromStatus: change.status,
                archivePath,
                mergeProof: branch.mergeProof,
                disposition: "skipped_projection_unverified",
                detail: `Could not pin ${defaultBranch} to an immutable commit SHA`,
              });
              continue;
            }
            if (!manifest) {
              results.push({
                changeId: change.id,
                fromStatus: change.status,
                archivePath,
                mergeProof: branch.mergeProof,
                disposition: "skipped_projection_unverified",
                detail: "Projection manifest is missing or invalid",
              });
              continue;
            }
            const proof = await verifyProjectionAtGitCommit({
              manifest,
              repo: mainCheckout,
              releasedCommitSha,
              manifestGitPath: `.adv/archive/${basename(archivePath)}/spec-projection.json`,
              expectedChangeId: change.id,
              expectedDeltaSetSha256: canonicalSha256(change.deltas),
              expectedDeltaIdsByCapability: Object.fromEntries(
                Object.entries(change.deltas).map(([capability, deltas]) => [
                  capability,
                  deltas.map((delta) => delta.id),
                ]),
              ),
            });
            if (!proof.ok) {
              results.push({
                changeId: change.id,
                fromStatus: change.status,
                archivePath,
                mergeProof: branch.mergeProof,
                disposition: "skipped_projection_unverified",
                detail: `${proof.code}: ${proof.message}`,
              });
              continue;
            }
            change.archive_projection_proof = proof.receipt;
          }
          if (dryRun) {
            results.push({
              changeId: change.id,
              fromStatus: change.status,
              toStatus: "archived",
              archivePath,
              mergeProof: branch.mergeProof,
              disposition: "would_repair",
            });
            continue;
          }

          try {
            const { saveRecoveredChangeStatus } =
              await import("./_recovery-writers");
            await saveRecoveredChangeStatus({
              store,
              change,
              authorization: { reason, evidence },
              status: "archived",
            });
            const readback = await verifyStatusRepairReadAfterWrite({
              store,
              changeId: change.id,
            });
            if (!readback.ok) {
              results.push({
                changeId: change.id,
                fromStatus: change.status,
                archivePath,
                mergeProof: branch.mergeProof,
                disposition: "readback_failed",
                detail: readback.error,
                readback: readback.readback,
              });
              continue;
            }
            results.push({
              changeId: change.id,
              fromStatus: change.status,
              status: "archived",
              archivePath,
              mergeProof: branch.mergeProof,
              disposition: "repaired",
              readback: readback.readback,
            });
          } catch (error) {
            results.push({
              changeId: change.id,
              fromStatus: change.status,
              archivePath,
              mergeProof: branch.mergeProof,
              disposition: "repair_failed",
              detail: error instanceof Error ? error.message : String(error),
            });
          }
        }

        const summary = {
          total: results.length,
          repaired: results.filter((r) => r.disposition === "repaired").length,
          skipped: results.filter((r) =>
            String(r.disposition).startsWith("skipped_"),
          ).length,
          failed: results.filter(
            (r) =>
              r.disposition === "readback_failed" ||
              r.disposition === "repair_failed",
          ).length,
        };
        return formatToolOutput({
          success: summary.failed === 0,
          action,
          dryRun: Boolean(dryRun),
          mainCheckout,
          defaultBranch,
          recoveryReason: reason,
          results,
          summary,
        });
      }
      const archivedList = await store.changes.list({
        status: "archived",
        includeArchived: true,
      });
      const archivedChangeIds = archivedList.changes.map((change) => change.id);
      const scan = detectArchivedUnmergedBranches({
        mainCheckout,
        defaultBranch,
        archivedChangeIds,
      });
      if (scan.status === "blocked") {
        return formatToolOutput({
          success: false,
          action,
          error: `Archive repair scan blocked: ${scan.reason}`,
          requirement: "rq-releaseFinalization01",
          details: scan.details,
        });
      }
      if (action === "scan") {
        return formatToolOutput({
          success: true,
          action,
          mainCheckout,
          defaultBranch,
          branches: scan.branches,
          count: scan.branches.length,
        });
      }
      if (!changeId?.trim()) {
        return formatToolOutput({
          success: false,
          action,
          error: "changeId is required when action='redrive'",
        });
      }
      if (!archivedChangeIds.includes(changeId)) {
        return formatToolOutput({
          success: false,
          action,
          changeId,
          error: `Change is not archived or was not found: ${changeId}`,
        });
      }
      const candidate = scan.branches.find(
        (branch) => branch.changeId === changeId,
      );
      if (!candidate) {
        return formatToolOutput({
          success: true,
          action,
          changeId,
          dryRun: Boolean(dryRun),
          message: `No archived-but-unmerged branch found for ${changeId}`,
        });
      }
      if (dryRun) {
        return formatToolOutput({
          success: true,
          action,
          changeId,
          dryRun: true,
          candidate,
          mainCheckout,
          defaultBranch,
        });
      }
      const outcome = redriveArchivedUnmergedBranch({
        mainCheckout,
        defaultBranch,
        changeId,
      });
      if (outcome.status === "blocked") {
        return formatToolOutput({
          success: false,
          action,
          changeId,
          error: `Archive repair redrive blocked: ${outcome.blocked?.reason}`,
          requirement: "rq-releaseFinalization01",
          remediation: outcome.blocked?.remediation,
          details: outcome.blocked?.details,
          outcome,
        });
      }
      return formatToolOutput({
        success: true,
        action,
        changeId,
        outcome,
      });
    },
  },
  adv_archive_purge: {
    description:
      "Operator-only maintenance tool (rq-archivePurge01): purge an archived change. Two escalation levels — default workflow-only purge terminates the archived change's Temporal workflow while preserving the on-disk archive bundle and disk projection (adv_change_show keeps returning content from disk); opt-in includeDiskBundle: true additionally removes the archive/<id>/ bundle directory and local disk projection recursively so subsequent adv_change_show returns the not-found path. Archived-only: refuses non-archived or unknown changeIds with a structured error and no mutations. Requires approvedByUser: true plus non-empty approvalEvidence; returns an audit result {changeId, workflowTerminated, bundleRemoved, archivedPath}. Not a routine autonomous agent action — invoke only on explicit operator instruction.",
    args: {
      changeId: z.string().describe("Archived change ID to purge"),
      includeDiskBundle: z
        .boolean()
        .optional()
        .describe(
          "Opt-in destructive escalation: also recursively remove the archive/<id>/ bundle directory and local disk projection so adv_change_show returns not-found. Default false preserves the on-disk bundle.",
        ),
      approvedByUser: z
        .literal(true)
        .describe(
          "Must be true — confirms the operator explicitly approved this purge",
        ),
      approvalEvidence: z
        .string()
        .describe(
          "Audited evidence of operator approval for this purge (e.g. operator instruction + reason).",
        ),
    },
    execute: async (
      {
        changeId,
        includeDiskBundle,
        approvedByUser,
        approvalEvidence,
      }: {
        changeId: string;
        includeDiskBundle?: boolean;
        approvedByUser: true;
        approvalEvidence: string;
      },
      store: Store,
    ) => {
      // Approval gates first — refuse before any read/mutation work so a
      // misconfigured call can never become a partial purge (C3).
      if (approvedByUser !== true) {
        return formatToolOutput({
          success: false,
          error: "approvedByUser must be true for archive purge",
          changeId,
          hint: "Archive purge is operator-only and requires explicit operator approval.",
        });
      }
      const evidence = approvalEvidence?.trim() ?? "";
      if (evidence.length === 0) {
        return formatToolOutput({
          success: false,
          error: "approvalEvidence is required for archive purge",
          changeId,
          hint: "Cite the operator approval and reason for this purge.",
        });
      }

      // rq-archivePurge01.3 / DDC1: archived-only — refuse unknown or
      // non-archived changes with a structured error and no mutations.
      const result = await store.changes.get(changeId);
      if (!result.success) {
        return formatToolOutput({ success: false, error: result.error });
      }
      if (!result.data) {
        return formatToolOutput({
          success: false,
          error: `Change not found: ${changeId}`,
          changeId,
        });
      }
      const change = result.data;
      if (change.status !== "archived") {
        return formatToolOutput({
          success: false,
          error: `Archive purge refused: change ${changeId} is not archived (status: ${change.status}).`,
          changeId,
          currentStatus: change.status,
          hint: "Only archived changes can be purged. Archive the change first via adv_change_archive, or use adv_change_close for terminal non-archived changes.",
        });
      }

      const removeDiskBundle = includeDiskBundle === true;
      const archivedPath = await findArchiveBundle(
        store.paths.archive,
        changeId,
      );

      // Terminate the change workflow via the Temporal client. A missing
      // workflow (already terminated/evicted) is idempotent success; any
      // other failure aborts the purge before disk state is touched so the
      // operator never gets a half-purged change (no live workflow serving
      // reads while the bundle is gone).
      const handle = await getChangeWorkflowHandleForStore(store, changeId);
      if (!handle) {
        return formatToolOutput({
          success: false,
          error:
            "Temporal service not available — cannot terminate the change workflow",
          changeId,
          hint: "Restore the Temporal service (adv_temporal_diagnose) and retry the purge.",
        });
      }
      let alreadyTerminated = false;
      try {
        await (
          handle as unknown as {
            terminate: (reason?: string) => Promise<unknown>;
          }
        ).terminate(
          `adv_archive_purge: operator-approved purge of archived change ${changeId}`,
        );
      } catch (error) {
        const { isWorkflowCompletedError } =
          await import("../temporal/recovery-classification");
        if (isWorkflowCompletedError(error)) {
          alreadyTerminated = true;
        } else {
          return formatToolOutput({
            success: false,
            error: `Failed to terminate change workflow: ${error instanceof Error ? error.message : String(error)}`,
            changeId,
            workflowTerminated: false,
          });
        }
      }

      // rq-archivePurge01.2: destructive escalation is strictly opt-in.
      // Remove the archive bundle, the legacy changes/<id>/ snapshot, and
      // the flat workflow projection file so no disk source can re-seed or
      // answer reads after the workflow is gone.
      if (removeDiskBundle) {
        try {
          if (archivedPath) {
            await rm(archivedPath, { recursive: true, force: true });
          }
          await removeChangeDir(store.paths.changes, changeId);
          await rm(join(store.paths.changes, `${changeId}.json`), {
            force: true,
          });
        } catch (error) {
          return formatToolOutput({
            success: false,
            error: `Workflow terminated but disk bundle removal failed: ${error instanceof Error ? error.message : String(error)}`,
            changeId,
            workflowTerminated: true,
            ...(alreadyTerminated ? { alreadyTerminated: true } : {}),
            bundleRemoved: false,
            archivedPath,
          });
        }
      }

      // Drop the local cache/memo entry so subsequent reads in this process
      // fall through to the archive bundle (default) or the not-found path
      // (includeDiskBundle). Best-effort: refresh never throws by contract.
      try {
        await store.changes.refresh(changeId);
      } catch (error) {
        logger.debug(
          `Post-purge cache refresh failed for ${changeId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      return formatToolOutput({
        success: true,
        changeId,
        workflowTerminated: true,
        ...(alreadyTerminated ? { alreadyTerminated: true } : {}),
        bundleRemoved: removeDiskBundle,
        archivedPath,
        requirement: "rq-archivePurge01",
      });
    },
  },
  adv_change_workflow_terminate: {
    description:
      "Operator-only maintenance tool: terminate the EXACT wedged run of a shipped change's Temporal workflow, pinned by runId via describe() — NOT a Temporal Reset. Eligibility is strict and ordered: approval-first (approvedByUser + non-blank approvalEvidence before any read or mutation); the change must exist and NOT be archived (archived changes route to adv_archive_purge, the sole archived-change lever — rq-archivePurge01 semantics preserved); shipped proof required (acceptance AND release gates done on the disk projection). The workflow is then described once and the exact run pinned: a not-found/completed describe or an already-terminal run status is idempotent success ONLY after that eligibility has passed; a RUNNING/PAUSED run without poisoned-history describe evidence is refused (never terminate a healthy workflow); a run with no pin-able runId or an unclassifiable status is refused. dryRun returns the full structured pin assessment without terminating or touching the projection cache. Termination targets the pinned run via getHandle(workflowId, runId); a not-found terminate is idempotent success, and any other terminate failure returns a structured error BEFORE any projection-cache refresh (failure-before-projection-mutation). On success the projection cache is refreshed so subsequent reads fall through to the durable disk projection. Not a routine autonomous agent action — invoke only on explicit operator instruction.",
    args: {
      changeId: z
        .string()
        .describe("Change ID whose wedged workflow run should be terminated"),
      approvedByUser: z
        .literal(true)
        .describe(
          "Must be true — confirms the operator explicitly approved this workflow termination",
        ),
      approvalEvidence: z
        .string()
        .describe(
          "Audited evidence of operator approval for this termination (e.g. operator instruction + wedged-state reason).",
        ),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "Preview the eligibility + pin assessment (describe is performed) without terminating the run or refreshing the projection cache.",
        ),
    },
    execute: async (
      {
        changeId,
        approvedByUser,
        approvalEvidence,
        dryRun,
      }: {
        changeId: string;
        approvedByUser: true;
        approvalEvidence: string;
        dryRun?: boolean;
      },
      store: Store,
    ) => {
      // Approval gates first — refuse before any read/mutation work so a
      // misconfigured call can never become a partial termination (purge C3).
      if (approvedByUser !== true) {
        return formatToolOutput({
          success: false,
          error: "approvedByUser must be true for change workflow termination",
          changeId,
          hint: "Workflow termination is operator-only and requires explicit operator approval.",
        });
      }
      const evidence = approvalEvidence?.trim() ?? "";
      if (evidence.length === 0) {
        return formatToolOutput({
          success: false,
          error: "approvalEvidence is required for change workflow termination",
          changeId,
          hint: "Cite the operator approval and wedged-state reason for this termination.",
        });
      }

      const result = await store.changes.get(changeId);
      if (!result.success) {
        return formatToolOutput({ success: false, error: result.error });
      }
      if (!result.data) {
        return formatToolOutput({
          success: false,
          error: `Change not found: ${changeId}`,
          changeId,
        });
      }
      const change = result.data;

      // Archived changes route to adv_archive_purge — the sole archived-change
      // termination lever. This preserves rq-archivePurge01 semantics exactly.
      if (change.status === "archived") {
        return formatToolOutput({
          success: false,
          error: `Workflow termination refused: change ${changeId} is archived.`,
          changeId,
          currentStatus: change.status,
          hint: "Use adv_archive_purge for archived changes — it is the sole archived-change workflow termination lever.",
        });
      }

      // Shipped proof: acceptance AND release gates done. This must pass
      // BEFORE any idempotent completed/not-found handling — a gone workflow
      // never masks an ineligible change.
      const gates = change.gates ?? createDefaultGates();
      const incompleteGates = WORKFLOW_TERMINATE_SHIPPED_GATES.filter(
        (gateId) => gates[gateId]?.status !== "done",
      );
      if (incompleteGates.length > 0) {
        return formatToolOutput({
          success: false,
          error: `Workflow termination refused: change ${changeId} has no shipped proof (gate(s) not done: ${incompleteGates.join(", ")}).`,
          changeId,
          incompleteGates,
          hint: "Only shipped changes (acceptance AND release gates done) are eligible — their disk projection is fully authoritative. Complete the gates via the normal workflow.",
        });
      }

      const { getService } = await import("../temporal/service");
      const service = getService();
      const projectId = service ? await getProjectId(store.paths.root) : null;
      if (!service || !projectId) {
        return formatToolOutput({
          success: false,
          error:
            "Temporal service not available — cannot describe or terminate the change workflow",
          changeId,
          hint: "Restore the Temporal service (adv_temporal_diagnose) and retry the termination.",
        });
      }
      const { getChangeHandle } = await import("./_adapters");
      const handle = getChangeHandle(service.client, projectId, changeId);
      if (typeof handle.describe !== "function") {
        return formatToolOutput({
          success: false,
          error:
            "Change workflow handle does not support describe() — cannot pin an exact run",
          changeId,
        });
      }

      // Idempotent completed/not-found handling — only reachable here, AFTER
      // approval + existence + status + shipped-gate eligibility.
      const refreshProjectionCache = async () => {
        try {
          await store.changes.refresh(changeId);
        } catch (error) {
          logger.debug(
            `Post-termination cache refresh failed for ${changeId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      };
      const { isWorkflowCompletedError } =
        await import("../temporal/recovery-classification");

      let description: unknown;
      try {
        description = await handle.describe();
      } catch (error) {
        if (isWorkflowCompletedError(error)) {
          await refreshProjectionCache();
          return formatToolOutput({
            success: true,
            changeId,
            workflowTerminated: true,
            alreadyTerminated: true,
            message: `Change ${changeId} workflow is already gone (completed/not-found); nothing to terminate.`,
          });
        }
        return formatToolOutput({
          success: false,
          error: `Failed to describe change workflow: ${error instanceof Error ? error.message : String(error)}`,
          changeId,
          workflowTerminated: false,
        });
      }

      const { runId, statusName } = workflowRunPinFromDescription(description);

      // Already-terminal run → idempotent success (after eligibility).
      if (statusName && TERMINAL_WORKFLOW_RUN_STATUSES.has(statusName)) {
        await refreshProjectionCache();
        return formatToolOutput({
          success: true,
          changeId,
          workflowTerminated: true,
          alreadyTerminated: true,
          ...(runId ? { runId } : {}),
          runStatus: statusName,
          message: `Change ${changeId} workflow run is already ${statusName}; nothing to terminate.`,
        });
      }
      if (!statusName || !TERMINABLE_WORKFLOW_RUN_STATUSES.has(statusName)) {
        return formatToolOutput({
          success: false,
          error: `Workflow termination refused: cannot classify run status${statusName ? ` "${statusName}"` : ""} for change ${changeId}.`,
          changeId,
          ...(runId ? { runId } : {}),
          hint: "Only RUNNING/PAUSED runs are terminable; already-terminal runs are idempotent success. Refusing to act on an unclassifiable run.",
        });
      }

      // Healthy guard: a live run must carry poisoned-history describe
      // evidence. Never terminate a healthy workflow.
      const { poisonedDescriptionEvidence } = await import("./recovery-probe");
      const wedgedEvidence = poisonedDescriptionEvidence(description);
      if (!wedgedEvidence) {
        return formatToolOutput({
          success: false,
          error: `Workflow termination refused: change ${changeId} run is ${statusName} but not wedged — no poisoned-history evidence in describe output.`,
          changeId,
          ...(runId ? { runId } : {}),
          runStatus: statusName,
          hint: "This tool only terminates wedged (poisoned-history) runs. Refusing to terminate a healthy workflow.",
        });
      }
      if (!runId) {
        return formatToolOutput({
          success: false,
          error: `Workflow termination refused: describe output for change ${changeId} carries no runId — cannot pin an exact run.`,
          changeId,
          runStatus: statusName,
          hint: "Exact run pinning is mandatory; refusing to terminate an unpinned run.",
        });
      }

      if (dryRun) {
        return formatToolOutput({
          success: true,
          dryRun: true,
          wouldTerminate: true,
          changeId,
          runId,
          runStatus: statusName,
          wedgedEvidence,
          shippedProof: { acceptance: "done", release: "done" },
          message: `Would terminate pinned run ${runId} (${statusName}, poisoned-history wedged) of shipped change ${changeId}.`,
        });
      }

      // Terminate the EXACT pinned run: a handle bound to (workflowId, runId)
      // can never kill a different run of the same workflow.
      const pinnedHandle = getChangeHandle(
        service.client,
        projectId,
        changeId,
        runId,
      );
      try {
        await (
          pinnedHandle as unknown as {
            terminate: (reason?: string) => Promise<unknown>;
          }
        ).terminate(
          `adv_change_workflow_terminate: operator-approved termination of wedged shipped change workflow ${changeId} (run ${runId})`,
        );
      } catch (error) {
        if (isWorkflowCompletedError(error)) {
          await refreshProjectionCache();
          return formatToolOutput({
            success: true,
            changeId,
            workflowTerminated: true,
            alreadyTerminated: true,
            runId,
            message: `Change ${changeId} run ${runId} ended before termination landed (completed/not-found); treated as already terminated.`,
          });
        }
        // failure-before-projection-mutation: no refresh, no disk write.
        return formatToolOutput({
          success: false,
          error: `Failed to terminate change workflow: ${error instanceof Error ? error.message : String(error)}`,
          changeId,
          runId,
          workflowTerminated: false,
        });
      }

      await refreshProjectionCache();
      return formatToolOutput({
        success: true,
        changeId,
        workflowTerminated: true,
        runId,
        runStatus: statusName,
        wedgedEvidence,
        shippedProof: { acceptance: "done", release: "done" },
        message: `Terminated pinned run ${runId} of shipped change ${changeId}. Disk projection remains authoritative; subsequent reads fall through to disk.`,
      });
    },
  },
  adv_change_repair_origin: {
    description:
      "Repair the origin linkage of an active/open ADV change. Audited and claim-safe: requires approval evidence and a reason, validates the origin kind/linkage matrix, rejects conflicting open issue claims with existing claimant evidence, and refuses archived/closed changes.",
    args: {
      changeId: z.string().describe("Change ID to repair"),
      origin_kind: ChangeOriginKindSchema.describe(
        "New origin provenance kind ('roadmap', 'discovery', 'triage', or 'adhoc')",
      ),
      origin_issue_number: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "GitHub issue number for kind=roadmap (required) or kind=triage (optional). Rejected for discovery and adhoc origins.",
        ),
      origin_source_artifact: z
        .string()
        .optional()
        .describe(
          "Stable upstream artifact reference for kind=triage or kind=discovery.",
        ),
      approvalEvidence: z
        .string()
        .min(1)
        .describe("Audited evidence of operator approval for this repair"),
      approvedByUser: z
        .literal(true)
        .describe(
          "Must be true — confirms operator explicitly approved the origin repair",
        ),
      reason: z
        .string()
        .min(1)
        .describe("Non-blank rationale for the origin repair"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview the repair without firing a signal"),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, routes the repair through that project's Temporal-backed target store.",
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
    execute: async (
      {
        changeId,
        origin_kind,
        origin_issue_number,
        origin_source_artifact,
        approvalEvidence,
        approvedByUser,
        reason,
        dryRun,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        changeId: string;
        origin_kind: ChangeOrigin["kind"];
        origin_issue_number?: number;
        origin_source_artifact?: string;
        approvalEvidence: string;
        approvedByUser: true;
        reason: string;
        dryRun?: boolean;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
      _maybeOverridePath?: string,
      providers: {
        claimChecker?: typeof defaultClaimChecker;
      } = {},
    ) => {
      if (approvedByUser !== true) {
        return formatToolOutput({
          error: "approvedByUser must be true for origin repair",
          changeId,
          hint: "Explicit operator approval is required for this audited repair path.",
        });
      }
      const originLinkageError = validateCreateOriginLinkage({
        origin_kind,
        origin_issue_number,
        origin_source_artifact,
      });
      if (originLinkageError) {
        return formatToolOutput(originLinkageError);
      }
      const evidence = approvalEvidence?.trim() ?? "";
      if (evidence.length === 0) {
        return formatToolOutput({
          error: "approvalEvidence is required for origin repair",
          changeId,
          hint: "Cite the operator approval or audit evidence for this repair.",
        });
      }
      const repairReason = reason?.trim() ?? "";
      if (repairReason.length === 0) {
        return formatToolOutput({
          error: "reason is required for origin repair",
          changeId,
          hint: "Provide a non-blank rationale for changing the origin.",
        });
      }
      const newOrigin: ChangeOrigin = {
        kind: origin_kind,
        ...(origin_issue_number !== undefined
          ? { issue_number: origin_issue_number }
          : {}),
        ...(origin_source_artifact
          ? { source_artifact: origin_source_artifact }
          : {}),
      };
      const runRepair = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        const result = await activeStore.changes.get(changeId);
        if (!result.success) {
          return formatToolOutput({ error: result.error });
        }
        if (!result.data) {
          return formatToolOutput({ error: `Change not found: ${changeId}` });
        }
        const change = result.data;
        // rq-activeOriginRepair01: active/open changes only. Archived/closed
        // origin repair is out of scope (OOS2).
        if (change.status === "archived" || change.status === "closed") {
          return formatToolOutput({
            error: `Cannot repair origin of ${change.status} change ${changeId}. Origin repair is for active/open changes only.`,
            changeId,
            status: change.status,
            hint: "Archived/closed origin repair is out of scope.",
          });
        }
        const previousOrigin = change.origin;
        // rq-backlogCoord02: claim-safe repair. If the new origin carries a
        // concrete issue number, ensure no other open change already holds the
        // claim. The change itself may already hold the claim (idempotent).
        if (newOrigin.issue_number !== undefined) {
          const projectId = (await getProjectId(activeStore.paths.root)) ?? "";
          const claimChecker = providers.claimChecker ?? defaultClaimChecker;
          const existing = await claimChecker(
            projectId,
            newOrigin.issue_number,
          );
          const conflicting = existing.filter(
            (candidate) => candidate.changeId !== changeId,
          );
          if (conflicting.length > 0) {
            const first = conflicting[0];
            return formatToolOutput({
              error: `Issue #${newOrigin.issue_number} is already claimed by change ${first.changeId} (status: ${first.status})`,
              code: "ORIGIN_CLAIM_CONFLICT",
              issue_number: newOrigin.issue_number,
              existing_change_id: first.changeId,
              existing_change_status: first.status,
              changeId,
              hint: `Resolve the conflicting claim before assigning this issue to ${changeId}, or use a different origin_issue_number.`,
            });
          }
        }
        if (dryRun) {
          return formatToolOutput({
            success: true,
            dryRun: true,
            changeId,
            previousOrigin,
            origin: newOrigin,
            approvalEvidence: evidence,
            reason: repairReason,
            message: `Would repair origin of ${changeId} (${change.status})`,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        }
        const bundle = getService();
        if (!bundle) {
          return formatToolOutput({
            error: "Temporal service not available",
            changeId,
          });
        }
        const projectId = (await getProjectId(activeStore.paths.root)) ?? "";
        const handle = getChangeHandle(bundle.client, projectId, changeId);
        await fireSignalAndRefresh(
          handle,
          activeStore,
          changeId,
          originRepairedSignal,
          {
            origin: newOrigin,
            repairedBy: "agent",
            repairedAt: new Date().toISOString(),
            approvalEvidence: evidence,
            reason: repairReason,
            previousOrigin,
          },
        );
        const readback = await activeStore.changes.get(changeId);
        if (!readback.success) {
          // rq-schemaDriftToolLayer: best-effort post-mutation readback. The
          // repair signal already landed; do not mask it as a hard failure.
          // Surface the schema error text so the operator can investigate
          // while still seeing the successful repair outcome below.
          logger.warn(
            `repair_origin readback failed for ${changeId}: ${readback.error}`,
          );
        }
        const readbackOrigin =
          readback.success && readback.data ? readback.data.origin : undefined;
        return formatToolOutput({
          success: true,
          changeId,
          status: change.status,
          previousOrigin,
          origin: readbackOrigin ?? newOrigin,
          approvalEvidence: evidence,
          reason: repairReason,
          message: `Repaired origin of ${changeId}`,
          ...(projectContext ? { _projectContext: projectContext } : {}),
        });
      };
      if (target_path) {
        try {
          return await withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path,
              stateRequirement: dryRun ? "snapshot-ok" : "temporal-required",
              target_confirmed,
              confirmationEvidence,
            },
            async ({ context, store: targetStore }) =>
              runRepair(targetStore, formatTargetProjectContext(context)),
          );
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error);
          return formatToolOutput({
            success: false,
            error: `Target project origin repair unavailable: ${errorText}`,
            changeId,
            target_path,
            targetRepairPacket: {
              workdir: target_path,
              tool: "adv_change_repair_origin",
              args: {
                changeId,
                origin_kind,
                ...(origin_issue_number !== undefined
                  ? { origin_issue_number }
                  : {}),
                ...(origin_source_artifact ? { origin_source_artifact } : {}),
                approvalEvidence: evidence,
                approvedByUser: true,
                reason: repairReason,
                ...(dryRun ? { dryRun } : {}),
              },
            },
          });
        }
      }
      return runRepair(store);
    },
  },
  adv_change_update_issues: {
    description: "Update GitHub issue URLs linked to a change",
    args: {
      changeId: z.string().describe("Change ID"),
      add: z
        .array(z.string().url())
        .optional()
        .describe("GitHub issue URLs to add"),
      remove: z
        .array(z.string().url())
        .optional()
        .describe("GitHub issue URLs to remove"),
    },
    execute: async (
      {
        changeId,
        add,
        remove,
      }: {
        changeId: string;
        add?: string[];
        remove?: string[];
      },
      store: Store,
    ) => {
      const addList = (add ?? []).filter(Boolean);
      const removeList = (remove ?? []).filter(Boolean);
      if (addList.length === 0 && removeList.length === 0) {
        return formatToolOutput({
          error: "At least one non-empty add/remove issue list is required",
        });
      }
      const invalid = invalidGitHubIssueUrls([...addList, ...removeList]);
      if (invalid.length > 0) {
        return formatToolOutput({
          error: `Invalid GitHub issue URL(s): ${invalid.join(", ")}. Expected https://github.com/<owner>/<repo>/issues/<number>`,
          invalid,
        });
      }
      const result = await store.changes.get(changeId);
      if (!result.success) {
        return formatToolOutput({ error: result.error });
      }
      if (!result.data) {
        return formatToolOutput({ error: `Change not found: ${changeId}` });
      }
      const change = result.data;
      const { github_issues, result: update } = applyIssueUpdates(
        change.github_issues,
        addList,
        removeList,
      );
      change.github_issues = github_issues;
      try {
        await store.changes.save(change);
      } catch (err) {
        return formatToolOutput({
          error: `Failed to save change: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      return formatToolOutput({
        success: true,
        message: `Issues updated: +${update.added.length} -${update.removed.length}`,
        github_issues: change.github_issues,
        added: update.added,
        removed: update.removed,
        alreadyLinked: update.alreadyLinked,
        notLinked: update.notLinked,
      });
    },
  },
  adv_change_reenter: {
    description:
      "Reopen gates from a specified point for scope expansion re-entry. Resets the target gate and all downstream gates to pending, preserving existing tasks and completed work.",
    args: {
      changeId: z.string().describe("Change ID to reopen gates for"),
      fromGate: GateIdSchema.describe("Gate to reopen from"),
      reason: z.string().describe("Why re-entry is needed"),
      scopeDelta: z
        .string()
        .optional()
        .describe("Description of new or changed scope"),
      approvedByUser: z
        .boolean()
        .optional()
        .describe(
          "Deprecated compatibility field. Re-entry no longer requires explicit user approval.",
        ),
      approvalEvidence: z
        .string()
        .optional()
        .describe(
          "Optional audit evidence when re-entry follows an explicit user instruction.",
        ),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview re-entry without firing gate reset signal."),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, routes the re-entry through that project's Temporal-backed target store.",
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
    execute: async (
      {
        changeId,
        fromGate,
        reason,
        scopeDelta,
        approvalEvidence: _approvalEvidence,
        dryRun,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        changeId: string;
        fromGate: GateId;
        reason: string;
        scopeDelta?: string;
        approvedByUser?: boolean;
        approvalEvidence?: string;
        dryRun?: boolean;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const runReenter = async (
        activeStore: Store,
        projectContext?: TargetProjectContext,
      ) => {
        const result = await activeStore.changes.get(changeId);
        if (!result.success) {
          return formatToolOutput({ error: result.error });
        }
        if (!result.data) {
          return formatToolOutput({
            error: `Change not found: ${changeId}`,
            changeId,
          });
        }

        // M2a (terminatechangeworkflowonarchi): change workflows now Complete
        // on archive/close. Reenter on a Completed workflow would fail with an
        // opaque WorkflowExecutionAlreadyCompleted error from Temporal. Reject
        // at the tool layer with a domain-level message and remediation hint.
        if (
          result.data.status === "archived" ||
          result.data.status === "closed"
        ) {
          return formatToolOutput({
            error: `Cannot reenter ${result.data.status} change ${changeId}. Reenter is for scope expansion on active changes; archived/closed changes cannot be reopened. Use adv_temporal_diagnose if workflow recovery is needed.`,
            changeId,
          });
        }

        if (dryRun) {
          return formatToolOutput({
            success: true,
            dryRun: true,
            changeId,
            fromGate,
            reason,
            scopeDelta,
            ...(projectContext
              ? { _projectContext: formatTargetProjectContext(projectContext) }
              : {}),
            message: `Would reenter change ${changeId} from ${fromGate}.`,
          });
        }

        try {
          const bundle = getService();
          if (!bundle) {
            return formatToolOutput({
              error: "Temporal service not available",
              changeId,
            });
          }
          const projectId = await getProjectId(activeStore.paths.root);
          if (!projectId) {
            return formatToolOutput({
              error: "Could not resolve project ID",
              changeId,
            });
          }
          const handle = getChangeHandle(bundle.client, projectId, changeId);
          // rq-cacheRefresh01: refresh after reenter so buildReentryResult
          // reads the reset-gates state from a fresh cache, not stale gates.
          await fireSignalAndRefresh(
            handle,
            activeStore,
            changeId,
            gateReenteredSignal,
            {
              fromGateId: fromGate,
              reason,
              scopeDelta,
              reenteredBy: "agent",
              reenteredAt: new Date().toISOString(),
            },
          );
          const output = await buildReentryResult(
            activeStore,
            changeId,
            fromGate,
          );
          return projectContext
            ? appendTargetProjectContextOutput(output, projectContext)
            : output;
        } catch (error) {
          return formatToolOutput({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      };

      if (target_path) {
        try {
          return await withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path,
              target_confirmed,
              confirmationEvidence,
              stateRequirement: dryRun ? "snapshot-ok" : "temporal-required",
              mutation: dryRun ? false : undefined,
            },
            async ({ context, store: targetStore }) =>
              runReenter(targetStore, context),
          );
        } catch (error) {
          return formatToolOutput({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return runReenter(store);
    },
  },
  adv_change_status_repair: {
    description:
      "Repair a change whose archive bundle is written and whose gates are all done, but whose status field is wedged at non-archived because the terminating workflow signal could not be processed (completed/poisoned workflow → WorkflowNotFoundError) and the phase-9 PR-merged finalization cannot re-detect a squash-merged or deleted release branch. This is a targeted, audited disk-projection status flip (→ archived) gated on the real shipped invariant (all 7 gates done + archive bundle present on disk). It does NOT push branches, create PRs, or run phase-9 finalization. Use only after adv_change_archive has written the bundle but left status wedged. Unblocks adv_reflect. Repair decision matrix: this tool is the single-change path (precise workflow-evidence gate, no branch requirement, target_path routing); for batch terminal-projection repair across all release-stuck candidates gated on branch-merge evidence, use adv_archive_repair action=reconcile instead.",
    args: {
      changeId: z.string().describe("Change ID whose status is wedged"),
      approvedByUser: z
        .literal(true)
        .describe(
          "Must be true — confirms operator explicitly approved the disk-projection status repair",
        ),
      approvalEvidence: z
        .string()
        .describe(
          "Audited evidence: cite the wedged-state proof (e.g. WorkflowNotFoundError / phase9_status.failed) and operator approval.",
        ),
      recoveryReason: z
        .string()
        .optional()
        .describe(
          "Required non-blank rationale for status repair recovery; explains why disk-projection status repair is appropriate.",
        ),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "Preview the repair (gate + bundle checks) without writing the status flip.",
        ),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, routes the repair through that project's Temporal-backed target store.",
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
    execute: async (
      {
        changeId,
        approvedByUser: _approvedByUser,
        approvalEvidence,
        recoveryReason,
        dryRun,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        changeId: string;
        approvedByUser: true;
        approvalEvidence: string;
        recoveryReason?: string;
        dryRun?: boolean;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const evidence = approvalEvidence?.trim() ?? "";
      if (evidence.length === 0) {
        return formatToolOutput({
          error: "approvalEvidence is required for change status repair",
          changeId,
          hint: "Cite the wedged-state evidence (WorkflowNotFoundError / phase9_status.failed) and operator approval.",
        });
      }
      const reason = recoveryReason?.trim() ?? "";
      if (reason.length === 0) {
        return formatToolOutput({
          error: "recoveryReason is required for change status repair",
          changeId,
          hint: "Explain why disk-projection status repair is appropriate for this wedged release state.",
        });
      }
      const { isPreciseWorkflowRecoveryEvidence } =
        await import("../temporal/recovery-classification");
      if (
        !isPreciseWorkflowRecoveryEvidence(evidence) &&
        !STATUS_REPAIR_PHASE9_EVIDENCE_RE.test(evidence)
      ) {
        return formatToolOutput({
          error:
            "approvalEvidence must cite precise completed-workflow, poisoned-history, or phase9_status.failed evidence for change status repair",
          changeId,
          hint: "Examples: WorkflowNotFoundError, WorkflowExecutionAlreadyCompleted, TMPRL1100, WorkflowTaskFailedCauseNonDeterministicError, or phase9_status.failed.",
        });
      }
      const runRepair = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        const result = await activeStore.changes.get(changeId);
        if (!result.success) {
          return formatToolOutput({ error: result.error });
        }
        if (!result.data) {
          return formatToolOutput({ error: `Change not found: ${changeId}` });
        }
        const change = result.data;
        const fromStatus = change.status;
        // Idempotent: already archived → nothing to repair.
        if (change.status === "archived") {
          return formatToolOutput({
            success: true,
            changeId,
            status: "archived",
            message: `Change ${changeId} is already archived; no repair needed.`,
          });
        }
        // Invariant 1: every gate must be done. Repair only finalizes the status
        // field; it must never substitute for incomplete gate work.
        const gates = change.gates ?? createDefaultGates();
        const incompleteGates = GATE_ORDER.filter(
          (gateId) => gates[gateId]?.status !== "done",
        );
        if (incompleteGates.length > 0) {
          return formatToolOutput({
            success: false,
            error: `Cannot repair status: gate(s) not done: ${incompleteGates.join(", ")}.`,
            changeId,
            incompleteGates,
            hint: "Status repair only finalizes a fully-gated, already-archived-on-disk change. Complete the gates via the normal workflow.",
          });
        }
        // Invariant 2: the archive bundle must already exist on disk. This proves
        // adv_change_archive wrote the bundle and only the status flip is missing.
        const bundlePath = await findArchiveBundle(
          activeStore.paths.archive,
          changeId,
        );
        if (!bundlePath) {
          return formatToolOutput({
            success: false,
            error: `Cannot repair status: no archive bundle found for ${changeId}.`,
            changeId,
            hint: "Run adv_change_archive first so the archive bundle is written, then repair the wedged status.",
          });
        }
        if (Object.values(change.deltas).some((deltas) => deltas.length > 0)) {
          const manifest = await readProjectionManifest(bundlePath);
          const { archiveMode } = detectArchiveMode(activeStore.config ?? {});
          const release = verifyReleaseEvidenceFromMain({
            store: activeStore,
            changeId,
            archiveMode,
            change,
          });
          if (
            !manifest ||
            release.status !== "shipped" ||
            !release.mergeCommitSha
          ) {
            return formatToolOutput({
              success: false,
              error:
                "Cannot repair status: accepted delta projection lacks a manifest or immutable released commit proof.",
              requirement: "rq-archiveDeltaReconciliation01",
              changeId,
              archivePath: bundlePath,
              hint: "Run approved archive delta reconciliation in a trusted repair worktree before status repair.",
            });
          }
          const projectionProof = await verifyProjectionAtGitCommit({
            manifest,
            repo: release.mainCheckout,
            releasedCommitSha: release.mergeCommitSha,
            manifestGitPath: `.adv/archive/${basename(bundlePath)}/spec-projection.json`,
            expectedChangeId: change.id,
            expectedDeltaSetSha256: canonicalSha256(change.deltas),
            expectedDeltaIdsByCapability: Object.fromEntries(
              Object.entries(change.deltas).map(([capability, deltas]) => [
                capability,
                deltas.map((delta) => delta.id),
              ]),
            ),
          });
          if (!projectionProof.ok) {
            return formatToolOutput({
              success: false,
              error: `Cannot repair status: projection proof failed: ${projectionProof.code}: ${projectionProof.message}`,
              requirement: "rq-archiveDeltaReconciliation01",
              changeId,
              archivePath: bundlePath,
              projectionFailure: projectionProof,
            });
          }
          change.archive_projection_proof = projectionProof.receipt;
        }
        if (dryRun) {
          return formatToolOutput({
            success: true,
            dryRun: true,
            changeId,
            fromStatus,
            toStatus: "archived",
            archivePath: bundlePath,
            message: `Would flip ${changeId} status ${fromStatus} → archived (all gates done, bundle present).`,
            recoveryReason: reason,
          });
        }
        try {
          const { saveRecoveredChangeStatus } =
            await import("./_recovery-writers");
          await saveRecoveredChangeStatus({
            store: activeStore,
            change,
            authorization: {
              reason,
              evidence,
            },
            status: "archived",
          });
        } catch (error) {
          return formatToolOutput({
            success: false,
            error: `Failed to repair change status: ${error instanceof Error ? error.message : String(error)}`,
            changeId,
          });
        }
        const readback = await verifyStatusRepairReadAfterWrite({
          store: activeStore,
          changeId,
        });
        if (!readback.ok) {
          return formatToolOutput({
            success: false,
            error: `Status repair read-after-write verification failed: ${readback.error}`,
            changeId,
            fromStatus,
            attemptedStatus: "archived",
            archivePath: bundlePath,
            readback: readback.readback,
            _recoveryMutation: true,
          });
        }
        return formatToolOutput({
          success: true,
          changeId,
          fromStatus,
          status: "archived",
          archivePath: bundlePath,
          readback: readback.readback,
          _recoveryMutation: true,
          recovered: true,
          recoveryReason: reason,
          ...(projectContext ? { _projectContext: projectContext } : {}),
          message: `Repaired ${changeId} status → archived (disk-projection). adv_reflect can now run.`,
        });
      };
      if (target_path) {
        try {
          return await withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path,
              stateRequirement: dryRun ? "snapshot-ok" : "temporal-required",
              target_confirmed,
              confirmationEvidence,
            },
            async ({ context, store: targetStore }) =>
              runRepair(targetStore, formatTargetProjectContext(context)),
          );
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error);
          return formatToolOutput({
            success: false,
            error: `Target project status repair unavailable: ${errorText}`,
            changeId,
            target_path,
            targetRepairPacket: {
              workdir: target_path,
              tool: "adv_change_status_repair",
              args: {
                changeId,
                approvedByUser: true,
                approvalEvidence,
                recoveryReason,
                ...(dryRun ? { dryRun } : {}),
              },
            },
          });
        }
      }
      return runRepair(store);
    },
  },
  // rq-activeChangePointer01: Session active-change pointer recovery.
  // Tool emits clear intent; recordForgetChange hook in index.ts processes it.
  adv_change_forget: {
    description:
      "Clear the session active-change pointer for a specified changeId. Pure in-memory recovery — does NOT close, archive, or modify any persistent state. Use when the session pointer references a phantom change (unreachable workflow, no disk state). The pointer is cleared via an index.ts post-output hook; this tool emits the clear intent.",
    args: {
      changeId: z
        .string()
        .describe(
          "The changeId to forget from the session pointer. Must match the current active pointer for the clear to take effect; if mismatched, the hook will refuse and surface the actual pointer.",
        ),
    },
    execute: async (
      {
        changeId,
      }: {
        changeId: string;
      },
      _store: Store,
    ) => {
      // Emit success output unconditionally. The recordForgetChange hook
      // in index.ts will process this and conditionally clear the pointer.
      logger.debug(`adv_change_forget: emitted clear intent for ${changeId}`);
      return formatToolOutput({
        success: true,
        changeId,
        action: "forget",
        cleared: true,
        message: `Forget intent emitted for ${changeId}. Session pointer will be cleared by the recordForgetChange hook if changeId matches the current active pointer.`,
      });
    },
  },
};
export {
  readArtifact,
  readArtifacts,
  loadProposalForContext,
} from "./change/artifacts";
export { closeLinkedIssue } from "./change/recovery";
