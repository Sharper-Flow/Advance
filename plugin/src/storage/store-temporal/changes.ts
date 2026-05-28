import type { Store } from "../store-types";
import type {
  ArtifactKind,
  ArtifactPayload,
  ChangeClosure,
  BulkCloseResult,
  Change,
} from "../../types";
import { createHash } from "crypto";
import {
  acceptanceUpdatedSignal,
  agreementUpdatedSignal,
  archiveChangeSignal,
  closeChangeSignal,
  designUpdatedSignal,
  executiveSummaryUpdatedSignal,
  problemStatementUpdatedSignal,
  proposalUpdatedSignal,
  updateArtifactMetadataSignal,
  changeStateQuery,
} from "../../temporal/messages";
import { ensureChangeWorkflowStarted } from "../../temporal/workflow-start";
import { listChangeDirs, removeChangeDir } from "../json";
import { filterChanges } from "../content-search";
import { computeLastActivity } from "../store-types";
import { runTemporal, getGuardedChangeHandle, type StoreDeps } from "./shared";
import {
  normalizeCreateArgs,
  normalizeUpdateArtifactsArgs,
} from "../_artifact-args";
import {
  validateAggregateSize,
  validatePerArtifactSize,
} from "../_artifact-size-validation";
import { createLogger } from "../../utils/debug-log";
import { isWorkflowCompletedError } from "../../temporal/recovery-classification";
import { listChangeWorkflowIds } from "../../temporal/list-change-workflows";
import type { ChangeSummary } from "../store-temporal-memo";

const logger = createLogger("store-temporal-changes");

