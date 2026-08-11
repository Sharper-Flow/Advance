/**
 * Executors for the migration residue actions that are safe to decide from a
 * single change projection: artifact metadata completion and worktree marker
 * normalization.
 *
 * Active projections always use ActionContext.coordinateChangeMutation. The
 * archive path has no active-projection transaction, so it uses the same
 * atomic-write/readback shape as the storage-owned migration. Neither path
 * synthesizes a projection when its current bytes cannot be validated.
 *
 * The artifact-metadata rewrite touches exactly one leaf (`artifacts.*.source`),
 * so its read precondition validates that subtree rather than the whole
 * document. A whole-document failure attributable solely to residue owned by a
 * different action (retired evidence enums, owned by the schema-drift action)
 * is recorded as a documented, whitelisted benign residual and does not block
 * the completion marker — the allowance already granted by
 * `rq-storeReconcileUnboundedProof01.4`. Every other read or validation failure
 * still fails closed. The write path keeps whole-document validation, which is
 * why a record carrying both residue classes converges over two runs.
 */

import { mkdir, readFile, readdir } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "node:path";

import { ChangeSchema, type Change } from "../types";
import {
  getWorktreeRegistrySnapshot,
  initStateDb,
} from "../tools/worktree/state";
import { atomicWriteFile } from "../utils/fs";
import {
  normalizeProjectionDocument,
  readBoundedProjectionDocument,
} from "./change-projection-reader";
import { isRetiredEvidenceValue } from "./retired-evidence";
import type {
  ActionContext,
  ActionExecutor,
  ActionOutcome,
} from "./reconcile-action-types";
import type { ReconcileAction, ReconcilePlanRecord } from "./reconcile-plan";

type JsonRecord = Record<string, unknown>;
type ArtifactDisposition =
  | "migrated"
  | "classified_terminal_noop"
  | "quarantined"
  | "benign_residual_foreign_owned";

type ExtendedOutcome = ActionOutcome & {
  disposition?: ArtifactDisposition;
  marker_written?: boolean;
};

/**
 * Whole-document standing of a projection whose mutated subtree is already
 * known to be well-formed.
 */
type DocumentValidity =
  | { kind: "valid" }
  | { kind: "foreign_owned_residue"; reason: string }
  | { kind: "invalid"; reason: string };

type ProjectionRead =
  | {
      kind: "ok";
      bytes: Buffer;
      raw: JsonRecord;
      documentValidity: DocumentValidity;
    }
  | { kind: "failed"; error_class: string; residual: string };

