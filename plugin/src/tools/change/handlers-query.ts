/** Handler definitions for query change tools. */
import { z } from "zod";
import {
  ChangeListStatusFilterSchema,
  BriefingPacketLaneSchema,
  BRIEFING_PACKET_SESSION_METADATA_MAX_LENGTH,
  type ArtifactKind,
  type Change,
  type ScopedSubagentReport,
  type BriefingPacketLane,
} from "../../types";
import type { Store } from "../../storage/store";
import { getReflection } from "../../storage/reflection";
import { validateChange } from "../../validator";
import { projectLoopLedger } from "../../utils/loop-ledger";
import {
  compactOpsFollowupAnnotation,
  compactOpsFollowupLinkAnnotations,
} from "../ops-followup-readback";
import {
  normalizeArtifactMetadataForReadback,
  normalizeGateArtifactEvidenceForReadback,
  loadProposalForContext,
  readArtifact,
  readArtifacts,
} from "./artifacts";
import {
  applyClarifyReadinessToChangeOutput,
  filterChangesForProductScope,
  productContextOutput,
  loadValidationContext,
} from "./create-clarify";
import { reconcileRecoveredGates } from "../gate";
import {
  DEFAULT_MAX_CHARS,
  formatToolOutput,
  paginate,
  resolveOutputMode,
} from "../../utils/tool-output";
import { withTimeout, TimeoutError } from "../../utils/with-timeout";
import {
  buildTodoProjection,
  formatValidationOutput,
  formatSmellReport,
} from "../../utils/tool-formatters";
import { checkRequirementSmells } from "../../validator/prep-readiness";
import { buildChangeContextSnapshot } from "../../utils/context-snapshot";
import { deriveDirectiveSafe } from "../../utils/workflow-directive";
import { degradedPhasePlan, derivePhasePlanSafe } from "../../utils/phase-plan";
import { withPhaseDirective } from "../../utils/phase-directive";
import { renderBriefingPacket } from "../../utils/briefing-packet-renderer";
import {
  formatTargetProjectContext,
  type TargetProjectOutputContext,
  withOptionalTargetPathStore,
  withTargetPathStore,
} from "../target-project";
import { buildExternalDependencyStatus } from "../external-dependency-status";
import {
  logger,
  shapeDirectiveResponse,
  createChangeShowSubreadRunner,
  applyArtifactContentToOutput,
  subagentReportReadbackKey,
  DEFAULT_BRIEFING_PACKET_LANE,
  buildBriefingPacketForChange,
  deriveChangePhase,
} from "./helpers";
import { CHANGE_VALIDATE_CONTEXT_TIMEOUT_MS } from "./helpers";
import { listPeerSessions } from "../session";
import { epicTools } from "../epic";
import { backlogShellTools } from "../backlog-shell";
import { getProjectId } from "../../utils/project-id";
import {
  listActiveEpicProjections,
  listRetiredEpicProjections,
} from "../../storage/epic-projection-reader";
import {
  classifyMembershipVerification,
  type EpicMembershipLookup,
  type EpicMembershipVerification,
} from "../epic-convergence";

async function dispatchFacadeRead(
  group: Record<string, unknown>,
  name: string,
  args: unknown,
  store: Store,
): Promise<string> {
  const definition = group[name] as {
    execute: (args: unknown, store: Store) => Promise<string>;
  };
  return definition.execute(args, store);
}

/** Build one active/retired Epic index for a membership-bearing change read. */
async function verifyEpicMembership(
  store: Store,
  change: Change,
): Promise<EpicMembershipVerification> {
  const membership = change.epic_membership;
  if (!membership) return "unknown";
  let localProjectId: string | null | undefined =
    store.productContext?.repoProjectId ?? undefined;
  if (localProjectId === undefined) {
    try {
      localProjectId = await getProjectId(store.paths.root);
    } catch {
      localProjectId = undefined;
    }
  }

  try {
    const [activeEpics, retiredEpics] = await Promise.all([
      listActiveEpicProjections(store.paths.activeEpics),
      listRetiredEpicProjections(store.paths.retiredEpics),
    ]);
    if (!activeEpics.success || !retiredEpics.success) {
      return classifyMembershipVerification(membership, {
        kind: "unavailable",
      });
    }

    const epicIndex = new Map<
      string,
      NonNullable<EpicMembershipLookup["epic"]>
    >();
    for (const epic of activeEpics.data) {
      epicIndex.set(epic.id, { entries: epic.entries, retired: false });
    }
    for (const epic of retiredEpics.data) {
      epicIndex.set(epic.id, { entries: epic.entries, retired: true });
    }
    return classifyMembershipVerification(membership, {
      kind: "available",
      changeId: change.id,
      localProjectId,
      epic: epicIndex.get(membership.epic_id),
    });
  } catch {
    return classifyMembershipVerification(membership, { kind: "unavailable" });
  }
}

