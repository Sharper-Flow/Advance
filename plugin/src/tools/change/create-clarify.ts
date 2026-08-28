/**
 * create-clarify helpers extracted from change.ts.
 */
import { basename, join, resolve } from "path";
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
import type { ChangeCreateInitialMetadata, Store } from "../../storage/store";
import type { ConflictInventory } from "../../validator/types";
import { generateChangeId } from "../../utils/change-id";
import { isSyntheticValidationDraftPattern } from "../../utils/synthetic-fixture-detector";
import { createLogger } from "../../utils/debug-log";
import { runClarifyReadinessChecks } from "../../validator/clarify-readiness";
import { formatToolOutput } from "../../utils/tool-output";
import {
  formatTargetProjectContext,
  type TargetProjectContext,
  withTargetPathStore,
} from "../target-project";
import { loadProposalForContext } from "../change/artifacts";
import {
  findChangeEntry,
  membershipFromChangeEntry,
} from "../epic-convergence";
import {
  loadValidationInventory,
  raceWithDeadline,
} from "./validation-projection";
import { createReadDeadline, type ReadDeadline } from "./validation-projection";
import { withTimeout, TimeoutError } from "../../utils/with-timeout";
const logger = createLogger("change");

/** Best-effort persistence budget for clarify-readiness enrichment on reads. */
const CLARIFY_READINESS_PERSIST_TIMEOUT_MS = 1_000;
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
  options?: {
    forceRecreate?: boolean;
    projectId?: string;
  },
): Promise<
  | {
      error: string;
      code: "DUPLICATE_ACTIVE_CHANGE";
      existing_change_id: string;
      existing_change_title: string;
      hint: string;
      force_recreate?: true;
    }
  | undefined
> {
  const candidateChangeId = generateChangeId(summary);
  const existingActiveList = await store.changes.list({ status: "active" });
  const existingDuplicate = existingActiveList.changes.find(
    (c) => c.id === candidateChangeId || c.title === summary,
  );
  if (!existingDuplicate) return undefined;

  const baseHint = `Resume the existing change with /adv-apply ${existingDuplicate.id}, or archive it before creating a new one.`;
  return {
    error: `An active change already exists for "${summary}"`,
    code: "DUPLICATE_ACTIVE_CHANGE",
    existing_change_id: existingDuplicate.id,
    existing_change_title: existingDuplicate.title,
    hint: options?.forceRecreate
      ? `${baseHint} forceRecreate is not supported by disk-only persistence.`
      : baseHint,
  };
}
/**
 * rq-backlogCoord02 / rq-backlogCoord03 — injection seam for the
 * pre-create + post-create claim-collision checks. Production wires to
 * The disk projection is the production claim source; tests may inject a
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
   * Post-create double-check window in milliseconds. Defaults to 5000 so a
   * concurrent disk projection can become visible before the second check.
   * Tests pass 0 to skip the wait entirely.
   */
  claimRaceCheckMs?: number;
}
export const DEFAULT_CLAIM_RACE_CHECK_MS = 5000;
export async function listIssueClaims(
  store: Store,
  issueNumber: number,
): Promise<Array<{ changeId: string; status: string }>> {
  const active = await store.changes.list({ status: "active" });
  return active.changes
    .filter(
      (change) =>
        (change as unknown as Change).origin?.issue_number === issueNumber,
    )
    .map((change) => ({ changeId: change.id, status: change.status }));
}
/**
 * Extract structured context-mismatch fields from an error, if it's an
 * AdvProjectContextMismatchError. Returns undefined for other error types.
 * GH #11: surface actionable project-context diagnostics instead of
 * opaque transport errors.
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
function resolveClarifyFindings(
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

export interface EpicSeedInput {
  epic_id?: string;
  entry_id?: string;
  epic_order?: number;
  epic_title?: string;
}

/**
 * Validate create-time Epic membership seed fields for completeness and build
 * the compact membership projection. Partial seeds are rejected before any
 * change is created (same-project or cross-project).
 */
export function buildEpicMembershipFromSeed(input: EpicSeedInput): {
  membership?: Change["epic_membership"];
  error?: {
    error: string;
    code: "INVALID_EPIC_MEMBERSHIP_SEED";
    fields: string[];
  };
} {
  const seedFields = [
    ["epic_id", input.epic_id],
    ["entry_id", input.entry_id],
    ["epic_title", input.epic_title],
  ] as const;
  const missingEpicSeedFields = seedFields
    .filter(([, value]) => value === undefined)
    .map(([field]) => field);
  const hasAnyEpicSeedField = seedFields.some(
    ([, value]) => value !== undefined,
  );
  if (hasAnyEpicSeedField && missingEpicSeedFields.length > 0) {
    return {
      error: {
        error:
          "Complete create-time Epic membership requires epic_id, entry_id, and epic_title; omit all Epic fields when no Epic membership is intended.",
        code: "INVALID_EPIC_MEMBERSHIP_SEED",
        fields: missingEpicSeedFields,
      },
    };
  }
  if (input.epic_id && input.entry_id && input.epic_title) {
    return {
      membership: {
        epic_id: input.epic_id,
        entry_id: input.entry_id,
        order: input.epic_order ?? 0,
        title: input.epic_title,
        linked_at: new Date().toISOString(),
      },
    };
  }
  return {};
}

