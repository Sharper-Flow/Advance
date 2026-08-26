/** Handler definitions for lifecycle change tools. */
import { z } from "zod";
import { resolve } from "path";
import type {
  FastFollowOf,
  ChangeOrigin,
  WorkNodeRef,
  Change,
} from "../../types";
import {
  createDefaultGates,
  ChangeOriginKindSchema,
  ChangeRepoScopeSchema,
  WorkNodeRefSchema,
  type ChangeRepoScope,
} from "../../types";
import type { ChangeCreateInitialMetadata, Store } from "../../storage/store";
import { getProjectId } from "../../utils/project-id";
import { loadProposalForContext } from "./artifacts";
import {
  checkActiveDuplicateChange,
  ChangeCreateProviders,
  DEFAULT_CLAIM_RACE_CHECK_MS,
  listIssueClaims,
  extractContextMismatch,
  isSyntheticValidationDraftSummary,
  buildSyntheticValidationDraftError,
  collectBlankCreateArtifactOrLinkageFields,
  validateCreateOriginLinkage,
  appendClarifyNeededForCreatedChange,
  buildEpicMembershipFromSeed,
  createCrossProjectFollowUp,
  validateEpicInStore,
  validateParentChange,
  resolveScopeRepos,
} from "./create-clarify";
import { readPortfolioState } from "../portfolio-state";
import {
  buildD3ContextFromStore,
  enforceD3ForChangeCreate,
} from "../../validator/work-graph-enforcement";
import { retireClosedChange } from "../../storage/closed-bundle";
import { formatToolOutput } from "../../utils/tool-output";
import { buildChangeContextSnapshot } from "../../utils/context-snapshot";
import { deriveDirectiveSafe } from "../../utils/workflow-directive";
import {
  formatTargetProjectContext,
  type TargetProjectOutputContext,
  withTargetPathStore,
  targetPathSchema,
  EPIC_OWNER_ROUTING_ERROR_CODES,
} from "../target-project";
import { includeSnapshotSchema } from "../shared-args";
import { coordinateChangeMutation } from "../change-mutation-coordinator";
import { logger, formatD3Error } from "./helpers";
import { epicTools } from "../epic";
import { membershipFromChangeEntry } from "../epic-convergence";

async function dispatchEpicTool(
  name: string,
  args: Record<string, unknown>,
  store: Store,
): Promise<string> {
  const definition = epicTools[name as keyof typeof epicTools] as {
    execute: (args: unknown, store: Store) => Promise<string>;
  };
  return definition.execute(args, store);
}