export const advChangeShowHandler = async (
  {
    changeId,
    limit,
    offset,
    target_path,
    include,
    outputMode,
    validate,
    strict,
    strictWarnings,
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
      sessions?: boolean;
      briefingPacket?: boolean;
      briefingPacketLane?: BriefingPacketLane;
      briefingPacketRequest?: string;
      entries?: boolean;
    };
    outputMode?: "compact" | "pretty";
    validate?: boolean;
    strict?: boolean;
    strictWarnings?: boolean;
  },
  store: Store,
) => {
  let epic: Awaited<ReturnType<Store["epics"]["get"]>> | undefined;
  try {
    epic = store.epics ? await store.epics.get(changeId) : undefined;
  } catch {
    epic = undefined;
  }
  if (epic?.success && epic.data) {
    return dispatchFacadeRead(
      epicTools as Record<string, unknown>,
      "adv_epic_show",
      { epic_id: changeId, view: include?.entries ? "full" : "compact" },
      store,
    );
  }
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
    const subread = createChangeShowSubreadRunner();
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
      artifacts: await normalizeArtifactMetadataForReadback(change.artifacts),
      gates: await normalizeGateArtifactEvidenceForReadback(change.gates),
    };
    let validationOutput: unknown;
    if (validate) {
      const validation = await advChangeValidateHandler(
        { changeId, strict, strictWarnings },
        activeStore,
      );
      try {
        validationOutput = JSON.parse(validation);
        if (
          validationOutput &&
          typeof validationOutput === "object" &&
          "passed" in validationOutput
        ) {
          validationOutput = {
            ...validationOutput,
            valid: (validationOutput as { passed: boolean }).passed,
          };
        }
      } catch {
        validationOutput = { raw: validation };
      }
    }
    if (include?.artifactOnly) {
      const output: Record<string, unknown> = {
        id: displayChange.id,
        title: displayChange.title,
        status: displayChange.status,
        artifacts: displayChange.artifacts,
        _artifactOnly: true,
        ...(validate ? { validation: validationOutput } : {}),
        ...(projectContext ? { _projectContext: projectContext } : {}),
      };
      if (requestedKinds.length > 0) {
        const artifactRead = await subread.runLocalCapable("artifacts", () =>
          readArtifacts(activeStore, changeId, requestedKinds),
        );
        if (artifactRead.ok) {
          applyArtifactContentToOutput(output, artifactRead.value);
        } else {
          output._artifactsError =
            artifactRead.error instanceof Error
              ? artifactRead.error.message
              : String(artifactRead.error);
        }
      }
      const changeShowHydrationStats = subread.getHydrationStats();
      if (changeShowHydrationStats) {
        output.hydrationStats = changeShowHydrationStats;
      }
      return formatToolOutput(output);
    }
    const { content: proposalText } = await loadProposalForContext(
      activeStore,
      changeId,
      change.title,
    );
    const epicMembershipVerification = change.epic_membership
      ? await verifyEpicMembership(activeStore, change)
      : undefined;
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
      ...(change.epic_membership && epicMembershipVerification
        ? { epic_membership_verification: epicMembershipVerification }
        : {}),
    };
    if (validate) output.validation = validationOutput;
    // Surface linked ops follow-up state structurally. The full profile
    // remains on the change; this just guarantees it is visible even when
    // downstream formatters would otherwise drop undefined keys.
    output.ops_followup = change.ops_followup ?? null;
    output.ops_followup_links = change.ops_followup_links ?? [];
    // Presence follows the artifact authority chain (projection → disk →
    // archive bundle), not a disk `problem-statement.md` that is no longer
    // materialized in the active change directory. No `*Path` is advertised:
    // the projection is the authority, and `include.problemStatement` is the
    // supported way to read the content.
    const projectedProblemStatement = change.documents?.problemStatement;
    output.problemStatementExists =
      typeof projectedProblemStatement === "string" &&
      projectedProblemStatement.trim().length > 0
        ? true
        : (await readArtifact(activeStore, changeId, "problemStatement")) !==
          null;
    const clarifyRead = await subread.run("clarify", () =>
      applyClarifyReadinessToChangeOutput({
        output,
        change,
        proposalText,
        changeId,
        store: activeStore,
        persist: false,
      }),
    );
    if (!clarifyRead.ok) {
      output._clarifyFindingsError =
        clarifyRead.error instanceof Error
          ? clarifyRead.error.message
          : String(clarifyRead.error);
    }
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
    const dependencyRead = await subread.run("externalDependency", () =>
      buildExternalDependencyStatus(change.external_dependencies),
    );
    if (dependencyRead.ok) {
      if (dependencyRead.value) {
        output._externalDependencyStatus = dependencyRead.value;
      }
    } else {
      output._externalDependencyStatusError =
        dependencyRead.error instanceof Error
          ? dependencyRead.error.message
          : String(dependencyRead.error);
    }
    // Include reflection data for archived changes
    if (change.status === "archived") {
      const reflectionRead = await subread.run("reflection", () =>
        getReflection(
          activeStore.paths.external ?? activeStore.paths.root,
          changeId,
        ),
      );
      if (reflectionRead.ok && reflectionRead.value) {
        output._reflection = reflectionRead.value;
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
          directiveState: {
            ...displayChange,
            projectId: displayChange.adv_project_id ?? "unknown",
            gates: normalizedGates ?? displayChange.gates,
          } as never,
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
        const snapshotRead = await subread.run(
          "snapshot",
          () => projectionStatePromise ?? loadProjectionState(),
        );
        if (snapshotRead.ok) {
          try {
            const { directiveState, normalizedGates } = snapshotRead.value;
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
              epicMembershipVerification,
            });
          } catch (e) {
            output._contextSnapshotError =
              e instanceof Error ? e.message : String(e);
          }
        } else {
          output._contextSnapshotError =
            snapshotRead.error instanceof Error
              ? snapshotRead.error.message
              : String(snapshotRead.error);
        }
      }
      // Phase plan — typed, read-only current-action projection (SC1,
      // AC3, AC8). `derivePhasePlanSafe` never throws: missing,
      // conflicting, or unsupported state degrades into a typed
      // non-authorizing plan with provenance and no route/command.
      if (include.phasePlan) {
        const phasePlanRead = await subread.run(
          "phasePlan",
          () => projectionStatePromise ?? loadProjectionState(),
        );
        if (phasePlanRead.ok) {
          try {
            const { directiveState } = phasePlanRead.value;
            output._phasePlan = withPhaseDirective(
              derivePhasePlanSafe(directiveState, Date.now()),
            );
          } catch (e) {
            output._phasePlan = degradedPhasePlan(
              changeId,
              "missing_state",
              e instanceof Error ? e.message : String(e),
            );
          }
        } else {
          output._phasePlan = degradedPhasePlan(
            changeId,
            "missing_state",
            phasePlanRead.error instanceof Error
              ? phasePlanRead.error.message
              : String(phasePlanRead.error),
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
      if (include.sessions) {
        try {
          const sessionResult = await listPeerSessions({
            projectRoot: activeStore.paths.root,
          });
          output._sessions = sessionResult.sessions;
          output._sessionsMeta = {
            total: sessionResult.sessions.length,
            unavailable: sessionResult.unavailable ?? false,
          };
        } catch (error) {
          output._sessions = [];
          output._sessionsMeta = {
            total: 0,
            unavailable: true,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
      // Ready tasks — unblocked queue, sliced to top-N. Avoids the
      // separate adv_task_ready round-trip on phase boundaries.
      if (include.readyTasks) {
        const readyRead = await subread.run("readyTasks", () =>
          activeStore.tasks.ready(changeId),
        );
        if (readyRead.ok) {
          try {
            const readyResult = readyRead.value;
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
        } else {
          output._readyTasksError =
            readyRead.error instanceof Error
              ? readyRead.error.message
              : String(readyRead.error);
        }
      }
      // Briefing packet — generated read projection over existing
      // structured state. No live packet state is persisted.
      if (include.briefingPacket) {
        const briefingRead = await subread.run("briefingPacket", async () => {
          const lane =
            include.briefingPacketLane ?? DEFAULT_BRIEFING_PACKET_LANE;
          const packetInput = await buildBriefingPacketForChange(
            activeStore,
            change,
            lane,
            include.briefingPacketRequest,
            epicMembershipVerification,
          );
          return renderBriefingPacket(packetInput);
        });
        if (briefingRead.ok) {
          output._briefingPacket = briefingRead.value;
        } else {
          output._briefingPacketError =
            briefingRead.error instanceof Error
              ? briefingRead.error.message
              : String(briefingRead.error);
        }
      }

      // GH #21: Artifact content include flags — read raw markdown
      // from the change directory. Only reads when explicitly
      // requested to avoid unnecessary I/O. Falls back to the
      // latest archive bundle for archived changes.
      // Batched multi-include read per C9 — single store.changes.get()
      // query covers all requested kinds (KD-6 readArtifacts).
      if (requestedKinds.length > 0) {
        const artifactRead = await subread.runLocalCapable("artifacts", () =>
          readArtifacts(activeStore, changeId, requestedKinds),
        );
        if (artifactRead.ok) {
          applyArtifactContentToOutput(output, artifactRead.value);
        } else {
          output._artifactsError =
            artifactRead.error instanceof Error
              ? artifactRead.error.message
              : String(artifactRead.error);
        }
      }
    }
    const changeShowHydrationStats = subread.getHydrationStats();
    if (changeShowHydrationStats) {
      output.hydrationStats = changeShowHydrationStats;
    }
    const pretty = resolveOutputMode(outputMode);
    const leanOutput = shapeDirectiveResponse(output, include ?? {});
    if (leanOutput) {
      const serializedPhasePlan = JSON.stringify(
        leanOutput._phasePlan,
        null,
        pretty ? 2 : undefined,
      );
      return formatToolOutput(leanOutput, {
        pretty,
        maxChars: Math.max(
          DEFAULT_MAX_CHARS,
          serializedPhasePlan.length + 4096,
        ),
      });
    }
    return formatToolOutput(output, { pretty });
  };

  if (target_path && requestedKinds.length > 0) {
    return withTargetPathStore(
      {
        currentProjectPath: store.paths.root,
        target_path,
        stateRequirement: "authoritative",
        mutation: false,
      },
      async ({ context, store: targetStore }) =>
        runShow(targetStore, formatTargetProjectContext(context)),
    );
  }

  return withOptionalTargetPathStore(
    { store, target_path },
    async (activeStore, projectContext) => runShow(activeStore, projectContext),
  );
};
export const advChangeListHandler = async (
  {
    status,
    includeArchived,
    includeClosed,
    sort,
    limit,
    offset,
    target_path,
    scope = "repo",
    filter,
  }: {
    status?: string;
    includeArchived?: boolean;
    includeClosed?: boolean;
    sort?: "recency" | "stalest" | "default";
    limit?: number;
    offset?: number;
    target_path?: string;
    scope?: "repo" | "product";
    filter?: { kind?: "epic" | "change"; status?: string };
  },
  store: Store,
) => {
  if (filter?.kind === "epic") {
    return dispatchFacadeRead(
      epicTools as Record<string, unknown>,
      "adv_epic_list",
      { status: filter.status === "backlog" ? "active" : filter.status },
      store,
    );
  }
  if (filter?.status === "backlog") {
    return dispatchFacadeRead(
      backlogShellTools as Record<string, unknown>,
      "adv_backlog_list",
      {},
      store,
    );
  }
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
      const result = await activeStore.changes.list({
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
};
export const advChangeValidateHandler = async (
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
  // validation context) so a slow projection read degrades structurally
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
        "Likely a slow projection read or peer hydration — retry; if persistent, run adv_status and adv_doctor to inspect project health.",
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
  // Strict mode can escalate warnings to failures, but it can NEVER
  // override a non-clean validation result and turn it into a pass. The
  // validator's `passed` flag already consumes `canConcludeClean`.
  const passed =
    validationResult.passed &&
    (!strict ||
      (validationResult.errors.length === 0 &&
        (!strictWarnings || validationResult.warnings.length === 0)));
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
    authorityDiagnostics: validationResult.authorityDiagnostics,
    formatted,
  });
};

export const queryChangeTools = {
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
      "include.sessions attaches the privacy-safe peer-session projection as `_sessions`. " +
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
          "Optional absolute path to another ADV project. When artifact include flags are requested, reads that project's persisted documents; otherwise reads a disk snapshot and returns _projectContext.",
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
          sessions: z
            .boolean()
            .optional()
            .describe(
              "When true, attaches privacy-safe peer sessions as `_sessions`.",
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
          entries: z
            .boolean()
            .optional()
            .describe("Include Epic child entries when changeId is an Epic."),
        })
        .optional()
        .describe(
          "Optional include flags to attach extra fields. Defaults preserve current behavior.",
        ),
      outputMode: z
        .enum(["compact", "pretty"])
        .optional()
        .describe(
          "Output mode: compact (default) or pretty. Overrides ADV_TOOL_OUTPUT_MODE env var for this call.",
        ),
    },
    validate: z
      .boolean()
      .optional()
      .describe("When true, include the standalone change validation result."),
    strict: z
      .boolean()
      .optional()
      .describe("Run strict validation checks when validate is true."),
    strictWarnings: z
      .boolean()
      .optional()
      .describe(
        "Treat warnings as blocking failures when validate and strict are true.",
      ),
    execute: advChangeShowHandler,
  },
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
      filter: z
        .object({
          kind: z.enum(["epic", "change"]).optional(),
          status: z.string().optional(),
        })
        .optional()
        .describe("Facade filter for Epic or backlog reads."),
    },
    execute: advChangeListHandler,
  },
};
