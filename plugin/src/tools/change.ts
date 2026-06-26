// rq-prop-context1: Durable Proposal Context for adv-task
/**
 * Change Tools
 *
 * Tools for managing change proposals.
 */

import { z } from "zod";
import { createHash } from "crypto";
import { basename, join } from "path";
import { readFile, stat, realpath } from "fs/promises";
import { execGit, getDefaultBranch } from "../utils/git.js";
import { parseGitRemoteUrl } from "../utils/git-remote";
import { execGh } from "../integrations/gh-cli";
import { readGitHubProjectConfig } from "../storage/github-project-config";
import type {
  Spec,
  FeatureFlags,
  CrossProjectOrigin,
  FastFollowOf,
  ChangeOrigin,
} from "../types";
import {
  createDefaultGates,
  getIncompleteGates,
  allGatesSatisfied,
  isGateSatisfied,
  GATE_ORDER,
  GateIdSchema,
  ARTIFACT_FILENAME,
  ChangeListStatusFilterSchema,
  ChangeOriginKindSchema,
  ChangeRepoScopeSchema,
  type GateId,
  type GateCompletion,
  type ArtifactKind,
  type Gates,
  type Change,
  type ChangeRepoScope,
  type ClarifyFindingSnapshot,
  type Phase9FinalizationStatus,
  type ScopedSubagentReport,
} from "../types";
import type { ChangeCreateInitialMetadata, Store } from "../storage/store";
import { getReflection } from "../storage/reflection";
import { getProjectId } from "../utils/project-id";
import { isSyntheticValidationDraftPattern } from "../utils/synthetic-fixture-detector";
import { validateChange } from "../validator";
import { createLogger } from "../utils/debug-log";
import { queryClaimsByIssueNumber } from "../temporal/visibility-claim-queries";
import {
  subagentReportKey,
  type ArtifactMetadata,
} from "../temporal/contracts";
import { advWorktreeCleanup } from "./worktree";
import { initStateDb as initWorktreeStateDb } from "./worktree/state";
import {
  compactOpsFollowupAnnotation,
  compactOpsFollowupLinkAnnotations,
} from "./ops-followup-readback";

const logger = createLogger("change");

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
  });
}

async function normalizeArtifactMetadataForReadback(
  artifacts: Change["artifacts"],
): Promise<Change["artifacts"]> {
  if (!artifacts) return artifacts;
  const normalized: NonNullable<Change["artifacts"]> = {};
  for (const [kind, rawMetadata] of Object.entries(artifacts) as Array<
    [string, ArtifactMetadata]
  >) {
    const metadata: ArtifactMetadata = { ...rawMetadata };
    if (metadata.path) {
      // Readback re-validates paths because workflow state can retain legacy
      // path metadata after active artifacts moved to Temporal-only content.
      const readable =
        metadata.source !== "temporal" &&
        metadata.readable !== false &&
        (await fileExists(metadata.path));
      if (readable) {
        metadata.readable = true;
      } else {
        delete metadata.path;
        metadata.readable = false;
      }
    }
    normalized[kind as keyof NonNullable<Change["artifacts"]>] = metadata;
  }
  return normalized;
}

export async function normalizeGateArtifactEvidenceForReadback(
  gates: Gates | undefined,
): Promise<Gates | undefined> {
  if (!gates) return gates;
  const normalized = { ...gates } as Gates;
  for (const gateId of GATE_ORDER) {
    const gate = normalized[gateId];
    const evidence = gate?.artifact_evidence;
    if (!evidence?.path) continue;
    // Gate evidence may come from older state that recorded active artifact
    // paths; suppress phantom paths unless the file is still materialized.
    if (await fileExists(evidence.path)) continue;
    const { path: _path, ...evidenceWithoutPath } = evidence;
    normalized[gateId] = {
      ...gate,
      artifact_evidence: evidenceWithoutPath,
    } as GateCompletion;
  }
  return normalized;
}

/**
 * Read a single artifact content by canonical kind. Temporal-first per
 * KD-6: queries `state.documents[kind]` via `store.changes.get()` (which
 * uses `mapTemporalChangeStateToChange` to surface documents). Falls back
 * to disk-active-dir, then archive bundle.
 *
 * Returns `null` when content is unavailable from any source (e.g. an
 * in-flight pre-migration change whose `state.documents` is empty and
 * disk file is also empty).
 */
export async function readArtifact(
  store: Store,
  changeId: string,
  kind: ArtifactKind,
): Promise<string | null> {
  // 1. Temporal-first — query workflow state.documents.
  try {
    const result = await store.changes.get(changeId);
    if (result.success && result.data) {
      const content = result.data.documents?.[kind];
      if (typeof content === "string" && content.length > 0) return content;
    }
  } catch {
    // Workflow may be unavailable; fall through to disk.
  }

  // 2. Disk active directory.
  const changeDir = join(store.paths.changes, changeId);
  const filename = ARTIFACT_FILENAME[kind];
  try {
    const text = await readFile(join(changeDir, filename), "utf-8");
    if (text.trim().length > 0) return text;
  } catch {
    // File missing — fall through.
  }

  // 3. Archive bundle fallback.
  const archiveDir = join(store.paths.root, ".adv", "archive");
  const bundleDir = await findArchiveBundle(archiveDir, changeId);
  if (bundleDir) {
    try {
      const text = await readFile(join(bundleDir, filename), "utf-8");
      if (text.trim().length > 0) return text;
    } catch {
      // Bundle file missing — return null.
    }
  }

  return null;
}

/**
 * Load proposal content with the legacy scaffold-fallback semantics layered
 * over the new Temporal-first read path. Returns generated scaffold text
 * when no proposal content is available from any source — matches the
 * pre-migration `loadProposalWithFallback` contract that downstream callers
 * (clarify-readiness checks, snapshot rendering, context fetching) rely on.
 *
 * T10 migration target — replaces direct `loadProposalWithFallback` calls.
 */
async function loadProposalForContext(
  store: Store,
  changeId: string,
  changeTitle: string,
): Promise<{ content: string; warning?: string }> {
  const content = await readArtifact(store, changeId, "proposal");
  if (content !== null) return { content };

  // Scaffold fallback — mirrors storage/json.ts loadProposalWithFallback's
  // scaffold so downstream consumers always receive some structural text.
  const scaffold = `# ${changeTitle}

## Intent

<!-- Auto-generated scaffold: proposal.md was missing or empty. -->
<!-- Update this file with the actual intent, scope, and user outcomes. -->

## Scope

- (unknown — proposal.md not found)

## User Outcomes

- [ ] Users can see what outcome this change is meant to deliver
- [ ] Discovery firms acceptance criteria and success criteria downstream
`;
  return {
    content: scaffold,
    warning: `⚠️  proposal content not found in Temporal state.documents or disk for change ${changeId}. Using auto-generated scaffold. Run /adv-proposal to create a proper proposal.`,
  };
}

/**
 * Batched multi-artifact read. Per C9 (read latency), issues exactly ONE
 * workflow query and extracts the requested kinds in memory. Disk and
 * archive-bundle fallbacks are per-kind in case the workflow lacks content
 * for some kinds (pre-migration change, partial hydration).
 *
 * Returns a partial record keyed by requested kind; missing kinds are
 * absent from the returned object.
 */
export async function readArtifacts(
  store: Store,
  changeId: string,
  kinds: ArtifactKind[],
): Promise<Partial<Record<ArtifactKind, string>>> {
  const result: Partial<Record<ArtifactKind, string>> = {};

  // 1. Temporal-first — single store.changes.get() call covers all kinds.
  let temporalDocuments: Partial<Record<ArtifactKind, string>> | undefined;
  try {
    const changeResult = await store.changes.get(changeId);
    if (changeResult.success && changeResult.data) {
      temporalDocuments = changeResult.data.documents as
        | Partial<Record<ArtifactKind, string>>
        | undefined;
    }
  } catch {
    // Workflow may be unavailable; per-kind disk fallback follows.
  }

  // 2. Per-kind: prefer Temporal, fall back to disk/archive.
  for (const kind of kinds) {
    const temporalContent = temporalDocuments?.[kind];
    if (typeof temporalContent === "string" && temporalContent.length > 0) {
      result[kind] = temporalContent;
      continue;
    }

    // Disk fallback per kind.
    const changeDir = join(store.paths.changes, changeId);
    const filename = ARTIFACT_FILENAME[kind];
    try {
      const text = await readFile(join(changeDir, filename), "utf-8");
      if (text.trim().length > 0) {
        result[kind] = text;
        continue;
      }
    } catch {
      // Fall through to archive bundle.
    }

    const archiveDir = join(store.paths.root, ".adv", "archive");
    const bundleDir = await findArchiveBundle(archiveDir, changeId);
    if (bundleDir) {
      try {
        const text = await readFile(join(bundleDir, filename), "utf-8");
        if (text.trim().length > 0) result[kind] = text;
      } catch {
        // Skip missing artifact.
      }
    }
  }

  return result;
}

/**
 * rq-backlogCoord02 / rq-backlogCoord03 — injection seam for the
 * pre-create + post-create claim-collision checks. Production wires to
 * `queryClaimsByIssueNumber` via `getService()`; tests inject a
 * deterministic mock.
 */
export interface ChangeCreateProviders {
  claimChecker?: (
    projectId: string,
    issueNumber: number,
  ) => Promise<Array<{ changeId: string; status: string }>>;
  /**
   * Post-create double-check window in milliseconds. Defaults to 5000
   * (rq-backlogCoord03 — chosen per validator pass-2 to give SQLite-backed
   * dev servers margin for Visibility propagation). Tests pass 0 to skip
   * the wait entirely.
   */
  claimRaceCheckMs?: number;
}

const DEFAULT_CLAIM_RACE_CHECK_MS = 5_000;

async function defaultClaimChecker(
  projectId: string,
  issueNumber: number,
): Promise<Array<{ changeId: string; status: string }>> {
  const bundle = getService();
  if (!bundle) return [];
  const client = bundle.client as unknown as Parameters<
    typeof queryClaimsByIssueNumber
  >[0];
  if (!client.workflow?.list) return [];
  const results = await queryClaimsByIssueNumber(
    client,
    projectId,
    issueNumber,
  );
  return results.map((r) => ({ changeId: r.changeId, status: "active" }));
}
import { runClarifyReadinessChecks } from "../validator/clarify-readiness";
import { fileExists, removeChangeDir, loadChange } from "../storage/json";
import {
  archiveChange,
  findArchiveBundle,
  getArchiveContractProofErrors,
  reconcileInRepoArchive,
} from "../archive";
import { formatToolOutput, paginate } from "../utils/tool-output";
import {
  buildTodoProjection,
  formatValidationOutput,
  formatSmellReport,
} from "../utils/tool-formatters";
import { checkRequirementSmells } from "../validator/prep-readiness";
import { buildChangeContextSnapshot } from "../utils/context-snapshot";
import { resolveChangeSelection } from "../storage/change-selection";
import { sweepClosedChangesFromDisk } from "../storage/disk-sweep";
import { BulkCloseSelectorSchema } from "../types";
import { collectErrorText } from "../temporal/retry-wrapper";
import {
  formatTargetProjectContext,
  type TargetProjectOutputContext,
  withOptionalTargetPathStore,
  withTargetPathStore,
} from "./target-project";
import { buildExternalDependencyStatus } from "./external-dependency-status";
import { getService } from "../temporal/service";
import {
  fireSignalAndRefresh,
  getChangeHandle,
  querySignal,
  waitForGateCompletion,
} from "./_adapters";
import {
  changeCancelledSignal,
  gateCompletedSignal,
  gateReenteredSignal,
  getGateStatusQuery,
  phase9StatusUpdatedSignal,
} from "../temporal/messages";
import { getOpenOpsFollowupObligations } from "../temporal/gate-readiness";
import {
  detectDefaultBranch,
  detectArchiveMode,
  deleteChangeBranch,
  resolveMainCheckout,
  finalizeRelease,
  validateChangeWorktree,
  classifyFinalizationRoute,
  coercePrWorkflowRoute,
  resolveReleaseReachability,
  detectArchivedUnmergedBranches,
  redriveArchivedUnmergedBranch,
  detectArchivedMergedBranches,
  getCheckedOutChangeBranches,
  type GitFinalizeOutcome,
} from "./archive-helpers/git-finalize";
import { dispatchPhase9Finalization } from "./archive-helpers/phase9-queue";

