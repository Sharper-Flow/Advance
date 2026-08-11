/**
 * Quarantine and noise actions for the store reconcile dispatcher.
 *
 * A quarantined projection is only restored when a known, schema-valid
 * normalization exists. Unknown bytes remain outside the readable set and are
 * reported as a residual; this module never invents a projection.
 */

import { access, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

import { ChangeSchema } from "../types";
import { atomicWriteFile, acquireFileLock } from "../utils/fs";
import { publishSummaryForChange } from "./change-summary-shard";
import { isRetiredEvidenceValue } from "./retired-evidence";
import type {
  ActionContext,
  ActionExecutor,
  ActionOutcome,
} from "./reconcile-action-types";
import type { ReconcileAction, ReconcilePlanRecord } from "./reconcile-plan";

/** Runtime store entries that are operational state, not removable noise. */
export const RECONCILE_NOISE_ALLOWLIST = ["worker.lock"] as const;

type JsonRecord = Record<string, unknown>;

type ExtendedOutcome = ActionOutcome & {
  documented_residual?: true;
  allowlisted?: true;
};

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isWithin(path: string, parent: string): boolean {
  const child = relative(resolve(parent), resolve(path));
  return child === "" || (child !== ".." && !child.startsWith(`..${"/"}`));
}

function failed(errorClass: string, residual: string): ActionOutcome {
  return { status: "failed", error_class: errorClass, residual };
}

function checkContext(
  record: ReconcilePlanRecord,
  action: ReconcileAction,
  expectedClass: ReconcileAction["class"],
  expectedAction: ReconcileAction["action"],
): ActionOutcome | null {
  if (
    record.class !== expectedClass ||
    action.class !== expectedClass ||
    action.action !== expectedAction ||
    record.record_id.length === 0
  ) {
    return failed(
      "invalid_executor_context",
      `${record.record_id}: expected ${expectedClass}/${expectedAction} action context`,
    );
  }
  return null;
}

function changeIdFor(
  record: ReconcilePlanRecord,
  quarantineRoot: string,
): string | null {
  if (record.record_id.startsWith("quarantine:")) {
    const id = record.record_id.slice("quarantine:".length);
    return id && !id.includes("/") && id !== "." && id !== ".." ? id : null;
  }
  const first = relative(quarantineRoot, record.source_path).split("/")[0];
  return first && first !== "." && first !== ".." ? first : null;
}

async function sourceFileFor(
  record: ReconcilePlanRecord,
  ctx: ActionContext,
): Promise<
  | { sourceFile: string; quarantineDir: string; changeId: string }
  | ActionOutcome
> {
  const quarantineRoot = resolve(ctx.storePaths.quarantineChanges);
  const source = resolve(record.source_path);
  if (!isWithin(source, quarantineRoot)) {
    return failed(
      "invalid_quarantine_path",
      `${record.record_id}: source path is outside the quarantine store`,
    );
  }

  const changeId = changeIdFor(record, quarantineRoot);
  if (!changeId) {
    return failed(
      "invalid_quarantine_record",
      `${record.record_id}: could not derive a canonical change id`,
    );
  }

  const sourceFiles = await findQuarantinedChangeFiles(source, quarantineRoot);
  if (sourceFiles.length === 0) {
    return failed(
      "quarantine_source_missing",
      `${record.record_id}: quarantined projection is unavailable under ${source}`,
    );
  }
  if (sourceFiles.length > 1) {
    return failed(
      "quarantine_source_ambiguous",
      `${record.record_id}: multiple quarantined projections found under ${source}`,
    );
  }
  const sourceFile = sourceFiles[0];
  const quarantineDir = dirname(sourceFile);
  return { sourceFile, quarantineDir, changeId };
}

async function findQuarantinedChangeFiles(
  source: string,
  quarantineRoot: string,
): Promise<string[]> {
  if (!isWithin(source, quarantineRoot)) return [];
  if (basename(source) === "change.json") {
    try {
      await access(source);
      return [source];
    } catch {
      return [];
    }
  }

  let entries;
  try {
    entries = await readdir(source, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const candidate = resolve(source, entry.name);
    if (!isWithin(candidate, quarantineRoot)) continue;
    if (entry.isFile() && entry.name === "change.json") {
      files.push(candidate);
    } else if (entry.isDirectory()) {
      files.push(
        ...(await findQuarantinedChangeFiles(candidate, quarantineRoot)),
      );
    }
  }
  return files;
}

function mapRetiredEvidence(value: unknown): {
  value: unknown;
  replacements: number;
} {
  if (Array.isArray(value)) {
    let replacements = 0;
    const mapped = value.map((item) => {
      const result = mapRetiredEvidence(item);
      replacements += result.replacements;
      return result.value;
    });
    return { value: mapped, replacements };
  }
  if (!isRecord(value)) return { value, replacements: 0 };

  let replacements = 0;
  const mapped: JsonRecord = {};
  for (const [key, nested] of Object.entries(value)) {
    if (
      key === "evidence_kind" &&
      typeof nested === "string" &&
      isRetiredEvidenceValue(nested)
    ) {
      mapped[key] = "other";
      replacements += 1;
    } else {
      const result = mapRetiredEvidence(nested);
      mapped[key] = result.value;
      replacements += result.replacements;
    }
  }
  return { value: mapped, replacements };
}

async function readJsonSource(
  sourceFile: string,
): Promise<{ bytes: Buffer; value: unknown } | ActionOutcome> {
  let bytes: Buffer;
  try {
    bytes = await readFile(sourceFile);
  } catch (error) {
    return failed(
      "quarantine_read_failed",
      `${sourceFile}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    return { bytes, value: JSON.parse(bytes.toString("utf8")) as unknown };
  } catch (error) {
    return {
      status: "skipped",
      documented_residual: true,
      residual: `documented_residual: true; no valid normalization mapping for ${sourceFile}: JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
    } as ExtendedOutcome;
  }
}

function isOutcome(
  value: { bytes: Buffer; value: unknown } | ActionOutcome,
): value is ActionOutcome {
  return "status" in value;
}

/** Normalize a quarantined projection and atomically return it to active storage. */
export const normalizeAndRestoreExecutor: ActionExecutor = async (
  record,
  action,
  ctx,
) => {
  const invalid = checkContext(
    record,
    action,
    "quarantined_record",
    "normalize_and_restore",
  );
  if (invalid) return invalid;

  const source = await sourceFileFor(record, ctx);
  if ("status" in source) return source;
  const parsed = await readJsonSource(source.sourceFile);
  if (isOutcome(parsed)) return parsed;

  const mapped = mapRetiredEvidence(parsed.value);
  const candidate = ChangeSchema.safeParse(mapped.value);
  if (mapped.replacements === 0 || !candidate.success) {
    return {
      status: "skipped",
      documented_residual: true,
      residual: `documented_residual: true; no valid normalization mapping; remains quarantined at ${source.sourceFile}`,
    } as ExtendedOutcome;
  }

  const activePath = join(
    ctx.storePaths.changes,
    source.changeId,
    "change.json",
  );
  let release: (() => Promise<void>) | undefined;
  try {
    await mkdir(dirname(activePath), { recursive: true });
    release = await acquireFileLock(activePath, 1_000);
    try {
      await access(activePath);
      return failed(
        "active_projection_exists",
        `${source.changeId}: refusing to overwrite an existing active projection while restoring quarantine`,
      );
    } catch {
      // The restore target is absent, as required for a safe quarantine restore.
    }

    await ctx.writeBeforeState(record.record_id, parsed.bytes);
    const normalized =
      candidate.data.worktree_auto_managed === undefined
        ? { ...candidate.data, worktree_auto_managed: false }
        : candidate.data;
    const normalizedBytes = Buffer.from(
      JSON.stringify(normalized, null, 2),
      "utf8",
    );
    await atomicWriteFile(activePath, normalizedBytes.toString("utf8"));

    let readback: Buffer;
    try {
      readback = await readFile(activePath);
    } catch (error) {
      return failed(
        "restore_readback_failed",
        `${source.changeId}: restored projection could not be read back: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const verified = ChangeSchema.safeParse(
      JSON.parse(readback.toString("utf8")),
    );
    if (
      !verified.success ||
      mapRetiredEvidence(verified.data).replacements > 0
    ) {
      return failed(
        "restore_validation_failed",
        `${source.changeId}: restored projection failed current ChangeSchema validation`,
      );
    }

    try {
      await publishSummaryForChange(
        {
          changesDir: ctx.storePaths.changes,
          summariesDir: ctx.storePaths.summariesDir,
        },
        verified.data,
      );
    } catch (error) {
      return failed(
        "summary_rebuild_failed",
        `${source.changeId}: restored projection is readable but its summary could not be rebuilt: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      await rm(source.quarantineDir, { recursive: true, force: false });
    } catch (error) {
      return failed(
        "quarantine_cleanup_failed",
        `${source.changeId}: restored projection is readable but quarantine cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      status: "mutated",
      before_bytes: parsed.bytes,
      after_bytes: readback,
    };
  } catch (error) {
    return failed(
      "restore_write_failed",
      `${source.changeId}: could not restore normalized projection: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    if (release) await release();
  }
};

/** Report-only fallback for a quarantined projection with no safe mapping. */
export const remainQuarantinedReportedExecutor: ActionExecutor = async (
  record,
  action,
  ctx,
) => {
  const invalid = checkContext(
    record,
    action,
    "quarantined_record",
    "remain_quarantined_reported",
  );
  if (invalid) return invalid;
  const source = await sourceFileFor(record, ctx);
  if ("status" in source) return source;
  return {
    status: "skipped",
    documented_residual: true,
    residual: `documented_residual: true; no valid normalization mapping; remains quarantined at ${source.sourceFile}`,
  } as ExtendedOutcome;
};

function allowlistedNoise(sourcePath: string, ctx: ActionContext): boolean {
  const storeRoot = dirname(ctx.storePaths.changes);
  const relativePath = relative(resolve(storeRoot), resolve(sourcePath));
  return RECONCILE_NOISE_ALLOWLIST.includes(
    relativePath as (typeof RECONCILE_NOISE_ALLOWLIST)[number],
  );
}

/** Move unknown store entries to quarantine, except operational allowlisted noise. */
export const quarantineToTrashExecutor: ActionExecutor = async (
  record,
  action,
  ctx,
) => {
  const invalid = checkContext(
    record,
    action,
    "unknown_store_noise",
    "quarantine_to_trash",
  );
  if (invalid) return invalid;

  if (allowlistedNoise(record.source_path, ctx)) {
    return {
      status: "skipped",
      allowlisted: true,
      residual: `allowlisted noise: ${relative(dirname(ctx.storePaths.changes), record.source_path)}`,
    } as ExtendedOutcome;
  }

  const storeRoot = dirname(ctx.storePaths.changes);
  if (!isWithin(record.source_path, storeRoot)) {
    return failed(
      "invalid_noise_path",
      `${record.record_id}: noise source is outside the target store`,
    );
  }
  const target = join(
    ctx.storePaths.quarantineChanges,
    "noise",
    basename(record.source_path),
  );
  try {
    await mkdir(dirname(target), { recursive: true });
    try {
      await access(target);
      return failed(
        "noise_quarantine_target_exists",
        `${record.record_id}: refusing to overwrite existing quarantine entry ${target}`,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        return failed(
          "noise_quarantine_target_check_failed",
          `${record.record_id}: could not verify quarantine target ${target}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    await rename(record.source_path, target);
    return { status: "mutated" };
  } catch (error) {
    return failed(
      "noise_quarantine_failed",
      `${record.record_id}: could not move noise to quarantine: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
