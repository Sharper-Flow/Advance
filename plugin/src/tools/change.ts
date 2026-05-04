// rq-prop-context1: Durable Proposal Context for adv-task
/**
 * Change Tools
 *
 * Tools for managing change proposals.
 */

import { z } from "zod";
import { basename, join } from "path";
import { readFile, stat, realpath } from "fs/promises";
import { execGit, getDefaultBranch } from "../utils/git.js";
import type {
  Spec,
  FeatureFlags,
  CrossProjectOrigin,
  FastFollowOf,
} from "../types";
import {
  createDefaultGates,
  getIncompleteGates,
  allGatesSatisfied,
  GateIdSchema,
  ChangeListStatusFilterSchema,
  type GateId,
  type Change,
  type ClarifyFindingSnapshot,
} from "../types";
import type { Store } from "../storage/store";
import { createDiskStore as createLegacyStore } from "../storage/store-disk";
import { classifyRecency } from "../storage/store-types";
import { getReflection } from "../storage/reflection";
import { getProjectId, getExternalRoot } from "../utils/project-id";
import { validateChange } from "../validator";
import { createLogger } from "../utils/debug-log";
import { validateCrossRepoTarget } from "../temporal/activities";

const logger = createLogger("change");
// Warning codes that may still surface during archive-time validation but do
// not, by themselves, indicate broken or unsafe release state. Keep this set
// intentionally narrow: errors and all other warnings continue to block strict
// validation until explicitly reviewed and reclassified.
const ARCHIVE_SAFE_STRICT_WARNING_CODES = new Set([
  "NO_DELTAS",
  "PROPOSAL_TASK_DRIFT",
]);
import { runClarifyReadinessChecks } from "../validator/clarify-readiness";
import {
  loadProposalWithFallback,
  fileExists,
  removeChangeDir,
  loadChange,
} from "../storage/json";
import { archiveChange, findArchiveBundle } from "../archive";
import { formatToolOutput, paginate } from "../utils/tool-output";
import {
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
function isSyntheticValidationDraftSummary(summary: string): boolean {
  const trimmed = summary.trim();

  // Bracket-prefix parity markers: [parity:legacy] ..., [parity:temporal] ...
  if (/^\[parity:(legacy|temporal)\]\s+/i.test(trimmed)) {
    return true;
  }

  // Explicit parity-prefix markers: parityLegacy*, parityTemporal*
  if (/^parity(Legacy|Temporal)\w*\d*$/i.test(trimmed)) {
    return true;
  }

  // ── Synthetic validation draft detection ──────────────────────────────────
  //
  // Synthetic summaries are generated by automated validation workflows, NOT
  // by human users creating real changes. The taxonomy of synthetics:
  //
  // 1. Roundtrip validation — verifies round-trip fidelity of change create →
  //    archive → restore. Patterns: "change roundtrip", "changeRoundtrip".
  //
  // 2. Per-subsystem parity runs — compares legacy disk store vs Temporal store
  //    outputs for the same operation. Covers: task, gate, wisdom, reentry.
  //    Bracket-prefix markers like [parity:legacy] are explicit tagging.
  //
  // 3. Latency benchmark runs — measures store operation latency before/after
  //    Temporal migration. Patterns: "latency legacy", "latencyLegacy".
  //
  // 4. Harness cleanup artifacts — leaked state from test harness teardown.
  //    Pattern: "cleanupParityHarnessLeak".
  //
  // 5. Comparison protocol iterations — auto-generated during user-intuition
  //    comparison protocol testing. Pattern: "userIntuitComparisonProtocol".
  //
  // These are rejected at change-creation time to prevent polluting the change
  // list with non-human validation artifacts.

  return [
    // Roundtrip validation
    /^change\s+roundtrip\d*$/i,
    /^changeRoundtrip\d*$/i,
    // Per-subsystem parity runs
    /^task\s+parity\d*$/i,
    /^taskParity\d*$/i,
    /^gate\s+parity\d*$/i,
    /^gateParity\d*$/i,
    /^wisdom\s+parity\d*$/i,
    /^wisdomParity\d*$/i,
    /^reentry\s+parity\d*$/i,
    /^reentryParity\d*$/i,
    // Latency benchmark runs
    /^latency\s*legacy\d*$/i,
    /^latencyLegacy\d*$/i,
    // Harness cleanup artifacts
    /^cleanupParityHarnessLeak\d*$/i,
    // Comparison protocol iterations
    /^userIntuitComparisonProtocol\d*$/i,
  ].some((pattern) => pattern.test(trimmed));
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

type ChangeIssueUpdate = {
  added: string[];
  removed: string[];
  alreadyLinked: string[];
  notLinked: string[];
};

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

  const changeDir = join(store.paths.changes, changeId);
  const { content: proposalText } = await loadProposalWithFallback(
    changeDir,
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
  target_path,
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
  target_path: string;
  source_project?: string;
  source_change_id?: string;
  store: Store;
}): Promise<string> {
  const validateTargetPath = async (): Promise<string | null> => {
    // P2.5: route through the same validation primitive that
    // crossRepoArtifactActivity uses. This unifies the existence + git-repo
    // checks under one source of truth and ensures cross-repo file I/O is
    // gated by activity-style validation per design.md § KD-4.
    const validation = await validateCrossRepoTarget(target_path);
    if (!validation.ok) {
      return formatToolOutput({ error: validation.error });
    }

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

  const validationError = await validateTargetPath();
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
  const targetProjectId = await getProjectId(target_path);
  const targetExternalRoot = targetProjectId
    ? getExternalRoot(targetProjectId)
    : undefined;

  let targetStore: Store;
  try {
    // Cross-repo change creation uses the legacy store directly as a
    // non-runtime filesystem utility. Temporal runtime is not initialized
    // for external repos in this tool path.
    targetStore = await createLegacyStore(target_path, {
      externalRoot: targetExternalRoot,
    });
    await targetStore.init();
  } catch (err) {
    return formatToolOutput({
      error: `Failed to initialize target project at ${target_path}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  try {
    const result = await targetStore.changes.create(
      summary,
      capability,
      enrichedProposal,
      problemStatement,
      agreement,
      design,
    );
    const changeResult = await targetStore.changes.get(result.changeId);
    if (changeResult.success && changeResult.data) {
      changeResult.data.cross_project_origin = origin;
      await targetStore.changes.save(changeResult.data);
    }

    const output: Record<string, unknown> = {
      ...result,
      cross_project_origin: origin,
      target_path,
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
            ...(targetProjectId ? { target_project_id: targetProjectId } : {}),
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
  } finally {
    targetStore.close();
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
  const changeDir = join(store.paths.changes, changeId);
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
    const fullChangeResult = await store.changes.get(activeChange.id);
    if (fullChangeResult.success && fullChangeResult.data) {
      activeChange.capabilities = Object.keys(fullChangeResult.data.deltas);
    }
  }

  const { content: proposalText } = await loadProposalWithFallback(
    changeDir,
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

function getArchivePreflightError(
  changeId: string,
  change: {
    tasks: { id: string; title: string; status: string }[];
    gates?: ReturnType<typeof createDefaultGates>;
  },
): string | null {
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

  const gates = change.gates ?? createDefaultGates();
  if (!allGatesSatisfied(gates)) {
    return formatToolOutput({
      error:
        "Cannot archive: incomplete gates. Complete all quality gates before archiving.",
      incompleteGates: getIncompleteGates(gates),
      hint: `Run /adv-gate-status ${changeId} to see gate details`,
    });
  }

  return null;
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
    return `Disk shows gates done but Temporal sees them incomplete. Run \`adv_change_diagnose changeId: ${changeId}\` to inspect, then \`adv_workflow_repair changeId: ${changeId}\` to rebind.`;
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
    const changeDir = join(store.paths.changes, changeId);
    const { content: proposalText } = await loadProposalWithFallback(
      changeDir,
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
      excludeRecencyBands: z
        .array(z.enum(["hot", "warm", "stale"]))
        .optional()
        .describe("Exclude changes in these recency bands"),
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
    },
    execute: async (
      {
        status,
        includeArchived,
        includeClosed,
        sort,
        excludeRecencyBands,
        limit,
        offset,
        target_path,
      }: {
        status?: string;
        includeArchived?: boolean;
        includeClosed?: boolean;
        sort?: "recency" | "stalest" | "default";
        excludeRecencyBands?: ("hot" | "warm" | "stale")[];
        limit?: number;
        offset?: number;
        target_path?: string;
      },
      store: Store,
    ) => {
      return withOptionalTargetPathStore(
        { store, target_path },
        async (activeStore, projectContext) => {
          const result = await activeStore.changes.list({
            status: status === "in-flight" ? undefined : status,
            includeArchived,
            includeClosed,
          });

          // Enrich with recency data from the store-computed last activity.
          const now = new Date();
          const withRecency = result.changes.map((change) => {
            const lastActivityAt = new Date(change.lastActivityAt);
            const minutesSince = Math.max(
              0,
              Math.floor((now.getTime() - lastActivityAt.getTime()) / 60000),
            );
            return {
              ...change,
              lastActivity: change.lastActivityAt,
              lastActivityAgeMinutes: minutesSince,
              recencyBand: classifyRecency(minutesSince),
              ...(change.fast_follow_of
                ? { parent_change_id: change.fast_follow_of.parent_change_id }
                : {}),
            };
          });

          // Filter by recency band before pagination
          let filtered = withRecency;
          if (status === "in-flight") {
            const inFlightStatuses = new Set(["draft", "pending", "active"]);
            filtered = filtered.filter((c) => inFlightStatuses.has(c.status));
          }
          if (excludeRecencyBands && excludeRecencyBands.length > 0) {
            const excludeSet = new Set(excludeRecencyBands);
            filtered = filtered.filter((c) => !excludeSet.has(c.recencyBand));
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
      "by priority then created_at; default 10, max 50). Defaults are " +
      "unchanged when include is omitted.",
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
          const changeDir = join(activeStore.paths.changes, changeId);
          const { content: proposalText } = await loadProposalWithFallback(
            changeDir,
            change.title,
          );
          const paged = paginate(change.tasks, {
            limit,
            offset,
            tool: "adv_change_show",
            args: `changeId: "${changeId}"`,
          });

          const output: Record<string, unknown> = {
            ...change,
            tasks: paged.items,
            _taskPagination: paged.pagination,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          };

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
                  change,
                  proposalText,
                  gates: gates ?? undefined,
                  workdir: activeStore.paths.root,
                });
              } catch (e) {
                output._contextSnapshotError =
                  e instanceof Error ? e.message : String(e);
              }
            }

            // Ledger — durable run state for the in-progress task. When
            // none exists, attaches `null` so callers can detect "no
            // ledger" without re-issuing the call.
            if (include.ledger) {
              try {
                const inProgress = change.tasks.find(
                  (t) => t.status === "in_progress",
                );
                if (inProgress) {
                  const run = await activeStore.tasks.getRun(inProgress.id);
                  output._ledger = run ?? null;
                } else {
                  output._ledger = null;
                }
              } catch (e) {
                output._ledgerError =
                  e instanceof Error ? e.message : String(e);
              }
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
              } catch (e) {
                output._readyTasksError =
                  e instanceof Error ? e.message : String(e);
              }
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
      parent_change_id: z
        .string()
        .optional()
        .describe(
          "Same-project parent change ID for fast-follow lineage. " +
            "Mutually exclusive with target_path (cross-project follow-up). " +
            "Parent must exist in the current project.",
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
        target_path,
        source_project,
        source_change_id,
        parent_change_id,
      }: {
        summary: string;
        capability?: string;
        proposal?: string;
        problemStatement?: string;
        agreement?: string;
        design?: string;
        target_path?: string;
        source_project?: string;
        source_change_id?: string;
        parent_change_id?: string;
      },
      store: Store,
    ) => {
      if (isSyntheticValidationDraftSummary(summary)) {
        return formatToolOutput(buildSyntheticValidationDraftError(summary));
      }

      if (target_path && parent_change_id) {
        return formatToolOutput({
          error: "target_path and parent_change_id are mutually exclusive",
        });
      }

      if (target_path) {
        return createCrossProjectFollowUp({
          summary,
          capability,
          proposal,
          problemStatement,
          agreement,
          design,
          target_path,
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

      // ----- Local creation path (unchanged) -----
      const result = await store.changes.create(
        summary,
        capability,
        proposal,
        problemStatement,
        agreement,
        design,
      );

      const output: Record<string, unknown> = { ...result };

      if (fastFollowOf) {
        const changeResult = await store.changes.get(result.changeId);
        if (changeResult.success && changeResult.data) {
          changeResult.data.fast_follow_of = fastFollowOf;
          await store.changes.save(changeResult.data);
        }
        output.fast_follow_of = fastFollowOf;
      }

      // Surface duplicate warning prominently if present
      if (result.duplicateWarning) {
        output._duplicateWarning = result.duplicateWarning;
      }

      // If parent_change_id set, attach fast-follow lineage
      if (parent_change_id) {
        const changeResult = await store.changes.get(result.changeId);
        if (changeResult.success && changeResult.data) {
          const updatedChange = {
            ...changeResult.data,
            fast_follow_of: {
              parent_change_id: parent_change_id,
              linked_at: new Date().toISOString(),
            },
          };
          await store.changes.save(updatedChange);
          output.fast_follow_of = updatedChange.fast_follow_of;
        }
      }

      await appendClarifyNeededForCreatedChange(store, result.changeId, output);

      const createdChangeResult = await store.changes.get(result.changeId);
      if (createdChangeResult.success && createdChangeResult.data) {
        const changeDir = join(store.paths.changes, result.changeId);
        const { content: proposalText } = await loadProposalWithFallback(
          changeDir,
          createdChangeResult.data.title,
        );
        output._contextSnapshot = buildChangeContextSnapshot({
          change: createdChangeResult.data,
          proposalText,
          gates: createdChangeResult.data.gates ?? createDefaultGates(),
          workdir: store.paths.root,
        });
      }

      return formatToolOutput(output);
    },
  },

  adv_change_update: {
    description:
      "Update proposal.md and/or problem-statement.md for an existing change. Does NOT create a new change or modify change.json metadata (status, tasks, deltas). Use this instead of calling adv_change_create again when refining a proposal. Only provided fields are written — omitted fields are left unchanged.",
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
          "New proposal.md content (overwrites existing). Omit to leave unchanged. At least one of `proposal`, `problemStatement`, `agreement`, or `design` MUST be provided.",
        ),
      problemStatement: z
        .string()
        .optional()
        .describe(
          "New problem-statement.md content (overwrites existing). Omit to leave unchanged. At least one of `proposal`, `problemStatement`, `agreement`, or `design` MUST be provided.",
        ),
      agreement: z
        .string()
        .optional()
        .describe(
          "New agreement.md content (overwrites existing). Omit to leave unchanged. At least one of `proposal`, `problemStatement`, `agreement`, or `design` MUST be provided.",
        ),
      design: z
        .string()
        .optional()
        .describe(
          "New design.md content (overwrites existing). Omit to leave unchanged. At least one of `proposal`, `problemStatement`, `agreement`, or `design` MUST be provided.",
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
    },
    execute: async (
      {
        changeId,
        proposal,
        problemStatement,
        agreement,
        design,
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        changeId: string;
        proposal?: string;
        problemStatement?: string;
        agreement?: string;
        design?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
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
          design === undefined
        ) {
          return formatToolOutput({
            error:
              "At least one of 'proposal', 'problemStatement', 'agreement', or 'design' must be provided.",
            hint: "Pass one or more of: proposal, problemStatement, agreement, design. See the tool description for which file each field writes.",
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

        const result = await activeStore.changes.updateArtifacts(
          changeId,
          proposal,
          problemStatement,
          agreement,
          design,
        );

        if (!result.success) {
          return formatToolOutput({ error: result.error });
        }

        return formatToolOutput({
          changeId,
          proposalPath: result.proposalPath,
          problemStatementPath: result.problemStatementPath,
          agreementPath: result.agreementPath,
          designPath: result.designPath,
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
    },
    execute: async (
      {
        changeId,
        reason,
        approvedByUser,
        approvalEvidence,
        supersededBy,
      }: {
        changeId: string;
        reason: "cancelled" | "superseded" | "not_planned";
        approvedByUser: true;
        approvalEvidence: string;
        supersededBy?: string;
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

      try {
        const change = await store.changes.close(changeId, {
          reason,
          approved_by_user: approvedByUser,
          approval_evidence: approvalEvidence,
          superseded_by: supersededBy,
          approved_at: new Date().toISOString(),
        });

        if (!change) {
          return formatToolOutput({ error: `Change not found: ${changeId}` });
        }

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
          change,
          message: cleanupWarning
            ? `Closed change ${changeId} as ${reason}. ${cleanupWarning}`
            : `Closed change ${changeId} as ${reason}.`,
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
    },
    execute: async (
      {
        selector,
        reason,
        approvedByUser,
        approvalEvidence,
        supersededBy,
      }: {
        selector: import("../types").BulkCloseSelector;
        reason: "cancelled" | "superseded" | "not_planned";
        approvedByUser: true;
        approvalEvidence: string;
        supersededBy?: string;
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

      if (selection.changeIds.length === 0) {
        return formatToolOutput({
          error: "SELECTION_ERROR: No changes matched the provided criteria.",
        });
      }

      try {
        const result = await store.changes.closeBatch(selection.changeIds, {
          reason,
          approved_by_user: approvedByUser,
          approval_evidence: approvalEvidence,
          superseded_by: supersededBy,
          approved_at: new Date().toISOString(),
        });

        // D3: Compose with sweepClosedChangesFromDisk for unified per-id
        // disk-removal reporting. Only run when closeBatch succeeded overall
        // — partial workflow-close failures preserve source dirs as the
        // rollback / orphan-sweep recovery path. (rq-bulkCloseDiskSweep01)
        let diskRemoved: string[] = [];
        let diskFailed: Array<{ id: string; error: string }> = [];
        if (result.success && store.paths?.changes) {
          const successfulIds = result.results
            .filter((r) => r.success)
            .map((r) => r.changeId);
          const sweep = await sweepClosedChangesFromDisk(
            successfulIds,
            store.paths.changes,
          );
          diskRemoved = sweep.removed;
          diskFailed = sweep.failed;
          if (diskFailed.length > 0) {
            const warnings = diskFailed
              .map(
                (f) =>
                  `Source cleanup warning: failed to remove changes/${f.id}: ${f.error}`,
              )
              .join(" ");
            result.message += ` ${warnings}`;
          }
        }

        return formatToolOutput({
          success: result.success,
          closed: result.closed,
          results: result.results,
          diskRemoved,
          diskFailed,
          message: result.message,
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
      strict: z.boolean().optional().describe("Treat warnings as errors"),
    },
    execute: async (
      { changeId, strict }: { changeId: string; strict?: boolean },
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

      // In strict mode, fail on errors and on warnings that are not explicitly
      // safe for archive-time validation. Archive-safe warnings still surface in
      // tool output but do not block strict validation by themselves.
      const passed = strict
        ? validationResult.errors.length === 0 &&
          validationResult.warnings.every((warning) =>
            ARCHIVE_SAFE_STRICT_WARNING_CODES.has(warning.code),
          )
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
    },
    execute: async (
      {
        changeId,
        dryRun,
        worktreePath,
      }: { changeId: string; dryRun?: boolean; worktreePath?: string },
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
      const preflightError = getArchivePreflightError(changeId, change);
      if (preflightError) {
        // Detect disk/Temporal divergence for incomplete gates so the user
        // gets a repair hint instead of a generic block message.
        const gates = change.gates ?? createDefaultGates();
        if (!allGatesSatisfied(gates)) {
          const divergenceHint = await getGateDivergenceHint(
            store,
            changeId,
            change,
          );
          if (divergenceHint) {
            return formatToolOutput({
              error:
                "Cannot archive: incomplete gates. Complete all quality gates before archiving.",
              incompleteGates: getIncompleteGates(gates),
              hint: divergenceHint,
            });
          }
        }
        return preflightError;
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

      // Idempotent retry: if the bundle already exists on disk, skip the
      // disk write. Two sub-cases:
      //   1. status === "archived"  → no-op success (archive already
      //      complete; both disk + state already transitioned).
      //   2. status !== "archived"  → recovery path; previous attempt
      //      wrote the bundle but the status transition failed. Build a
      //      synthetic result without re-writing disk; let the status
      //      transition (below) complete the recovery.
      const existingBundlePath = !dryRun
        ? await findArchiveBundle(archivePaths.archive, changeId)
        : null;
      let archiveResult: import("../archive/types").ArchiveOperationResult;

      if (existingBundlePath !== null) {
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
        });
      }

      // Update change status in store (unless dry run)
      if (!dryRun && archiveResult.success) {
        change.status = "archived";
        try {
          await store.changes.save(change);
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
      }

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
        dryRun: dryRun ?? false,
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
    },
    execute: async (
      {
        changeId,
        fromGate,
        reason,
        scopeDelta,
        approvalEvidence,
      }: {
        changeId: string;
        fromGate: GateId;
        reason: string;
        scopeDelta?: string;
        approvedByUser?: boolean;
        approvalEvidence?: string;
      },
      store: Store,
    ) => {
      const normalizedApprovalEvidence = approvalEvidence?.trim() || undefined;
      const result = await store.changes.get(changeId);
      if (!result.success) {
        return formatToolOutput({ error: result.error });
      }
      if (!result.data) {
        return formatToolOutput({ error: `Change not found: ${changeId}` });
      }

      try {
        await store.gates.reopenFrom(
          changeId,
          fromGate,
          reason,
          scopeDelta,
          undefined,
          normalizedApprovalEvidence,
        );
        return buildReentryResult(store, changeId, fromGate);
      } catch (error) {
        return formatToolOutput({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  },
};
