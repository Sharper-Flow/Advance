// rq-prop-context1: Durable Proposal Context for adv-task
/** Shared helpers for change handlers. */
import { ZodError } from "zod";
import { readFile } from "fs/promises";
import { join } from "path";
import type { WorkNodeRef } from "../../types";
import {
  BRIEFING_PACKET_SESSION_METADATA_MAX_LENGTH,
  type GateId,
  type ArtifactKind,
  type Change,
  type ChangeLifecycleState,
  type ScopedSubagentReport,
  type BriefingPacketLane,
  type GateCompletion,
} from "../../types";
import { ChangeSchema } from "../../types/changes";
import type { Store } from "../../storage/store";
import { formatZodError } from "../../utils/safe-execute";
import { createLogger } from "../../utils/debug-log";
import {
  subagentReportImplementationCycleId,
  subagentReportKey,
} from "../../types/subagent-reports";
import { readArtifacts, type ArtifactReadResult } from "./artifacts";
import {
  buildReleaseCompletionEvidence,
  preservePhase9Evidence,
} from "./archive-gate";
import { coordinateChangeMutation } from "../change-mutation-coordinator";
import { type D3EnforcementError } from "../../validator/work-graph-enforcement";
import { nodeRefKey } from "../../validator/work-graph-validation";
import { findArchiveBundle } from "../../archive/archive";
import { classifyBriefingFacts } from "../../utils/briefing-fact-classifier";
import { type BriefingPacketRendererInput } from "../../utils/briefing-packet-renderer";
import type { GitFinalizeOutcome } from "../archive-helpers/git-finalize";
import type { ReadDeadline } from "./validation-projection";
import type { EpicMembershipVerification } from "../epic-convergence";

export const logger = createLogger("change");

const LEAN_PHASE_PLAN_FIELDS = new Set([
  "id",
  "title",
  "status",
  "gates",
  "acceptanceCriteria",
  "_phasePlan",
  "_unavailable",
]);

const DIRECTIVE_INCLUDE_FIELDS: Record<string, readonly string[]> = {
  ledger: ["_ledger"],
  loopLedger: ["_loopLedger"],
  loopLedgerDetails: ["_loopLedger"],
  snapshot: ["_contextSnapshot", "_contextSnapshotError"],
  readyTasks: [
    "_readyTasks",
    "_readyTasksMeta",
    "_todoProjection",
    "_readyTasksError",
  ],
  proposal: ["_proposal"],
  problemStatement: ["_problemStatement"],
  agreement: ["_agreement"],
  design: ["_design"],
  executiveSummary: ["_executiveSummary"],
  acceptance: ["_acceptance"],
  subagentReports: ["_subagentReports", "_subagentReportsMeta"],
  briefingPacket: ["_briefingPacket", "_briefingPacketError"],
};

function hasPhaseDirective(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const plan = value as { kind?: unknown; directive?: unknown };
  return plan.kind === "actionable" && plan.directive !== undefined;
}

export function shapeDirectiveResponse(
  output: Record<string, unknown>,
  include: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!hasPhaseDirective(output._phasePlan)) return undefined;
  const retainedFields = new Set(LEAN_PHASE_PLAN_FIELDS);
  for (const [includeKey, outputKeys] of Object.entries(
    DIRECTIVE_INCLUDE_FIELDS,
  )) {
    if (include[includeKey] === true) {
      for (const outputKey of outputKeys) retainedFields.add(outputKey);
    }
  }
  const leanOutput: Record<string, unknown> = {};
  const omittedFields = Object.keys(output)
    .filter((key) => !retainedFields.has(key) && output[key] !== undefined)
    .sort();
  for (const key of retainedFields) {
    if (output[key] !== undefined) leanOutput[key] = output[key];
  }
  if (omittedFields.length > 0) leanOutput._omittedFields = omittedFields;
  return leanOutput;
}