/**
 * Extract structured context-mismatch fields from an error, if it's an
 * AdvProjectContextMismatchError. Returns undefined for other error types.
 * GH #11: surface actionable project-context diagnostics instead of
 * opaque Temporal gRPC errors.
 */
function extractContextMismatch(error: unknown): {
  errorClass: "AdvProjectContextMismatch";
  owningProjectId: string;
  currentProjectId: string;
  hint: string;
} | void {
  if (error instanceof Error && error.name === "AdvProjectContextMismatch") {
    const e = error as Error & {
      owningProjectId?: string;
      currentProjectId?: string;
    };
    return {
      errorClass: "AdvProjectContextMismatch",
      owningProjectId: e.owningProjectId ?? "unknown",
      currentProjectId: e.currentProjectId ?? "unknown",
      hint: "This change belongs to a different project context. Open the change in its owning project, or verify linked-project configuration.",
    };
  }
}

/**
 * Pure function: merge current clarify findings with persisted snapshots.
 * Resolves stale findings and appends new ones.
 */
function resolveClarifyFindings(
  existing: ClarifyFindingSnapshot[],
  current: Array<{ code: string; severity: string; message: string }>,
  now: string,
): ClarifyFindingSnapshot[] {
  const currentCodes = new Set(current.map((f) => f.code));

  // Mark previously-persisted findings as resolved if no longer raised
  const updated: ClarifyFindingSnapshot[] = existing.map((f) =>
    !f.resolved && !currentCodes.has(f.code)
      ? { ...f, resolved: true, resolved_at: now }
      : f,
  );

  // Append new findings not yet in snapshots
  const existingCodes = new Set(existing.map((f) => f.code));
  for (const finding of current) {
    if (!existingCodes.has(finding.code)) {
      updated.push({
        code: finding.code,
        severity: finding.severity as "error" | "warning" | "info",
        message: finding.message,
        recorded_at: now,
      });
    }
  }

  return updated;
}

// rq-synthstate01: Synthetic Validation Draft Isolation
// Pattern recognition extracted to utils/synthetic-fixture-detector for reuse
// across both this tool-layer guard and the storage/json.ts saveChange disk
// guard (defense-in-depth against direct-disk-write code paths that bypass
// adv_change_create).
function isSyntheticValidationDraftSummary(summary: string): boolean {
  return isSyntheticValidationDraftPattern(summary);
}

function buildSyntheticValidationDraftError(
  summary: string,
): Record<string, string> {
  return {
    error:
      `Synthetic validation draft summary "${summary}" is reserved for parity/validation flows. ` +
      "Use isolated temp/test storage instead of live ADV state.",
  };
}

// Defensive bypass-resilience guard. Preflight in tool-arg-preflight.ts now
// normalizes blank artifact / origin_source_artifact placeholders to omitted
// before tool execution (rq-toolPlaceholderPolicy01.5), so this guard is a
// no-op on the normal preflighted path. It remains active for direct
// callers that bypass preflight (e.g. legacy or test harnesses).
function collectBlankCreateArtifactOrLinkageFields(input: {
  proposal?: string;
  problemStatement?: string;
  agreement?: string;
  design?: string;
  executiveSummary?: string;
  origin_source_artifact?: string;
}): string[] {
  return [
    { field: "proposal", value: input.proposal },
    { field: "problemStatement", value: input.problemStatement },
    { field: "agreement", value: input.agreement },
    { field: "design", value: input.design },
    { field: "executiveSummary", value: input.executiveSummary },
    { field: "origin_source_artifact", value: input.origin_source_artifact },
  ]
    .filter(
      ({ value }) =>
        value !== undefined &&
        typeof value === "string" &&
        value.trim().length === 0,
    )
    .map(({ field }) => field);
}

// Defensive bypass-resilience guard. Preflight in tool-arg-preflight.ts now
// normalizes blank-string and zero placeholders for origin_issue_number /
// origin_source_artifact to omitted before tool execution
// (rq-toolPlaceholderPolicy01.5). This function therefore no-ops for
// strict-mode-style placeholder fills, but remains active for non-strict
// callers that emit real origin-matrix violations (e.g. roadmap origin
// without origin_issue_number, adhoc origin with linkage fields).
function validateCreateOriginLinkage(input: {
  origin_kind?: ChangeOrigin["kind"];
  origin_issue_number?: number;
  origin_source_artifact?: string;
}): { error: string; fields: string[]; hint: string } | undefined {
  const hasIssue = input.origin_issue_number !== undefined;
  const hasSource = input.origin_source_artifact !== undefined;

  // rq-backlogCoord08: enforce the create-time origin linkage matrix before
  // claim checks, workflow start, or any late projection persistence.
  if (!input.origin_kind) {
    const fields = [
      ...(hasIssue ? ["origin_issue_number"] : []),
      ...(hasSource ? ["origin_source_artifact"] : []),
    ];
    if (fields.length > 0) {
      return {
        error:
          "origin_issue_number / origin_source_artifact require origin_kind to be set",
        fields,
        hint: "Pass origin_kind ('roadmap' | 'discovery' | 'triage' | 'adhoc') alongside allowed linkage fields, or omit linkage fields for an unlinked change.",
      };
    }
    return undefined;
  }

  if (input.origin_kind === "roadmap") {
    if (!hasIssue) {
      return {
        error: "origin_issue_number is required when origin_kind is 'roadmap'",
        fields: ["origin_issue_number"],
        hint: "Pass origin_issue_number with the GitHub issue number, or use origin_kind 'discovery' / 'triage' / 'adhoc' for non-roadmap-driven changes.",
      };
    }
    if (hasSource) {
      return {
        error:
          "origin_source_artifact is only allowed for triage or discovery origins.",
        fields: ["origin_source_artifact"],
        hint: "Omit origin_source_artifact for roadmap origins; the issue number is the roadmap linkage.",
      };
    }
  }

  if (input.origin_kind === "discovery" && hasIssue) {
    return {
      error:
        "origin_issue_number is only allowed for roadmap or triage origins.",
      fields: ["origin_issue_number"],
      hint: "Use origin_kind 'roadmap' or 'triage' for issue-linked changes, or omit origin_issue_number for discovery origins.",
    };
  }

  if (input.origin_kind === "adhoc") {
    const fields = [
      ...(hasIssue ? ["origin_issue_number"] : []),
      ...(hasSource ? ["origin_source_artifact"] : []),
    ];
    if (fields.length > 0) {
      return {
        error: "origin linkage fields are not allowed for adhoc origins.",
        fields,
        hint: "Omit origin_issue_number and origin_source_artifact for adhoc origins.",
      };
    }
  }

  return undefined;
}

type ChangeIssueUpdate = {
  added: string[];
  removed: string[];
  alreadyLinked: string[];
  notLinked: string[];
};

function invalidGitHubIssueUrls(urls: string[]): string[] {
  return urls.filter((value) => {
    try {
      const parsed = new URL(value);
      return !(
        parsed.protocol === "https:" &&
        parsed.hostname === "github.com" &&
        /^\/[^/]+\/[^/]+\/issues\/\d+$/.test(parsed.pathname)
      );
    } catch {
      return true;
    }
  });
}

function applyIssueUpdates(
  existing: string[] | undefined,
  add: string[] = [],
  remove: string[] = [],
): { github_issues: string[]; result: ChangeIssueUpdate } {
  const githubIssues = [...(existing ?? [])];
  const result: ChangeIssueUpdate = {
    added: [],
    removed: [],
    alreadyLinked: [],
    notLinked: [],
  };

  for (const issueUrl of add) {
    if (githubIssues.includes(issueUrl)) {
      result.alreadyLinked.push(issueUrl);
      continue;
    }
    githubIssues.push(issueUrl);
    result.added.push(issueUrl);
  }

  for (const issueUrl of remove) {
    const before = githubIssues.length;
    const next = githubIssues.filter((url) => url !== issueUrl);
    if (next.length === before) {
      result.notLinked.push(issueUrl);
      continue;
    }
    githubIssues.splice(0, githubIssues.length, ...next);
    result.removed.push(issueUrl);
  }

  return { github_issues: githubIssues, result };
}

/**
 * Build a markdown section documenting cross-project origin for a proposal.
 */
function buildOriginSection(origin: CrossProjectOrigin): string {
  let section = `## Cross-Project Origin\n\n`;
  section += `This change was created as a follow-up from **${origin.source_project}**.\n\n`;
  section += `| Field | Value |\n|-------|-------|\n`;
  section += `| Source project | ${origin.source_project} |\n`;
  section += `| Source path | \`${origin.source_path}\` |\n`;
  if (origin.source_change_id) {
    section += `| Source change | ${origin.source_change_id} |\n`;
  }
  section += `\n> **Note:** The originating project should be consulted for context on why this change is needed.\n`;
  return section;
}

async function persistClarifyFindings(
  store: Store,
  changeId: string,
  findings: ClarifyFindingSnapshot[],
  errorLabel: string,
): Promise<void> {
  try {
    const freshResult = await store.changes.get(changeId);
    if (freshResult.success && freshResult.data) {
      freshResult.data.clarify_findings = findings;
      await store.changes.save(freshResult.data);
    }
  } catch (err) {
    logger.warn(`${errorLabel}: ${(err as Error).message}`);
  }
}