export async function validateEpicInStore(
  store: Store,
  context: Pick<TargetProjectContext, "root">,
  membership: NonNullable<Change["epic_membership"]>,
): Promise<{
  error?: { error: string; code: string; hint?: string };
  entry?: Extract<import("../../types").EpicEntry, { kind: "change" }>;
}> {
  const epicResult = await store.epics.get(membership.epic_id);
  if (!epicResult.success || !epicResult.data) {
    return {
      error: {
        error: `Epic not found: ${membership.epic_id} in ${context.root}`,
        code: "EPIC_NOT_FOUND",
      },
    };
  }
  const entry = findChangeEntry(epicResult.data, {
    mode: "entry_id",
    entryId: membership.entry_id,
  });
  if (!entry) {
    return {
      error: {
        error: `Epic entry not found: ${membership.entry_id} in Epic ${membership.epic_id}`,
        code: "ENTRY_NOT_FOUND",
        hint: "Use parent_epic_id to create a new Epic entry; entry_id seeds an existing entry.",
      },
    };
  }
  return { entry };
}

async function validateTargetEpic(input: {
  epicMembership: NonNullable<Change["epic_membership"]>;
  targetStore: Store;
  targetContext: TargetProjectContext;
  epic_owner_target_path?: string;
  epic_owner_target_confirmed?: true;
  epic_owner_confirmationEvidence?: string;
  sourceStore: Store;
}): Promise<{
  error?: { error: string; code: string; hint?: string };
  ownerContext?: TargetProjectContext;
  entry?: Extract<import("../../types").EpicEntry, { kind: "change" }>;
}> {
  const ownerRoot = input.epic_owner_target_path
    ? resolve(input.epic_owner_target_path)
    : input.targetContext.root;
  const targetRoot = input.targetContext.root;

  if (ownerRoot === targetRoot) {
    return validateEpicInStore(
      input.targetStore,
      input.targetContext,
      input.epicMembership,
    );
  }

  try {
    return await withTargetPathStore(
      {
        currentProjectPath: input.sourceStore.paths.root,
        target_path: input.epic_owner_target_path!,
        stateRequirement: "authoritative",
        target_confirmed: input.epic_owner_target_confirmed,
        confirmationEvidence: input.epic_owner_confirmationEvidence,
      },
      async ({ context, store: ownerStore }) => {
        const result = await validateEpicInStore(
          ownerStore,
          context,
          input.epicMembership,
        );
        if (result.error) return result;
        return { ownerContext: context, entry: result.entry };
      },
    );
  } catch (err) {
    return {
      error: {
        error: `Failed to validate Epic owner project at ${input.epic_owner_target_path}: ${err instanceof Error ? err.message : String(err)}`,
        code: "EPIC_OWNER_UNREACHABLE",
      },
    };
  }
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
        hint: "Pass origin_kind ('discovery' | 'triage' | 'adhoc') alongside allowed linkage fields, or omit linkage fields for an unlinked change. ('roadmap' is readable legacy only — retired for new writes.)",
      };
    }
    return undefined;
  }
  if (input.origin_kind === "roadmap") {
    // reshapeTriagePortfolioBalance: 'roadmap' is readable legacy only.
    return {
      error:
        "ORIGIN_KIND_ROADMAP_RETIRED: origin_kind 'roadmap' is retired for new writes.",
      fields: ["origin_kind"],
      hint: "Use origin_kind 'triage' for issue-linked changes, or 'discovery' / 'adhoc' for non-issue-driven changes. (The 'roadmap' kind remains readable on archived changes for backward compatibility.)",
    };
  }
  if (input.origin_kind === "discovery" && hasIssue) {
    return {
      error: "origin_issue_number is only allowed for triage origins.",
      fields: ["origin_issue_number"],
      hint: "Use origin_kind 'triage' for issue-linked changes, or omit origin_issue_number for discovery origins.",
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
    await withTimeout(
      (async () => {
        const freshResult = await store.changes.get(changeId);
        if (freshResult.success && freshResult.data) {
          freshResult.data.clarify_findings = findings;
          await store.changes.save(freshResult.data);
        }
      })(),
      CLARIFY_READINESS_PERSIST_TIMEOUT_MS,
      `${errorLabel}: deadline exceeded`,
    );
  } catch (err) {
    if (err instanceof TimeoutError) {
      logger.warn(`${errorLabel}: timed out after ${err.timeoutMs}ms`);
      return;
    }
    logger.warn(`${errorLabel}: ${(err as Error).message}`);
  }
}
export async function applyClarifyReadinessToChangeOutput({
  output,
  change,
  proposalText,
  changeId,
  store,
  persist = true,
}: {
  output: Record<string, unknown>;
  change: Change;
  proposalText: string;
  changeId: string;
  store: Store;
  persist?: boolean;
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
    if (persist && updated.length > 0) {
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
    if (persist && updated.length > 0) {
      await persistClarifyFindings(
        store,
        changeId,
        updated,
        "Failed to resolve clarify findings",
      );
    }
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
  epicMembership,
  epic_owner_target_path,
  epic_owner_target_confirmed,
  epic_owner_confirmationEvidence,
  store,
  forceRecreate,
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
  epicMembership?: Change["epic_membership"];
  epic_owner_target_path?: string;
  epic_owner_target_confirmed?: true;
  epic_owner_confirmationEvidence?: string;
  store: Store;
  forceRecreate?: boolean;
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
        stateRequirement: "authoritative",
        target_confirmed,
        confirmationEvidence,
      },
      async ({ context, store: targetStore }) => {
        const duplicateError = await checkActiveDuplicateChange(
          targetStore,
          summary,
          { forceRecreate, projectId: context.projectId },
        );
        if (duplicateError) {
          return formatToolOutput(duplicateError);
        }

        let ownerContext: TargetProjectContext | undefined;
        let derivedEpicMembership = epicMembership;
        if (epicMembership) {
          const epicValidation = await validateTargetEpic({
            epicMembership,
            targetStore,
            targetContext: context,
            epic_owner_target_path,
            epic_owner_target_confirmed,
            epic_owner_confirmationEvidence,
            sourceStore: store,
          });
          if (epicValidation.error) {
            return formatToolOutput(epicValidation.error);
          }
          ownerContext = epicValidation.ownerContext;
          if (epicValidation.entry) {
            derivedEpicMembership = membershipFromChangeEntry(
              epicMembership.epic_id,
              epicValidation.entry,
              epicMembership.title,
              "create",
            );
          }
        }

        const initialMetadata: ChangeCreateInitialMetadata = {
          cross_project_origin: origin,
        };
        if (derivedEpicMembership) {
          initialMetadata.epic_membership = {
            ...derivedEpicMembership,
            epic_project_id: ownerContext?.projectId ?? context.projectId,
            source: "create",
          };
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
          initialMetadata,
        });
        const output: Record<string, unknown> = {
          changeId: result.changeId,
          artifactAuthority: "change.documents",
          ...(result.duplicateWarning
            ? { duplicateWarning: result.duplicateWarning }
            : {}),
          cross_project_origin: origin,
          target_path,
          _projectContext: formatTargetProjectContext(context),
        };
        if (derivedEpicMembership) {
          output.epic_membership = initialMetadata.epic_membership;
        }
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
 * Options for building a validation input bundle.
 */
export interface LoadValidationContextOptions {
  /**
   * Request-scoped aggregate deadline. If omitted, a fresh 8-second deadline is
   * created at the start of the call.
   */
  deadline?: ReadDeadline;
}

/**
 * Execute async work over an array with bounded concurrency while preserving
 * input order. Used for spec hydration so validation never fans out without a
 * cap.
 */
async function boundedMap<T, U>(
  items: T[],
  fn: (item: T, index: number) => Promise<U>,
  concurrency: number,
): Promise<U[]> {
  if (concurrency <= 0) throw new Error("concurrency must be positive");
  if (items.length === 0) return [];

  const results: U[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

async function loadSpecsForValidation(
  store: Store,
  deadline: ReadDeadline | undefined,
): Promise<Spec[]> {
  const specList = await raceWithDeadline(store.specs.list(), deadline);
  const specs = await boundedMap(
    specList.specs,
    async (specInfo) => {
      const specResult = await raceWithDeadline(
        store.specs.get(specInfo.name),
        deadline,
      );
      return specResult.success && specResult.data ? specResult.data : null;
    },
    4,
  );
  return specs.filter((s): s is Spec => s !== null);
}

async function loadProposalForValidation(
  store: Store,
  changeId: string,
  changeTitle: string,
  deadline: ReadDeadline | undefined,
): Promise<string> {
  const { content } = await raceWithDeadline(
    loadProposalForContext(store, changeId, changeTitle),
    deadline,
  );
  return content;
}

async function loadChangedSpecFilesForValidation(
  rootDir: string,
  deadline: ReadDeadline | undefined,
): Promise<string[] | null | undefined> {
  let changedSpecFiles: string[] | null | undefined = undefined;
  try {
    const gitPath = join(rootDir, ".git");
    const gitStat = await raceWithDeadline(stat(gitPath), deadline);
    if (gitStat.isFile()) {
      const gitFile = await raceWithDeadline(
        readFile(gitPath, "utf-8"),
        deadline,
      );
      if (gitFile.includes("gitdir:")) {
        changedSpecFiles = await raceWithDeadline(
          computeChangedSpecFiles(rootDir),
          deadline,
        );
      }
    }
  } catch {
    // best-effort only — changedSpecFiles stays undefined (not in worktree)
  }
  return changedSpecFiles;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else if (typeof value === "object") {
    for (const key of Object.keys(value))
      deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

/**
 * Build the validator input bundle for a change.
 *
 * Specs stay loaded from the current worktree through the store. When the
 * current root is a git worktree, this also computes merge-base-aware spec
 * divergence against the default branch so validation can warn only on real
 * branch-local spec changes.
 *
 * Builds a typed conflict inventory (complete paginated change inventory
 * with Epic/member context and explicit completeness state). Active changes
 * and Epic members are authoritative; archived changes are related context
 * only.
 *
 * All independent input reads (projection, specs, proposal, Git context) are
 * started under a single request-scoped deadline with bounded spec concurrency.
 * The returned snapshot is deep-frozen so late-settled background work cannot
 * mutate it.
 */
export async function loadValidationContext(
  store: Store,
  changeId: string,
  changeTitle: string,
  options?: LoadValidationContextOptions,
): Promise<{
  specs: Spec[];
  activeChanges: {
    id: string;
    title: string;
    capabilities: string[];
  }[];
  conflictInventory: ConflictInventory;
  proposalText: string;
  changedSpecFiles: string[] | null | undefined;
}> {
  const deadline = options?.deadline ?? createReadDeadline(8_000);

  // Start all independent input reads concurrently under the same deadline.
  const [inventoryResult, specsResult, proposalResult, gitResult] =
    await Promise.allSettled([
      loadValidationInventory(store, changeId, { deadline }),
      loadSpecsForValidation(store, deadline),
      loadProposalForValidation(store, changeId, changeTitle, deadline),
      loadChangedSpecFilesForValidation(store.paths.root, deadline),
    ]);

  // Build the typed conflict inventory, defaulting to blocked if projection
  // itself threw.
  const conflictInventory: ConflictInventory =
    inventoryResult.status === "fulfilled"
      ? inventoryResult.value
      : {
          entries: [],
          completeness: "blocked",
          warnings: [
            `Change inventory source unreachable: ${inventoryResult.reason instanceof Error ? inventoryResult.reason.message : String(inventoryResult.reason)}`,
          ],
          source: "validation-inventory-projection",
          ownChangeId: changeId,
          canConcludeClean: false,
        };

  const specs: Spec[] =
    specsResult.status === "fulfilled" ? specsResult.value : [];

  const proposalText: string =
    proposalResult.status === "fulfilled"
      ? proposalResult.value
      : `# ${changeTitle}\n\n## Intent\n\n<!-- Auto-generated scaffold: proposal.md timed out or failed during validation input load. -->\n\n## Scope\n\n- (unknown — proposal.md not available)\n\n## User Outcomes\n\n- [ ] Users can see what outcome this change is meant to deliver\n- [ ] Discovery firms acceptance criteria and success criteria downstream\n`;

  const changedSpecFiles: string[] | null | undefined =
    gitResult.status === "fulfilled" ? gitResult.value : undefined;

  // Any branch failure (timeout or unexpected error) structurally blocks a
  // clean/pass verdict. Diagnostics from the inventory are still preserved.
  const anyBranchFailed = [
    inventoryResult,
    specsResult,
    proposalResult,
    gitResult,
  ].some((r) => r.status === "rejected");
  if (anyBranchFailed) {
    conflictInventory.canConcludeClean = false;
  }

  // Legacy activeChanges array derived from the typed inventory.
  const activeChanges = conflictInventory.entries
    .filter((e) => !e.isArchived && !e.isOwnChange)
    .map((e) => ({
      id: e.id,
      title: e.title,
      capabilities: e.capabilities ?? [],
    }));

  return deepFreeze({
    specs,
    activeChanges,
    conflictInventory,
    proposalText,
    changedSpecFiles,
  });
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