export function formatD3Error(error: D3EnforcementError): string {
  switch (error.code) {
    case "INVALID_WORK_NODE_REF": {
      const reason = (error as { reason?: string }).reason;
      if (reason === "self_edge") return "Self-dependency is not allowed.";
      if (reason === "duplicate_ref")
        return "Duplicate dependency reference in same_project_dependencies.";
      return "Invalid dependency reference.";
    }
    case "UNRESOLVED_DEPENDENCY":
      return "Dependency target does not exist in scope.";
    case "DEPENDENCY_CYCLE":
      return "Adding this dependency would create a cycle.";
    case "DEP_PREREQ_NONTERMINAL": {
      const refs = (error as { blocking_refs: WorkNodeRef[] }).blocking_refs;
      return `Cannot create change: prerequisites are not terminal: ${refs.map((r) => nodeRefKey(r)).join(", ")}`;
    }
    default:
      return `Dependency enforcement failed: ${error.code}`;
  }
}

/** Local disk reads need no workflow circuit breaker; errors remain bounded per member. */
export function createChangeShowSubreadRunner(_deadline?: ReadDeadline) {
  const omittedIds: string[] = [];
  async function run<T>(
    label: string,
    op: () => Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
    try {
      return { ok: true, value: await op() };
    } catch (error) {
      logger.debug("subread.run error", { label, error });
      omittedIds.push(label);
      return { ok: false, error };
    }
  }
  async function runLocalCapable<T>(
    label: string,
    op: () => Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
    return run(label, op);
  }
  function getHydrationStats() {
    if (omittedIds.length === 0) return undefined;
    return {
      deadlineExceeded: false,
      omitted: omittedIds.length,
      omittedIds,
    };
  }
  return { run, runLocalCapable, getHydrationStats };
}

const ARTIFACT_OUTPUT_KEYS: Record<string, string> = {
  proposal: "_proposal",
  problemStatement: "_problemStatement",
  agreement: "_agreement",
  design: "_design",
  executiveSummary: "_executiveSummary",
  acceptance: "_acceptance",
};

export function applyArtifactContentToOutput(
  output: Record<string, unknown>,
  artifactContent: Partial<Record<ArtifactKind, ArtifactReadResult>>,
): void {
  const sources: Record<string, string> = {};
  for (const [kind, outputKey] of Object.entries(ARTIFACT_OUTPUT_KEYS)) {
    const entry = artifactContent[kind as ArtifactKind];
    if (entry === undefined) continue;
    output[outputKey] = entry.content;
    sources[kind] = entry.source;
  }
  if (Object.keys(sources).length > 0) output._artifactSources = sources;
}

export type ArchiveConvergenceRefusalCode =
  | "AUTHORIZATION_MISSING"
  | "PROOF_NOT_SHIPPED"
  | "PROOF_MISSING_BUNDLE"
  | "PROOF_INVALID_BUNDLE"
  | "PROOF_BUNDLE_ID_MISMATCH";

export type SaveRecoveredArchiveConvergenceResult =
  | {
      kind: "converged";
      change: Change;
      readback: {
        status: "archived";
        lifecycleState: "archived";
        releaseStatus: "done";
        phase9Status: "done";
      };
    }
  | {
      kind: "refused";
      refusalCode: ArchiveConvergenceRefusalCode;
      evidence: string;
    }
  | { kind: "writeFailed"; error: string }
  | {
      kind: "readbackFailed" | "state_unknown";
      error: string;
      readback: {
        status?: Change["status"];
        lifecycleState?: Change["lifecycleState"];
        releaseStatus?: GateCompletion["status"];
        phase9Status?: NonNullable<Change["phase9_status"]>["status"];
      };
    };