async function applyClarifyReadinessToChangeOutput({
  output,
  change,
  proposalText,
  changeId,
  store,
}: {
  output: Record<string, unknown>;
  change: Change;
  proposalText: string;
  changeId: string;
  store: Store;
}): Promise<void> {
  const features = store.config?.features as FeatureFlags | undefined;
  const clarifyMode = features?.clarify_enforcement ?? "advisory";
  if (clarifyMode === "off") return;

  const clarifyResult = runClarifyReadinessChecks(change, proposalText);
  if (clarifyResult.findings.length > 0) {
    output.clarifyFindings = {
      count: clarifyResult.findings.length,
      findings: clarifyResult.findings.map((f) => ({
        code: f.code,
        severity: f.severity,
        message: f.message,
        questionCategory: f.details?.questionCategory,
      })),
    };

    const updated = resolveClarifyFindings(
      change.clarify_findings ?? [],
      clarifyResult.findings,
      new Date().toISOString(),
    );
    if (updated.length > 0) {
      await persistClarifyFindings(
        store,
        changeId,
        updated,
        "Failed to persist clarify findings",
      );
    }
    return;
  }

  if (change.clarify_findings?.some((f) => !f.resolved)) {
    const updated = resolveClarifyFindings(
      change.clarify_findings ?? [],
      [],
      new Date().toISOString(),
    );
    await persistClarifyFindings(
      store,
      changeId,
      updated,
      "Failed to resolve clarify findings",
    );
  }
}

async function appendClarifyNeededForCreatedChange(
  store: Store,
  changeId: string,
  output: Record<string, unknown>,
): Promise<void> {
  const features = store.config?.features as FeatureFlags | undefined;
  const clarifyMode = features?.clarify_enforcement ?? "advisory";
  if (clarifyMode === "off") return;

  const changeResult = await store.changes.get(changeId);
  if (!changeResult.success || !changeResult.data) return;

  const { content: proposalText } = await loadProposalForContext(
    store,
    changeId,
    changeResult.data.title,
  );
  const clarifyResult = runClarifyReadinessChecks(
    changeResult.data,
    proposalText,
  );
  if (clarifyResult.findings.length === 0) return;

  output.clarifyNeeded = {
    count: clarifyResult.findings.length,
    findings: clarifyResult.findings.map((f) => ({
      code: f.code,
      severity: f.severity,
      message: f.message,
      questionCategory: f.details?.questionCategory,
    })),
  };
}

