/**
 * create-clarify helpers extracted from change.ts.
 */
import { basename, join } from "path";
import { readFile, stat, realpath } from "fs/promises";
import { execGit, getDefaultBranch } from "../../utils/git.js";
import type {
  Spec,
  FeatureFlags,
  CrossProjectOrigin,
  ChangeOrigin,
} from "../../types";
import {
  type Change,
  type ChangeRepoScope,
  type ClarifyFindingSnapshot,
} from "../../types";
import type { Store } from "../../storage/store";
import { generateChangeId } from "../../utils/change-id";
import { isSyntheticValidationDraftPattern } from "../../utils/synthetic-fixture-detector";
import { createLogger } from "../../utils/debug-log";
import { queryClaimsByIssueNumber } from "../../temporal/visibility-claim-queries";
import { runClarifyReadinessChecks } from "../../validator/clarify-readiness";
import { formatToolOutput } from "../../utils/tool-output";
import {
  formatTargetProjectContext,
  withTargetPathStore,
} from "../target-project";
import { getService } from "../../temporal/service";
import { loadProposalForContext } from "../change/artifacts";
const logger = createLogger("change");
/**
 * rq-dupActiveCreate01 — Shared pre-create guard. Returns an error payload
 * when an active change already shares the generated ID or exact summary
 * title. Called for same-project creates and cross-project follow-ups so
 * the disk store's suffix fallback cannot mint e.g. `fixOpenBugs2` while
 * the original is still in-flight.
 */
export async function checkActiveDuplicateChange(
  store: Store,
  summary: string,
): Promise<
  | {
      error: string;
      code: "DUPLICATE_ACTIVE_CHANGE";
      existing_change_id: string;
      existing_change_title: string;
      hint: string;
    }
  | undefined
> {
  const candidateChangeId = generateChangeId(summary);
  const existingActiveList = await store.changes.list({ status: "active" });
  const existingDuplicate = existingActiveList.changes.find(
    (c) => c.id === candidateChangeId || c.title === summary,
  );
  if (!existingDuplicate) return undefined;
  return {
    error: `An active change already exists for "${summary}"`,
    code: "DUPLICATE_ACTIVE_CHANGE",
    existing_change_id: existingDuplicate.id,
    existing_change_title: existingDuplicate.title,
    hint: `Resume the existing change with /adv-apply ${existingDuplicate.id}, or archive it before creating a new one.`,
  };
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
  ) => Promise<
    Array<{
      changeId: string;
      status: string;
    }>
  >;
  /**
   * Post-create double-check window in milliseconds. Defaults to 5000
   * (rq-backlogCoord03 — chosen per validator pass-2 to give SQLite-backed
   * dev servers margin for Visibility propagation). Tests pass 0 to skip
   * the wait entirely.
   */
  claimRaceCheckMs?: number;
}
export const DEFAULT_CLAIM_RACE_CHECK_MS = 5000;
export async function defaultClaimChecker(
  projectId: string,
  issueNumber: number,
): Promise<
  Array<{
    changeId: string;
    status: string;
  }>
> {
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
/**
 * Extract structured context-mismatch fields from an error, if it's an
 * AdvProjectContextMismatchError. Returns undefined for other error types.
 * GH #11: surface actionable project-context diagnostics instead of
 * opaque Temporal gRPC errors.
 */
export function extractContextMismatch(error: unknown): {
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
export function resolveClarifyFindings(
  existing: ClarifyFindingSnapshot[],
  current: Array<{
    code: string;
    severity: string;
    message: string;
  }>,
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
export function isSyntheticValidationDraftSummary(summary: string): boolean {
  return isSyntheticValidationDraftPattern(summary);
}
export function buildSyntheticValidationDraftError(
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
export function collectBlankCreateArtifactOrLinkageFields(input: {
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
export function validateCreateOriginLinkage(input: {
  origin_kind?: ChangeOrigin["kind"];
  origin_issue_number?: number;
  origin_source_artifact?: string;
}):
  | {
      error: string;
      fields: string[];
      hint: string;
    }
  | undefined {
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
export type ChangeIssueUpdate = {
  added: string[];
  removed: string[];
  alreadyLinked: string[];
  notLinked: string[];
};
export function invalidGitHubIssueUrls(urls: string[]): string[] {
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
export function applyIssueUpdates(
  existing: string[] | undefined,
  add: string[] = [],
  remove: string[] = [],
): {
  github_issues: string[];
  result: ChangeIssueUpdate;
} {
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
export function buildOriginSection(origin: CrossProjectOrigin): string {
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
export async function persistClarifyFindings(
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
export async function applyClarifyReadinessToChangeOutput({
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
export async function appendClarifyNeededForCreatedChange(
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
export async function createCrossProjectFollowUp({
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
        const duplicateError = await checkActiveDuplicateChange(
          targetStore,
          summary,
        );
        if (duplicateError) {
          return formatToolOutput(duplicateError);
        }
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
export async function validateParentChange(
  store: Store,
  parentChangeId: string,
): Promise<
  | {
      ok: true;
    }
  | {
      ok: false;
      validParentIds: string[];
    }
> {
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
export function resolveScopeRepos(
  store: Store,
  explicitScope?: ChangeRepoScope[],
):
  | {
      ok: true;
      scope?: ChangeRepoScope[];
    }
  | {
      ok: false;
      error: string;
    } {
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
export async function filterChangesForProductScope<
  T extends {
    id: string;
  },
>(
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
export function productContextOutput(
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
export async function loadValidationContext(
  store: Store,
  changeId: string,
  changeTitle: string,
): Promise<{
  specs: Spec[];
  activeChanges: {
    id: string;
    title: string;
    capabilities: string[];
  }[];
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
        `Validation context: skipping peer change ${activeChange.id} (workflow unavailable): ${err instanceof Error ? err.message : String(err)}`,
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
export async function computeChangedSpecFiles(
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