/** Genuine disk repair: converge a shipped archive's durable projection. */
export async function saveRecoveredArchiveConvergence(input: {
  store: Store;
  change: Change;
  changeId: string;
  authorization: { reason: string; evidence: string };
  finalization: GitFinalizeOutcome;
  releaseGate?: GateCompletion;
  archivedAt?: string;
}): Promise<SaveRecoveredArchiveConvergenceResult> {
  const { reason, evidence } = input.authorization;
  if (!reason?.trim() || !evidence?.trim()) {
    return {
      kind: "refused",
      refusalCode: "AUTHORIZATION_MISSING",
      evidence:
        "disk-projection recovery authorization requires non-empty reason and evidence",
    };
  }
  if (input.finalization.status !== "shipped") {
    return {
      kind: "refused",
      refusalCode: "PROOF_NOT_SHIPPED",
      evidence: `finalization.status: ${input.finalization.status}`,
    };
  }
  const bundlePath = await findArchiveBundle(
    input.store.paths.archive,
    input.changeId,
  );
  if (!bundlePath) {
    return {
      kind: "refused",
      refusalCode: "PROOF_MISSING_BUNDLE",
      evidence: `no archive bundle found under ${input.store.paths.archive} for ${input.changeId}`,
    };
  }
  let bundleChange: Change;
  try {
    const parsed = JSON.parse(
      await readFile(join(bundlePath, "change.json"), "utf-8"),
    );
    bundleChange = ChangeSchema.parse(parsed);
  } catch (error) {
    return {
      kind: "refused",
      refusalCode: "PROOF_INVALID_BUNDLE",
      evidence:
        error instanceof ZodError
          ? `bundle ChangeSchema parse failed: ${formatZodError(error)}`
          : `bundle change.json could not be read or parsed at ${bundlePath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (bundleChange.id !== input.changeId) {
    return {
      kind: "refused",
      refusalCode: "PROOF_BUNDLE_ID_MISMATCH",
      evidence: `bundle change.id: "${bundleChange.id}", requested: "${input.changeId}"`,
    };
  }

  const archivedAt = input.archivedAt ?? new Date().toISOString();
  const approvalEvidence = buildReleaseCompletionEvidence(input.finalization);
  const releaseGateDone: GateCompletion = input.releaseGate ?? {
    status: "done",
    completed_at: archivedAt,
    completed_by: "adv-archive",
    approval_evidence: approvalEvidence,
    recovery_audit: {
      reason: "archive_convergence_recovery",
      evidence: `${reason}; ${evidence}`,
      recovered_at: archivedAt,
    },
  };
  const outcome = await coordinateChangeMutation<Change>({
    authority: {
      kind: "recovery",
      reason,
      evidence,
    },
    changesDir: input.store.paths.changes,
    expectedRevision: input.change.projection_revision ?? 0,
    intent: {
      changeId: input.changeId,
      mutationKind: "archive_convergence",
      mutateLatestProjection: (latest) => ({
        ...latest,
        status: "archived",
        lifecycleState: "archived",
        gates: { ...(latest.gates ?? {}), release: releaseGateDone },
        phase9_status: preservePhase9Evidence(latest.phase9_status, {
          status: "done",
          startedAt: latest.phase9_status?.startedAt ?? archivedAt,
          completedAt: archivedAt,
          route: input.finalization.route,
          ...(input.finalization.prNumber
            ? { prNumber: input.finalization.prNumber }
            : {}),
          ...(input.finalization.prUrl
            ? { prUrl: input.finalization.prUrl }
            : {}),
          ...(input.finalization.mergeCommitSha
            ? { mergeCommitSha: input.finalization.mergeCommitSha }
            : {}),
          ...(input.finalization.prHeadSha
            ? { prHeadSha: input.finalization.prHeadSha }
            : {}),
          ...(input.finalization.defaultBranchSha
            ? { defaultBranchSha: input.finalization.defaultBranchSha }
            : {}),
          ...(input.finalization.changeTipSha
            ? { changeTipSha: input.finalization.changeTipSha }
            : {}),
          ...(input.finalization.preArchiveTipSha
            ? { preArchiveTipSha: input.finalization.preArchiveTipSha }
            : {}),
          autoMergeArmed: false,
        }),
      }),
      verifyProjection: (readback) => {
        const failures: string[] = [];
        if (readback.status !== "archived") failures.push("status");
        if (readback.lifecycleState !== "archived")
          failures.push("lifecycleState");
        if (readback.gates?.release?.status !== "done")
          failures.push("release gate");
        if (readback.phase9_status?.status !== "done")
          failures.push("phase9_status");
        return failures.length === 0
          ? true
          : {
              ok: false,
              error: `readback did not converge: ${failures.join(", ")}`,
            };
      },
    },
  });
  if (outcome.kind === "verified") {
    return {
      kind: "converged",
      change: outcome.value,
      readback: {
        status: "archived",
        lifecycleState: "archived",
        releaseStatus: "done",
        phase9Status: "done",
      },
    };
  }
  if (outcome.kind === "unverified") {
    return {
      kind: "state_unknown",
      error: `archive convergence recovery wrote the projection but the postcondition could not be verified: ${outcome.reason}`,
      readback: {},
    };
  }
  if (outcome.kind === "stale_revision") {
    return {
      kind: "writeFailed",
      error: `archive convergence recovery encountered a stale projection revision: expected ${outcome.expected}, actual ${outcome.actual}`,
    };
  }
  return { kind: "writeFailed", error: outcome.reason };
}

function subagentReportTaskId(
  report: ScopedSubagentReport,
): string | undefined {
  if (typeof report.scope !== "string" && report.scope.kind === "task") {
    return report.scope.task_id;
  }
  return "task_id" in report ? report.task_id : undefined;
}

export function subagentReportReadbackKey(
  report: ScopedSubagentReport,
): string {
  return subagentReportKey({
    changeId: report.change_id,
    taskId: subagentReportTaskId(report),
    scope: typeof report.scope === "string" ? undefined : report.scope,
    agent: report.agent,
    attempt: report.attempt,
    implementationCycleId: subagentReportImplementationCycleId(report),
  });
}

export const DEFAULT_BRIEFING_PACKET_LANE: BriefingPacketLane = "engineer";

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
  for (const task of change.tasks ?? []) {
    for (const report of task.subagent_reports ?? []) {
      for (const fact of classifyBriefingFacts({ report })) {
        if (!seenIds.has(fact.id)) {
          seenIds.add(fact.id);
          facts.push(fact);
        }
      }
    }
  }
  for (const report of change.subagent_reports ?? []) {
    for (const fact of classifyBriefingFacts({ report })) {
      if (!seenIds.has(fact.id)) {
        seenIds.add(fact.id);
        facts.push(fact);
      }
    }
  }
  return facts;
}

export async function buildBriefingPacketForChange(
  store: Store,
  change: Change,
  lane: BriefingPacketLane = DEFAULT_BRIEFING_PACKET_LANE,
  request?: string,
  epicMembershipVerification?: EpicMembershipVerification,
): Promise<BriefingPacketRendererInput> {
  const artifacts = await readArtifacts(store, change.id, [
    "proposal",
    "problemStatement",
    "acceptance",
  ]);
  const verificationExpectations =
    change.contract?.items
      .filter((item) => item.kind === "acceptance_criterion")
      .map((item) => item.text) ?? [];
  if (artifacts.acceptance?.content) {
    for (const line of artifacts.acceptance.content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !verificationExpectations.includes(trimmed))
        verificationExpectations.push(trimmed);
    }
  }
  const affectedFiles = new Set(change.affectedPaths ?? []);
  for (const task of change.tasks ?? []) {
    for (const file of task.touched_files ?? []) affectedFiles.add(file);
  }
  const reviewMatrixById = new Map(
    change.contract?.reviewMatrix?.rows.map((row) => [row.contractId, row]),
  );
  const contractItems =
    change.contract?.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      text: item.text,
      status:
        reviewMatrixById.get(item.id)?.status ??
        (item.status === "approved" ? ("pass" as const) : ("unknown" as const)),
      variant: item.variant,
    })) ?? [];
  return {
    change_id: change.id,
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
      proposal: artifacts.proposal?.content,
      problem_statement: artifacts.problemStatement?.content,
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
    ...(change.epic_membership && epicMembershipVerification
      ? { epic_membership_verification: epicMembershipVerification }
      : {}),
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

type ChangePhase = GateId | "released" | "archived" | "closed";

export function deriveChangePhase(row: {
  status: Change["status"];
  lifecycleState?: ChangeLifecycleState;
  currentGate?: GateId | "done";
}): ChangePhase | undefined {
  const lifecycle = row.lifecycleState ?? row.status;
  if (lifecycle === "archived") return "archived";
  if (lifecycle === "closed") return "closed";
  if (row.currentGate === undefined) return undefined;
  return row.currentGate === "done" ? "released" : row.currentGate;
}

export const CHANGE_VALIDATE_CONTEXT_TIMEOUT_MS = 8_000;
