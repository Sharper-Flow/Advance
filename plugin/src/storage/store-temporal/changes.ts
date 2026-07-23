import type { Store, ChangeConflictAuthority } from "../store-types";
import {
  type ArtifactKind,
  type ArtifactPayload,
  type ChangeClosure,
  type BulkCloseResult,
  type Change,
  type ChangeLifecycleState,
  type GateId,
  type TerminalSource,
  type TerminalWarning,
} from "../../types";
import { createHash } from "crypto";
import {
  acceptanceUpdatedSignal,
  agreementUpdatedSignal,
  archiveChangeSignal,
  archiveRequestedSignal,
  closeChangeSignal,
  designUpdatedSignal,
  epicMembershipClearedSignal,
  epicMembershipSetSignal,
  executiveSummaryUpdatedSignal,
  problemStatementUpdatedSignal,
  proposalUpdatedSignal,
  updateArtifactMetadataSignal,
  changeStateQuery,
  crossProjectCoordinationUpdatedSignal,
} from "../../temporal/messages";
import { getMutationReceiptQuery } from "../../temporal/messages";
import type { MutationReceipt } from "../../temporal/contracts";
import {
  MutationApplicationUnconfirmedError,
  waitForQueryPredicate,
} from "../../utils/query-predicate";
import { randomUUID } from "node:crypto";
import { ensureChangeWorkflowStarted } from "../../temporal/workflow-start";
import { getCurrentSessionId } from "../../utils/session-id";
import {
  hasArchiveBundle,
  isSchemaError,
  listChangeDirs,
  loadChange,
  removeChangeDir,
} from "../json";
import { filterChanges } from "../content-search";
import { computeLastActivity, firstOpenGate } from "../store-types";
import {
  runTemporal,
  runTemporalQuery,
  getChangeHandle,
  getGuardedChangeHandle,
  getTemporalConnection,
  runTemporalRead,
  createTemporalReadDeadline,
  createTemporalReadContext,
  isTemporalReadExpired,
  raceWithTemporalDeadline,
  remainingDeadlineMs,
  TemporalQueryTimeoutError,
  type StoreDeps,
} from "./shared";
import {
  validateAggregateSize,
  validatePerArtifactSize,
} from "../_artifact-size-validation";
import { createLogger } from "../../utils/debug-log";
import { enforceMutationEligibilityForError } from "../../temporal/mutation-safety";
import { fireSignalWithMutationGuard } from "./gates";
import { isWorkflowCompletedError } from "../../temporal/recovery-classification";
import { listChangeWorkflowIds } from "../../temporal/list-change-workflows";
import type { ChangeSummary } from "../store-temporal-memo";
import {
  renderTerminalHistory,
  TERMINAL_HISTORY_DEADLINE_BUDGET_MS,
} from "../../archive/terminal-history";
import type {
  ChangeWorkflowState,
  SignalRejection,
} from "../../temporal/contracts";
import { computeCreationRequestHash } from "./creation-hash";

const logger = createLogger("store-temporal-changes");

function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function latestSignalRejection(
  state: ChangeWorkflowState,
  signalName: string,
  since: string,
): SignalRejection | undefined {
  const rejections = state.signal_rejections ?? [];
  for (let i = rejections.length - 1; i >= 0; i--) {
    const rejection = rejections[i];
    if (rejection.signalName === signalName && rejection.rejectedAt >= since) {
      return rejection;
    }
  }
  return undefined;
}

/**
 * Deterministic order for content signal fan-out within a single
 * `create()` or `updateArtifacts()` call. Workflow histories diff cleanly
 * across runs only if the order is fixed. Locked by C5; verified by the
 * signal invariant test (T19).
 *
 * Tool layer MUST `await` each signal acknowledgement before firing the
 * next; concurrent firing (`Promise.all`) is forbidden because TS SDK
 * preserves only server-acceptance order within an activation.
 */
const ARTIFACT_SIGNAL_ORDER: ReadonlyArray<{
  kind: ArtifactKind;
  signal:
    | typeof proposalUpdatedSignal
    | typeof problemStatementUpdatedSignal
    | typeof agreementUpdatedSignal
    | typeof designUpdatedSignal
    | typeof executiveSummaryUpdatedSignal
    | typeof acceptanceUpdatedSignal;
}> = [
  { kind: "proposal", signal: proposalUpdatedSignal },
  { kind: "problemStatement", signal: problemStatementUpdatedSignal },
  { kind: "agreement", signal: agreementUpdatedSignal },
  { kind: "design", signal: designUpdatedSignal },
  { kind: "executiveSummary", signal: executiveSummaryUpdatedSignal },
  { kind: "acceptance", signal: acceptanceUpdatedSignal },
];

/**
 * rq-temporalMutationSafety01 — SC4 mutation-eligibility guard for a single
 * signal call. The signal is dispatched via `runTemporal`; any failure is
 * classified into a `TemporalWorkflowDiagnostic` and SC4-mutation-ineligible
 * classes (no_poller / query_failed_or_not_registered / deadline / unknown /
 * query_rejected / permission / resource_exhaustion) are re-thrown as
 * `TemporalMutationIneligibleError`. `not_found` and `poisoned_history`
 * intentionally pass through — they require additional operator safeguards
 * (approval, exact run pinning, shipped proof, dry-run) handled elsewhere.
 *
 * Use this at every signal, projection-write, reset, and terminate call
 * site that does NOT already go through `fireSignal` (the tools/_adapters
 * wrapper applies the same SC4 guard at its boundary).
 */
async function fireGuardedSignal<Args extends unknown[]>(
  input: import("./shared").TemporalStoreBackendInput,
  changeId: string,
  signalName: unknown,
  ...args: Args
): Promise<void> {
  try {
    await runTemporal(async () => {
      const handle = await getGuardedChangeHandle(input, changeId);
      await handle.signal(signalName, ...(args as unknown[]));
    });
  } catch (err) {
    // SC4 guard at signal-dispatch boundary.
    enforceMutationEligibilityForError(err);
    // Surviving path: SC4-pass (not_found / poisoned_history).
    throw err;
  }
}

/**
 * Fire one content signal per defined field in `artifacts`, in deterministic
 * order (proposal → problemStatement → agreement → design → executiveSummary
 * → acceptance). Each call awaits server acknowledgement before the next.
 * Undefined fields fire no signal (no-op).
 *
 * The corresponding `updateArtifactMetadataSignal` fires AFTER each content
 * signal so `state.artifacts.{kind}.contentHash` stays consistent with
 * `state.documents.{kind}`.
 */
async function fireContentSignalsSequentially(
  input: import("./shared").TemporalStoreBackendInput,
  handle: Awaited<ReturnType<typeof getGuardedChangeHandle>>,
  changeId: string,
  artifacts: ArtifactPayload,
  confirmReadinessReceipts = false,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  // Suppress unused-parameter lint when `handle` is unused due to routing
  // through the SC4-guarded wrapper. The handle would be used by the
  // attached fallback path if `fireGuardedSignal` cannot resolve
  // `getGuardedChangeHandle`.
  void handle;
  for (const { kind, signal } of ARTIFACT_SIGNAL_ORDER) {
    const content = artifacts[kind];
    if (content === undefined) continue;
    // Content signal — populates state.documents[kind]. SC4-guarded.
    const requiresReceipt =
      confirmReadinessReceipts &&
      (kind === "executiveSummary" || kind === "acceptance");
    const mutationReceiptId = requiresReceipt
      ? `mrec_${randomUUID()}`
      : undefined;
    await fireGuardedSignal(input, changeId, signal, {
      text: content,
      updatedAt,
      ...(mutationReceiptId ? { mutationReceiptId } : {}),
    });
    if (mutationReceiptId) {
      const receipt = await waitForQueryPredicate(
        () =>
          handle.query(getMutationReceiptQuery, mutationReceiptId) as Promise<
            MutationReceipt | undefined
          >,
        (candidate) => candidate?.id === mutationReceiptId,
      );
      if (!receipt) {
        throw new MutationApplicationUnconfirmedError(mutationReceiptId);
      }
    }

    // Metadata signal — populates state.artifacts[kind] with contentHash.
    // Fires AFTER the content signal so the hash reflects the just-written
    // content. Temporal-only updates intentionally omit `path`: there is no
    // readable artifact file for active content, and synthesizing one produces
    // phantom paths in agent-facing tool output. SC4-guarded.
    await fireGuardedSignal(input, changeId, updateArtifactMetadataSignal, {
      kind,
      metadata: {
        updatedAt,
        contentHash: computeContentHash(content),
        source: "temporal",
        readable: false,
      },
    });
  }
}

