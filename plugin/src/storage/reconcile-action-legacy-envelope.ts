import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { atomicWriteFile } from "../utils/fs";
import {
  compareProjectionCounters,
  extractProjectionCounters,
} from "./projection-counters";
import type {
  ActionContext,
  ActionExecutor,
  ActionOutcome,
} from "./reconcile-action-types";
import type { ReconcileAction, ReconcilePlanRecord } from "./reconcile-plan";

type JsonRecord = Record<string, unknown>;
type HashedOutcome = ActionOutcome & {
  before_hash?: string;
  after_hash?: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalPath(ctx: ActionContext, changeId: string): string {
  return join(ctx.storePaths.changes, changeId, "change.json");
}

function legacyPath(ctx: ActionContext, changeId: string): string {
  return join(ctx.storePaths.changes, `${changeId}.json`);
}

function failed(errorClass: string, residual: string): ActionOutcome {
  return { status: "failed", error_class: errorClass, residual };
}

async function readJson(
  path: string,
): Promise<{ bytes: Buffer; value: unknown } | { error: string }> {
  try {
    const bytes = await readFile(path);
    try {
      return { bytes, value: JSON.parse(bytes.toString("utf8")) };
    } catch (error) {
      return {
        error: `${path}: JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  } catch (error) {
    return {
      error: `${path}: read failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function wrappedLike(value: JsonRecord): boolean {
  return Object.prototype.hasOwnProperty.call(value, "state");
}

function mapCanonicalToLegacyShape(
  legacy: JsonRecord,
  canonical: JsonRecord,
): JsonRecord {
  return wrappedLike(legacy) ? { state: canonical } : canonical;
}

function checkAction(
  record: ReconcilePlanRecord,
  action: ReconcileAction,
  expectedClass: ReconcileAction["class"],
  expectedAction: ReconcileAction["action"],
): ActionOutcome | null {
  if (
    record.record_id.length === 0 ||
    record.class !== expectedClass ||
    action.class !== expectedClass ||
    action.action !== expectedAction
  ) {
    return failed(
      "invalid_executor_context",
      `${record.record_id}: expected ${expectedClass}/${expectedAction} action context`,
    );
  }
  return null;
}

export const advanceLegacyToCanonicalExecutor: ActionExecutor = async (
  record,
  action,
  ctx,
) => {
  const invalid = checkAction(
    record,
    action,
    "legacy_divergent_behind",
    "advance_legacy_to_canonical",
  );
  if (invalid) return invalid;

  const canonical = await readJson(canonicalPath(ctx, record.record_id));
  if ("error" in canonical)
    return failed("canonical_read_failed", canonical.error);
  if (!isRecord(canonical.value))
    return failed(
      "canonical_invalid",
      `${record.record_id}: canonical projection root is not an object`,
    );
  const canonicalCounters = extractProjectionCounters(canonical.value);
  if (!canonicalCounters)
    return failed(
      "canonical_counters_unavailable",
      `${record.record_id}: canonical projection counters are unavailable`,
    );

  const legacy = await readJson(legacyPath(ctx, record.record_id));
  if ("error" in legacy) return failed("legacy_read_failed", legacy.error);
  if (!isRecord(legacy.value))
    return failed(
      "legacy_invalid",
      `${record.record_id}: legacy envelope root is not an object`,
    );
  const legacyState = wrappedLike(legacy.value)
    ? legacy.value.state
    : legacy.value;
  if (!isRecord(legacyState))
    return failed(
      "legacy_invalid",
      `${record.record_id}: legacy envelope state is not an object`,
    );
  const legacyCounters = extractProjectionCounters(legacyState);
  if (!legacyCounters)
    return failed(
      "legacy_counters_unavailable",
      `${record.record_id}: legacy envelope counters are unavailable`,
    );

  if (compareProjectionCounters(legacyCounters, canonicalCounters) >= 0) {
    return {
      status: "skipped",
      residual: `${record.record_id}: legacy envelope is not behind canonical projection`,
      before_bytes: legacy.bytes,
    };
  }

  // Capture the complete legacy file before mutation. The caller owns the
  // durable location and hashes this same byte copy in its receipt.
  await ctx.writeBeforeState(`${record.record_id}.legacy.json`, legacy.bytes);

  // Re-check the canonical bytes immediately before publishing the legacy
  // replacement. This is the C1 direction guard: canonical is never written.
  const canonicalBeforeWrite = await readFile(
    canonicalPath(ctx, record.record_id),
  );
  if (!canonicalBeforeWrite.equals(canonical.bytes)) {
    return failed(
      "canonical_changed",
      `${record.record_id}: canonical projection changed during reconcile`,
    );
  }

  const nextLegacyBytes = Buffer.from(
    JSON.stringify(mapCanonicalToLegacyShape(legacy.value, canonical.value)),
    "utf8",
  );
  try {
    await atomicWriteFile(
      legacyPath(ctx, record.record_id),
      nextLegacyBytes.toString("utf8"),
    );
  } catch (error) {
    return failed(
      "legacy_write_failed",
      `${record.record_id}: legacy envelope write failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Assert canonical byte identity after the only write. A mismatch is a
  // failed guard-rail result, never a success or a canonical repair.
  const canonicalAfterWrite = await readFile(
    canonicalPath(ctx, record.record_id),
  );
  if (!canonicalAfterWrite.equals(canonical.bytes)) {
    return {
      ...failed(
        "canonical_changed",
        `${record.record_id}: canonical projection changed during reconcile`,
      ),
      before_bytes: legacy.bytes,
      after_bytes: nextLegacyBytes,
    };
  }

  return {
    status: "mutated",
    before_bytes: legacy.bytes,
    after_bytes: nextLegacyBytes,
    before_hash: sha256(legacy.bytes),
    after_hash: sha256(nextLegacyBytes),
  } as HashedOutcome;
};

export const reportOnlyExecutor: ActionExecutor = async (
  record,
  action,
  ctx,
) => {
  if (
    record.class === "epic_owner_foreign" &&
    action.class === "epic_owner_foreign" &&
    action.action === "report_only"
  ) {
    return {
      status: "skipped",
      report_only: true,
      residual: `${record.record_id}: foreign Epic owner reported without local mutation`,
    } as ActionOutcome & { report_only: true };
  }
  const invalid = checkAction(
    record,
    action,
    "legacy_newer_than_canonical",
    "report_only",
  );
  if (invalid) return invalid;

  const canonical = await readJson(canonicalPath(ctx, record.record_id));
  if ("error" in canonical)
    return failed("canonical_read_failed", canonical.error);
  const legacy = await readJson(legacyPath(ctx, record.record_id));
  if ("error" in legacy) return failed("legacy_read_failed", legacy.error);
  if (!isRecord(canonical.value) || !isRecord(legacy.value))
    return failed(
      "legacy_invalid",
      `${record.record_id}: report-only projections must have object roots`,
    );

  const canonicalCounters = extractProjectionCounters(canonical.value);
  const legacyState = wrappedLike(legacy.value)
    ? legacy.value.state
    : legacy.value;
  const legacyCounters = extractProjectionCounters(legacyState);
  if (!canonicalCounters || !legacyCounters)
    return failed(
      "counter_extraction_failed",
      `${record.record_id}: report-only counters are unavailable`,
    );
  if (compareProjectionCounters(legacyCounters, canonicalCounters) <= 0)
    return failed(
      "report_only_direction_invalid",
      `${record.record_id}: report-only envelope is not newer than canonical projection`,
    );

  // ActionOutcome's shared seam uses "skipped" for non-mutating success.
  return {
    status: "skipped",
    report_only: true,
    before_hash: sha256(legacy.bytes),
    after_hash: sha256(canonical.bytes),
  } as ActionOutcome & {
    report_only: true;
    before_hash: string;
    after_hash: string;
  };
};