function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
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
  handle: Awaited<ReturnType<typeof getGuardedChangeHandle>>,
  changeId: string,
  artifacts: ArtifactPayload,
  metadataPaths: Partial<Record<ArtifactKind, string>>,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  for (const { kind, signal } of ARTIFACT_SIGNAL_ORDER) {
    const content = artifacts[kind];
    if (content === undefined) continue;
    // Content signal — populates state.documents[kind]
    await handle.signal(signal, { text: content, updatedAt });

    // Metadata signal — populates state.artifacts[kind] with contentHash.
    // Fires AFTER the content signal so the hash reflects the just-written
    // content. metadataPaths[kind] is supplied by the disk store when the
    // artifact file was also written (transition window before T15 removes
    // disk writes from this path).
    const path = metadataPaths[kind];
    if (path) {
      await handle.signal(updateArtifactMetadataSignal, {
        kind,
        metadata: {
          path,
          updatedAt,
          contentHash: computeContentHash(content),
        },
      });
    }
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
    create: (async (summary: string, ...rest: unknown[]) => {
      // Normalize positional + options-object call shapes to a single
      // options-object form. See `_artifact-args.ts`.
      const { capability, artifacts, initialMetadata } = normalizeCreateArgs([
        summary,
        ...rest,
      ]);

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

      // Forward to disk store via its still-positional internal API.
      // T15 (KD-10 phase 16) removes the legacy.changes.create artifact-
      // content forwarding entirely once the temporal store fires content
      // signals instead. For now, behavior is preserved.
      const result = await legacy.changes.create(
        summary,
        capability,
        artifacts.proposal,
        artifacts.problemStatement,
        artifacts.agreement,
        artifacts.design,
        artifacts.executiveSummary,
        initialMetadata ? { initialMetadata } : undefined,
      );
      const created = await legacy.changes.get(result.changeId);
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
          seedState: {
            status: created.data.status,
            tasks: created.data.tasks,
            deltas: created.data.deltas,
            wisdom: created.data.wisdom,
            gates: created.data.gates,
            reentry_history: created.data.reentry_history,
            fast_follow_of: created.data.fast_follow_of,
            origin: created.data.origin,
            // rq-autoManageAdvWorktrees AC3 — new changes are auto-managed
            // by default. Seed the workflow state with the marker so the
            // first read sees it; lazy migration (A4) covers legacy changes
            // that pre-date this field.
            worktree_auto_managed: true,
          },
        });
      } catch (err) {
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
      // Only fires for actually-defined fields; transitional behavior keeps
      // disk writes via legacy.changes.create above until T15 removes them.
      const metadataPaths: Partial<Record<ArtifactKind, string>> = {};
      if (result.path) metadataPaths.proposal = result.path;
      if (result.problemStatementPath)
        metadataPaths.problemStatement = result.problemStatementPath;
      if (result.agreementPath) metadataPaths.agreement = result.agreementPath;
      if (result.designPath) metadataPaths.design = result.designPath;
      if (result.executiveSummaryPath)
        metadataPaths.executiveSummary = result.executiveSummaryPath;
      // Acceptance is not currently scaffolded by createChangeScaffold;
      // when added via updateArtifacts/gate.ts, the metadata signal fires
      // there.

      if (Object.values(artifacts).some((v) => v !== undefined)) {
        await runTemporal(async () => {
          const handle = await getGuardedChangeHandle(input, created.data!.id);
          await fireContentSignalsSequentially(
            handle,
            created.data!.id,
            artifacts,
            metadataPaths,
          );
        });
      }

      return result;
    }) as Store["changes"]["create"],
    save: async (change) => {
      // Invalidate Memo before save to prevent stale status from being
      // served by the fast path in listResolvedChanges. Without this,
      // archive operations (which set status="archived" then save) leave
      // a zombie entry in the Memo, causing list() to show archived
      // changes as still active.
      invalidateChange(change.id);

      if (change.status === "archived") {
        await runTemporal(async () =>
          (await getGuardedChangeHandle(input, change.id)).signal(
            archiveChangeSignal,
          ),
        );
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
        fast_follow_of: change.fast_follow_of,
        origin: change.origin,
        scope_repos: change.scope_repos,
        adv_project_id: change.adv_project_id,
      });
    },
    list: async (filter) => {
      // When status is explicitly "archived"/"closed", auto-enable the
      // corresponding include flag so the status filter isn't immediately
      // undone by the exclusion below.
      const effectiveIncludeArchived =
        filter?.includeArchived || filter?.status === "archived";
      const effectiveIncludeClosed =
        filter?.includeClosed || filter?.status === "closed";

      // Pass include flags into the resolver so the visibility query
      // widens its status filter to include archived/closed workflows
      // when the caller asked for them. Without this the post-filter
      // below operates on a pre-narrowed set and surfaces nothing.
      const changes = await listResolvedChanges({
        includeArchived: effectiveIncludeArchived,
        includeClosed: effectiveIncludeClosed,
      });
      let filtered = changes;

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
          created_at: change.created_at,
          lastActivityAt: computeLastActivity(change),
          taskCount: change.tasks.length,
          completedTasks: change.tasks.filter((task) => task.status === "done")
            .length,
          fast_follow_of: change.fast_follow_of,
        })),
      };
    },
    get: async (changeId: string) => {
      // Delegates to the shared orphan-tolerant path so adv_status,
      // adv_change_show, and adv_change_list all behave the same when
      // a workflow is missing: try to re-seed from disk, otherwise
      // return the not-found error.
      return getTemporalChange(changeId);
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
      try {
        await runTemporal(async () =>
          (await getGuardedChangeHandle(input, changeId)).signal(
            closeChangeSignal,
            closure,
          ),
        );
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
        if (
          change.data.status !== "draft" &&
          change.data.status !== "pending"
        ) {
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
            message: `Bulk close aborted: Change "${id}" has protected status "${change.data.status}". Only draft or pending changes can be bulk-closed.`,
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
          try {
            await runTemporal(async () =>
              (await getGuardedChangeHandle(input, id)).signal(
                closeChangeSignal,
                closure,
              ),
            );
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
    updateArtifacts: (async (changeId: string, ...rest: unknown[]) => {
      // Normalize positional + options-object call shapes.
      const artifacts = normalizeUpdateArtifactsArgs([changeId, ...rest]);

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
        existingDocuments = (snapshot as unknown as { documents?: typeof existingDocuments })
          .documents ?? {};
      } catch {
        // Snapshot may be unavailable for in-flight workflows or test
        // fixtures; aggregate cap then computes against the proposed payload
        // alone, which is a conservative undercount but safe.
      }
      validateAggregateSize(artifacts, existingDocuments);

      // Forward to disk store via still-positional internal API.
      // T15 removes this call entirely once temporal-first writes land.
      const result = await legacy.changes.updateArtifacts(
        changeId,
        artifacts.proposal,
        artifacts.problemStatement,
        artifacts.agreement,
        artifacts.design,
        artifacts.executiveSummary,
      );
      if (!result.success) {
        return result;
      }

      // KD-3 + KD-4: sequential await fan-out of content signals. Each
      // defined field on `artifacts` fires its content signal (populating
      // state.documents[kind]) followed by updateArtifactMetadataSignal
      // (populating state.artifacts[kind].contentHash). Order matches
      // ARTIFACT_SIGNAL_ORDER for deterministic history diffs (C5).
      const metadataPaths: Partial<Record<ArtifactKind, string>> = {};
      if (result.proposalPath) metadataPaths.proposal = result.proposalPath;
      if (result.problemStatementPath)
        metadataPaths.problemStatement = result.problemStatementPath;
      if (result.agreementPath) metadataPaths.agreement = result.agreementPath;
      if (result.designPath) metadataPaths.design = result.designPath;
      if (result.executiveSummaryPath)
        metadataPaths.executiveSummary = result.executiveSummaryPath;
      // acceptancePath is not yet plumbed through createChangeScaffold/
      // updateChangeArtifacts; the gate.ts acceptance write path (T12)
      // surfaces it through a different code path until T15+T20 unify.

      await runTemporal(async () => {
        const handle = await getGuardedChangeHandle(input, changeId);
        await fireContentSignalsSequentially(
          handle,
          changeId,
          artifacts,
          metadataPaths,
        );
      });

      return result;
    }) as Store["changes"]["updateArtifacts"],

    // rq-changeSummaryReadModel01: lightweight summary list for default
    // tool paths. Uses `ChangeSummaryMemo` and `changeCache` to avoid
    // per-change full hydration when summary data already satisfies the
    // response contract; falls back to authoritative hydration for IDs
    // that have no summary proof. Archive/closed callers still walk the
    // full hydration path because terminal records require disk/archive
    // reconciliation outside the memo.
    listSummary: async (filter) => {
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
      // correctness depends on full state (terminal-status sweeps, content
      // filters that need created_at/lastActivityAt), defer to the full
      // `list` projection. The hydrationStats field is still returned so
      // telemetry callers can identify the fallback path.
      if (wantsTerminal || hasContentFilters) {
        const fallback = await listResolvedChanges({
          includeArchived: wantsArchived,
          includeClosed: wantsClosed,
        });
        let filtered = fallback;
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
            lastActivityAt: computeLastActivity(c),
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
        return {
          changes: filtered.map((change) => ({
            id: change.id,
            title: change.title,
            status: change.status,
            created_at: change.created_at,
            lastActivityAt: computeLastActivity(change),
            taskCount: change.tasks.length,
            completedTasks: change.tasks.filter((t) => t.status === "done")
              .length,
            fast_follow_of: change.fast_follow_of,
          })),
          hydrationStats: {
            totalIds: filtered.length,
            fromMemo: 0,
            fromCache: 0,
            fromHydration: filtered.length,
          },
        };
      }

      // Build candidate ID set from memo + Visibility + disk to avoid
      // dropping orphan-on-disk changes the memo never observed. Memo
      // is the warm-path source; Visibility/disk catch cold-start and
      // orphan cases.
      const memoSummaries = memo.getAll();
      const memoIds = memoSummaries.map((s) => s.id);

      const bundle = input.temporal as {
        client?: { workflow?: { list?: unknown } };
      };
      let visibilityIds: string[] = [];
      if (typeof bundle.client?.workflow?.list === "function") {
        try {
          visibilityIds = await listChangeWorkflowIds(
            bundle.client as Parameters<typeof listChangeWorkflowIds>[0],
            { projectId: input.projectId },
          );
        } catch (err) {
          logger.warn(
            `[listSummary] Visibility list failed; falling back to disk only: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      let diskIds: string[] = [];
      try {
        diskIds = await listChangeDirs(legacy.paths.changes);
      } catch (err) {
        logger.warn(
          `[listSummary] Disk listChangeDirs failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      const changeIds = Array.from(
        new Set([...memoIds, ...visibilityIds, ...diskIds]),
      );

      const memoIndex = new Map<string, ChangeSummary>();
      for (const summary of memoSummaries) {
        memoIndex.set(summary.id, summary);
      }

      let fromMemo = 0;
      let fromCache = 0;
      let fromHydration = 0;

      type SummaryRow = {
        id: string;
        title: string;
        status: Change["status"];
        created_at: string;
        lastActivityAt: string;
        taskCount: number;
        completedTasks: number;
        fast_follow_of?: Change["fast_follow_of"];
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
            created_at: cached.created_at,
            lastActivityAt: computeLastActivity(cached),
            taskCount: cached.tasks.length,
            completedTasks: cached.tasks.filter((t) => t.status === "done")
              .length,
            fast_follow_of: cached.fast_follow_of,
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
            created_at: summary.lastActivityAt,
            lastActivityAt: summary.lastActivityAt,
            taskCount: summary.taskCounts.total,
            completedTasks: summary.taskCounts.done,
            fast_follow_of: summary.fast_follow_of,
          });
          continue;
        }

        // Miss: hydrate one change via the authoritative orphan-tolerant
        // path. Skip on hard failure rather than aborting the batch.
        try {
          const loaded = await getTemporalChange(id);
          if (loaded.success && loaded.data) {
            fromHydration += 1;
            const change = loaded.data;
            rows.push({
              id: change.id,
              title: change.title,
              status: change.status,
              created_at: change.created_at,
              lastActivityAt: computeLastActivity(change),
              taskCount: change.tasks.length,
              completedTasks: change.tasks.filter((t) => t.status === "done")
                .length,
              fast_follow_of: change.fast_follow_of,
            });
          }
        } catch (err) {
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

      return {
        changes: filtered,
        hydrationStats: {
          totalIds: changeIds.length,
          fromMemo,
          fromCache,
          fromHydration,
        },
      };
    },
  };
}
