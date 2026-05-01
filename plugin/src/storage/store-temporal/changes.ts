import type { Store } from "../store-types";
import type { ChangeClosure, BulkCloseResult, Change } from "../../types";
import {
  archiveChangeUpdate,
  closeChangeUpdate,
  updateArtifactMetadataUpdate,
} from "../../temporal/messages";
import { ensureChangeWorkflowStarted } from "../../temporal/migration";
import { removeChangeDir } from "../json";
import { filterChanges } from "../content-search";
import { computeLastActivity } from "../store-types";
import { runTemporal, getGuardedChangeHandle, type StoreDeps } from "./shared";

export function createChangeOps(deps: StoreDeps): Store["changes"] {
  const {
    input,
    legacy,
    invalidateChange,
    updateOverlay,
    emitChangeSummarySignal,
    resolveStateOrQuery,
    indexTasksFromState,
    setCachedChange,
    getTemporalChange,
    listResolvedChanges,
    getTemporalWorkflowClient,
  } = deps;

  return {
    create: async (
      summary,
      capability,
      proposalContent,
      problemStatementContent,
      agreementContent,
      designContent,
    ) => {
      const result = await legacy.changes.create(
        summary,
        capability,
        proposalContent,
        problemStatementContent,
        agreementContent,
        designContent,
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
          seedState: {
            status: created.data.status,
            tasks: created.data.tasks,
            wisdom: created.data.wisdom,
            gates: created.data.gates,
            reentry_history: created.data.reentry_history,
            fast_follow_of: created.data.fast_follow_of,
          },
        });
      } catch (err) {
        try {
          await removeChangeDir(legacy.paths.changes, created.data.id);
        } catch (rollbackErr) {
          // Rollback itself failed (disk unmounted, permissions, etc).
          // Log but don't mask the original Temporal error.
          console.error(
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
      };
      try {
        await legacy.changes.save(changeWithOwner);
      } catch {
        // Best-effort: disk save failure for owner metadata MUST NOT
        // cascade as a creation failure.
      }

      updateOverlay(created.data.id, {
        created_at: created.data.created_at,
        created_by: created.data.created_by,
        deltas: created.data.deltas,
        validation: created.data.validation,
        github_issues: created.data.github_issues,
        clarify_findings: created.data.clarify_findings,
        judgment_calls: created.data.judgment_calls,
        batch_surfaced_at: created.data.batch_surfaced_at,
        cross_project_origin: created.data.cross_project_origin,
        fast_follow_of: created.data.fast_follow_of,
        adv_project_id: input.projectId,
      });
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
        const raw = await runTemporal(async () =>
          (await getGuardedChangeHandle(input, change.id)).executeUpdate(
            archiveChangeUpdate,
            { args: [] },
          ),
        );
        const result = await resolveStateOrQuery(
          async () => await getGuardedChangeHandle(input, change.id),
          raw,
        );
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
        judgment_calls: change.judgment_calls,
        batch_surfaced_at: change.batch_surfaced_at,
        cross_project_origin: change.cross_project_origin,
        fast_follow_of: change.fast_follow_of,
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
    close: async (changeId: string, closure: ChangeClosure) => {
      invalidateChange(changeId);

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
      if (current.success && current.data) {
        const updated: Change = {
          ...current.data,
          status: "closed",
          closure,
        };
        await legacy.changes.save(updated);
      }

      const raw = await runTemporal(async () =>
        (await getGuardedChangeHandle(input, changeId)).executeUpdate(
          closeChangeUpdate,
          {
            args: [closure],
          },
        ),
      );
      const result = await resolveStateOrQuery(
        async () => await getGuardedChangeHandle(input, changeId),
        raw,
      );
      indexTasksFromState(result);
      updateOverlay(changeId, { status: "closed", closure });
      const change = setCachedChange(result);
      emitChangeSummarySignal(changeId, result);
      return change;
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
          invalidateChange(id);
          const raw = await runTemporal(async () =>
            (await getGuardedChangeHandle(input, id)).executeUpdate(
              closeChangeUpdate,
              {
                args: [closure],
              },
            ),
          );
          const result = await resolveStateOrQuery(
            async () => await getGuardedChangeHandle(input, id),
            raw,
          );
          indexTasksFromState(result);
          updateOverlay(id, { status: "closed", closure });
          setCachedChange(result);
          emitChangeSummarySignal(id, result);
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
          : `Closed ${closed}of ${changeIds.length} change(s). See results for details.`,
      };
    },
    updateArtifacts: async (
      changeId,
      proposalContent,
      problemStatementContent,
      agreementContent,
      designContent,
    ) => {
      const result = await legacy.changes.updateArtifacts(
        changeId,
        proposalContent,
        problemStatementContent,
        agreementContent,
        designContent,
      );
      if (!result.success) {
        return result;
      }

      const updates: Array<
        [
          "proposal" | "problemStatement" | "agreement" | "design",
          string | undefined,
        ]
      > = [
        ["proposal", result.proposalPath],
        ["problemStatement", result.problemStatementPath],
        ["agreement", result.agreementPath],
        ["design", result.designPath],
      ];
      for (const [kind, path] of updates) {
        if (!path) continue;
        await runTemporal(async () =>
          (await getGuardedChangeHandle(input, changeId)).executeUpdate(
            updateArtifactMetadataUpdate,
            {
              args: [kind, { path, updatedAt: new Date().toISOString() }],
            },
          ),
        );
      }
      return result;
    },
  };
}
