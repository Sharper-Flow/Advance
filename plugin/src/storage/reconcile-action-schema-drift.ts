/** Executors for change projections carrying retired evidence enums. */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { ChangeSchema, type Change } from "../types";
import { getProjectId } from "../utils/project-id";
import { executeQuarantine } from "../tools/change-projection-quarantine";
import { RETIRED_EVIDENCE_VALUES } from "./retired-evidence";
import type { ActionExecutor, ActionOutcome } from "./reconcile-action-types";

type MutableRecord = Record<string, unknown>;

/** Additional residual proof retained by direct executor callers. */
export type SchemaDriftActionOutcome = ActionOutcome & {
  documented_residual?: true;
  residual_reason?: string;
  before_hash?: string;
  after_hash?: string;
};

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isRecord(value: unknown): value is MutableRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
  const mapped: MutableRecord = {};
  for (const [key, nested] of Object.entries(value)) {
    if (
      key === "evidence_kind" &&
      typeof nested === "string" &&
      RETIRED_EVIDENCE_VALUES.has(nested)
    ) {
      mapped[key] = "other";
      replacements += 1;
      continue;
    }
    const result = mapRetiredEvidence(nested);
    mapped[key] = result.value;
    replacements += result.replacements;
  }
  return { value: mapped, replacements };
}

function hasRetiredEvidence(value: unknown): boolean {
  return mapRetiredEvidence(value).replacements > 0;
}

function parseJson(bytes: Uint8Array | string): unknown | null {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function failure(errorClass: string, residual: string): ActionOutcome {
  return { status: "failed", error_class: errorClass, residual };
}

function mutationFailure(result: {
  kind: string;
  reason?: string;
}): ActionOutcome {
  return failure(
    `mutation_${result.kind}`,
    result.reason ?? `coordinateChangeMutation returned ${result.kind}`,
  );
}

async function readSource(
  recordId: string,
  sourcePath: string,
): Promise<{ bytes: Buffer; parsed: unknown } | ActionOutcome> {
  let bytes: Buffer;
  try {
    bytes = await readFile(sourcePath);
  } catch (error) {
    return failure(
      "source_read_failed",
      `${recordId}: could not read ${sourcePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = parseJson(bytes);
  if (parsed === null) {
    return {
      status: "skipped",
      residual: `${recordId}: source is not JSON; normalization has no valid mapping`,
    };
  }
  return { bytes, parsed };
}

function isActionOutcome(
  value: { bytes: Buffer; parsed: unknown } | ActionOutcome,
): value is ActionOutcome {
  return "status" in value;
}

export const normalizeEnumMappingExecutor: ActionExecutor = async (
  record,
  _action,
  ctx,
) => {
  const source = await readSource(record.record_id, record.source_path);
  if (isActionOutcome(source)) return source;

  const mapped = mapRetiredEvidence(source.parsed);
  if (mapped.replacements === 0) {
    return { status: "skipped" };
  }

  const candidate = ChangeSchema.safeParse(mapped.value);
  if (!candidate.success) {
    return failure(
      "schema_validation_failed",
      `${record.record_id}: retired enum mapping still fails ChangeSchema validation`,
    );
  }

  await ctx.writeBeforeState(record.record_id, source.bytes);

  const mutation = await ctx.coordinateChangeMutation<Change>({
    changeId: record.record_id,
    mutationKind: "store-reconcile:normalize-enum-mapping",
    normalizeLatestProjection: (latest) => {
      const mappedLatest = mapRetiredEvidence(latest).value;
      return ChangeSchema.parse(mappedLatest);
    },
    mutateLatestProjection: (latest) => {
      const latestMapped = mapRetiredEvidence(latest).value;
      const parsed = ChangeSchema.safeParse(latestMapped);
      if (!parsed.success) {
        throw new Error(
          "normalized latest projection failed ChangeSchema validation",
        );
      }
      return parsed.data;
    },
    verifyProjection: (readback) => {
      const parsed = ChangeSchema.safeParse(readback);
      return {
        ok: parsed.success && !hasRetiredEvidence(readback),
        ...(!parsed.success && {
          error: "durable readback failed ChangeSchema validation",
        }),
      };
    },
  });

  if (mutation.kind !== "verified") return mutationFailure(mutation);

  const readback = ChangeSchema.safeParse(mutation.value);
  if (!readback.success || hasRetiredEvidence(mutation.value)) {
    return failure(
      "schema_validation_failed",
      `${record.record_id}: post-write projection failed current ChangeSchema validation`,
    );
  }

  let afterBytes: Buffer;
  try {
    afterBytes = await readFile(record.source_path);
  } catch (error) {
    return failure(
      "post_write_read_failed",
      `${record.record_id}: could not verify durable post-write bytes: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const durable = parseJson(afterBytes);
  if (!ChangeSchema.safeParse(durable).success || hasRetiredEvidence(durable)) {
    return failure(
      "schema_validation_failed",
      `${record.record_id}: durable post-write bytes failed current ChangeSchema validation`,
    );
  }

  return {
    status: "mutated",
    before_bytes: source.bytes,
    after_bytes: afterBytes,
    before_hash: sha256(source.bytes),
    after_hash: sha256(afterBytes),
  };
};

function quarantineFailureOutcome(
  recordId: string,
  result: Exclude<
    Awaited<ReturnType<typeof executeQuarantine>>,
    { success: true }
  >,
): ActionOutcome {
  const reason =
    "error" in result ? result.error : (result.details ?? result.reason);
  return failure(
    `quarantine_${result.code.toLowerCase()}`,
    `${recordId}: quarantine failed: ${reason ?? result.code}`,
  );
}

export const quarantineRecordExecutor: ActionExecutor = async (
  record,
  _action,
  ctx,
) => {
  const source = await readSource(record.record_id, record.source_path);
  if (isActionOutcome(source)) return source;

  const mapped = mapRetiredEvidence(source.parsed);
  const current = ChangeSchema.safeParse(source.parsed);
  if (current.success) return { status: "skipped" };

  // A valid retired-enum mapping belongs to the normalization action. Do not
  // move it to quarantine merely because this second plan action is present.
  if (mapped.replacements > 0 && ChangeSchema.safeParse(mapped.value).success) {
    return { status: "skipped" };
  }

  await ctx.writeBeforeState(record.record_id, source.bytes);

  const projectId = await getProjectId(ctx.storePaths.root);
  if (!projectId) {
    return failure(
      "target_store_resolution",
      `${record.record_id}: quarantine requires a stable project identity`,
    );
  }

  const result = await executeQuarantine({
    changeId: record.record_id,
    approvedByUser: true,
    approvalEvidence: `store reconcile run ${ctx.runId}`,
    dryRun: false,
    projectId,
    projectDir: ctx.storePaths.external ?? ctx.storePaths.root,
    changesDir: ctx.storePaths.changes,
  });

  if (!result.success)
    return quarantineFailureOutcome(record.record_id, result);

  return {
    status: "mutated",
    before_bytes: source.bytes,
    documented_residual: true,
    residual_reason: result.reason,
    residual: `documented_residual: true; reason: ${result.reason}; quarantined at ${result.quarantine_path}`,
  };
};