function dispositionLedgerPath(ctx: ActionContext): string {
  return join(
    ctx.storePaths.reconcileDir,
    "runs",
    ctx.runId,
    "artifact-dispositions.json",
  );
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function failed(error_class: string, residual: string): ExtendedOutcome {
  return { status: "failed", error_class, residual };
}

function readFailed(error_class: string, residual: string): ProjectionRead {
  return { kind: "failed", error_class, residual };
}

function invalidContext(
  record: ReconcilePlanRecord,
  action: ReconcileAction,
  expectedAction: ReconcileAction["action"],
): ExtendedOutcome | null {
  if (
    record.class !== "unmigrated_artifact_metadata" &&
    record.class !== "unmigrated_worktree_marker"
  ) {
    return failed(
      "invalid_executor_context",
      `${record.record_id}: unsupported residue class ${record.class}`,
    );
  }
  if (action.class !== record.class || action.action !== expectedAction) {
    return failed(
      "invalid_executor_context",
      `${record.record_id}: expected ${record.class}/${expectedAction} action context`,
    );
  }
  return null;
}

function valueAtPath(root: unknown, path: readonly PropertyKey[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (Array.isArray(current) && typeof key === "number") {
      current = current[key];
      continue;
    }
    if (!isRecord(current)) return undefined;
    current = current[String(key)];
  }
  return current;
}

/**
 * Classifies a whole-document validation failure. The failure is foreign-owned
 * only when every reported issue lands on a retired `evidence_kind` leaf — the
 * residue class the schema-drift action owns. Any other issue keeps the
 * document `invalid`, so genuine corruption still fails closed.
 */
function classifyDocument(normalized: unknown): DocumentValidity {
  const parsed = ChangeSchema.safeParse(normalized);
  if (parsed.success) return { kind: "valid" };

  const issues = parsed.error.issues;
  const foreignOwned =
    issues.length > 0 &&
    issues.every((issue) => {
      const path = issue.path;
      return (
        path.length > 0 &&
        path[path.length - 1] === "evidence_kind" &&
        isRetiredEvidenceValue(valueAtPath(normalized, path))
      );
    });
  if (foreignOwned) {
    return {
      kind: "foreign_owned_residue",
      reason:
        "whole-document validation fails only on retired evidence enums owned by the schema-drift action",
    };
  }
  return {
    kind: "invalid",
    reason: `projection failed ChangeSchema validation (${issues[0]?.path.join(".") || "root"})`,
  };
}

async function readProjection(path: string): Promise<ProjectionRead> {
  const bounded = await readBoundedProjectionDocument(path);
  if (bounded.kind !== "ok") {
    return readFailed(
      "projection_read_failed",
      `${path}: ${
        bounded.kind === "not_found"
          ? "projection not found"
          : bounded.kind === "oversized"
            ? `projection exceeds ${bounded.limit} bytes`
            : `${bounded.kind}: ${bounded.error}`
      }`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bounded.content) as unknown;
  } catch (error) {
    return readFailed(
      "projection_read_failed",
      `${path}: corrupt JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isRecord(parsed)) {
    return readFailed(
      "projection_validation_failed",
      `${path}: root is not an object`,
    );
  }

  const [normalized] = normalizeProjectionDocument(parsed);
  // Subtree-scoped precondition: the rewrite touches only `artifacts.*.source`,
  // so a malformed artifacts subtree is the only shape that blocks the read.
  const subtree = artifactMap(normalized);
  if (subtree.kind === "invalid") {
    return readFailed(
      "projection_validation_failed",
      `${path}: ${subtree.reason}`,
    );
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    return readFailed(
      "projection_read_failed",
      `${path}: read failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    kind: "ok",
    bytes,
    raw: parsed,
    documentValidity: classifyDocument(normalized),
  };
}

function artifactMap(
  value: unknown,
):
  | { kind: "unchanged"; value: JsonRecord }
  | { kind: "migrated"; value: JsonRecord }
  | { kind: "invalid"; reason: string } {
  if (!isRecord(value))
    return { kind: "invalid", reason: "root is not an object" };
  if (value.artifacts === undefined) return { kind: "unchanged", value };
  if (!isRecord(value.artifacts)) {
    return { kind: "invalid", reason: "artifacts must be an object" };
  }

  let changed = false;
  const artifacts: JsonRecord = { ...value.artifacts };
  for (const [kind, item] of Object.entries(value.artifacts)) {
    if (item === undefined) continue;
    if (!isRecord(item)) {
      return {
        kind: "invalid",
        reason: `artifacts.${kind} metadata must be an object`,
      };
    }
    if (item.source === undefined || item.source === "disk") continue;
    if (typeof item.source !== "string") {
      return {
        kind: "invalid",
        reason: `artifacts.${kind}.source must be a string`,
      };
    }
    if (item.source !== "temporal") continue;
    artifacts[kind] = { ...item, source: "disk" };
    changed = true;
  }
  return changed
    ? { kind: "migrated", value: { ...value, artifacts } }
    : { kind: "unchanged", value };
}

function hasTemporalMetadata(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.artifacts)) return false;
  return Object.values(value.artifacts).some(
    (item) => isRecord(item) && item.source === "temporal",
  );
}