export function createChangeOps(deps: StoreDeps): Store["changes"] {
  const {
    input,
    legacy,
    invalidateChange,
    updateOverlay,
    emitChangeSummarySignal,
    indexTasksFromState,
    setCachedChange,
    getTemporalChange,
    listResolvedChanges,
    getTemporalWorkflowClient,
    dualWriteAfterMutation,
    memo,
    changeCache,
  } = deps;

  return {
    create: async (summary, options) => {
      const capability = options?.capability;
      const artifacts = options?.artifacts ?? {};
      const initialMetadata = options?.initialMetadata;
      const epicMembership = initialMetadata?.epic_membership;

      // rq-creationRequestHash01 (tk-74c358188ffb, design D2 / AC4 / AC11):
      // compute the canonical creation-request hash from stable identity
      // fields. Threaded into seedState (so the workflow records it once at
      // start) and into ChangeWorkflowInput.creationRequestHash (so the
      // "already started" recovery path can reconcile retries against the
      // original request — closes the post-commit-timeout duplicate-
      // creation defect class). The hash is also stamped on the disk
      // projection below so disk-first readers see it without a workflow
      // query round-trip.
      const creationRequestHash = computeCreationRequestHash({
        summary,
        capability,
        origin: initialMetadata?.origin,
        fast_follow_of: initialMetadata?.fast_follow_of,
        cross_project_origin: initialMetadata?.cross_project_origin,
        scope_repos: initialMetadata?.scope_repos,
        epic_membership_seed: epicMembership,
        same_project_dependencies: initialMetadata?.same_project_dependencies,
      });

      // Layer 1 size validation (KD-8 layer 1). Fails fast before any
      // disk write or signal fires. Layer 2 (signal-handler state-mutation
      // rejection) in T8 enforces structurally inside the workflow.
      for (const kind of [
        "proposal",
        "problemStatement",
        "agreement",
        "design",
        "executiveSummary",
        "acceptance",
      ] as const) {
        const content = artifacts[kind];
        if (content !== undefined) validatePerArtifactSize(kind, content);
      }
      validateAggregateSize(artifacts);

      // T15 / AC8: no artifact-content disk writes from the temporal store
      // production path. Forward only the non-artifact scaffolding
      // (change.json + dir + default proposal.md placeholder) to legacy
      // disk store; user-supplied artifact content flows exclusively
      // through content signals → state.documents.
      //
      // Note: createChangeScaffold still writes a default proposal.md
      // SCAFFOLD on disk to maintain backward compat for legacy callers
      // that read disk. The scaffold is placeholder content, not user
      // content; once T20 deletes the positional API entirely, the
      // scaffold path itself can be removed.
      const result = await legacy.changes.create(summary, {
        ...(capability !== undefined ? { capability } : {}),
        ...(initialMetadata ? { initialMetadata } : {}),
        // No artifacts passed — content flows via signals only.
      });
      const created = await legacy.changes.get(result.changeId);
      if (isSchemaError(created)) {
        throw new Error(created.error);
      }
      if (!created.success || !created.data) {
        throw new Error(
          `Created change ${result.changeId} but could not reload scaffolded change state`,
        );
      }

      // P1.4 transactional guard: if Temporal workflow start fails,
      // the disk scaffold (proposal.md, change.json, etc.) would
      // otherwise persist as an orphan that confuses subsequent tool
      // calls. Remove the change dir on failure and re-throw the
      // ORIGINAL error — never mask it with rollback errors.
      //
      // See design.md § KD-7.
      try {
        const client = getTemporalWorkflowClient();
        await ensureChangeWorkflowStarted(client, {
          projectId: input.projectId,
          changeId: created.data.id,
          title: created.data.title,
          initializedAt: created.data.created_at,
          projectionChangesDir: legacy.paths.changes,
          archiveProjects: [{ projectPath: legacy.paths.root }],
          // KD-10 / rq-isolSessionTaskQueue01: thread current session ID so
          // ensureChangeWorkflowStarted can route to advance-{projectId}-{sess}.
          // Undefined falls back to project queue (legacy / pre-init / tests).
          sessionId: getCurrentSessionId(),
          // rq-creationRequestHash01: enables the "already started" hash
          // reconciliation. Without this, the existing workflow's handle
          // is returned silently on retry — masking any divergence between
          // the original and retried request.
          creationRequestHash,
          seedState: {
            status: created.data.status,
            tasks: created.data.tasks,
            deltas: created.data.deltas,
            wisdom: created.data.wisdom,
            gates: created.data.gates,
            reentry_history: created.data.reentry_history,
            fast_follow_of: created.data.fast_follow_of,
            cross_project_origin: created.data.cross_project_origin,
            origin: created.data.origin,
            same_project_dependencies:
              initialMetadata?.same_project_dependencies ??
              created.data.same_project_dependencies ??
              [],
            // rq-autoManageAdvWorktrees AC3 — new changes are auto-managed
            // by default. Seed the workflow state with the marker so the
            // first read sees it; lazy migration (A4) covers legacy changes
            // that pre-date this field.
            worktree_auto_managed: true,
            // rq-creationRequestHash01: stamp the hash onto the workflow
            // state so future retries / Continue-As-New can reconcile.
            creation_request_hash: creationRequestHash,
            ...(epicMembership ? { epic_membership: epicMembership } : {}),
          },
        });
      } catch (err) {
        // rq-creationRequestHash01: a hash conflict is a deterministic,
        // caller-induced refusal — the just-written disk scaffold must be
        // rolled back so a subsequent same-summary create with the ORIGINAL
        // request can still succeed. Treat the same as any Temporal-start
        // failure for P1.4 purposes.
        try {
          await removeChangeDir(legacy.paths.changes, created.data.id);
        } catch (rollbackErr) {
          // Rollback itself failed (disk unmounted, permissions, etc).
          // Log but don't mask the original Temporal error.
          logger.error(
            `P1.4 rollback failed for change '${created.data.id}' after Temporal-start error: ${
              rollbackErr instanceof Error
                ? rollbackErr.message
                : String(rollbackErr)
            }. Manual cleanup of the change directory may be required.`,
          );
        }
        throw err;
      }

      const changeWithOwner: Change = {
        ...created.data,
        adv_project_id: input.projectId,
        // rq-autoManageAdvWorktrees AC3 — stamp the disk projection so the
        // first read sees the marker even before the workflow signal-
        // handler projection writes it back. Sticky on the workflow side
        // via applyWorktreeAutoManagedToState.
        worktree_auto_managed: true,
        // rq-creationRequestHash01: persist hash on the disk projection so
        // disk-first readers (legacy fallback, archive bundle hydration)
        // can reconcile without a workflow query round-trip.
        creation_request_hash: creationRequestHash,
        same_project_dependencies:
          initialMetadata?.same_project_dependencies ??
          created.data.same_project_dependencies ??
          [],
      };
      try {
        await legacy.changes.save(changeWithOwner);
      } catch (err) {
        // Best-effort: disk save failure for owner metadata MUST NOT
        // cascade as a creation failure.
        logger.warn(
          `Owner metadata disk save failed for change ${created.data.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      updateOverlay(created.data.id, {
        created_at: created.data.created_at,
        created_by: created.data.created_by,
        deltas: created.data.deltas,
        validation: created.data.validation,
        github_issues: created.data.github_issues,
        clarify_findings: created.data.clarify_findings,
        cross_project_origin: created.data.cross_project_origin,
        fast_follow_of: created.data.fast_follow_of,
        origin: created.data.origin,
        scope_repos: created.data.scope_repos,
        adv_project_id: input.projectId,
        // rq-autoManageAdvWorktrees AC3 — surface the marker on the Memo
        // overlay so lightweight summary reads observe it without a
        // workflow query round-trip.
        worktree_auto_managed: true,
      });

      // KD-3 + KD-4: sequential await fan-out of content signals so the
      // workflow's state.documents becomes the source of truth for artifact
      // content. Order is deterministic; each await blocks until server
      // acknowledgement of the prior signal. Undefined fields fire no
      // signal (no-op). The metadata-update signal fires AFTER each content
      // signal to keep state.artifacts[kind].contentHash consistent.
      //
      // Only fires for actually-defined fields. Metadata is source-tagged as
      // Temporal-only and deliberately carries no path; the legacy scaffold may
      // create placeholder files, but active artifact content lives in
      // state.documents.

      if (Object.values(artifacts).some((v) => v !== undefined)) {
        await runTemporal(async () => {
          const handle = await getGuardedChangeHandle(input, created.data!.id);
          await fireContentSignalsSequentially(
            input,
            handle,
            created.data!.id,
            artifacts,
          );
        });
      }

      return result;
    },
    save: async (change) => {
      // Invalidate Memo before save to prevent stale status from being
      // served by the fast path in listResolvedChanges. Without this,
      // archive operations (which set status="archived" then save) leave
      // a zombie entry in the Memo, causing list() to show archived
      // changes as still active.
      invalidateChange(change.id);

      if (change.status === "archived") {
        // SC4 + SC6 — archive is a terminal-state mutation. The signal
        // guard raises `TemporalMutationIneligibleError` for SC4 classes;
        // the post-signal readback classifies as
        // `outcome_unknown_readback_unavailable` if it fails after the
        // signal ACK. Either failure surfaces a typed error rather than
        // silently authorizing the disk write below.
        const hasAcceptedDeltas = Object.values(change.deltas).some(
          (deltas) => deltas.length > 0,
        );
        if (hasAcceptedDeltas && !change.archive_projection_proof) {
          throw new Error(
            `changes.save(${change.id}, archived): accepted deltas require archive_projection_proof before terminal state.`,
          );
        }
        const outcome = change.archive_projection_proof
          ? await fireSignalWithMutationGuard(
              input,
              change.id,
              archiveRequestedSignal,
              [
                {
                  approvalEvidence:
                    change.gates?.release?.approval_evidence ??
                    "Archive projection proof verified before terminal state",
                  requestedBy: "archive-projection-reconciler",
                  requestedAt: change.archive_projection_proof.verified_at,
                  projectionProof: change.archive_projection_proof,
                },
              ],
            )
          : await fireSignalWithMutationGuard(
              input,
              change.id,
              archiveChangeSignal,
              [],
            );
        if (outcome === "outcome_unknown_readback_unavailable") {
          throw new Error(
            `changes.save(${change.id}, archived): signal acknowledged but post-signal readback unavailable — outcome classified as outcome_unknown_readback_unavailable.`,
          );
        }
        const result = (await runTemporal(async () =>
          (await getGuardedChangeHandle(input, change.id)).query(
            changeStateQuery,
          ),
        )) as import("../../temporal/contracts").ChangeWorkflowState;
        indexTasksFromState(result);
        updateOverlay(change.id, { status: "archived" });
        setCachedChange(result);
        emitChangeSummarySignal(change.id, result);
        return;
      }

      await legacy.changes.save(change);
      if (
        change.cross_project_links !== undefined ||
        change.external_dependencies !== undefined
      ) {
        // SC4-guarded signal: SC4 mutation-ineligible classes raise
        // `TemporalMutationIneligibleError`; not_found / poisoned_history
        // pass through to surface the original error.
        await fireGuardedSignal(
          input,
          change.id,
          crossProjectCoordinationUpdatedSignal,
          {
            ...(change.cross_project_links !== undefined
              ? { cross_project_links: change.cross_project_links }
              : {}),
            ...(change.external_dependencies !== undefined
              ? { external_dependencies: change.external_dependencies }
              : {}),
            updatedAt: new Date().toISOString(),
          },
        );
      }
      updateOverlay(change.id, {
        title: change.title,
        status: change.status,
        created_at: change.created_at,
        created_by: change.created_by,
        deltas: change.deltas,
        validation: change.validation,
        github_issues: change.github_issues,
        closure: change.closure,
        clarify_findings: change.clarify_findings,
        reentry_history: change.reentry_history,
        cross_project_origin: change.cross_project_origin,
        cross_project_links: change.cross_project_links,
        external_dependencies: change.external_dependencies,
        fast_follow_of: change.fast_follow_of,
        origin: change.origin,
        scope_repos: change.scope_repos,
        adv_project_id: change.adv_project_id,
      });
    },
    list: async (filter) => {
      const effectiveIncludeArchived =
        filter?.includeArchived || filter?.status === "archived";
      const effectiveIncludeClosed =
        filter?.includeClosed || filter?.status === "closed";

      const resolved = await listResolvedChanges(
        {
          includeArchived: effectiveIncludeArchived,
          includeClosed: effectiveIncludeClosed,
        },
        undefined,
        {
          hydrationConcurrency: filter?.validationConcurrency,
        },
      );
      let filtered = resolved.changes;

      if (filter?.status) {
        filtered = filtered.filter((change) => change.status === filter.status);
      }
      if (!effectiveIncludeArchived) {
        filtered = filtered.filter((change) => change.status !== "archived");
      }
      if (!effectiveIncludeClosed) {
        filtered = filtered.filter((change) => change.status !== "closed");
      }

      // P2.3: substring/prefix/timestamp filters via linear-scan
      // content-search helper. See `content-search.ts` and
      // `scripts/bench-content-search.ts` for the bench data backing
      // this strategy choice over MiniSearch.
      if (
        filter?.prefix ||
        filter?.titleContains ||
        filter?.createdBefore ||
        filter?.lastActivityBefore
      ) {
        const enriched = filtered.map((c) => ({
          ...c,
          lastActivityAt: computeLastActivity(c),
        }));
        filtered = filterChanges(enriched, {
          prefix: filter.prefix,
          titleContains: filter.titleContains,
          createdBefore: filter.createdBefore,
          lastActivityBefore: filter.lastActivityBefore,
        });
      }

      filtered.sort((a, b) => {
        const cmp = b.created_at.localeCompare(a.created_at);
        return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
      });

      return {
        changes: filtered.map((change) => ({
          id: change.id,
          title: change.title,
          status: change.status,
          currentGate: firstOpenGate(change.gates),
          lifecycleState: change.lifecycleState,
          created_at: change.created_at,
          lastActivityAt: computeLastActivity(change),
          taskCount: change.tasks.length,
          completedTasks: change.tasks.filter((task) => task.status === "done")
            .length,
          fast_follow_of: change.fast_follow_of,
          epic_membership: change.epic_membership,
          capabilities: Object.keys(change.deltas),
        })),
        // Terminal degraded metadata is forwarded for terminal reads
        // (existing semantics); deadline-triggered incompleteness is
        // typed on every path so a truncated result never looks
        // complete (C2).
        ...(resolved.warnings ? { warnings: resolved.warnings } : {}),
        ...(resolved.hydrationStats
          ? { hydrationStats: resolved.hydrationStats }
          : {}),
      };
    },
    get: async (changeId: string) => {
      // Delegates to the shared orphan-tolerant path so adv_status,
      // adv_change_show, and adv_change_list all behave the same when
      // a workflow is missing: try to re-seed from disk, otherwise
      // return the not-found error.
      const ctx = createTemporalReadContext();
      return getTemporalChange(changeId, { context: ctx });
    },
    refresh: async (changeId: string): Promise<void> => {
      // R1 follow-on: tool-layer code paths that mutate workflow state
      // via direct fireSignal() (notably adv_gate_complete) bypass the
      // store's own mutation methods and would otherwise leave stale
      // data in changeCache. After firing the signal those tools call
      // store.changes.refresh(changeId) to drop the stale entry and
      // re-populate the cache with fresh workflow state. Best-effort:
      // a refresh failure is logged but never thrown — the workflow
      // signal has already succeeded by the time we get here.
      invalidateChange(changeId);
      await dualWriteAfterMutation(changeId);
    },
    setEpicMembership: async (
      changeId,
      { membership, expectedCurrent, setAt },
    ) => {
      const recordedAt = setAt ?? new Date().toISOString();
      invalidateChange(changeId);
      // SC4 + SC6 — guard the signal and classify the readback outcome.
      // `outcome_unknown_readback_unavailable` throws a typed error rather
      // than letting the caller claim the membership change was applied.
      const outcome = await fireSignalWithMutationGuard(
        input,
        changeId,
        epicMembershipSetSignal,
        [
          {
            membership,
            ...(expectedCurrent ? { expectedCurrent } : {}),
            setAt: recordedAt,
          },
        ],
      );
      if (outcome === "outcome_unknown_readback_unavailable") {
        throw new Error(
          `changes.setEpicMembership(${changeId}): signal acknowledged but post-signal readback unavailable — outcome classified as outcome_unknown_readback_unavailable.`,
        );
      }
      const state = (await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as ChangeWorkflowState;
      const rejection = latestSignalRejection(
        state,
        "epicMembershipSet",
        recordedAt,
      );
      if (rejection) throw new Error(rejection.errorMessage);
      indexTasksFromState(state);
      updateOverlay(changeId, { epic_membership: state.epic_membership });
      const change = setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
      await dualWriteAfterMutation(changeId);
      return change;
    },
    clearEpicMembership: async (changeId, { expected, clearedAt }) => {
      const recordedAt = clearedAt ?? new Date().toISOString();
      invalidateChange(changeId);
      const outcome = await fireSignalWithMutationGuard(
        input,
        changeId,
        epicMembershipClearedSignal,
        [{ expected, clearedAt: recordedAt }],
      );
      if (outcome === "outcome_unknown_readback_unavailable") {
        throw new Error(
          `changes.clearEpicMembership(${changeId}): signal acknowledged but post-signal readback unavailable — outcome classified as outcome_unknown_readback_unavailable.`,
        );
      }
      const state = (await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).query(changeStateQuery),
      )) as ChangeWorkflowState;
      const rejection = latestSignalRejection(
        state,
        "epicMembershipCleared",
        recordedAt,
      );
      if (rejection) throw new Error(rejection.errorMessage);
      indexTasksFromState(state);
      updateOverlay(changeId, { epic_membership: state.epic_membership });
      const change = setCachedChange(state);
      emitChangeSummarySignal(changeId, state);
      await dualWriteAfterMutation(changeId);
      return change;
    },
    close: async (changeId: string, closure: ChangeClosure) => {
      // Layer C1 (rq-archiveRetirement01-followon for closed class):
      // disk-first safety-net write. Without this, close() updates the
      // in-memory overlay only — disk change.json retains stale draft
      // status. On process restart, listResolvedChanges disk fallback
      // returns the stale draft as a zombie. Closed changes have NO
      // archive bundle, so Layer A1 cannot detect them.
      //
      // Disk-first ordering: if disk write fails, propagate the error
      // and DO NOT execute the Temporal transition (no half-state).
      // The current state is fetched from Temporal/disk and merged with
      // the closed status + closure to write a complete change.json.
      const current = await getTemporalChange(changeId);
      if (!current.success || !current.data) {
        throw new Error(
          current.success === false
            ? current.error
            : `Change ${changeId} not found`,
        );
      }
      const updated: Change = {
        ...current.data,
        status: "closed",
        closure,
      };
      await legacy.changes.save(updated);

      invalidateChange(changeId);

      // Try Temporal signal; if workflow is already completed/terminated,
      // the disk write already succeeded — return disk-backed close result.
      //
      // SC4 + SC6: the SC4 guard raises TemporalMutationIneligibleError on
      // mutation-ineligible classes (`not_found`/`poisoned_history` pass
      // through). The post-signal readback classification surfaces an
      // ambiguous `outcome_unknown_readback_unavailable` as a typed error
      // rather than letting the caller claim a successful close.
      try {
        const outcome = await fireSignalWithMutationGuard(
          input,
          changeId,
          closeChangeSignal,
          [closure],
        );
        if (outcome === "outcome_unknown_readback_unavailable") {
          throw new Error(
            `changes.close(${changeId}): signal acknowledged but post-signal readback unavailable — outcome classified as outcome_unknown_readback_unavailable.`,
          );
        }
        const result = (await runTemporal(async () =>
          (await getGuardedChangeHandle(input, changeId)).query(
            changeStateQuery,
          ),
        )) as import("../../temporal/contracts").ChangeWorkflowState;
        indexTasksFromState(result);
        updateOverlay(changeId, { status: "closed", closure });
        const change = setCachedChange(result);
        emitChangeSummarySignal(changeId, result);
        return change;
      } catch (err) {
        if (!isWorkflowCompletedError(err)) throw err;
        // Workflow already terminated — disk save succeeded, return
        // the disk-backed closed change. Log for observability.
        logger.info(
          `Change ${changeId} workflow already completed; closed on disk only.`,
        );
        updateOverlay(changeId, { status: "closed", closure });
        return updated;
      }
    },

    closeBatch: async (
      changeIds: string[],
      closure: ChangeClosure,
    ): Promise<BulkCloseResult> => {
      // Pre-validate: fail-all if any target is invalid or protected
      for (const id of changeIds) {
        const change = await getTemporalChange(id);
        if (!change.success || !change.data) {
          return {
            success: false,
            closed: 0,
            results: changeIds.map((cid) => ({
              changeId: cid,
              success: false,
              error:
                cid === id
                  ? change.success === false
                    ? change.error
                    : "Change not found"
                  : "Aborted due to sibling failure",
            })),
            message: `Bulk close aborted: Change "${id}" not found.`,
          };
        }
        if (change.data.status !== "draft") {
          return {
            success: false,
            closed: 0,
            results: changeIds.map((cid) => ({
              changeId: cid,
              success: false,
              error:
                cid === id
                  ? `Protected status "${change.data!.status}"`
                  : "Aborted due to sibling failure",
            })),
            message: `Bulk close aborted: Change "${id}" has protected status "${change.data.status}". Only draft changes can be bulk-closed.`,
          };
        }
      }

      const results: {
        changeId: string;
        success: boolean;
        error?: string;
      }[] = [];
      let closed = 0;

      for (const id of changeIds) {
        try {
          // Layer C1 (rq-archiveRetirement01-followon): disk-first
          // safety-net write per id. If disk write fails, record a
          // per-id failure and SKIP this id's Temporal mutation
          // (no half-state). Other ids in the batch continue.
          const current = await getTemporalChange(id);
          if (!current.success || !current.data) {
            throw new Error(
              current.success === false
                ? current.error
                : `Change ${id} not found`,
            );
          }
          const updated: Change = {
            ...current.data,
            status: "closed",
            closure,
          };
          await legacy.changes.save(updated);

          invalidateChange(id);

          // Try Temporal signal; if workflow already completed, treat
          // as disk-only close (disk save already succeeded).
          //
          // SC4 + SC6: see changes.close() — same guards apply here.
          try {
            const outcome = await fireSignalWithMutationGuard(
              input,
              id,
              closeChangeSignal,
              [closure],
            );
            if (outcome === "outcome_unknown_readback_unavailable") {
              throw new Error(
                `changes.closeBatch(${id}): signal acknowledged but post-signal readback unavailable — outcome classified as outcome_unknown_readback_unavailable.`,
              );
            }
            const result = (await runTemporal(async () =>
              (await getGuardedChangeHandle(input, id)).query(changeStateQuery),
            )) as import("../../temporal/contracts").ChangeWorkflowState;
            indexTasksFromState(result);
            updateOverlay(id, { status: "closed", closure });
            setCachedChange(result);
            emitChangeSummarySignal(id, result);
          } catch (err) {
            if (!isWorkflowCompletedError(err)) throw err;
            // Workflow already terminated — disk save succeeded.
            logger.info(
              `Change ${id} workflow already completed; closed on disk only (batch).`,
            );
            updateOverlay(id, { status: "closed", closure });
          }
          results.push({ changeId: id, success: true });
          closed++;
        } catch (err) {
          results.push({
            changeId: id,
            success: false,
            error: String(err),
          });
        }
      }

      const allSuccess = closed === changeIds.length;
      return {
        success: allSuccess,
        closed,
        results,
        message: allSuccess
          ? `Successfully closed ${closed} change(s).`
          : `Closed ${closed} of ${changeIds.length} change(s). See results for details.`,
      };
    },
    updateArtifacts: async (changeId, artifacts) => {
      // Layer 1 size validation (KD-8 layer 1). Fail fast before any disk
      // write or signal fires. Aggregate cap considers existing state.documents
      // when present so a sequence of updates can't push the total past the
      // 1.8 MB continueAsNew ceiling.
      for (const kind of [
        "proposal",
        "problemStatement",
        "agreement",
        "design",
        "executiveSummary",
        "acceptance",
      ] as const) {
        const content = artifacts[kind];
        if (content !== undefined) validatePerArtifactSize(kind, content);
      }
      // Best-effort existing state lookup for aggregate cap projection;
      // skip if state not yet available (workflow not running, etc.).
      let existingDocuments: Partial<Record<ArtifactKind, string | undefined>> =
        {};
      try {
        const snapshot = await getTemporalChange(changeId);
        // `getTemporalChange` returns a `LoadResult` (`{ success, data }`).
        // The documents live on `.data`, never on the wrapper — read through
        // the success branch so the aggregate cap projection sees the real
        // persisted documents (QUAL-002).
        if (isSchemaError(snapshot)) {
          throw new Error(snapshot.error);
        }
        if (snapshot.success && snapshot.data) {
          existingDocuments =
            (snapshot.data.documents as typeof existingDocuments) ?? {};
        }
      } catch {
        // Snapshot may be unavailable for in-flight workflows or test
        // fixtures; aggregate cap then computes against the proposed payload
        // alone, which is a conservative undercount but safe.
      }
      validateAggregateSize(artifacts, existingDocuments);

      // T15 / AC8 + rq-artifactPathTruth01: no artifact-content disk writes
      // from the temporal store production path, and no synthesized artifact
      // paths. Active content is stored in state.documents; metadata records
      // source/readability instead of fake filesystem locations.

      // KD-3 + KD-4: sequential await fan-out of content signals. Each
      // defined field on `artifacts` fires its content signal (populating
      // state.documents[kind]) followed by updateArtifactMetadataSignal
      // (populating state.artifacts[kind].contentHash). Order matches
      // ARTIFACT_SIGNAL_ORDER for deterministic history diffs (C5).
      await runTemporal(async () => {
        const handle = await getGuardedChangeHandle(input, changeId);
        await fireContentSignalsSequentially(
          input,
          handle,
          changeId,
          artifacts,
          true,
        );
      });

      // Compose result shape matching the legacy contract. Temporal-only
      // updates do not write artifact files, so no path fields are returned.
      const result: {
        success: true;
        proposalPath?: string;
        problemStatementPath?: string;
        agreementPath?: string;
        designPath?: string;
        executiveSummaryPath?: string;
      } = { success: true };

      // AC9 (completeStateBackedGate): invalidate the change cache after the
      // content-signal fan-out, matching save/close/refresh/bulk-close. Without
      // this, a store.changes.get(changeId) immediately following
      // adv_change_update returns stale cached state.documents/state.artifacts
      // content — the confirmed root cause of the stale-contract symptom (a
      // re-mint was required after adv_change_update because changeCache held
      // pre-update content).
      invalidateChange(changeId);
      return result;
    },

    // rq-changeSummaryReadModel01: lightweight summary list for default
    // warm paths. Uses `ChangeSummaryMemo` and `changeCache` to avoid
    // per-change full hydration when summary data already satisfies the
    // response contract; falls back to authoritative hydration for IDs
    // that have no summary proof.
    //
    // rq-activeListFastPath01: default active/in-flight callers stay on
    // this summary/memo/cache path. Terminal reconciliation is only
    // invoked when the filter explicitly asks for archived/closed rows
    // or when content filters require full state.
    //
    // rq-readCacheAdvisory01: the memo/summary/cache fast path is advisory,
    // never the primary list/status truth source for lifecycle/gate/task
    // state; warm rows served after deadline expiry stay degraded, and
    // completeness is never inferred from cache warmth or row count.
    listSummary: async (filter) => {
      // rq-statusHealthAggregateBudget01: request-scoped aggregate deadline
      // covers enumeration and hydration, degrading typed output on expiry.
      // Request-scoped aggregate deadline (KD1). One budget covers
      // source enumeration, the archive-bundle pre-scan, and every
      // cold-miss hydration below; expiry produces typed degradation
      // instead of an unbounded read.
      const deadline = createTemporalReadDeadline();
      const ctx = createTemporalReadContext(deadline.budgetMs);
      ctx.deadline = deadline;
      const expired = (): boolean => isTemporalReadExpired(ctx);
      let deadlineExceeded = false;
      const deadlineSources = new Set<TerminalSource>();
      const markDeadline = (source: TerminalSource): void => {
        deadlineExceeded = true;
        deadlineSources.add(source);
      };

      const wantsArchived =
        filter?.includeArchived || filter?.status === "archived";
      const wantsClosed = filter?.includeClosed || filter?.status === "closed";
      const wantsTerminal = Boolean(wantsArchived || wantsClosed);
      const hasContentFilters = Boolean(
        filter?.prefix ||
        filter?.titleContains ||
        filter?.createdBefore ||
        filter?.lastActivityBefore,
      );

      // Compatibility envelope: when callers exercise paths whose
      // correctness depends on full state (content filters that need
      // created_at/lastActivityAt), defer to the full `list` projection.
      // Terminal-status sweeps are handled by the non-authoritative history
      // renderer below under a separate 20-second deadline.
      if (hasContentFilters) {
        const fallback = await listResolvedChanges(
          {
            includeArchived: wantsArchived,
            includeClosed: wantsClosed,
          },
          deadline,
        );
        let filtered = fallback.changes;
        if (filter?.status) {
          filtered = filtered.filter((c) => c.status === filter.status);
        }
        if (!wantsArchived) {
          filtered = filtered.filter((c) => c.status !== "archived");
        }
        if (!wantsClosed) {
          filtered = filtered.filter((c) => c.status !== "closed");
        }
        const enriched = filtered.map((c) => ({
          ...c,
          lastActivityAt: computeLastActivity(c),
        }));
        filtered = filterChanges(enriched, {
          prefix: filter?.prefix,
          titleContains: filter?.titleContains,
          createdBefore: filter?.createdBefore,
          lastActivityBefore: filter?.lastActivityBefore,
        });
        filtered.sort((a, b) => {
          const cmp = b.created_at.localeCompare(a.created_at);
          return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
        });
        return {
          changes: filtered.map((change) => ({
            id: change.id,
            title: change.title,
            status: change.status,
            currentGate: firstOpenGate(change.gates),
            lifecycleState: change.lifecycleState,
            created_at: change.created_at,
            lastActivityAt: computeLastActivity(change),
            taskCount: change.tasks.length,
            completedTasks: change.tasks.filter((t) => t.status === "done")
              .length,
            fast_follow_of: change.fast_follow_of,
            ops_followup: change.ops_followup,
            ops_followup_links: change.ops_followup_links,
          })),
          hydrationStats: {
            totalIds: filtered.length,
            fromMemo: 0,
            fromCache: 0,
            fromHydration: filtered.length,
            ...(fallback.hydrationStats?.deadlineExceeded
              ? { deadlineExceeded: true }
              : {}),
          },
          ...(fallback.warnings ? { warnings: fallback.warnings } : {}),
        };
      }

      // Explicit non-authoritative archived/closed history. Active rows are
      // still resolved under the default 8-second authoritative deadline; the
      // terminal subset runs under a separate 20-second deadline so large
      // history cannot starve active conflict authority.
      if (wantsTerminal) {
        const activeResolved = await listResolvedChanges(
          { includeArchived: false, includeClosed: false },
          deadline,
        );
        const activeRows = activeResolved.changes
          .filter((c) => c.status !== "archived" && c.status !== "closed")
          .map((change) => ({
            id: change.id,
            title: change.title,
            status: change.status,
            currentGate: firstOpenGate(change.gates),
            lifecycleState: change.lifecycleState,
            created_at: change.created_at,
            lastActivityAt: computeLastActivity(change),
            taskCount: change.tasks.length,
            completedTasks: change.tasks.filter((t) => t.status === "done")
              .length,
            fast_follow_of: change.fast_follow_of,
            ops_followup: change.ops_followup,
            ops_followup_links: change.ops_followup_links,
            epic_membership: change.epic_membership,
          }));

        const history = await renderTerminalHistory({
          archivePath: legacy.paths.archive,
          changesPath: legacy.paths.changes,
          includeArchived: wantsArchived,
          includeClosed: wantsClosed,
          deadline: createTemporalReadDeadline(
            TERMINAL_HISTORY_DEADLINE_BUDGET_MS,
          ),
        });

        const byId = new Map<string, SummaryRow>();
        for (const row of activeRows) {
          byId.set(row.id, row);
        }
        for (const row of history.changes) {
          byId.set(row.id, {
            id: row.id,
            title: row.title,
            status: row.status,
            currentGate: row.currentGate,
            lifecycleState: row.lifecycleState,
            created_at: row.created_at,
            lastActivityAt: row.lastActivityAt,
            taskCount: row.taskCount,
            completedTasks: row.completedTasks,
            fast_follow_of: row.fast_follow_of,
            ops_followup: row.ops_followup,
            ops_followup_links: row.ops_followup_links,
            epic_membership: row.epic_membership,
          });
        }

        let filtered = Array.from(byId.values());
        if (filter?.status) {
          filtered = filtered.filter((c) => c.status === filter.status);
        }
        if (!wantsArchived) {
          filtered = filtered.filter((c) => c.status !== "archived");
        }
        if (!wantsClosed) {
          filtered = filtered.filter((c) => c.status !== "closed");
        }
        if (hasContentFilters) {
          const enriched = filtered.map((c) => ({
            ...c,
            lastActivityAt: c.lastActivityAt,
          }));
          filtered = filterChanges(enriched, {
            prefix: filter?.prefix,
            titleContains: filter?.titleContains,
            createdBefore: filter?.createdBefore,
            lastActivityBefore: filter?.lastActivityBefore,
          });
        }
        filtered.sort((a, b) => {
          const cmp = b.created_at.localeCompare(a.created_at);
          return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
        });

        const allWarnings = [
          ...(activeResolved.warnings ?? []),
          ...history.warnings,
        ];
        const allDeadlineExceeded =
          activeResolved.hydrationStats?.deadlineExceeded === true ||
          history.hydrationStats.deadlineExceeded === true;

        return {
          changes: filtered,
          hydrationStats: {
            totalIds: filtered.length,
            fromMemo: 0,
            fromCache: 0,
            fromHydration: activeRows.length,
            ...history.hydrationStats,
            ...(allDeadlineExceeded ? { deadlineExceeded: true } : {}),
          },
          ...(allWarnings.length > 0 ? { warnings: allWarnings } : {}),
        };
      }

      // Build candidate ID set from cache + memo + Visibility + disk to avoid
      // dropping warm rows after a source deadline and orphan-on-disk changes
      // the memo never observed. Cache/memo are warm-path sources;
      // Visibility/disk catch cold-start and orphan cases.
      const memoSummaries = memo.getAll();
      const memoIds = memoSummaries.map((s) => s.id);

      const bundle = input.temporal as {
        client?: { workflow?: { list?: unknown } };
      };
      let visibilityIds: string[] = [];
      if (typeof bundle.client?.workflow?.list === "function") {
        try {
          const visibilityRead = await runTemporalRead(
            getTemporalConnection(input),
            () =>
              listChangeWorkflowIds(
                bundle.client as Parameters<typeof listChangeWorkflowIds>[0],
                { projectId: input.projectId },
              ),
            ctx,
            { opType: "visibilityList", timeoutMs: 5_000 },
          );
          if (!visibilityRead.complete) {
            throw visibilityRead.error;
          }
          visibilityIds = visibilityRead.data as string[];
        } catch (err) {
          const hitDeadline =
            err instanceof TemporalQueryTimeoutError || expired();
          logger.warn(
            `[listSummary] Visibility list ${
              hitDeadline ? "exceeded the aggregate read deadline" : "failed"
            }; falling back to disk only: ${err instanceof Error ? err.message : String(err)}`,
          );
          if (hitDeadline) markDeadline("visibility");
        }
      }

      // Disk enumeration is typically fast local I/O (one readdir per path)
      // but can hang on slow network/FUSE/NFS-backed project roots or
      // transiently-stalled filesystems. Route it through the same
      // aggregate-deadline admission gate as visibility and the
      // `listResolvedChanges` active-disk path (AC1/AC5/C2) so a slow
      // readdir degrades with typed source-specific incompleteness
      // rather than outliving the request budget. Disk still stays
      // available as an omission-evidence source on Temporal-side
      // degradation; the deadline gates the potentially-unbounded stages.
      let diskIds: string[] = [];
      try {
        diskIds = await raceWithTemporalDeadline(
          listChangeDirs(legacy.paths.changes),
          deadline,
        );
      } catch (err) {
        const hitDeadline =
          err instanceof TemporalQueryTimeoutError || expired();
        logger.warn(
          `[listSummary] Disk listChangeDirs ${
            hitDeadline ? "exceeded the aggregate read deadline" : "failed"
          }: ${err instanceof Error ? err.message : String(err)}`,
        );
        if (hitDeadline) markDeadline("active_disk");
      }

      const changeIds = Array.from(
        new Set([
          ...changeCache.keys(),
          ...memoIds,
          ...visibilityIds,
          ...diskIds,
        ]),
      );

      const memoIndex = new Map<string, ChangeSummary>();
      for (const summary of memoSummaries) {
        memoIndex.set(summary.id, summary);
      }

      // rq-crossSessionCacheConsistency01 / status-repair-parity: warm-path
      // summaries must not serve stale active cache/memo entries after an
      // archive bundle has been written (e.g. adv_change_archive or
      // adv_doctor). Mirror the Layer A1 pre-scan from
      // listResolvedChanges: invalidate any non-terminal cached/memo entry
      // whose change now has an archive bundle, so the next read rehydrates
      // from the durable terminal record.
      if (legacy.paths.archive) {
        const archiveBundleCache = new Map<string, boolean>();
        const checkArchiveBundle = async (id: string): Promise<boolean> => {
          const cached = archiveBundleCache.get(id);
          if (cached !== undefined) return cached;
          const exists = await hasArchiveBundle(legacy.paths.archive, id);
          archiveBundleCache.set(id, exists);
          return exists;
        };

        for (const summary of memoSummaries) {
          // Deadline admission: stop the archive-bundle pre-scan once the
          // aggregate budget is gone and record typed incompleteness.
          if (expired()) {
            markDeadline("archive");
            break;
          }
          if (
            summary.status !== "archived" &&
            summary.status !== "closed" &&
            (await checkArchiveBundle(summary.id))
          ) {
            memoIndex.delete(summary.id);
            invalidateChange(summary.id);
          }
        }

        for (const [id, cached] of changeCache.entries()) {
          if (expired()) {
            markDeadline("archive");
            break;
          }
          if (
            cached.status !== "archived" &&
            cached.status !== "closed" &&
            (await checkArchiveBundle(id))
          ) {
            invalidateChange(id);
          }
        }
      }

      let fromMemo = 0;
      let fromCache = 0;
      let fromHydration = 0;

      type SummaryRow = {
        id: string;
        title: string;
        status: Change["status"];
        currentGate: GateId | "done";
        lifecycleState?: ChangeLifecycleState;
        created_at: string;
        lastActivityAt: string;
        taskCount: number;
        completedTasks: number;
        fast_follow_of?: Change["fast_follow_of"];
        ops_followup?: Change["ops_followup"];
        ops_followup_links?: Change["ops_followup_links"];
        epic_membership?: Change["epic_membership"];
      };

      const rows: SummaryRow[] = [];

      for (const id of changeIds) {
        const cached = changeCache.get(id);
        if (cached) {
          fromCache += 1;
          rows.push({
            id: cached.id,
            title: cached.title,
            status: cached.status,
            currentGate: firstOpenGate(cached.gates),
            lifecycleState: cached.lifecycleState,
            created_at: cached.created_at,
            lastActivityAt: computeLastActivity(cached),
            taskCount: cached.tasks.length,
            completedTasks: cached.tasks.filter((t) => t.status === "done")
              .length,
            fast_follow_of: cached.fast_follow_of,
            ops_followup: cached.ops_followup,
            ops_followup_links: cached.ops_followup_links,
            epic_membership: cached.epic_membership,
          });
          continue;
        }

        const summary = memoIndex.get(id);
        if (summary) {
          fromMemo += 1;
          rows.push({
            id: summary.id,
            title: summary.title,
            status: summary.status,
            currentGate: firstOpenGate(summary.gateProgress),
            lifecycleState: summary.lifecycleState,
            created_at: summary.lastActivityAt,
            lastActivityAt: summary.lastActivityAt,
            taskCount: summary.taskCounts.total,
            completedTasks: summary.taskCounts.done,
            fast_follow_of: summary.fast_follow_of,
            ops_followup: summary.ops_followup,
            ops_followup_links: summary.ops_followup_links,
            epic_membership: summary.epic_membership,
          });
          continue;
        }

        // Miss: hydrate one change via the authoritative orphan-tolerant
        // path. Skip on hard failure rather than aborting the batch.
        // Deadline admission: once the aggregate budget is gone, no new
        // hydration begins — remaining misses become typed degradation
        // while cache/memo rows for later ids are still served.
        if (expired()) {
          markDeadline("workflow_query");
          continue;
        }

        // bl-HiZJbUuy: disk-first summary hydration. On a cache+memo miss,
        // resolve the row from the durable active change.json projection BEFORE
        // any per-workflow Temporal query. This is the path adv_change_list /
        // adv_status take; keeping it disk-first makes enumeration O(disk) and
        // off the single shared worker under multi-session load (the N+1 query
        // here was the residual change-list timeout after the listResolvedChanges
        // fix). The getTemporalChange query below is retained ONLY as a bounded
        // fallback for Temporal/memo-only IDs with no active disk projection.
        // Mutation preconditions still call getTemporalChange directly
        // (Temporal-fresh); this reorder is scoped to the read-only listSummary.
        try {
          const diskLoaded = await raceWithTemporalDeadline(
            loadChange(legacy.paths.changes, id),
            ctx.deadline,
          );
          if (isSchemaError(diskLoaded)) {
            throw new Error(diskLoaded.error);
          }
          if (diskLoaded.success && diskLoaded.data) {
            let change = diskLoaded.data;
            // Archive-bundle terminal override: a non-terminal disk status with
            // a present bundle IS archived; it is filtered from the warm path.
            // (Properly-archived changes have their active dir removed, so they
            // miss the disk read above and fall through to getTemporalChange;
            // this covers the rare best-effort removeChangeDir residue.)
            if (
              change.status !== "archived" &&
              change.status !== "closed" &&
              legacy.paths.archive &&
              (await hasArchiveBundle(legacy.paths.archive, id))
            ) {
              change = { ...change, status: "archived" as const };
            }
            fromHydration += 1;
            rows.push({
              id: change.id,
              title: change.title,
              status: change.status,
              currentGate: firstOpenGate(change.gates),
              lifecycleState: change.lifecycleState,
              created_at: change.created_at,
              lastActivityAt: computeLastActivity(change),
              taskCount: change.tasks.length,
              completedTasks: change.tasks.filter((t) => t.status === "done")
                .length,
              fast_follow_of: change.fast_follow_of,
              ops_followup: change.ops_followup,
              ops_followup_links: change.ops_followup_links,
              epic_membership: change.epic_membership,
            });
            continue;
          }
        } catch (err) {
          if (err instanceof TemporalQueryTimeoutError || expired()) {
            markDeadline("workflow_query");
            continue;
          }
          // Disk miss / unreadable (not a deadline) — fall through to the
          // bounded workflow-query fallback below.
        }

        // If the disk-first read exhausted the budget, do not begin a workflow
        // query (which would reject expired and orphan its rejection).
        if (expired()) {
          markDeadline("workflow_query");
          continue;
        }
        try {
          const loaded = await raceWithTemporalDeadline(
            getTemporalChange(id, { context: ctx }),
            ctx.deadline,
          );
          if (isSchemaError(loaded)) {
            throw new Error(loaded.error);
          }
          if (loaded.success && loaded.data) {
            fromHydration += 1;
            const change = loaded.data;
            rows.push({
              id: change.id,
              title: change.title,
              status: change.status,
              currentGate: firstOpenGate(change.gates),
              lifecycleState: change.lifecycleState,
              created_at: change.created_at,
              lastActivityAt: computeLastActivity(change),
              taskCount: change.tasks.length,
              completedTasks: change.tasks.filter((t) => t.status === "done")
                .length,
              fast_follow_of: change.fast_follow_of,
              ops_followup: change.ops_followup,
              ops_followup_links: change.ops_followup_links,
              epic_membership: change.epic_membership,
            });
          }
        } catch (err) {
          if (err instanceof TemporalQueryTimeoutError || expired()) {
            markDeadline("workflow_query");
          }
          logger.debug(
            `[listSummary] hydration miss for change ${id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Filter terminal statuses out of the warm path; they are not
      // accessible through listSummary except via the wantsTerminal
      // compatibility envelope above.
      let filtered = rows.filter(
        (r) => r.status !== "archived" && r.status !== "closed",
      );
      if (filter?.status) {
        filtered = filtered.filter((r) => r.status === filter.status);
      }

      filtered.sort((a, b) => {
        const cmp = b.created_at.localeCompare(a.created_at);
        return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
      });

      const warnings: TerminalWarning[] = [];
      if (deadlineExceeded) {
        const sources =
          deadlineSources.size > 0
            ? Array.from(deadlineSources)
            : (["workflow_query"] as TerminalSource[]);
        for (const source of sources) {
          warnings.push({
            code: "SOURCE_DEADLINE_EXCEEDED",
            source,
            message: `Aggregate read deadline (${deadline.budgetMs}ms) exceeded while resolving ${source}; summary rows are incomplete.`,
          });
        }
      }

      return {
        changes: filtered,
        hydrationStats: {
          totalIds: changeIds.length,
          fromMemo,
          fromCache,
          fromHydration,
          ...(deadlineExceeded ? { deadlineExceeded: true } : {}),
        },
        ...(warnings.length > 0 ? { warnings } : {}),
      };
    },
    /**
     * rq-archiveInventoryActive01: active-only, fixed-8s, fail-closed conflict
     * authority. Membership comes only from Visibility
     * (`AdvLifecycleState="open" AND ExecutionStatus="Running"`); facts come
     * from the durable active projection (disk `change.json`) or a capped
     * workflow fallback. Terminal history, archive bundles, cache, and memo
     * cannot establish completeness.
     */
    listConflictAuthority: async (options) => {
      const deadline = options?.deadline ?? createTemporalReadDeadline();
      const expired = (): boolean => remainingDeadlineMs(deadline) <= 0;
      const warnings: string[] = [];

      const bundle = input.temporal as {
        client?: { workflow?: { list?: unknown } };
      };
      let visibilityIds: string[] = [];
      if (typeof bundle.client?.workflow?.list === "function") {
        try {
          visibilityIds = await raceWithTemporalDeadline(
            listChangeWorkflowIds(
              bundle.client as Parameters<typeof listChangeWorkflowIds>[0],
              { projectId: input.projectId },
            ),
            deadline,
          );
        } catch (err) {
          const hitDeadline =
            err instanceof TemporalQueryTimeoutError || expired();
          warnings.push(
            `Visibility active enumeration ${hitDeadline ? "exceeded the aggregate read deadline" : "failed"}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else {
        warnings.push(
          "Temporal client does not expose workflow.list; active conflict authority cannot enumerate Visibility.",
        );
      }

      const activeIds = Array.from(new Set(visibilityIds)).sort((a, b) =>
        a.localeCompare(b),
      );

      type FactRow = {
        id: string;
        title: string;
        status: string;
        capabilities: string[];
        epic_membership?: Change["epic_membership"];
        fast_follow_of?: Change["fast_follow_of"];
      };
      const active: FactRow[] = [];
      let omittedCount = 0;
      let shadowCount = 0;

      type LoadActiveResult =
        | { kind: "fact"; fact: FactRow }
        | { kind: "shadow" }
        | { kind: "fail"; warning: string };

      const loadActiveFact = async (
        changeId: string,
      ): Promise<LoadActiveResult> => {
        // Durable active projection: read disk changes/<id>/change.json
        // directly. We deliberately avoid `legacy.changes.get` because it
        // performs archive-bundle dominance/self-heal reads for the general
        // listing path. The authority performs no unbounded archive scans:
        // terminal-shadow reconciliation uses only the active durable record;
        // archive bundles never participate in conflict authority.
        let diskResult: Awaited<ReturnType<typeof loadChange>> | undefined;
        let terminalProjection = false;
        try {
          diskResult = await raceWithTemporalDeadline(
            loadChange(legacy.paths.changes, changeId),
            deadline,
          );
        } catch (err) {
          const hitDeadline =
            err instanceof TemporalQueryTimeoutError || expired();
          return {
            kind: "fail",
            warning: `Active fact load for ${changeId} failed${hitDeadline ? " (deadline)" : ""}: ${err instanceof Error ? err.message : String(err)}`,
          };
        }

        if (diskResult && isSchemaError(diskResult)) {
          throw new Error(diskResult.error);
        }
        if (diskResult?.success && diskResult.data) {
          const data = diskResult.data;
          if (data.id !== changeId) {
            return {
              kind: "fail",
              warning: `Active candidate ${changeId} durable projection has mismatched id (${data.id}); cannot establish active authority.`,
            };
          }

          // Terminal-shadow reconciliation (rq-terminalAwareTruth01): a
          // Visibility-proven active ID with a terminal durable projection is a
          // stale shadow. If the terminal record can be confirmed, exclude it
          // from active membership without making the authority incomplete.
          if (data.status === "archived" || data.status === "closed") {
            // Visibility and the durable projection disagree. Confirm terminal
            // state through the already-authoritative active workflow fallback,
            // never through non-authoritative archive history.
            terminalProjection = true;
          } else {
            return {
              kind: "fact",
              fact: {
                id: data.id,
                title: data.title,
                status: data.status,
                capabilities: Object.keys(data.deltas ?? {}),
                epic_membership: data.epic_membership,
                fast_follow_of: data.fast_follow_of,
              },
            };
          }
        }

        // Optional workflow fallback: capped at min(1,000ms, remaining budget).
        try {
          const remaining = remainingDeadlineMs(deadline);
          if (remaining <= 0) {
            return {
              kind: "fail",
              warning: `Active candidate ${changeId} has no durable projection and the aggregate deadline is exhausted; cannot establish active authority.`,
            };
          }
          const fallbackBudget = Math.min(1_000, Math.max(0, remaining));
          const fallbackDeadline = {
            budgetMs: fallbackBudget,
            deadlineAt: Date.now() + fallbackBudget,
          };
          const state = (await runTemporalQuery(
            async () =>
              getChangeHandle(input, changeId).query(changeStateQuery),
            { deadline: fallbackDeadline },
          )) as ChangeWorkflowState;

          if (state.changeId !== changeId) {
            return {
              kind: "fail",
              warning: `Active candidate ${changeId} workflow fallback returned mismatched id (${state.changeId}); cannot establish active authority.`,
            };
          }
          if (state.status === "archived" || state.status === "closed") {
            if (terminalProjection) {
              return { kind: "shadow" };
            }
            return {
              kind: "fail",
              warning: `Active candidate ${changeId} workflow fallback returned terminal status (${state.status}); cannot establish active authority.`,
            };
          }

          if (terminalProjection) {
            return {
              kind: "fail",
              warning: `Active candidate ${changeId} has a terminal durable projection but workflow fallback returned active status (${state.status}); cannot establish active authority.`,
            };
          }

          return {
            kind: "fact",
            fact: {
              id: state.changeId,
              title: state.title,
              status: state.status,
              capabilities: Object.keys(state.deltas ?? {}),
              epic_membership: (
                state as { epic_membership?: Change["epic_membership"] }
              ).epic_membership,
              fast_follow_of: state.fast_follow_of,
            },
          };
        } catch (err) {
          const hitDeadline =
            err instanceof TemporalQueryTimeoutError || expired();
          return {
            kind: "fail",
            warning: `Active candidate ${changeId} workflow fallback failed${hitDeadline ? " (deadline)" : ""}: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      };

      const FACT_LOAD_CONCURRENCY = 4;
      const loadConcurrency = Math.max(
        1,
        Math.min(32, Math.floor(options?.concurrency ?? FACT_LOAD_CONCURRENCY)),
      );
      for (let i = 0; i < activeIds.length; i += loadConcurrency) {
        if (expired()) {
          const remaining = activeIds.slice(i);
          warnings.push(
            `Aggregate deadline expired before all active candidates could be loaded; omitted ${remaining.length} candidate(s).`,
          );
          omittedCount += remaining.length;
          break;
        }
        const batch = activeIds.slice(i, i + loadConcurrency);
        const loaded = await Promise.all(batch.map(loadActiveFact));
        for (const item of loaded) {
          if (item.kind === "fact") {
            active.push(item.fact);
          } else if (item.kind === "shadow") {
            shadowCount += 1;
          } else {
            warnings.push(item.warning);
            omittedCount += 1;
          }
        }
      }

      active.sort((a, b) => a.id.localeCompare(b.id));

      const completeness: ChangeConflictAuthority["completeness"] =
        warnings.length === 0 && omittedCount === 0 ? "complete" : "incomplete";

      return {
        active,
        completeness,
        canConcludeClean: completeness === "complete",
        warnings,
        source: "active-conflict-authority",
        candidateCount: activeIds.length,
        omittedCount,
        shadowCount,
      };
    },
  };
}
