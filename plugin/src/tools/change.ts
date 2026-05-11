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
  ChangeOrigin,
} from "../types";
import {
  createDefaultGates,
  getIncompleteGates,
  allGatesSatisfied,
  GateIdSchema,
  ChangeListStatusFilterSchema,
  ChangeOriginKindSchema,
  ChangeRepoScopeSchema,
  type GateId,
  type Gates,
  type Change,
  type ChangeRepoScope,
  type ClarifyFindingSnapshot,
} from "../types";
import type { Store } from "../storage/store";
import { createDiskStore as createLegacyStore } from "../storage/store-disk";
import { getReflection } from "../storage/reflection";
import { getProjectId, getExternalRoot } from "../utils/project-id";
import { isSyntheticValidationDraftPattern } from "../utils/synthetic-fixture-detector";
import { validateChange } from "../validator";
import { createLogger } from "../utils/debug-log";
import { validateCrossRepoTarget } from "../temporal/activities";
import { queryClaimsByIssueNumber } from "../temporal/visibility-claim-queries";

const logger = createLogger("change");

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
import {
  loadProposalWithFallback,
  fileExists,
  removeChangeDir,
  loadChange,
} from "../storage/json";
import {
  archiveChange,
  findArchiveBundle,
  getArchiveContractProofErrors,
  reconcileInRepoArchive,
} from "../archive";
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
import { getService } from "../temporal/service";
import {
  fireSignalAndRefresh,
  getChangeHandle,
  querySignal,
} from "./_adapters";
import {
  changeCancelledSignal,
  gateReenteredSignal,
  getGateStatusQuery,
} from "../temporal/messages";

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
  divergenceHint?: string | null,
): string | null {
  const gates = gateState.effectiveGates;
  if (!allGatesSatisfied(gates)) {
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
      incompleteGates: getIncompleteGates(gates),
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
          const result = await activeStore.changes.list({
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
      "include.proposal / include.problemStatement / include.agreement / include.design " +
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
          proposal?: boolean;
          problemStatement?: boolean;
          agreement?: boolean;
          design?: boolean;
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

            if (include.ledger) {
              output._ledger = null;
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

            // GH #21: Artifact content include flags — read raw markdown
            // from the change directory. Only reads when explicitly
            // requested to avoid unnecessary I/O.
            if (include.proposal) {
              try {
                const { content } = await loadProposalWithFallback(
                  changeDir,
                  change.title,
                );
                if (content) output._proposal = content;
              } catch {
                // File may not exist for changes without a proposal
              }
            }
            if (include.problemStatement) {
              try {
                const text = await readFile(
                  join(changeDir, "problem-statement.md"),
                  "utf-8",
                );
                output._problemStatement = text;
              } catch {
                // File may not exist
              }
            }
            if (include.agreement) {
              try {
                const text = await readFile(
                  join(changeDir, "agreement.md"),
                  "utf-8",
                );
                output._agreement = text;
              } catch {
                // File may not exist
              }
            }
            if (include.design) {
              try {
                const text = await readFile(
                  join(changeDir, "design.md"),
                  "utf-8",
                );
                output._design = text;
              } catch {
                // File may not exist
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
      scope_repos: z
        .array(ChangeRepoScopeSchema)
        .optional()
        .describe(
          "Product-linked repo scope for this change. Repo IDs must exist in the product config. Defaults to the current repo when product linking is enabled.",
        ),
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
          "GitHub issue number for kind=roadmap (required) or post-hoc backlinking. " +
            "Behavior automation (auto-create issue / auto-close on archive) lands in a follow-up change.",
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
        target_path,
        source_project,
        source_change_id,
        parent_change_id,
        scope_repos,
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
        target_path?: string;
        source_project?: string;
        source_change_id?: string;
        parent_change_id?: string;
        scope_repos?: ChangeRepoScope[];
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

      // Origin validation: kind=roadmap requires an issue number; other kinds
      // accept it optionally. Origin is typed-state only — behavior automation
      // (auto-create issue, auto-close on archive) lands in a follow-up change.
      let origin: ChangeOrigin | undefined;
      if (origin_kind) {
        if (origin_kind === "roadmap" && origin_issue_number === undefined) {
          return formatToolOutput({
            error:
              "origin_issue_number is required when origin_kind is 'roadmap'",
            hint: "Pass origin_issue_number with the GitHub issue number, or use origin_kind 'discovery' / 'triage' / 'adhoc' for non-roadmap-driven changes.",
          });
        }
        origin = {
          kind: origin_kind,
          ...(origin_issue_number !== undefined
            ? { issue_number: origin_issue_number }
            : {}),
          ...(origin_source_artifact
            ? { source_artifact: origin_source_artifact }
            : {}),
        };
      } else if (origin_issue_number !== undefined || origin_source_artifact) {
        return formatToolOutput({
          error:
            "origin_issue_number / origin_source_artifact require origin_kind to be set",
          hint: "Pass origin_kind ('roadmap' | 'discovery' | 'triage' | 'adhoc') alongside the linkage fields.",
        });
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

      const scopeResolution = resolveScopeRepos(store, scope_repos);
      if (!scopeResolution.ok) {
        return formatToolOutput({ error: scopeResolution.error });
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

      // Persist origin provenance onto the created change. Behavior automation
      // (auto-create issue / auto-close on archive) is intentionally NOT
      // performed here — it ships in a follow-up change.
      if (origin) {
        const changeResult = await store.changes.get(result.changeId);
        if (changeResult.success && changeResult.data) {
          await store.changes.save({ ...changeResult.data, origin });
          output.origin = origin;
        }
      }

      if (scopeResolution.scope) {
        const changeResult = await store.changes.get(result.changeId);
        if (changeResult.success && changeResult.data) {
          await store.changes.save({
            ...changeResult.data,
            scope_repos: scopeResolution.scope,
          });
          await store.changes.refresh(result.changeId);
          output.scope_repos = scopeResolution.scope;
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
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview close without firing signals or removing files."),
    },
    execute: async (
      {
        changeId,
        reason,
        approvedByUser: _approvedByUser,
        approvalEvidence,
        supersededBy,
        dryRun,
      }: {
        changeId: string;
        reason: "cancelled" | "superseded" | "not_planned";
        approvedByUser: true;
        approvalEvidence: string;
        supersededBy?: string;
        dryRun?: boolean;
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
        // rq-cacheRefresh01: refresh AFTER cancel so subsequent reads
        // see the closed/cancelled state, not the stale active state.
        await fireSignalAndRefresh(
          handle,
          store,
          changeId,
          changeCancelledSignal,
          {
            approvalEvidence,
            reason,
            supersededBy,
            cancelledBy: "agent",
            cancelledAt: new Date().toISOString(),
          },
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
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "Preview bulk close without firing signals or removing files.",
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
      }: {
        selector: import("../types").BulkCloseSelector;
        reason: "cancelled" | "superseded" | "not_planned";
        approvedByUser: true;
        approvalEvidence: string;
        supersededBy?: string;
        dryRun?: boolean;
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
        }[] = [];
        let closed = 0;

        for (const id of selection.changeIds) {
          try {
            const handle = getChangeHandle(bundle.client, projectId, id);
            // rq-cacheRefresh01: refresh per-change after each cancel
            // so subsequent reads of any cancelled change see closed state.
            await fireSignalAndRefresh(
              handle,
              store,
              id,
              changeCancelledSignal,
              {
                approvalEvidence,
                reason,
                supersededBy,
                cancelledBy: "agent",
                cancelledAt: new Date().toISOString(),
              },
            );
            results.push({ changeId: id, success: true });
            closed++;
          } catch (err) {
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
          .filter((r) => r.success)
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
        divergenceHint,
      );
      if (gatePreflightError) {
        return gatePreflightError;
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

      // rq-archiveOrdering01: Archive State Transition Must Be Resilient
      // to Failed Disk Bundle Write. Idempotent retry: if the bundle already
      // exists on disk, skip the disk write. Two sub-cases:
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
        if (!dryRun && archivePaths.inRepoArchive) {
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
        ...(archiveResult.multiRepo
          ? { multiRepo: archiveResult.multiRepo }
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
};