export const advChangeCreateHandler = async (
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
    same_project_dependencies,
    origin_kind,
    origin_issue_number,
    origin_source_artifact,
    forceRecreate,
    include,
    kind = "change",
    parent_epic_id,
    shell,
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
    same_project_dependencies?: WorkNodeRef[];
    origin_kind?: ChangeOrigin["kind"];
    origin_issue_number?: number;
    origin_source_artifact?: string;
    forceRecreate?: boolean;
    include?: { snapshot?: boolean };
    kind?: "epic" | "change";
    parent_epic_id?: string;
    shell?: boolean;
  },
  store: Store,
  _maybeOverridePath?: string,
  providers: ChangeCreateProviders = {},
) => {
  if (kind === "epic") {
    return dispatchEpicTool(
      "adv_epic_create",
      {
        epic_id: summary,
        title: summary,
        narrative: proposal ?? capability ?? summary,
      },
      store,
    );
  }
  if (shell) {
    if (!parent_epic_id) {
      return formatToolOutput({
        error: "parent_epic_id is required when shell is true",
        code: "EPIC_PARENT_REQUIRED",
      });
    }
    return dispatchEpicTool(
      "adv_epic_add_shell",
      {
        epic_id: parent_epic_id,
        title: summary,
        success_hint: proposal ?? capability ?? summary,
      },
      store,
    );
  }
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
    if (ownerRoot !== childRoot && childRoot === resolve(store.paths.root)) {
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
  let epicMembership = epicSeedResult.membership;

  // Validate same_project_dependencies at create time and refuse creation
  // when any hard prerequisite is nonterminal.
  const deps = same_project_dependencies ?? [];
  if (deps.length > 0) {
    const projectId = (await getProjectId(store.paths.root)) ?? "";
    const sourceRef: WorkNodeRef = {
      kind: "change",
      project_id: projectId,
      change_id: "pending", // New change ID is derived from summary below.
    };
    const d3Ctx = await buildD3ContextFromStore(store);
    const d3Result = enforceD3ForChangeCreate(sourceRef, deps, d3Ctx);
    if (!d3Result.ok) {
      return formatToolOutput({
        success: false,
        error: formatD3Error(d3Result.error),
        code: d3Result.error.code,
        ...(d3Result.error.code === "SHELL_PREREQ_NONTERMINAL" ||
        d3Result.error.code === "DEP_PREREQ_NONTERMINAL"
          ? {
              blocking_refs: (
                d3Result.error as { blocking_refs: WorkNodeRef[] }
              ).blocking_refs,
            }
          : {}),
      });
    }
  }

  // rq-backlogCoord02 — Pre-create claim collision check.
  // Fires for any origin that carries a concrete `issue_number` (kind
  // roadmap requires it; triage may carry it when promoting from a
  // backlog item). Skipped for adhoc/discovery without issue_number.
  // Production reads claims from the active disk projection; tests may inject
  // an explicit `claimChecker` provider for deterministic collision scenarios.
  const claimChecker =
    providers.claimChecker ??
    ((_projectId: string, issueNumber: number) =>
      listIssueClaims(store, issueNumber));
  const claimRaceCheckMs =
    providers.claimRaceCheckMs ?? DEFAULT_CLAIM_RACE_CHECK_MS;
  // reshapeTriagePortfolioBalance: claim check fires on any
  // issue-linked origin regardless of kind label, matching runtime
  // semantics reframed by rq-backlogCoord02.
  const issueNumberForClaim = origin?.issue_number;
  const shouldClaimCheck =
    issueNumberForClaim !== undefined && issueNumberForClaim > 0;
  if (shouldClaimCheck && issueNumberForClaim !== undefined) {
    const projectId = (await getProjectId(store.paths.root)) ?? "";
    const existing = await claimChecker(projectId, issueNumberForClaim);
    if (existing.length > 0) {
      const first = existing[0];
      return formatToolOutput({
        error: `Issue #${issueNumberForClaim} is already claimed by change ${first.changeId} (status: ${first.status})`,
        code: "CLAIM_CONFLICT",
        issue_number: issueNumberForClaim,
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
      forceRecreate,
    });
  }
  if (epicMembership) {
    const epicValidation = await validateEpicInStore(
      store,
      { root: store.paths.root },
      epicMembership,
    );
    if (epicValidation.error) {
      return formatToolOutput(epicValidation.error);
    }
    if (epicValidation.entry) {
      epicMembership = membershipFromChangeEntry(
        epicMembership.epic_id,
        epicValidation.entry,
        epicMembership.title,
        "create",
      );
    }
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
  const projectId = (await getProjectId(store.paths.root)) ?? "";
  const duplicateError = await checkActiveDuplicateChange(store, summary, {
    forceRecreate,
    projectId,
  });
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
  if (deps.length > 0) {
    initialMetadata.same_project_dependencies = deps;
  }
  const createOptions =
    Object.keys(initialMetadata).length > 0 ? { initialMetadata } : undefined;
  // rq-backlogCoord08: seed creation metadata before workflow start so
  // origin/search attributes are authoritative persisted state, not a late
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
  const output: Record<string, unknown> = {
    changeId: result.changeId,
    artifactAuthority: "change.documents",
    ...(result.duplicateWarning
      ? { duplicateWarning: result.duplicateWarning }
      : {}),
  };
  // rq-createPortfolioLine01 (AC4): bounded portfolio state at creation.
  // Deadline-capped and degrades to { available: false } — never blocks
  // creation (DDC3, R4).
  output.portfolioState = await readPortfolioState(store);
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
    const createdGates = createdChangeResult.data.gates ?? createDefaultGates();
    // AC5: created-change snapshot carries the `Next:` orientation line.
    // Best effort: a derivation failure must not break change-create; the
    // snapshot omits the `Next:` line.
    const createdDirective = deriveDirectiveSafe(
      {
        ...createdChangeResult.data,
        projectId: createdChangeResult.data.adv_project_id ?? "unknown",
        gates: createdGates,
      } as never,
      Date.now(),
    );
    if (!createdDirective) {
      logger.warn(
        `deriveWorkflowDirective failed in change-create for ${result.changeId}; snapshot omits Next line`,
      );
    }
    if (include?.snapshot) {
      output._contextSnapshot = buildChangeContextSnapshot({
        change: createdChangeResult.data,
        proposalText,
        gates: createdGates,
        workdir: store.paths.root,
        directive: createdDirective,
      });
    }
  }
  // rq-backlogCoord03 — Post-create double-check for race tolerance.
  // Concurrent creates may both pass the pre-create check. Re-query after the
  // bounded race-check window
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
  if (parent_epic_id) {
    const created = await dispatchEpicTool(
      "adv_epic_link_change",
      {
        epic_id: parent_epic_id,
        change_id: result.changeId,
        link_evidence: "change created with parent_epic_id",
      },
      store,
    );
    try {
      const linked = JSON.parse(created) as Record<string, unknown>;
      if (linked.success === false) return created;
    } catch {
      return created;
    }
  }
  return formatToolOutput(output);
};
export const advChangeUpdateHandler = async (
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
    priorApprovalEvidence,
    link_change,
    unlink_change,
    reorder_entries,
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
    priorApprovalEvidence?: string;
    link_change?: string;
    unlink_change?: string;
    reorder_entries?: string[];
  },
  store: Store,
) => {
  if (link_change || unlink_change || reorder_entries) {
    const existing = await store.changes.get(changeId);
    if (existing.success && existing.data) {
      return formatToolOutput({
        error: `Change ${changeId} is not an Epic`,
        code: "EPIC_REQUIRED",
      });
    }
    const epic = await store.epics.get(changeId);
    if (!epic.success || !epic.data) {
      return formatToolOutput({
        error: `Epic not found: ${changeId}`,
        code: "EPIC_REQUIRED",
      });
    }
    const evidence = priorApprovalEvidence ?? "change facade Epic operation";
    if (link_change) {
      return dispatchEpicTool(
        "adv_epic_link_change",
        {
          epic_id: changeId,
          change_id: link_change,
          link_evidence: evidence,
        },
        store,
      );
    }
    if (unlink_change) {
      return dispatchEpicTool(
        "adv_epic_unlink_change",
        {
          epic_id: changeId,
          change_id: unlink_change,
          unlink_evidence: evidence,
        },
        store,
      );
    }
    return dispatchEpicTool(
      "adv_epic_reorder",
      {
        epic_id: changeId,
        entry_ids: reorder_entries,
        expected_version: epic.data.version,
      },
      store,
    );
  }
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
        error: "At least one update field must be provided.",
        hint: "Pass one or more of: proposal, problemStatement, agreement, design, executiveSummary.",
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
      // Epics and changes occupy separate stores but share one id namespace,
      // so an Epic id resolves to no change here. Reporting it as missing
      // sends the caller hunting an id problem that does not exist. The
      // inverse case is already typed as EPIC_REQUIRED on the structural
      // branch above.
      //
      // Fails open: this path is already returning an error, and an
      // unreadable Epic store must not replace change-not-found with a
      // store failure.
      let epicWithSameId: unknown;
      try {
        const epicResult = await activeStore.epics?.get(changeId);
        epicWithSameId = epicResult?.success ? epicResult.data : undefined;
      } catch {
        epicWithSameId = undefined;
      }
      if (epicWithSameId) {
        return formatToolOutput({
          error: `'${changeId}' is an Epic, not a change. Epics do not carry change artifacts.`,
          code: "EPIC_ARTIFACTS_UNSUPPORTED",
          hint: "Epics carry a narrative rather than proposal/problemStatement/agreement/design/executiveSummary. In Code Mode, read it with 'tools.adv.epic_show' and edit Epic entries through 'adv_change_update link_change / unlink_change / reorder_entries'.",
        });
      }
      return formatToolOutput({
        error: `Change '${changeId}' not found.`,
        hint: "Fetch valid change IDs with 'adv_change_list' or confirm the target with 'adv_change_show changeId: <id>' before retrying.",
      });
    }
    const artifactUpdates = {
      ...(proposal !== undefined ? { proposal } : {}),
      ...(problemStatement !== undefined ? { problemStatement } : {}),
      ...(agreement !== undefined ? { agreement } : {}),
      ...(design !== undefined ? { design } : {}),
      ...(executiveSummary !== undefined ? { executiveSummary } : {}),
    };
    const outcome = await coordinateChangeMutation<Change>({
      authority: {
        reason: "change artifact update",
        evidence: priorApprovalEvidence ?? "operator-requested artifact update",
      },
      changesDir: activeStore.paths.changes,
      intent: {
        changeId,
        mutationKind: "artifact_update",
        mutateLatestProjection: (latest) => ({
          ...latest,
          documents: { ...(latest.documents ?? {}), ...artifactUpdates },
        }),
        verifyProjection: (readback) => {
          const artifactsVerified = Object.entries(artifactUpdates).every(
            ([kind, content]) =>
              (
                readback.documents as
                  | Record<string, string | undefined>
                  | undefined
              )?.[kind] === content,
          );
          return artifactsVerified;
        },
      },
    });
    if (outcome.kind !== "verified") {
      return formatToolOutput({
        error:
          outcome.kind === "unverified"
            ? outcome.reason
            : `Artifact update requires operator attention: ${outcome.kind === "stale_revision" ? `stale revision ${outcome.actual}` : outcome.reason}`,
        changeId,
      });
    }
    return formatToolOutput({
      success: true,
      changeId,
      artifactAuthority: "change.documents",
      ...(projectContext ? { _projectContext: projectContext } : {}),
    });
  };
  if (target_path) {
    return withTargetPathStore(
      {
        currentProjectPath: store.paths.root,
        target_path,
        stateRequirement: "authoritative",
        target_confirmed,
        confirmationEvidence,
      },
      async ({ context, store: targetStore }) =>
        runUpdate(targetStore, formatTargetProjectContext(context)),
    );
  }
  return runUpdate(store);
};
export const advChangeCloseHandler = async (
  {
    changeId,
    reason,
    approvedByUser: _approvedByUser,
    approvalEvidence,
    supersededBy,
    dryRun,
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
    const epic = activeStore.epics
      ? await activeStore.epics.get(changeId)
      : undefined;
    if (epic?.success && epic.data) {
      return dispatchEpicTool(
        "adv_epic_retire",
        {
          epic_id: changeId,
          expected_version: epic.data.version,
          evidence: approvalEvidence,
          retired_by: "agent",
          dryRun,
        },
        activeStore,
      );
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
    const closeInput = {
      approvalEvidence,
      reason,
      supersededBy,
      cancelledAt: new Date().toISOString(),
    };
    try {
      const outcome = await coordinateChangeMutation<Change>({
        authority: {
          reason: `close change as ${reason}`,
          evidence: approvalEvidence,
        },
        changesDir: activeStore.paths.changes,
        intent: {
          changeId,
          mutationKind: "status_transition",
          mutateLatestProjection: (latest) => ({
            ...latest,
            status: "closed",
            lifecycleState: "closed",
            closure: {
              reason,
              approved_by_user: true,
              approval_evidence: approvalEvidence,
              approved_at: closeInput.cancelledAt,
              superseded_by: supersededBy,
            },
          }),
          verifyProjection: (readback) =>
            readback.status === "closed" &&
            readback.lifecycleState === "closed",
        },
      });
      if (outcome.kind !== "verified") {
        return formatToolOutput({
          error:
            outcome.kind === "unverified"
              ? outcome.reason
              : `Cannot safely close change: ${outcome.kind === "stale_revision" ? `stale revision ${outcome.actual}` : outcome.reason}`,
          changeId,
        });
      }
      // The closed record exists only inside `changes/<id>/`, so that directory
      // cannot be removed until the record has been copied to `closed/<id>/`
      // and proven readable there. retireClosedChange owns that ordering and
      // fails closed: if durability is not proven, nothing is removed.
      // AC1/AC4, constraint C4.
      let cleanupWarning: string | undefined;
      if (activeStore.paths?.changes && activeStore.paths?.closed) {
        const retirement = await retireClosedChange({
          change: outcome.value,
          closedPath: activeStore.paths.closed,
          changesDir: activeStore.paths.changes,
        });
        if (!retirement.ok) {
          return formatToolOutput({
            error:
              `Change ${changeId} was marked closed but could not be made ` +
              `durable: ${retirement.error}. Its record was left in place.`,
            changeId,
          });
        }
        cleanupWarning = retirement.cleanupWarning;
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
          stateRequirement: "authoritative",
          mutation: !dryRun,
          target_confirmed,
          confirmationEvidence,
        },
        async ({ context, store: targetStore }) =>
          runClose(targetStore, formatTargetProjectContext(context)),
      );
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      return formatToolOutput({
        success: false,
        error: `Target project close unavailable: ${errorText}`,
        changeId,
        target_path,
      });
    }
  }
  return runClose(store);
};
export const lifecycleChangeTools = {
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
      same_project_dependencies: z
        .array(WorkNodeRefSchema)
        .default([])
        .describe(
          "Same-project hard prerequisite changes/shells. Change creation is refused while any prereq is nonterminal.",
        ),
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
      forceRecreate: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Bypass duplicate detection when the existing active change's workflow is poisoned and a new change is required. Only allowed when the duplicate is poisoned.",
        ),
      kind: z.enum(["epic", "change"]).default("change").optional(),
      parent_epic_id: z.string().optional(),
      shell: z.boolean().optional(),
      ...includeSnapshotSchema.shape,
    },
    execute: advChangeCreateHandler,
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
          "Optional absolute path to another ADV project. When provided, mutates that project's disk-backed store.",
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
      priorApprovalEvidence: z
        .string()
        .optional()
        .describe(
          "Optional prior user approval evidence for audit continuity when recovery follows a gate/acceptance approval.",
        ),
      link_change: z.string().optional(),
      unlink_change: z.string().optional(),
      reorder_entries: z.array(z.string()).optional(),
    },
    execute: advChangeUpdateHandler,
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
      target_path: targetPathSchema.shape.target_path,
      target_confirmed: targetPathSchema.shape.target_confirmed,
      confirmationEvidence: targetPathSchema.shape.confirmationEvidence,
    },
    execute: advChangeCloseHandler,
  },
};