function isUnder(path: string, parent: string): boolean {
  const child = relative(parent, path);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

function isActiveProjection(ctx: ActionContext, sourcePath: string): boolean {
  return isUnder(sourcePath, ctx.storePaths.changes);
}

function isDisposition(value: unknown): value is ArtifactDisposition {
  return (
    value === "migrated" ||
    value === "classified_terminal_noop" ||
    value === "quarantined" ||
    value === "benign_residual_foreign_owned"
  );
}

async function readDispositionLedger(
  ctx: ActionContext,
): Promise<Record<string, ArtifactDisposition>> {
  try {
    const parsed = JSON.parse(
      await readFile(dispositionLedgerPath(ctx), "utf8"),
    ) as unknown;
    if (!isRecord(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, ArtifactDisposition] =>
          isDisposition(entry[1]),
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function recordDisposition(
  ctx: ActionContext,
  recordId: string,
  disposition: ArtifactDisposition,
): Promise<string | undefined> {
  try {
    const path = dispositionLedgerPath(ctx);
    const dispositions = await readDispositionLedger(ctx);
    dispositions[recordId] = disposition;
    await mkdir(dirname(path), { recursive: true });
    await atomicWriteFile(path, JSON.stringify(dispositions, null, 2));
    return undefined;
  } catch (error) {
    return `could not record ${disposition} disposition: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function writeMarkerIfComplete(
  ctx: ActionContext,
  recordId: string,
  disposition: ArtifactDisposition,
): Promise<{ complete: boolean; error?: string }> {
  const projectionPaths: string[] = [];
  for (const parent of [ctx.storePaths.changes, ctx.storePaths.archive]) {
    let entries;
    try {
      entries = await readdir(parent, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      return {
        complete: false,
        error: `could not enumerate ${parent}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        projectionPaths.push(join(parent, entry.name, "change.json"));
      }
    }
  }

  const unresolved: string[] = [];
  const benignResiduals: string[] = [];
  for (const path of projectionPaths) {
    const current = await readProjection(path);
    if (current.kind === "failed") {
      unresolved.push(path);
      continue;
    }
    if (hasTemporalMetadata(current.raw)) {
      unresolved.push(path);
      continue;
    }
    // Residue this action cannot touch must not permanently block completion,
    // but it is recorded so the marker never hides it (DDC3).
    if (current.documentValidity.kind === "foreign_owned_residue") {
      benignResiduals.push(basename(dirname(path)));
      continue;
    }
    if (current.documentValidity.kind === "invalid") unresolved.push(path);
  }
  if (unresolved.length > 0 || projectionPaths.length === 0) {
    return { complete: false };
  }

  const markerPath = ctx.storePaths.artifactMetadataMigrationMarker;
  let dispositions: Record<string, ArtifactDisposition> = {};
  try {
    dispositions = await readDispositionLedger(ctx);
    const existing = JSON.parse(await readFile(markerPath, "utf8")) as unknown;
    if (isRecord(existing) && isRecord(existing.dispositions)) {
      dispositions = {
        ...dispositions,
        ...Object.fromEntries(
          Object.entries(existing.dispositions).filter(
            (entry): entry is [string, ArtifactDisposition] =>
              isDisposition(entry[1]),
          ),
        ),
      };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return {
        complete: false,
        error: `could not read completion marker: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  for (const residualId of benignResiduals) {
    dispositions[residualId] = "benign_residual_foreign_owned";
  }
  dispositions[recordId] = disposition;
  try {
    await mkdir(dirname(markerPath), { recursive: true });
    await atomicWriteFile(
      markerPath,
      JSON.stringify(
        {
          version: 1,
          run_id: ctx.runId,
          completed_at: new Date().toISOString(),
          dispositions,
        },
        null,
        2,
      ),
    );
    return { complete: true };
  } catch (error) {
    return {
      complete: false,
      error: `could not write completion marker: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function mutationFailure(result: {
  kind: string;
  reason?: string;
}): ExtendedOutcome {
  return failed(
    `mutation_${result.kind}`,
    result.reason ?? `coordinateChangeMutation returned ${result.kind}`,
  );
}

async function readAfter(
  path: string,
  recordId: string,
): Promise<Buffer | ExtendedOutcome> {
  try {
    const bytes = await readFile(path);
    const parsed = JSON.parse(bytes.toString("utf8")) as unknown;
    const validation = ChangeSchema.safeParse(parsed);
    if (!validation.success || hasTemporalMetadata(parsed)) {
      return failed(
        "post_write_validation_failed",
        `${recordId}: durable projection still carries invalid artifact metadata`,
      );
    }
    return bytes;
  } catch (error) {
    return failed(
      "post_write_read_failed",
      `${recordId}: could not verify durable projection: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function persistArtifactMigration(
  record: ReconcilePlanRecord,
  source: Extract<ProjectionRead, { kind: "ok" }>,
  ctx: ActionContext,
): Promise<ExtendedOutcome> {
  const mapped = artifactMap(source.raw);
  if (mapped.kind === "invalid") {
    return failed(
      "artifact_metadata_invalid",
      `${record.record_id}: ${mapped.reason}`,
    );
  }
  if (mapped.kind === "unchanged") {
    const dispositionError = await recordDisposition(
      ctx,
      record.record_id,
      "classified_terminal_noop",
    );
    const completion = await writeMarkerIfComplete(
      ctx,
      record.record_id,
      "classified_terminal_noop",
    );
    return {
      status: "skipped",
      disposition: "classified_terminal_noop",
      ...(dispositionError && {
        residual: dispositionError,
      }),
      ...(completion.error && { residual: completion.error }),
      ...(completion.complete && { marker_written: true }),
    };
  }

  await ctx.writeBeforeState(record.record_id, source.bytes);
  if (isActiveProjection(ctx, record.source_path)) {
    const mutation = await ctx.coordinateChangeMutation<Change>({
      changeId: record.record_id,
      mutationKind: "store-reconcile:migrate-artifact-metadata",
      mutateLatestProjection: (latest) => {
        const latestMapped = artifactMap(latest);
        if (latestMapped.kind === "invalid") {
          throw new Error(latestMapped.reason);
        }
        return ChangeSchema.parse(latestMapped.value);
      },
      verifyProjection: (readback: Change) => ({
        ok:
          ChangeSchema.safeParse(readback).success &&
          !hasTemporalMetadata(readback),
        error: "durable readback still carries temporal artifact metadata",
      }),
    });
    if (mutation.kind !== "verified") return mutationFailure(mutation);
  } else {
    try {
      await atomicWriteFile(
        record.source_path,
        JSON.stringify(mapped.value, null, 2),
      );
    } catch (error) {
      return failed(
        "projection_write_failed",
        `${record.record_id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const after = await readAfter(record.source_path, record.record_id);
  if (typeof after !== "object" || !Buffer.isBuffer(after)) return after;
  const dispositionError = await recordDisposition(
    ctx,
    record.record_id,
    "migrated",
  );
  const completion = await writeMarkerIfComplete(
    ctx,
    record.record_id,
    "migrated",
  );
  return {
    status: "mutated",
    before_bytes: source.bytes,
    after_bytes: after,
    disposition: "migrated",
    ...(dispositionError && { residual: dispositionError }),
    ...(completion.error && { residual: completion.error }),
    ...(completion.complete && { marker_written: true }),
  };
}

export const migrateRecordExecutor: ActionExecutor = async (
  record,
  action,
  ctx,
) => {
  const invalid = invalidContext(record, action, "migrate_record");
  if (invalid) return invalid;
  if (record.class !== "unmigrated_artifact_metadata") {
    return failed(
      "invalid_executor_context",
      `${record.record_id}: wrong residue class`,
    );
  }
  const source = await readProjection(record.source_path);
  if (source.kind === "failed") {
    return failed(source.error_class, source.residual);
  }
  return persistArtifactMigration(record, source, ctx);
};

export const classifyTerminalNoopExecutor: ActionExecutor = async (
  record,
  action,
  ctx,
) => {
  const invalid = invalidContext(record, action, "classify_terminal_noop");
  if (invalid) return invalid;
  if (record.class !== "unmigrated_artifact_metadata") {
    return failed(
      "invalid_executor_context",
      `${record.record_id}: wrong residue class`,
    );
  }
  const source = await readProjection(record.source_path);
  if (source.kind === "failed") {
    return failed(source.error_class, source.residual);
  }
  if (hasTemporalMetadata(source.raw)) {
    return failed(
      "terminal_noop_not_eligible",
      `${record.record_id}: temporal artifact metadata still requires migration`,
    );
  }
  const dispositionError = await recordDisposition(
    ctx,
    record.record_id,
    "classified_terminal_noop",
  );
  const completion = await writeMarkerIfComplete(
    ctx,
    record.record_id,
    "classified_terminal_noop",
  );
  return {
    status: "skipped",
    residual: `${record.record_id}: terminal_noop disposition recorded`,
    disposition: "classified_terminal_noop",
    ...(dispositionError && { residual: dispositionError }),
    ...(completion.error && { residual: completion.error }),
    ...(completion.complete && { marker_written: true }),
  };
};

async function registryHasEvidence(
  ctx: ActionContext,
  changeId: string,
): Promise<boolean> {
  try {
    const access = await initStateDb(ctx.storePaths.root);
    const snapshot = await getWorktreeRegistrySnapshot(access);
    if (snapshot.unavailable) return false;
    return snapshot.records.some(
      (entry) =>
        entry.changeId === changeId || entry.branch === `change/${changeId}`,
    );
  } catch {
    return false;
  }
}

async function setMarker(
  record: ReconcilePlanRecord,
  ctx: ActionContext,
  expected: boolean,
  requireEvidence: boolean,
): Promise<ExtendedOutcome> {
  const source = await readProjection(record.source_path);
  if (source.kind === "failed") {
    return failed(source.error_class, source.residual);
  }
  // The worktree-marker rewrite is not scoped to the artifacts subtree, so this
  // path keeps the whole-document precondition it has always had.
  if (source.documentValidity.kind !== "valid") {
    return failed(
      "projection_validation_failed",
      `${record.record_id}: ${source.documentValidity.reason}`,
    );
  }
  const current = source.raw.worktree_auto_managed;
  if (current === true || current === false) return { status: "skipped" };

  const evidence = await registryHasEvidence(ctx, record.record_id);
  if (requireEvidence && !evidence) {
    return {
      status: "skipped",
      residual: `${record.record_id}: no worktree-registry evidence; legacy marker action remains eligible`,
    };
  }
  if (!requireEvidence && evidence) {
    return {
      status: "skipped",
      residual: `${record.record_id}: worktree-registry evidence selects auto marker`,
    };
  }

  await ctx.writeBeforeState(record.record_id, source.bytes);
  if (isActiveProjection(ctx, record.source_path)) {
    const mutation = await ctx.coordinateChangeMutation<Change>({
      changeId: record.record_id,
      mutationKind: "store-reconcile:normalize-worktree-marker",
      mutateLatestProjection: (latest: Change) => ({
        ...latest,
        worktree_auto_managed: expected,
      }),
      verifyProjection: (readback: Change) => ({
        ok: readback.worktree_auto_managed === expected,
        error: "durable readback has the wrong worktree_auto_managed marker",
      }),
    });
    if (mutation.kind !== "verified") return mutationFailure(mutation);
  } else {
    try {
      await atomicWriteFile(
        record.source_path,
        JSON.stringify(
          { ...source.raw, worktree_auto_managed: expected },
          null,
          2,
        ),
      );
    } catch (error) {
      return failed(
        "projection_write_failed",
        `${record.record_id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const after = await readAfter(record.source_path, record.record_id);
  if (typeof after !== "object" || !Buffer.isBuffer(after)) return after;
  return {
    status: "mutated",
    before_bytes: source.bytes,
    after_bytes: after,
  };
}

export const setMarkerAutoExecutor: ActionExecutor = async (
  record,
  action,
  ctx,
) => {
  const invalid = invalidContext(record, action, "set_marker_auto");
  if (invalid) return invalid;
  if (record.class !== "unmigrated_worktree_marker") {
    return failed(
      "invalid_executor_context",
      `${record.record_id}: wrong residue class`,
    );
  }
  return setMarker(record, ctx, true, true);
};

export const setMarkerLegacyExecutor: ActionExecutor = async (
  record,
  action,
  ctx,
) => {
  const invalid = invalidContext(record, action, "set_marker_legacy");
  if (invalid) return invalid;
  if (record.class !== "unmigrated_worktree_marker") {
    return failed(
      "invalid_executor_context",
      `${record.record_id}: wrong residue class`,
    );
  }
  return setMarker(record, ctx, false, false);
};