async function createCrossProjectFollowUp({
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
  store,
}: {
  summary: string;
  capability?: string;
  proposal?: string;
  problemStatement?: string;
  agreement?: string;
  design?: string;
  executiveSummary?: string;
  target_path: string;
  target_confirmed?: true;
  confirmationEvidence?: string;
  source_project?: string;
  source_change_id?: string;
  store: Store;
}): Promise<string> {
  const validateNotCurrentProject = async (): Promise<string | null> => {
    try {
      const [realTarget, realRoot] = await Promise.all([
        realpath(target_path),
        realpath(store.paths.root),
      ]);
      if (realTarget === realRoot) {
        return formatToolOutput({
          error:
            "Target path resolves to current project. Omit target_path to create a change in the current project.",
        });
      }
    } catch {
      // fall through — store creation will surface truly invalid paths
    }

    return null;
  };

  const validationError = await validateNotCurrentProject();
  if (validationError) return validationError;

  const resolvedSourceProject =
    source_project ?? store.config?.name ?? basename(store.paths.root);
  const origin: CrossProjectOrigin = {
    source_project: resolvedSourceProject,
    source_path: store.paths.root,
    source_change_id,
    linked_at: new Date().toISOString(),
  };
  const originSection = buildOriginSection(origin);
  const enrichedProposal = proposal
    ? `${originSection}\n\n${proposal}`
    : undefined;
  try {
    return await withTargetPathStore(
      {
        currentProjectPath: store.paths.root,
        target_path,
        stateRequirement: "temporal-required",
        target_confirmed,
        confirmationEvidence,
      },
      async ({ context, store: targetStore }) => {
        const result = await targetStore.changes.create(summary, {
          capability,
          artifacts: {
            ...(enrichedProposal !== undefined
              ? { proposal: enrichedProposal }
              : {}),
            ...(problemStatement !== undefined ? { problemStatement } : {}),
            ...(agreement !== undefined ? { agreement } : {}),
            ...(design !== undefined ? { design } : {}),
            ...(executiveSummary !== undefined ? { executiveSummary } : {}),
          },
          initialMetadata: { cross_project_origin: origin },
        });

        const output: Record<string, unknown> = {
          ...result,
          cross_project_origin: origin,
          target_path,
          _projectContext: formatTargetProjectContext(context),
        };
        if (result.duplicateWarning) {
          output._duplicateWarning = result.duplicateWarning;
        }

        if (source_change_id) {
          const sourceResult = await store.changes.get(source_change_id);
          if (sourceResult.success && sourceResult.data) {
            const sourceChange = sourceResult.data;
            const links = sourceChange.cross_project_links ?? [];
            const duplicate = links.some(
              (link) =>
                link.target_path === target_path &&
                link.changeId === result.changeId,
            );
            if (!duplicate) {
              links.push({
                target_path,
                target_project_id: context.projectId,
                changeId: result.changeId,
                relationship: "follow_up",
                linked_at: origin.linked_at,
              });
              sourceChange.cross_project_links = links;
              await store.changes.save(sourceChange);
            }
          }
        }

        return formatToolOutput(output);
      },
    );
  } catch (err) {
    return formatToolOutput({
      error: `Failed to create target project change at ${target_path}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function validateParentChange(
  store: Store,
  parentChangeId: string,
): Promise<{ ok: true } | { ok: false; validParentIds: string[] }> {
  const parent = await store.changes.get(parentChangeId);
  if (parent.success && parent.data) return { ok: true };

  const list = await store.changes.list({
    includeArchived: true,
    includeClosed: true,
  });
  return {
    ok: false,
    validParentIds: list.changes.map((change) => change.id),
  };
}

function resolveScopeRepos(
  store: Store,
  explicitScope?: ChangeRepoScope[],
): { ok: true; scope?: ChangeRepoScope[] } | { ok: false; error: string } {
  const productContext = store.productContext;
  if (!productContext || productContext.mode === "single_repo") {
    return explicitScope?.length
      ? { ok: true, scope: explicitScope }
      : { ok: true };
  }

  try {
    const requested = explicitScope?.length
      ? explicitScope
      : [{ repo_id: productContext.currentRepoId, required: true }];
    const seen = new Set<string>();
    const mergeOrders = new Set<number>();
    const scope = requested.map((entry) => {
      if (seen.has(entry.repo_id)) {
        throw new Error(`Duplicate scope_repos repo_id: ${entry.repo_id}`);
      }
      seen.add(entry.repo_id);

      if (entry.merge_order !== undefined) {
        if (mergeOrders.has(entry.merge_order)) {
          throw new Error(
            `Duplicate scope_repos merge_order: ${entry.merge_order}`,
          );
        }
        mergeOrders.add(entry.merge_order);
      }

      const repo = productContext.repos[entry.repo_id];
      if (!repo) {
        throw new Error(`Unknown scope_repos repo_id: ${entry.repo_id}`);
      }

      return {
        ...entry,
        path: entry.path ?? repo.root,
        repo_project_id: entry.repo_project_id ?? repo.repoProjectId,
        role: entry.role ?? repo.productRole,
        required: entry.required ?? true,
      };
    });

    return { ok: true, scope };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

async function filterChangesForProductScope<T extends { id: string }>(
  changes: T[],
  store: Store,
  scope: "repo" | "product" | undefined,
): Promise<T[]> {
  const productContext = store.productContext;
  if (!productContext || productContext.mode === "single_repo") return changes;
  if (scope === "product") return changes;

  const scoped: T[] = [];
  for (const change of changes) {
    const full = await store.changes.get(change.id);
    if (!full.success || !full.data?.scope_repos?.length) {
      scoped.push(change);
      continue;
    }
    if (
      full.data.scope_repos.some(
        (repo) => repo.repo_id === productContext.currentRepoId,
      )
    ) {
      scoped.push(change);
    }
  }
  return scoped;
}

function productContextOutput(
  store: Store,
  scope: "repo" | "product" | undefined,
): Record<string, unknown> | undefined {
  const context = store.productContext;
  if (!context || context.mode === "single_repo") return undefined;
  return {
    productId: context.productId,
    productProjectId: context.productProjectId,
    currentRepoId: context.currentRepoId,
    repoProjectId: context.repoProjectId,
    primaryRepoId: context.primaryRepoId,
    mode: context.mode,
    scope: scope ?? "repo",
    ...(context.degraded !== undefined && { degraded: context.degraded }),
    ...(context.readOnly !== undefined && { readOnly: context.readOnly }),
    ...(context.warning !== undefined && { warning: context.warning }),
  };
}

/**
 * Build the validator input bundle for a change.
 *
 * Specs stay loaded from the current worktree through the store. When the
 * current root is a git worktree, this also computes merge-base-aware spec
 * divergence against the default branch so validation can warn only on real
 * branch-local spec changes.
 */
async function loadValidationContext(
  store: Store,
  changeId: string,
  changeTitle: string,
): Promise<{
  specs: Spec[];
  activeChanges: { id: string; title: string; capabilities: string[] }[];
  proposalText: string;
  changedSpecFiles: string[] | null | undefined;
}> {
  const specList = await store.specs.list();
  const specs: Spec[] = [];
  for (const specInfo of specList.specs) {
    const specResult = await store.specs.get(specInfo.name);
    if (specResult.success && specResult.data) {
      specs.push(specResult.data);
    }
  }

  const changeList = await store.changes.list({ includeArchived: false });
  const activeChanges = changeList.changes
    .filter((c) => c.id !== changeId)
    .map((c) => ({ id: c.id, title: c.title, capabilities: [] as string[] }));

  for (const activeChange of activeChanges) {
    // Fix 5 (rq fixMultiSessionTemporalState / AC7): a peer change whose
    // Temporal workflow was evicted/terminated (its disk projection may
    // still exist) makes store.changes.get throw WorkflowNotFoundError when
    // disk re-seed also fails. A dangling peer must NOT block a healthy
    // change's validate/archive — listResolvedChanges already tolerates this
    // in the list path; this is the matching guard for the validation-context
    // read path. Skip the unrecoverable peer: it contributes no known
    // capabilities to conflict detection. This guard intentionally only
    // tolerates per-peer hydration failures and never suppresses validation
    // errors for the target change (constraint C5).
    try {
      const fullChangeResult = await store.changes.get(activeChange.id);
      if (fullChangeResult.success && fullChangeResult.data) {
        activeChange.capabilities = Object.keys(fullChangeResult.data.deltas);
      }
    } catch (err) {
      logger.warn(
        `Validation context: skipping peer change ${activeChange.id} (workflow unavailable): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  const { content: proposalText } = await loadProposalForContext(
    store,
    changeId,
    changeTitle,
  );

  // Detect worktree and compute merge-base-aware spec divergence
  let changedSpecFiles: string[] | null | undefined = undefined;
  try {
    const gitPath = join(store.paths.root, ".git");
    const gitStat = await stat(gitPath);
    if (gitStat.isFile()) {
      const gitFile = await readFile(gitPath, "utf-8");
      if (gitFile.includes("gitdir:")) {
        // We're in a worktree — compute spec divergence
        changedSpecFiles = await computeChangedSpecFiles(store.paths.root);
      }
    }
  } catch {
    // best-effort only — changedSpecFiles stays undefined (not in worktree)
  }

  return { specs, activeChanges, proposalText, changedSpecFiles };
}

/**
 * Compute spec files that differ between current HEAD and the merge-base
 * with the default branch. Returns string[] of changed paths, or null on
 * failure (detached HEAD, shallow clone, no default branch).
 */
async function computeChangedSpecFiles(
  rootDir: string,
): Promise<string[] | null> {
  try {
    const defaultBranch = await getDefaultBranch(rootDir);
    const raw = await execGit(
      ["diff", "--name-only", `${defaultBranch}...HEAD`, "--", ".adv/specs/"],
      rootDir,
    );
    const files = raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    return files;
  } catch {
    // Degraded: detached HEAD, no default branch, shallow clone, etc.
    return null;
  }
}

function getArchiveTaskPreflightError(change: {
  tasks: { id: string; title: string; status: string }[];
}): string | null {
  const incompleteTasks = change.tasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled",
  );
  if (incompleteTasks.length > 0) {
    return formatToolOutput({
      error: "Cannot archive: incomplete tasks",
      incompleteTasks: incompleteTasks.map((t) => ({
        id: t.id,
        title: t.title,
      })),
    });
  }

  return null;
}

type ArchiveGateState = {
  effectiveGates: Gates;
  storeGates: Gates;
  source: "store" | "live";
  liveGates?: Gates;
  liveQueryError?: string;
};

async function resolveArchiveGateState(
  store: Store,
  changeId: string,
  change: { gates?: Gates },
): Promise<ArchiveGateState> {
  const storeGates = change.gates ?? createDefaultGates();
  const bundle = getService();
  const projectId = bundle ? await getProjectId(store.paths.root) : null;

  if (!bundle || !projectId) {
    return { effectiveGates: storeGates, storeGates, source: "store" };
  }

  try {
    const handle = getChangeHandle(bundle.client, projectId, changeId);
    const queriedGates = await querySignal<Gates>(
      handle,
      getGateStatusQuery,
      undefined,
    );
    if (queriedGates && typeof queriedGates === "object") {
      // Live Temporal gates are authoritative. When they disagree with store
      // gates, getGateDivergenceHint surfaces the mismatch so the user can
      // recover (e.g., manual /adv-gate-complete to sync stale state).
      return {
        effectiveGates: queriedGates,
        storeGates,
        source: "live",
        liveGates: queriedGates,
      };
    }
  } catch (error) {
    return {
      effectiveGates: storeGates,
      storeGates,
      source: "store",
      liveQueryError: collectErrorText(error),
    };
  }

  return { effectiveGates: storeGates, storeGates, source: "store" };
}

function getArchiveGatePreflightError(
  changeId: string,
  gateState: ArchiveGateState,
  allowReleasePending: boolean,
  divergenceHint?: string | null,
): string | null {
  const gates = gateState.effectiveGates;
  // rq-releaseFinalization01: archive may run with release gate pending.
  // Finalization creates the reachability/push evidence required to complete
  // the release gate, which is then done after archive succeeds.
  const incompleteGates = allowReleasePending
    ? GATE_ORDER.filter(
        (gateId) => gateId !== "release" && !isGateSatisfied(gates[gateId]),
      )
    : getIncompleteGates(gates);
  if (incompleteGates.length > 0) {
    const fallbackHint = `Run /adv-gate-status ${changeId} to see gate details`;
    const hint = [
      fallbackHint,
      gateState.liveQueryError
        ? `Live gate-status query failed: ${gateState.liveQueryError}`
        : null,
      divergenceHint ?? null,
    ]
      .filter(Boolean)
      .join(" ");

    return formatToolOutput({
      error:
        "Cannot archive: incomplete gates. Complete all quality gates before archiving.",
      incompleteGates,
      gateStateSource: gateState.source,
      storeIncompleteGates: getIncompleteGates(gateState.storeGates),
      ...(gateState.liveGates
        ? { liveIncompleteGates: getIncompleteGates(gateState.liveGates) }
        : {}),
      ...(gateState.liveQueryError
        ? { liveQueryError: gateState.liveQueryError }
        : {}),
      hint,
    });
  }

  return null;
}

// rq-releaseFinalization01: release gate confirmation must be durable.
async function waitForArchiveReleaseGateCompletion(
  handle: ReturnType<typeof getChangeHandle>,
): Promise<GateCompletion | undefined> {
  return waitForGateCompletion(handle, "release");
}

function buildReleaseCompletionEvidence(
  finalization: GitFinalizeOutcome,
): string {
  const details = [
    `defaultBranch=${finalization.defaultBranch}`,
    `mainCheckout=${finalization.mainCheckout}`,
    `pushStatus=${finalization.pushStatus}`,
    finalization.mergeCommitSha
      ? `mergeCommitSha=${finalization.mergeCommitSha}`
      : null,
    finalization.mainCheckpointCommitSha
      ? `mainCheckpointCommitSha=${finalization.mainCheckpointCommitSha}`
      : null,
    finalization.prBranch ? `prBranch=${finalization.prBranch}` : null,
    finalization.prNumber ? `prNumber=${finalization.prNumber}` : null,
    finalization.prUrl ? `prUrl=${finalization.prUrl}` : null,
    finalization.route ? `route=${finalization.route}` : null,
  ].filter(Boolean);
  return `Phase 9 finalization ${finalization.status}; ${details.join("; ")}`;
}

function buildPendingMergePhase9Status(input: {
  finalization: GitFinalizeOutcome;
  startedAt: string;
}): Phase9FinalizationStatus {
  return {
    status: "pending_merge",
    startedAt: input.startedAt,
    prNumber: input.finalization.prNumber,
    prUrl: input.finalization.prUrl,
    autoMergeArmed: input.finalization.autoMergeArmed,
    route: input.finalization.route,
  };
}

function buildFailedPhase9Classification(input: {
  change: Change;
  finalization: GitFinalizeOutcome;
}):
  | {
      phase9Failure: {
        status: "failed";
        error?: string;
        blocker?: string;
        recoverable: false;
        remediation?: string;
        details?: string[];
      };
    }
  | Record<string, never> {
  // rq-archiveRecoveryConsistency01: failed Phase 9 recovery without
  // structural release proof must classify the blocker and fail closed.
  const phase9Status = input.change.phase9_status;
  if (phase9Status?.status !== "failed") {
    return {};
  }
  const blocked =
    input.finalization.status === "blocked"
      ? input.finalization.blocked
      : undefined;
  return {
    phase9Failure: {
      status: "failed",
      error: phase9Status.error,
      blocker: blocked?.reason,
      recoverable: false,
      remediation: blocked?.remediation,
      details: blocked?.details,
    },
  };
}

async function recordPhase9Status(input: {
  store: Store;
  changeId: string;
  status: Phase9FinalizationStatus;
}): Promise<void> {
  const bundle = getService();
  if (!bundle) {
    throw new Error("Temporal service not available for phase9 status update");
  }
  const projectId = await getProjectId(input.store.paths.root);
  if (!projectId) {
    throw new Error("Could not resolve project ID for phase9 status update");
  }
  const handle = getChangeHandle(bundle.client, projectId, input.changeId);
  await fireSignalAndRefresh(
    handle,
    input.store,
    input.changeId,
    phase9StatusUpdatedSignal,
    {
      phase9_status: input.status,
      updatedAt: new Date().toISOString(),
    },
  );
}

async function projectEpicTerminalSummaryAfterArchive(input: {
  store: Store;
  change: Change;
  completedAt: string;
}): Promise<
  | { status: "not_applicable" }
  | { status: "recorded"; epicId: string; entryId: string }
  | { status: "warning"; epicId: string; entryId: string; error: string }
> {
  const membership = input.change.epic_membership;
  if (!membership) return { status: "not_applicable" };

  try {
    await input.store.epics.setEntryTerminalSummary(membership.epic_id, {
      entryId: membership.entry_id,
      status: "archived",
      completedAt: input.completedAt,
    });
    return {
      status: "recorded",
      epicId: membership.epic_id,
      entryId: membership.entry_id,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn(
      `archive epic terminal projection: failed to update ${membership.epic_id}/${membership.entry_id} for ${input.change.id}: ${error}`,
    );
    return {
      status: "warning",
      epicId: membership.epic_id,
      entryId: membership.entry_id,
      error,
    };
  }
}

/**
 * Verify Phase 9 release evidence from the main checkout when the original
 * change worktree is already gone. Used only for existing-bundle retries; it
 * mirrors finalizeRelease's release proof without merging or pushing again.
 */
function verifyReleaseEvidenceFromMain(input: {
  store: Store;
  changeId: string;
  archiveMode: "direct" | "pr";
  change?: Change;
}): GitFinalizeOutcome {
  const mainCheckout = input.store.paths.root;
  const { branch: defaultBranch } = detectDefaultBranch(mainCheckout);

  const classifiedRoute = classifyFinalizationRoute(
    mainCheckout,
    defaultBranch,
  );
  const route =
    input.archiveMode === "pr" ||
    input.change?.phase9_status?.status === "pending_merge"
      ? coercePrWorkflowRoute(classifiedRoute)
      : classifiedRoute;
  const reachability = resolveReleaseReachability({
    mainCheckout,
    defaultBranch,
    changeId: input.changeId,
    route,
    prNumber: input.change?.phase9_status?.prNumber,
  });
  if (reachability.reachable) {
    return {
      status: "shipped",
      mainCheckout,
      defaultBranch,
      route: route.route,
      mergeCommitSha:
        reachability.proof === "pr_merged"
          ? reachability.mergeCommitOid
          : undefined,
      prNumber: reachability.prNumber,
      prUrl: input.change?.phase9_status?.prUrl,
      autoMergeArmed: false,
      pushStatus: "pushed",
    };
  }

  if (reachability.proof === "origin_push_unverified") {
    return {
      status: "blocked",
      mainCheckout,
      defaultBranch,
      route: route.route,
      pushStatus: "failed",
      pushFailureReason: reachability.details?.join("; "),
      blocked: {
        reason: "DEFAULT_BRANCH_PUSH_NOT_VERIFIED",
        remediation: `Default branch ${defaultBranch} must be pushed before release completion (rq-releaseFinalization01).`,
        details: reachability.details,
      },
    };
  }

  if (reachability.proof === "pr_unmerged") {
    return {
      status: "blocked",
      mainCheckout,
      defaultBranch,
      route: route.route,
      pushStatus: "pushed",
      prBranch: `change/${input.changeId}`,
      prNumber: reachability.prNumber,
      prUrl: input.change?.phase9_status?.prUrl,
      autoMergeArmed: reachability.autoMergeArmed,
      blocked: {
        reason: reachability.autoMergeArmed
          ? "PR_PENDING_AUTO_MERGE"
          : "PR_NOT_MERGED",
        remediation: `PR for change/${input.changeId} must be merged before release completion (rq-releaseFinalization01).`,
        details: reachability.details,
      },
    };
  }

  return {
    status: "blocked",
    mainCheckout,
    defaultBranch,
    route: route.route,
    pushStatus: "not_attempted",
    blocked: {
      reason:
        reachability.proof === "origin_unmerged"
          ? "CHANGE_BRANCH_NOT_REACHABLE_FROM_ORIGIN"
          : "CHANGE_BRANCH_NOT_REACHABLE",
      remediation: `Change branch change/${input.changeId} must be reachable from ${route.route === "no_remote" ? defaultBranch : `origin/${defaultBranch}`} before release completion (rq-releaseFinalization01).`,
      details: reachability.details,
    },
  };
}

type ArchiveReleaseGateResult =
  | {
      ok: true;
      gate: GateCompletion;
      alreadyDone: boolean;
      recoveryMutation?: boolean;
      reconciliationWarning?: string;
    }
  | {
      ok: false;
      error: string;
      workflowGateStatus?: GateCompletion["status"];
      readinessBlockers?: GateCompletion["readiness_blockers"];
      stuckReason?: GateCompletion["stuck_reason"];
    };

/**
 * Repair only the release-gate disk projection after structural Phase 9
 * evidence exists but the change workflow has already completed. The caller
 * must pass completed-workflow evidence so disk-direct recovery remains
 * auditable instead of becoming an unguarded state bypass.
 */
async function recoverReleaseGateViaDiskProjection(input: {
  store: Store;
  change: Change;
  evidence: string;
  recoveryEvidence: string;
}): Promise<Extract<ArchiveReleaseGateResult, { ok: true }>> {
  const { RECOVERY_RECONCILIATION_WARNING } =
    await import("../temporal/recovery-classification");
  const { saveRecoveredGateCompletion } = await import("./_recovery-writers");
  const completion: GateCompletion = {
    status: "done",
    completed_at: new Date().toISOString(),
    completed_by: "adv-archive",
    approval_evidence: input.evidence,
  };
  const updated = await saveRecoveredGateCompletion({
    store: input.store,
    change: input.change,
    authorization: {
      reason: "completed_workflow_release_gate_recovery",
      evidence: `${input.recoveryEvidence}; ${input.evidence}`,
    },
    gateId: "release",
    completion,
  });
  return {
    ok: true,
    gate: updated.gates?.release ?? completion,
    alreadyDone: false,
    recoveryMutation: true,
    reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
  };
}

/**
 * Single source of truth for the completed-workflow recovery dance used by the
 * archive release-gate completion path (STRUCT-002). Classifies the error; on a
 * completed/poisoned workflow it recovers the release gate via disk projection,
 * otherwise it rethrows. Replaces three byte-identical inline catch blocks.
 */
async function recoverReleaseGateIfWorkflowCompleted(
  error: unknown,
  ctx: { store: Store; change: Change; evidence: string },
): Promise<Extract<ArchiveReleaseGateResult, { ok: true }>> {
  const { isWorkflowCompletedError } =
    await import("../temporal/recovery-classification");
  if (isWorkflowCompletedError(error)) {
    return recoverReleaseGateViaDiskProjection({
      store: ctx.store,
      change: ctx.change,
      evidence: ctx.evidence,
      recoveryEvidence: collectErrorText(error),
    });
  }
  throw error;
}

type DurableReleaseGateProofResult =
  | { ok: true; gate: GateCompletion }
  | {
      ok: false;
      error: string;
      releaseGateStatus?: GateCompletion["status"];
      readinessBlockers?: GateCompletion["readiness_blockers"];
      stuckReason?: GateCompletion["stuck_reason"];
    };

function releaseGateEvidenceMatches(
  gate: GateCompletion | undefined,
  evidence: string,
): boolean {
  return (
    typeof gate?.approval_evidence === "string" &&
    gate.approval_evidence.includes(evidence)
  );
}

async function verifyReleaseGateDurableForArchive(input: {
  store: Store;
  changeId: string;
  evidence: string;
}): Promise<DurableReleaseGateProofResult> {
  let gates: Gates | null;
  try {
    gates = await input.store.gates.get(input.changeId);
  } catch (error) {
    return {
      ok: false,
      error: `Store-backed release gate read failed: ${collectErrorText(error)}`,
    };
  }

  const releaseGate = gates?.release;
  if (releaseGate?.status !== "done") {
    return {
      ok: false,
      error:
        "Store-backed durable release gate proof did not observe release done",
      releaseGateStatus: releaseGate?.status,
      readinessBlockers: releaseGate?.readiness_blockers,
      stuckReason: releaseGate?.stuck_reason,
    };
  }

  if (!releaseGateEvidenceMatches(releaseGate, input.evidence)) {
    return {
      ok: false,
      error:
        "Store-backed durable release gate proof lacks matching Phase 9 evidence",
      releaseGateStatus: releaseGate.status,
      readinessBlockers: releaseGate.readiness_blockers,
      stuckReason: releaseGate.stuck_reason,
    };
  }

  return { ok: true, gate: releaseGate };
}

/**
 * Record the release gate after Phase 9 returns shipped evidence and
 * before archive status retires the workflow. Each Temporal interaction can
 * race a completed workflow, so query, signal, and confirmation poll all route
 * completed-workflow failures through disk-projection recovery.
 */
async function completeReleaseGateAfterFinalization(input: {
  store: Store;
  change: Change;
  changeId: string;
  finalization: GitFinalizeOutcome;
}): Promise<ArchiveReleaseGateResult> {
  if (input.finalization.status !== "shipped") {
    return {
      ok: false,
      error: `Release gate requires successful Phase 9 finalization, got ${input.finalization.status}`,
    };
  }

  const bundle = getService();
  if (!bundle) {
    return {
      ok: false,
      error: "Temporal service not available for release gate completion",
    };
  }
  const projectId = await getProjectId(input.store.paths.root);
  if (!projectId) {
    return {
      ok: false,
      error: "Could not resolve project ID for release gate completion",
    };
  }

  const handle = getChangeHandle(bundle.client, projectId, input.changeId);
  const evidence = buildReleaseCompletionEvidence(input.finalization);
  let currentGate: GateCompletion | undefined;
  try {
    currentGate = await querySignal<GateCompletion>(
      handle,
      getGateStatusQuery,
      "release",
    );
  } catch (error) {
    return recoverReleaseGateIfWorkflowCompleted(error, {
      store: input.store,
      change: input.change,
      evidence,
    });
  }
  if (currentGate?.status === "done") {
    return { ok: true, gate: currentGate, alreadyDone: true };
  }

  try {
    await fireSignalAndRefresh(
      handle,
      input.store,
      input.changeId,
      gateCompletedSignal,
      {
        gateId: "release",
        completedBy: "adv-archive",
        completedAt: new Date().toISOString(),
        approvalEvidence: evidence,
      },
    );
  } catch (error) {
    return recoverReleaseGateIfWorkflowCompleted(error, {
      store: input.store,
      change: input.change,
      evidence,
    });
  }

  let postSignalGate: GateCompletion | undefined;
  try {
    postSignalGate = await waitForArchiveReleaseGateCompletion(handle);
  } catch (error) {
    return recoverReleaseGateIfWorkflowCompleted(error, {
      store: input.store,
      change: input.change,
      evidence,
    });
  }
  if (postSignalGate?.status === "done") {
    return { ok: true, gate: postSignalGate, alreadyDone: false };
  }
  return {
    ok: false,
    error: "Cannot confirm release gate completion from workflow state",
    workflowGateStatus: postSignalGate?.status,
    readinessBlockers: postSignalGate?.readiness_blockers,
    stuckReason: postSignalGate?.stuck_reason,
  };
}

/**
 * Detect disk/Temporal gate divergence for the incomplete-gates archive
 * preflight path. If the on-disk change.json shows all gates satisfied but
 * the store-backed change object does not, the Temporal workflow state is
 * stale relative to disk — typically after a manual gate fix or recovery.
 */
async function getGateDivergenceHint(
  store: Store,
  changeId: string,
  change: { gates?: ReturnType<typeof createDefaultGates> },
): Promise<string | null> {
  const storeGates = change.gates ?? createDefaultGates();
  if (allGatesSatisfied(storeGates)) {
    return null; // No divergence — store already sees gates done
  }

  const diskResult = await loadChange(store.paths.changes, changeId);
  if (!diskResult.success || !diskResult.data) {
    return null; // Can't read disk — degrade gracefully
  }

  const diskGates = diskResult.data.gates ?? createDefaultGates();
  if (allGatesSatisfied(diskGates)) {
    return `Disk shows gates done but Temporal sees them incomplete. Run \`adv_change_show changeId: ${changeId}\` and \`adv_gate_status changeId: ${changeId}\` to inspect, then \`adv_temporal_diagnose changeId: ${changeId}\` for recovery guidance.`;
  }

  return null; // Both agree gates are incomplete
}

const ARCHIVE_SEARCH_ATTRIBUTE_RECOVERY_HINT =
  "Run adv_temporal_diagnose. If search attributes are missing or unverified, run adv_temporal_register_search_attributes, then adv_temporal_worker_restart (worker process only), then retry archive. Restart OpenCode for plugin tool-code drift; worker restart does not reload plugin/src/tools/*.ts.";

function isSearchAttributeArchiveFailure(errorText: string): boolean {
  return /search attribute|SearchAttribute|upsertSearchAttributes|AdvChangeStatus|AdvChangeId/i.test(
    errorText,
  );
}

type StatusRepairReadback = {
  showStatus?: Change["status"];
  inFlightCount: number;
  archivedCount: number;
};

type StatusRepairReadbackResult =
  | { ok: true; readback: StatusRepairReadback }
  | { ok: false; error: string; readback: StatusRepairReadback };

async function verifyStatusRepairReadAfterWrite(input: {
  store: Store;
  changeId: string;
}): Promise<StatusRepairReadbackResult> {
  let showResult: Awaited<ReturnType<Store["changes"]["get"]>>;
  let inFlight: Awaited<ReturnType<Store["changes"]["list"]>>;
  let archived: Awaited<ReturnType<Store["changes"]["list"]>>;
  try {
    showResult = await input.store.changes.get(input.changeId);
    [inFlight, archived] = await Promise.all([
      // `in-flight` is a tool-layer union, not a persisted status. The
      // default list surface is the durable draft/pending/active projection.
      input.store.changes.list({}),
      input.store.changes.list({ status: "archived", includeArchived: true }),
    ]);
  } catch (error) {
    const readback = {
      inFlightCount: -1,
      archivedCount: -1,
    } satisfies StatusRepairReadback;
    return {
      ok: false,
      error: `readback threw: ${collectErrorText(error)}`,
      readback,
    };
  }
  const showStatus = showResult.success
    ? (showResult.data?.status as Change["status"] | undefined)
    : undefined;
  const inFlightCount = inFlight.changes.filter(
    (change) => change.id === input.changeId,
  ).length;
  const archivedCount = archived.changes.filter(
    (change) => change.id === input.changeId,
  ).length;
  const readback: StatusRepairReadback = {
    showStatus,
    inFlightCount,
    archivedCount,
  };
  const failures: string[] = [];
  if (showStatus !== "archived") {
    failures.push(
      `adv_change_show-equivalent status is ${showStatus ?? "missing"}`,
    );
  }
  if (inFlightCount !== 0) {
    failures.push(
      `in-flight list contains ${input.changeId} ${inFlightCount} time(s)`,
    );
  }
  if (archivedCount !== 1) {
    failures.push(
      `archived list contains ${input.changeId} ${archivedCount} time(s)`,
    );
  }
  if (failures.length > 0) {
    return { ok: false, error: failures.join("; "), readback };
  }
  return { ok: true, readback };
}

async function loadSpecsMap(store: Store): Promise<Map<string, Spec>> {
  const specList = await store.specs.list();
  const specs = new Map<string, Spec>();
  for (const specInfo of specList.specs) {
    const specResult = await store.specs.get(specInfo.name);
    if (specResult.success && specResult.data) {
      specs.set(specInfo.name, specResult.data);
    }
  }
  return specs;
}

async function buildReentryResult(
  store: Store,
  changeId: string,
  fromGate: GateId,
): Promise<string> {
  const gates = await store.gates.get(changeId);
  const updatedChange = await store.changes.get(changeId);
  const reentryHistory =
    updatedChange.success && updatedChange.data
      ? (updatedChange.data.reentry_history ?? [])
      : [];
  const latestEntry = reentryHistory[reentryHistory.length - 1];

  // Build context snapshot showing the reset gate state
  let contextSnapshot: string | undefined;
  if (updatedChange.success && updatedChange.data) {
    const { content: proposalText } = await loadProposalForContext(
      store,
      changeId,
      updatedChange.data.title,
    );
    contextSnapshot = buildChangeContextSnapshot({
      change: updatedChange.data,
      proposalText,
      gates: gates ?? undefined,
      workdir: store.paths.root,
    });
  }

  const output: Record<string, unknown> = {
    success: true,
    message: `Re-entry from ${fromGate}: gates reset to pending. ${latestEntry?.gates_reset?.length ?? 0} gate(s) reopened.`,
    gates,
    reentry: latestEntry,
  };
  if (contextSnapshot) {
    output._contextSnapshot = contextSnapshot;
  }

  return formatToolOutput(output);
}

// =============================================================================
// Linked Issue Closure
// =============================================================================

export interface CloseLinkedIssueResult {
  close_eligible?: boolean;
  issue_closed: number[];
  issue_closure_error?: {
    issue_number: number;
    exitCode: number;
    stderr: string;
    manualCommand: string;
  };
  dryRun?: boolean;
}

export async function closeLinkedIssue(options: {
  change: Change;
  store: Store;
  noCloseIssue?: boolean;
  dryRun?: boolean;
  existingBundlePath?: string;
  worktreePath?: string;
}): Promise<CloseLinkedIssueResult> {
  const {
    change,
    store,
    noCloseIssue,
    dryRun,
    existingBundlePath,
    worktreePath,
  } = options;

  const kind = change.origin?.kind;
  const issueNumber = change.origin?.issue_number;
  if (
    !kind ||
    !["roadmap", "triage"].includes(kind) ||
    !issueNumber ||
    issueNumber <= 0
  ) {
    return { issue_closed: [] };
  }

  if (noCloseIssue) {
    return { close_eligible: true, issue_closed: [] };
  }

  if (dryRun) {
    return { close_eligible: true, issue_closed: [], dryRun: true };
  }

  const ghConfig = await readGitHubProjectConfig(
    store.paths.root,
    store.paths.external ?? null,
  );

  const cwd = worktreePath ?? store.paths.root;

  // Determine if --repo flag is needed
  let repoFlag: string | undefined;
  if (ghConfig?.owner && ghConfig?.repository_filter) {
    const configRepo = `${ghConfig.owner}/${ghConfig.repository_filter}`;
    let currentRepoStr: string | undefined;
    try {
      const remoteUrl = (
        await execGit(["remote", "get-url", "origin"], cwd)
      ).trim();
      const parsed = parseGitRemoteUrl(remoteUrl);
      if (parsed) {
        currentRepoStr = `${parsed.owner}/${parsed.name}`;
      }
    } catch {
      // ignore
    }
    if (!currentRepoStr || currentRepoStr !== configRepo) {
      repoFlag = configRepo;
    }
  }

  // Get short SHA for comment
  let shortSha = "unknown";
  try {
    shortSha = (await execGit(["rev-parse", "--short", "HEAD"], cwd)).trim();
  } catch {
    // silently use "unknown"
  }

  // Post comment unless re-archive
  if (!existingBundlePath) {
    const commentText = `Shipped via ${change.id} (${shortSha})`;
    const commentArgs = [
      "issue",
      "comment",
      String(issueNumber),
      "--body",
      commentText,
    ];
    if (repoFlag) {
      commentArgs.push("--repo", repoFlag);
    }
    await execGh(commentArgs, cwd);
    // Comment errors are non-fatal; continue to close
  }

  // Close the issue
  const closeArgs = [
    "issue",
    "close",
    String(issueNumber),
    "--reason",
    "completed",
  ];
  if (repoFlag) {
    closeArgs.push("--repo", repoFlag);
  }
  const closeResult = await execGh(closeArgs, cwd);

  if (closeResult.ghNotFound) {
    return { close_eligible: true, issue_closed: [] };
  }

  if (closeResult.exitCode !== 0) {
    const manualCommand = `gh issue close ${issueNumber} --reason completed${repoFlag ? ` --repo ${repoFlag}` : ""}`;
    return {
      issue_closed: [],
      issue_closure_error: {
        issue_number: issueNumber,
        exitCode: closeResult.exitCode,
        stderr: closeResult.stderr,
        manualCommand,
      },
    };
  }

  return { close_eligible: true, issue_closed: [issueNumber] };
}

type ChangeCloseRecoveryMode = "normal" | "poisoned_history";

interface ChangeClosePayloadInput {
  approvalEvidence: string;
  reason: "cancelled" | "superseded" | "not_planned";
  supersededBy?: string;
  cancelledAt: string;
}

function buildChangeClosePayload(input: ChangeClosePayloadInput) {
  return {
    approvalEvidence: input.approvalEvidence,
    reason: input.reason,
    supersededBy: input.supersededBy,
    cancelledBy: "agent",
    cancelledAt: input.cancelledAt,
  };
}

function buildChangeClosure(input: ChangeClosePayloadInput): Change["closure"] {
  return {
    reason: input.reason,
    approved_by_user: true,
    approval_evidence: input.approvalEvidence,
    approved_at: input.cancelledAt,
    superseded_by: input.supersededBy,
  };
}

async function validateChangeCloseRecoveryArgs(input: {
  changeId?: string;
  recoveryMode?: ChangeCloseRecoveryMode;
  recoveryEvidence?: string;
}): Promise<Record<string, unknown> | null> {
  if (input.recoveryMode !== "poisoned_history") return null;
  const { isPreciseWorkflowRecoveryEvidence } =
    await import("../temporal/recovery-classification");
  if (!input.recoveryEvidence?.trim()) {
    return {
      error:
        "change close recovery requires non-empty recoveryEvidence when recoveryMode='poisoned_history'",
      ...(input.changeId ? { changeId: input.changeId } : {}),
    };
  }
  if (!isPreciseWorkflowRecoveryEvidence(input.recoveryEvidence)) {
    return {
      error:
        "change close recoveryEvidence must cite precise poisoned-history or completed-workflow evidence",
      ...(input.changeId ? { changeId: input.changeId } : {}),
    };
  }
  return null;
}

async function recoverCompletedWorkflowClose(input: {
  store: Store;
  change: Change;
  closeInput: ChangeClosePayloadInput;
  recoveryMode?: ChangeCloseRecoveryMode;
  recoveryEvidence?: string;
  signalError: unknown;
}): Promise<{ recovered: boolean; error?: string }> {
  if (input.recoveryMode !== "poisoned_history") {
    return {
      recovered: false,
      error:
        input.signalError instanceof Error
          ? input.signalError.message
          : String(input.signalError),
    };
  }
  const { isWorkflowCompletedError } =
    await import("../temporal/recovery-classification");
  if (!isWorkflowCompletedError(input.signalError)) {
    return {
      recovered: false,
      error:
        input.signalError instanceof Error
          ? input.signalError.message
          : String(input.signalError),
    };
  }

  const { saveRecoveredChangeStatus } = await import("./_recovery-writers");
  await saveRecoveredChangeStatus({
    store: input.store,
    change: input.change,
    authorization: {
      reason: "completed_workflow_close_recovery",
      evidence: input.recoveryEvidence ?? String(input.signalError),
    },
    status: "closed",
    closure: buildChangeClosure(input.closeInput),
  });
  return { recovered: true };
}

// =============================================================================
// Tool Definitions
// =============================================================================

export const changeTools = {
  adv_change_list: {
    description:
      "List active changes with optional filtering, recency enrichment, and sorting",
    args: {
      status: ChangeListStatusFilterSchema.optional().describe(
        'Filter by status. Use "in-flight" for the union of draft + pending + active.',
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
            const lastActivityAt = new Date(change.lastActivityAt);
            const minutesSince = Math.max(
              0,
              Math.floor((now.getTime() - lastActivityAt.getTime()) / 60000),
            );
            return {
              ...change,
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
            const inFlightStatuses = new Set(["draft", "pending", "active"]);
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
          "Optional absolute path to another ADV project. When provided, reads that project as a disk snapshot and returns _projectContext.",
        ),
      include: z
        .object({
          ledger: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches the in-progress task's durable run ledger as `_ledger`.",
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
          snapshot?: boolean;
          readyTasks?: boolean;
          readyTasksLimit?: number;
          artifactOnly?: boolean;
          proposal?: boolean;
          problemStatement?: boolean;
          agreement?: boolean;
          design?: boolean;
          executiveSummary?: boolean;
          acceptance?: boolean;
          subagentReports?: boolean;
        };
      },
      store: Store,
    ) => {
      return withOptionalTargetPathStore(
        { store, target_path },
        async (activeStore, projectContext) => {
          const result = await activeStore.changes.get(changeId);
          if (!result.success) {
            return formatToolOutput({ error: result.error });
          }
          if (!result.data) {
            return formatToolOutput({ error: `Change not found: ${changeId}` });
          }
          const change = result.data;
          const displayChange: Change = {
            ...change,
            artifacts: await normalizeArtifactMetadataForReadback(
              change.artifacts,
            ),
            gates: await normalizeGateArtifactEvidenceForReadback(change.gates),
          };

          const requestedKinds: ArtifactKind[] = [];
          if (include?.proposal) requestedKinds.push("proposal");
          if (include?.problemStatement)
            requestedKinds.push("problemStatement");
          if (include?.agreement) requestedKinds.push("agreement");
          if (include?.design) requestedKinds.push("design");
          if (include?.executiveSummary)
            requestedKinds.push("executiveSummary");
          if (include?.acceptance) requestedKinds.push("acceptance");

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
            // Snapshot — matches mutation-tool convention (top-level
            // `_contextSnapshot`). Uses the same formatter live emission
            // and compaction use, ensuring fidelity parity.
            if (include.snapshot) {
              try {
                let gates: Awaited<ReturnType<typeof activeStore.gates.get>> =
                  null;
                try {
                  gates = await activeStore.gates.get(changeId);
                } catch {
                  // best-effort: missing gates → snapshot still useful
                }
                output._contextSnapshot = buildChangeContextSnapshot({
                  change: displayChange,
                  proposalText,
                  gates: gates
                    ? await normalizeGateArtifactEvidenceForReadback(gates)
                    : undefined,
                  workdir: activeStore.paths.root,
                });
              } catch (e) {
                output._contextSnapshotError =
                  e instanceof Error ? e.message : String(e);
              }
            }

            if (include.ledger) {
              output._ledger = null;
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
                    change.tasks.find(
                      (task) => task.status === "in_progress",
                    ) ?? null,
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
        },
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
          "'roadmap' = promoted from a GitHub Project / ROADMAP.md item (origin_issue_number required). " +
          "'discovery' = surfaced mid-session (bug found, drive-by improvement). " +
          "'triage' = promoted by /adv-triage from agenda/wisdom/notes (origin_source_artifact recommended). " +
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
            "Examples: agenda-id ('ag-...'), wisdom-id, task-id, or note-line ref.",
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

      const initialMetadata: ChangeCreateInitialMetadata = {};
      if (origin) initialMetadata.origin = origin;
      if (fastFollowOf) initialMetadata.fast_follow_of = fastFollowOf;
      if (scopeResolution.scope)
        initialMetadata.scope_repos = scopeResolution.scope;
      const epicSeedFields = [
        ["epic_id", epic_id],
        ["entry_id", entry_id],
        ["epic_title", epic_title],
      ] as const;
      const missingEpicSeedFields = epicSeedFields
        .filter(([, value]) => value === undefined)
        .map(([field]) => field);
      const hasAnyEpicSeedField =
        epicSeedFields.length !== missingEpicSeedFields.length;
      if (hasAnyEpicSeedField && missingEpicSeedFields.length > 0) {
        return formatToolOutput({
          error:
            "Complete create-time Epic membership requires epic_id, entry_id, and epic_title; omit all Epic fields when no Epic membership is intended.",
          code: "INVALID_EPIC_MEMBERSHIP_SEED",
          fields: missingEpicSeedFields,
        });
      }
      if (epic_id && entry_id && epic_title) {
        initialMetadata.epic_membership = {
          epic_id,
          entry_id,
          order: epic_order ?? 0,
          title: epic_title,
          linked_at: new Date().toISOString(),
        };
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
      if (createdChangeResult.success && createdChangeResult.data) {
        const { content: proposalText } = await loadProposalForContext(
          store,
          result.changeId,
          createdChangeResult.data.title,
        );
        output._contextSnapshot = buildChangeContextSnapshot({
          change: createdChangeResult.data,
          proposalText,
          gates: createdChangeResult.data.gates ?? createDefaultGates(),
          workdir: store.paths.root,
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
            `Post-create claim race-check failed for ${result.changeId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
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
        if (!existing.success || !existing.data) {
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
          const { RECOVERY_RECONCILIATION_WARNING, isWorkflowCompletedError } =
            await import("../temporal/recovery-classification");
          const completedWorkflow = isWorkflowCompletedError(error);
          let poisonedWorkflow = false;
          if (!completedWorkflow) {
            const bundle = await import("../temporal/service");
            const service = bundle.getService();
            const projectId = await getProjectId(activeStore.paths.root);
            if (service && projectId) {
              const { getChangeHandle } = await import("./_adapters");
              const { workflowHasPoisonedRecoveryEvidence } =
                await import("./recovery-probe");
              const handle = getChangeHandle(
                service.client,
                projectId,
                changeId,
              );
              poisonedWorkflow = await workflowHasPoisonedRecoveryEvidence(
                handle,
                { signalError: error },
              );
            }
          }
          if (!completedWorkflow && !poisonedWorkflow) throw error;
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
      }: {
        changeId: string;
        reason: "cancelled" | "superseded" | "not_planned";
        approvedByUser: true;
        approvalEvidence: string;
        supersededBy?: string;
        dryRun?: boolean;
        recoveryMode?: ChangeCloseRecoveryMode;
        recoveryEvidence?: string;
      },
      store: Store,
    ) => {
      if (reason === "superseded" && !supersededBy) {
        return formatToolOutput({
          error: "supersededBy is required when reason is 'superseded'.",
        });
      }

      const result = await store.changes.get(changeId);
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
        const projectId = await getProjectId(store.paths.root);
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
          store,
          changeId,
          changeCancelledSignal,
          buildChangeClosePayload(closeInput),
        );

        // Remove source `changes/<id>/` directory after successful close.
        // Best-effort: failure surfaces as a warning but does NOT flip success
        // to false — the closed status is durable.
        let cleanupWarning: string | undefined;
        if (store.paths?.changes) {
          try {
            await removeChangeDir(store.paths.changes, changeId);
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
        });
      } catch (error) {
        const closeInput = {
          approvalEvidence,
          reason,
          supersededBy,
          cancelledAt: new Date().toISOString(),
        };
        const recovery = await recoverCompletedWorkflowClose({
          store,
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
          });
        }
        const contextMismatch = extractContextMismatch(error);
        return formatToolOutput({
          error: error instanceof Error ? error.message : String(error),
          ...contextMismatch,
        });
      }
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
      }: {
        selector: import("../types").BulkCloseSelector;
        reason: "cancelled" | "superseded" | "not_planned";
        approvedByUser: true;
        approvalEvidence: string;
        supersededBy?: string;
        dryRun?: boolean;
        recoveryMode?: ChangeCloseRecoveryMode;
        recoveryEvidence?: string;
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

      const selection = await resolveChangeSelection(selector, {
        list: store.changes.list.bind(store.changes),
        get: store.changes.get.bind(store.changes),
      });

      if (!selection.ok) {
        return formatToolOutput({ error: selection.error });
      }

      const recoveryValidation = await validateChangeCloseRecoveryArgs({
        recoveryMode,
        recoveryEvidence,
      });
      if (recoveryValidation) {
        return formatToolOutput(recoveryValidation);
      }

      if (selection.changeIds.length === 0) {
        return formatToolOutput({
          error: "SELECTION_ERROR: No changes matched the provided criteria.",
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
        });
      }

      try {
        const bundle = getService();
        if (!bundle) {
          return formatToolOutput({
            error: "Temporal service not available",
          });
        }
        const projectId = await getProjectId(store.paths.root);
        if (!projectId) {
          return formatToolOutput({
            error: "Could not resolve project ID",
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
              store,
              id,
              changeCancelledSignal,
              buildChangeClosePayload(closeInput),
            );
            results.push({ changeId: id, success: true });
            closed++;
          } catch (err) {
            const existing = await store.changes.get(id);
            if (existing.success && existing.data) {
              const closeInput = {
                approvalEvidence,
                reason,
                supersededBy,
                cancelledAt: new Date().toISOString(),
              };
              const recovery = await recoverCompletedWorkflowClose({
                store,
                change: existing.data,
                closeInput,
                recoveryMode,
                recoveryEvidence,
                signalError: err,
              });
              if (recovery.recovered) {
                results.push({ changeId: id, success: true, recovered: true });
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
        let diskFailed: Array<{ id: string; error: string }> = [];
        const successfulIds = results
          .filter((r) => r.success && !r.recovered)
          .map((r) => r.changeId);
        if (successfulIds.length > 0 && store.paths?.changes) {
          const sweep = await sweepClosedChangesFromDisk(
            successfulIds,
            store.paths.changes,
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
        });
      } catch (error) {
        const contextMismatch = extractContextMismatch(error);
        return formatToolOutput({
          error: error instanceof Error ? error.message : String(error),
          ...contextMismatch,
        });
      }
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
      }: { changeId: string; strict?: boolean; strictWarnings?: boolean },
      store: Store,
    ) => {
      const result = await store.changes.get(changeId);
      if (!result.success) {
        return formatToolOutput({ error: result.error });
      }
      if (!result.data) {
        return formatToolOutput({ error: `Change not found: ${changeId}` });
      }

      const change = result.data;
      const { specs, activeChanges, proposalText, changedSpecFiles } =
        await loadValidationContext(store, changeId, change.title);

      // Run full validation with active changes for conflict detection
      const validationResult = await validateChange(change, {
        specs,
        activeChanges,
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
      }: {
        changeId: string;
        dryRun?: boolean;
        worktreePath?: string;
        noCloseIssue?: boolean;
        closeIssue?: boolean;
        phase9?: "run" | "skip";
        recoveryMode?: "normal" | "poisoned_history";
        recoveryEvidence?: string;
      },
      store: Store,
    ) => {
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

      const gateState = await resolveArchiveGateState(store, changeId, change);
      const divergenceHint =
        gateState.source === "store" && !allGatesSatisfied(gateState.storeGates)
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

      const specs = await loadSpecsMap(store);

      // Run the archive operation
      // Include in-repo archive path: resolves within the repo at .adv/archive/.
      // When worktreePath is provided (e.g. /adv-archive Phase 9 from a worktree),
      // the bundle lands inside the worktree so it can be staged on the change
      // branch. Without worktreePath, falls back to store.paths.root (main
      // checkout) for backward compatibility.
      const inRepoBase = worktreePath ?? store.paths.root;
      const inRepoArchive = join(inRepoBase, ".adv", "archive");
      const archivePaths =
        store.config?.features?.wisdom_accumulation === false
          ? { ...store.paths, wisdom: undefined, inRepoArchive }
          : { ...store.paths, inRepoArchive };

      const existingBundlePath = !dryRun
        ? await findArchiveBundle(archivePaths.archive, changeId)
        : null;

      if (!dryRun) {
        if (!worktreePath && phase9 !== "skip" && existingBundlePath === null) {
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
        if (
          !dryRun &&
          archivePaths.inRepoArchive &&
          (worktreePath || phase9 === "skip")
        ) {
          await reconcileInRepoArchive(
            change,
            archivePaths.inRepoArchive,
            archivePaths.changes
              ? join(archivePaths.changes, changeId)
              : undefined,
          );
        }

        archiveResult = {
          success: true,
          changeId,
          specsUpdated: [],
          docsGenerated: [],
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
        | Extract<ArchiveReleaseGateResult, { ok: true }>
        | undefined;
      if (!dryRun && archiveResult.success && phase9 !== "skip") {
        if (phase9 === "run" && change.status !== "archived") {
          // AC3: Async phase9 dispatch. Save pending status, then run
          // finalization + release gate + cleanup in background.
          const now = new Date().toISOString();
          await recordPhase9Status({
            store,
            changeId,
            status: { status: "pending", startedAt: now },
          });

          dispatchPhase9Finalization({
            changeId,
            store,
            run: async () => {
              const currentResult = await store.changes.get(changeId);
              if (!currentResult.success || !currentResult.data) {
                throw new Error("Change not found for async phase9 completion");
              }
              const currentChange = currentResult.data;

              const currentFinalization = worktreePath
                ? await finalizeRelease({
                    changeId,
                    workdir: worktreePath,
                    expectedMainCheckout: store.paths.root,
                    archiveMode,
                    autoPush,
                  })
                : verifyReleaseEvidenceFromMain({
                    store,
                    changeId,
                    archiveMode,
                    change: currentChange,
                  });

              if (currentFinalization.status === "blocked") {
                throw new Error(
                  `Archive finalization blocked: ${currentFinalization.blocked?.reason}`,
                );
              }

              if (currentFinalization.status === "pending_merge") {
                await recordPhase9Status({
                  store,
                  changeId,
                  status: buildPendingMergePhase9Status({
                    finalization: currentFinalization,
                    startedAt: currentChange.phase9_status?.startedAt ?? now,
                  }),
                });
                return;
              }

              const releaseResult = await completeReleaseGateAfterFinalization({
                store,
                change: currentChange,
                changeId,
                finalization: currentFinalization,
              });
              if (!releaseResult.ok) {
                throw new Error(
                  `Archive release gate completion blocked: ${releaseResult.error}`,
                );
              }

              const releaseEvidence =
                buildReleaseCompletionEvidence(currentFinalization);
              const durableProof = await verifyReleaseGateDurableForArchive({
                store,
                changeId,
                evidence: releaseEvidence,
              });
              if (!durableProof.ok) {
                throw new Error(
                  `Archive durable release gate proof blocked: ${durableProof.error}`,
                );
              }

              // Archive status transition
              const archivedAt = new Date().toISOString();
              await recordPhase9Status({
                store,
                changeId,
                status: {
                  status: "done",
                  startedAt: currentChange.phase9_status?.startedAt ?? now,
                  completedAt: archivedAt,
                },
              });
              currentChange.status = "archived";
              await store.changes.save(currentChange);
              await projectEpicTerminalSummaryAfterArchive({
                store,
                change: currentChange,
                completedAt: archivedAt,
              });

              // Cleanup. Failures here are non-fatal (the change is already
              // durably archived) but MUST be observable so leaked dirs,
              // worktrees, and branches do not accumulate silently (QUAL-004).
              try {
                await removeChangeDir(store.paths.changes, currentChange.id);
              } catch (err) {
                logger.warn(
                  `archive cleanup: failed to remove change dir for ${currentChange.id}: ${err instanceof Error ? err.message : String(err)}`,
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
                logger.warn(
                  `archive cleanup: worktree cleanup failed for ${currentChange.id}: ${err instanceof Error ? err.message : String(err)}`,
                );
              }

              if (
                currentFinalization?.status === "shipped" &&
                currentFinalization.mainCheckout &&
                currentFinalization.route !== "pr_auto_merge" &&
                archiveMode === "direct"
              ) {
                try {
                  deleteChangeBranch(
                    currentFinalization.mainCheckout,
                    currentChange.id,
                  );
                } catch (err) {
                  logger.warn(
                    `archive cleanup: failed to delete change branch for ${currentChange.id}: ${err instanceof Error ? err.message : String(err)}`,
                  );
                }
              }

              // Issue closure
              await closeLinkedIssue({
                change: currentChange,
                store,
                noCloseIssue,
                dryRun: false,
                existingBundlePath: existingBundlePath ?? undefined,
                worktreePath,
              });
            },
            recordFailure: async (error) => {
              await recordPhase9Status({
                store,
                changeId,
                status: {
                  status: "failed",
                  startedAt: now,
                  completedAt: new Date().toISOString(),
                  error: error instanceof Error ? error.message : String(error),
                },
              });
            },
          });

          return formatToolOutput({
            success: archiveResult.success,
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
            phase9: "pending",
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

        // Sync mode (existing behavior)
        finalization = worktreePath
          ? await finalizeRelease({
              changeId,
              workdir: worktreePath,
              expectedMainCheckout: store.paths.root,
              archiveMode,
              autoPush,
            })
          : verifyReleaseEvidenceFromMain({
              store,
              changeId,
              archiveMode,
              change,
            });

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
        if (
          change.phase9_status?.status &&
          change.phase9_status.status !== "done"
        ) {
          await recordPhase9Status({
            store,
            changeId,
            status: {
              status: "done",
              startedAt:
                change.phase9_status.startedAt ?? new Date().toISOString(),
              completedAt: new Date().toISOString(),
            },
          });
        }
        releaseGateCompletion = {
          ...releaseResult,
          gate: durableProof.gate,
        };
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
            const epicProjection = await projectEpicTerminalSummaryAfterArchive({
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
                  const { getService } = await import("../temporal/service");
                  const { getChangeHandle } = await import("./_adapters");
                  const { getProjectId } = await import("../utils/project-id");
                  const bundle = getService();
                  const projectId = bundle
                    ? await getProjectId(store.paths.root)
                    : null;
                  const handle =
                    bundle && projectId
                      ? getChangeHandle(bundle.client, projectId, changeId)
                      : undefined;
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
    },
  },

  adv_archive_repair: {
    description:
      "Scan for archived change branches not reachable from origin/default and re-drive PR auto-merge handoff; OR clean up local change/* branches left behind after PR-mode archive merges",
    args: {
      action: z
        .enum(["scan", "redrive", "cleanup_merged"])
        .describe(
          "scan = list candidates; redrive = open/reuse PR and arm auto-merge for one archived change; " +
            "cleanup_merged = scan local change/* branches tied to archived ADV changes, detect fully-merged ones (squash-merge-safe), and delete the safe ones",
        ),
      changeId: z
        .string()
        .optional()
        .describe(
          "Archived change ID to re-drive when action='redrive' or restrict cleanup_merged to a single change",
        ),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "Preview redrive or cleanup_merged without creating PRs, arming auto-merge, or deleting branches",
        ),
    },
    execute: async (
      {
        action,
        changeId,
        dryRun,
      }: {
        action: "scan" | "redrive" | "cleanup_merged";
        changeId?: string;
        dryRun?: boolean;
      },
      store: Store,
    ) => {
      const mainCheckout = resolveMainCheckout(store.paths.root);
      const { branch: defaultBranch } = detectDefaultBranch(mainCheckout);
      const archivedList = await store.changes.list({
        status: "archived",
        includeArchived: true,
      });
      const archivedChangeIds = archivedList.changes.map((change) => change.id);

      if (action === "cleanup_merged") {
        let targetArchivedChangeIds = archivedChangeIds;
        if (changeId?.trim()) {
          if (!archivedChangeIds.includes(changeId)) {
            return formatToolOutput({
              success: false,
              action,
              changeId,
              error: `Change is not archived or was not found: ${changeId}`,
            });
          }
          targetArchivedChangeIds = [changeId];
        }

        const fetchWarnings: string[] = [];
        try {
          await execGit(["fetch", "origin", defaultBranch], mainCheckout);
        } catch (err) {
          fetchWarnings.push(
            `Best-effort default-branch fetch failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        const detect = detectArchivedMergedBranches({
          mainCheckout,
          defaultBranch,
          archivedChangeIds: targetArchivedChangeIds,
        });
        if (detect.status === "blocked") {
          return formatToolOutput({
            success: false,
            action,
            error: `Cleanup scan blocked: ${detect.reason}`,
            details: detect.details,
          });
        }

        const checkedOut = getCheckedOutChangeBranches(mainCheckout);
        if (checkedOut.status === "blocked") {
          return formatToolOutput({
            success: false,
            action,
            error: `Worktree safety check blocked: ${checkedOut.reason}`,
            details: checkedOut.details,
          });
        }

        const candidates = detect.branches.filter(
          (b) => !checkedOut.branches.has(b.branch),
        );
        const skippedWorktree = detect.branches.filter((b) =>
          checkedOut.branches.has(b.branch),
        );

        if (dryRun) {
          return formatToolOutput({
            success: true,
            action,
            dryRun: true,
            mainCheckout,
            defaultBranch,
            candidates,
            skipped: skippedWorktree.map((b) => ({
              ...b,
              reason: "WORKTREE_CHECKED_OUT",
              worktreePath: checkedOut.worktreePaths[b.branch],
            })),
            count: candidates.length,
            ...(fetchWarnings.length > 0 ? { warnings: fetchWarnings } : {}),
          });
        }

        const results = candidates.map((b) => {
          const deletion = deleteChangeBranch(mainCheckout, b.changeId);
          return {
            changeId: b.changeId,
            branch: b.branch,
            mergeProof: b.mergeProof,
            ...deletion,
          };
        });

        const summary = {
          total: detect.branches.length,
          candidates: candidates.length,
          deleted: results.filter((r) => r.localDeleted).length,
          remoteDeleted: results.filter((r) => r.remoteDeleted).length,
          failed: results.filter((r) => !r.localDeleted).length,
          skippedWorktree: skippedWorktree.length,
        };

        return formatToolOutput({
          success: true,
          action,
          dryRun: false,
          mainCheckout,
          defaultBranch,
          results,
          skipped: skippedWorktree.map((b) => ({
            ...b,
            reason: "WORKTREE_CHECKED_OUT",
            worktreePath: checkedOut.worktreePaths[b.branch],
          })),
          summary,
          ...(fetchWarnings.length > 0 ? { warnings: fetchWarnings } : {}),
        });
      }

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
      }: { changeId: string; add?: string[]; remove?: string[] },
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
    },
    execute: async (
      {
        changeId,
        fromGate,
        reason,
        scopeDelta,
        approvalEvidence: _approvalEvidence,
        dryRun,
      }: {
        changeId: string;
        fromGate: GateId;
        reason: string;
        scopeDelta?: string;
        approvedByUser?: boolean;
        approvalEvidence?: string;
        dryRun?: boolean;
      },
      store: Store,
    ) => {
      const result = await store.changes.get(changeId);
      if (!result.success) {
        return formatToolOutput({ error: result.error });
      }
      if (!result.data) {
        return formatToolOutput({ error: `Change not found: ${changeId}` });
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
        const projectId = await getProjectId(store.paths.root);
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
          store,
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
        return buildReentryResult(store, changeId, fromGate);
      } catch (error) {
        return formatToolOutput({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  },

  adv_change_status_repair: {
    description:
      "Repair a change whose archive bundle is written and whose gates are all done, but whose status field is wedged at non-archived because the terminating workflow signal could not be processed (completed/poisoned workflow → WorkflowNotFoundError) and the phase-9 PR-merged finalization cannot re-detect a squash-merged or deleted release branch. This is a targeted, audited disk-projection status flip (→ archived) gated on the real shipped invariant (all 7 gates done + archive bundle present on disk). It does NOT push branches, create PRs, or run phase-9 finalization. Use only after adv_change_archive has written the bundle but left status wedged. Unblocks adv_reflect.",
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
        dryRun,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        changeId: string;
        approvedByUser: true;
        approvalEvidence: string;
        dryRun?: boolean;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      if (!approvalEvidence || approvalEvidence.trim().length === 0) {
        return formatToolOutput({
          error: "approvalEvidence is required for change status repair",
          changeId,
          hint: "Cite the wedged-state evidence (WorkflowNotFoundError / phase9_status.failed) and operator approval.",
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

        if (dryRun) {
          return formatToolOutput({
            success: true,
            dryRun: true,
            changeId,
            fromStatus,
            toStatus: "archived",
            archivePath: bundlePath,
            message: `Would flip ${changeId} status ${fromStatus} → archived (all gates done, bundle present).`,
          });
        }

        try {
          const { saveRecoveredChangeStatus } =
            await import("./_recovery-writers");
          await saveRecoveredChangeStatus({
            store: activeStore,
            change,
            authorization: {
              reason: "operator_status_repair",
              evidence: approvalEvidence.trim(),
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
    execute: async ({ changeId }: { changeId: string }, _store: Store) => {
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
