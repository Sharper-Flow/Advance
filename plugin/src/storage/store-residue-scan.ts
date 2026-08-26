/**
 * Read-only, bounded classification of disk-backed ADV store residue.
 *
 * This module deliberately does not repair, normalize, or create anything.
 * `reconcile-plan.ts` consumes its typed output and later execution tasks own
 * all mutations.
 */

import { access, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { z } from "zod";

import { ChangeSchema, type EpicEntry } from "../types";
import {
  normalizeProjectionDocument,
  readBoundedProjectionDocument,
} from "./change-projection-reader";
import {
  readCurrentSummaryShard,
  type SummaryIndexPaths,
} from "./change-summary-shard";
import {
  listActiveEpicProjections,
  listRetiredEpicProjections,
} from "./epic-projection-reader";
import { getProjectPaths, type ProjectPaths } from "./json";
import {
  compareProjectionCounters,
  extractProjectionCounters,
  readLegacyCounters,
} from "./projection-counters";
import { RETIRED_EVIDENCE_VALUES } from "./retired-evidence";
import { findChangeEntry } from "../tools/epic-convergence";

export const ResidueClassSchema = z.enum([
  "schema_drift_retired_enum",
  "summary_pointer_missing",
  "summary_pointer_stale",
  "legacy_divergent_behind",
  "legacy_newer_than_canonical",
  "unmigrated_artifact_metadata",
  "unmigrated_worktree_marker",
  "epic_owner_missing",
  "epic_owner_foreign",
  "epic_entry_missing",
  "quarantined_record",
  "unknown_store_noise",
  "store_artifact_missing",
  "healthy",
]);

export type ResidueClass = z.infer<typeof ResidueClassSchema>;

export const StoreResidueRecordSchema = z.object({
  record_id: z.string(),
  source_path: z.string(),
  class: ResidueClassSchema,
  also_matches: z.array(ResidueClassSchema),
  evidence: z.array(z.string()),
});

export type StoreResidueRecord = z.infer<typeof StoreResidueRecordSchema>;

const counterShape = Object.fromEntries(
  ResidueClassSchema.options.map((className) => [
    className,
    z.number().int().nonnegative(),
  ]),
) as Record<ResidueClass, z.ZodNumber>;

export const StoreResidueCountersSchema = z.object(counterShape);
export type StoreResidueCounters = z.infer<typeof StoreResidueCountersSchema>;

export const StoreResidueScanSchema = z.object({
  schema_version: z.literal(1),
  records: z.array(StoreResidueRecordSchema),
  counters: StoreResidueCountersSchema,
  scanned: z.number().int().nonnegative(),
  omitted: z.number().int().nonnegative(),
  truncated: z.boolean(),
  budget_exceeded: z.boolean(),
  continuation_cursor: z.string().min(1).optional(),
  resume_cursor_found: z.boolean().optional(),
});

export type StoreResidueScan = z.infer<typeof StoreResidueScanSchema>;

export interface StoreResidueScanOptions {
  /** Repository root used by the canonical path resolver. */
  directory?: string;
  /** Optional externally resolved mutable state root. */
  externalRoot?: string;
  /** Already-resolved paths, useful to callers that own store construction. */
  paths?: ProjectPaths;
  maxRecords?: number;
  budgetMs?: number;
  /** Resume after the record id persisted by an interrupted bounded scan. */
  resumeAfter?: string;
  /** Project identity used to distinguish local Epic owners from remote ones. */
  localProjectId?: string | null;
}

export const RECONCILE_START_CURSOR = "__reconcile_start__";

type Signal = { class: ResidueClass; evidence: string };

const PRIMARY_PRECEDENCE: readonly ResidueClass[] = [
  "schema_drift_retired_enum",
  "summary_pointer_missing",
  "summary_pointer_stale",
  "legacy_divergent_behind",
  "legacy_newer_than_canonical",
  "unmigrated_artifact_metadata",
  "unmigrated_worktree_marker",
  "epic_owner_missing",
  "epic_owner_foreign",
  "epic_entry_missing",
  "quarantined_record",
  "unknown_store_noise",
  "store_artifact_missing",
  "healthy",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function collectRetiredEvidence(value: unknown, path = ""): string[] {
  const found: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      found.push(...collectRetiredEvidence(item, `${path}[${index}]`)),
    );
  } else if (asRecord(value)) {
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const nestedPath = path ? `${path}.${key}` : key;
      if (
        key === "evidence_kind" &&
        typeof nested === "string" &&
        RETIRED_EVIDENCE_VALUES.has(nested)
      ) {
        found.push(`evidence_kind=${nested} not in current enum`);
      }
      found.push(...collectRetiredEvidence(nested, nestedPath));
    }
  }
  return found;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(
  path: string,
): Promise<
  | { kind: "ok"; value: unknown }
  | { kind: "missing" | "corrupt"; reason: string }
> {
  const result = await readBoundedProjectionDocument(path);
  if (result.kind === "not_found")
    return { kind: "missing", reason: "projection not found" };
  if (result.kind !== "ok") {
    return {
      kind: "corrupt",
      reason:
        result.kind === "oversized"
          ? `projection exceeds ${result.limit} bytes`
          : `${result.kind}: ${result.error}`,
    };
  }
  try {
    return { kind: "ok", value: JSON.parse(result.content) };
  } catch (error) {
    return {
      kind: "corrupt",
      reason: `JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function listEntries(
  path: string,
): Promise<Array<{ name: string; isDirectory: boolean }>> {
  try {
    return (await readdir(path, { withFileTypes: true }))
      .map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return [];
  }
}

function isUnder(path: string, parent: string): boolean {
  const rel = relative(parent, path);
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\"))
  );
}

function signalsToRecord(
  record_id: string,
  source_path: string,
  signals: Signal[],
): StoreResidueRecord {
  const unique = new Map<ResidueClass, string>();
  for (const signal of signals) {
    if (!unique.has(signal.class)) unique.set(signal.class, signal.evidence);
  }
  if (unique.size === 0)
    unique.set(
      "healthy",
      "canonical projection is readable and all residue checks passed",
    );
  const className =
    PRIMARY_PRECEDENCE.find((candidate) => unique.has(candidate)) ?? "healthy";
  const evidence = [...unique.values()];
  return {
    record_id,
    source_path,
    class: className,
    also_matches: PRIMARY_PRECEDENCE.filter(
      (candidate) => candidate !== className && unique.has(candidate),
    ),
    evidence,
  };
}

async function classifyCanonical(
  paths: ProjectPaths,
  id: string,
  sourcePath: string,
  epicIndex: ReadonlyMap<string, { entries: EpicEntry[]; retired: boolean }>,
  localProjectId?: string | null,
): Promise<StoreResidueRecord> {
  const loaded = await readJson(sourcePath);
  if (loaded.kind !== "ok") {
    return signalsToRecord(id, sourcePath, [
      {
        class: "quarantined_record",
        evidence: `bounded read failed: ${loaded.reason}`,
      },
    ]);
  }
  const raw = asRecord(loaded.value);
  if (!raw) {
    return signalsToRecord(id, sourcePath, [
      {
        class: "quarantined_record",
        evidence: "projection root is not an object",
      },
    ]);
  }
  const [normalized] = normalizeProjectionDocument(raw);
  const validation = ChangeSchema.safeParse(normalized);

  const signals: Signal[] = [];
  for (const evidence of collectRetiredEvidence(raw)) {
    signals.push({ class: "schema_drift_retired_enum", evidence });
  }
  if (!validation.success) {
    signals.push({
      class: "quarantined_record",
      evidence: "projection failed current ChangeSchema validation",
    });
  }

  const summaryPaths: SummaryIndexPaths = {
    changesDir: paths.changes,
    summariesDir: paths.summariesDir,
  };
  try {
    const summary = await readCurrentSummaryShard(summaryPaths, id);
    if (summary.kind === "degraded") {
      signals.push({
        class: summary.reason.includes("missing current summary pointer")
          ? "summary_pointer_missing"
          : "summary_pointer_stale",
        evidence: summary.reason,
      });
    } else if (summary.kind === "not_found") {
      signals.push({
        class: "summary_pointer_missing",
        evidence: "no current summary pointer",
      });
    }
  } catch (error) {
    signals.push({
      class: "summary_pointer_stale",
      evidence: `summary pointer read failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  const canonical = extractProjectionCounters(
    validation.success ? validation.data : normalized,
  );
  const legacy = await readLegacyCounters(paths.changes, id);
  if (canonical && legacy.kind === "ok") {
    const direction = compareProjectionCounters(legacy.counters, canonical);
    if (direction < 0) {
      signals.push({
        class: "legacy_divergent_behind",
        evidence: `envelope counters < canonical revision ${canonical.projection_revision}`,
      });
    } else if (direction > 0) {
      signals.push({
        class: "legacy_newer_than_canonical",
        evidence: `envelope counters > canonical revision ${canonical.projection_revision}`,
      });
    }
  } else if (legacy.kind === "degraded") {
    signals.push({
      class: "quarantined_record",
      evidence: `legacy envelope unreadable: ${legacy.reason}`,
    });
  }

  const artifacts = asRecord(raw.artifacts);
  if (artifacts) {
    for (const [kind, metadataValue] of Object.entries(artifacts)) {
      const metadata = asRecord(metadataValue);
      if (!metadata) continue;
      if (metadata.source === "temporal") {
        signals.push({
          class: "unmigrated_artifact_metadata",
          evidence: `artifacts.${kind}.source=temporal requires migration`,
        });
      }
      if (typeof metadata.path === "string") {
        const artifactPath = isAbsolute(metadata.path)
          ? metadata.path
          : join(dirname(sourcePath), metadata.path);
        if (!(await exists(artifactPath))) {
          signals.push({
            class: "store_artifact_missing",
            evidence: `artifact ${kind} missing at ${artifactPath}`,
          });
        }
      }
    }
  }

  // Loaded lazily to keep schema-registry imports acyclic: status-hygiene's
  // Store type imports eventually reach the registry through store-disk.
  const { computeAutoManagedCensus } = await import("../tools/status-hygiene");
  const census = computeAutoManagedCensus([
    {
      worktree_auto_managed:
        raw.worktree_auto_managed === true
          ? true
          : raw.worktree_auto_managed === false
            ? false
            : undefined,
    },
  ]);
  if (census.unmigrated > 0) {
    signals.push({
      class: "unmigrated_worktree_marker",
      evidence: "worktree_auto_managed marker absent",
    });
  }

  const membership = asRecord(raw.epic_membership);
  if (typeof membership?.epic_id === "string") {
    const epic = epicIndex.get(membership.epic_id);
    const epicProjectId = membership.epic_project_id;
    if (
      typeof epicProjectId === "string" &&
      epicProjectId.length > 0 &&
      typeof localProjectId === "string" &&
      epicProjectId !== localProjectId
    ) {
      signals.push({
        class: "epic_owner_foreign",
        evidence: `epic_membership references foreign epic project ${epicProjectId}`,
      });
    } else if (!epic) {
      signals.push({
        class: "epic_owner_missing",
        evidence: `epic_membership references missing epic ${membership.epic_id}`,
      });
    } else if (
      !epic.retired &&
      !findChangeEntry(epic, {
        mode: "entry_id_or_change_id",
        entryId:
          typeof membership.entry_id === "string"
            ? membership.entry_id
            : undefined,
        changeId: id,
      })
    ) {
      signals.push({
        class: "epic_entry_missing",
        evidence: `epic_membership has no matching entry in active epic ${membership.epic_id}`,
      });
    }
  }
  return signalsToRecord(id, sourcePath, signals);
}

async function enumerateCanonicalRecords(
  paths: ProjectPaths,
  epicIndex: ReadonlyMap<string, { entries: EpicEntry[]; retired: boolean }>,
  localProjectId: string | null | undefined,
  add: (record: StoreResidueRecord) => void,
  shouldStop: () => boolean,
): Promise<void> {
  for (const parent of [paths.changes, paths.archive]) {
    for (const entry of await listEntries(parent)) {
      if (shouldStop()) return;
      const sourcePath = join(parent, entry.name, "change.json");
      if (entry.isDirectory) {
        add(
          await classifyCanonical(
            paths,
            entry.name,
            sourcePath,
            epicIndex,
            localProjectId,
          ),
        );
      } else if (entry.name.endsWith(".json")) {
        const canonicalDir = join(parent, entry.name.slice(0, -5));
        if (!(await exists(canonicalDir))) {
          add(
            signalsToRecord(`legacy:${entry.name}`, join(parent, entry.name), [
              {
                class: "quarantined_record",
                evidence: "legacy envelope has no canonical record",
              },
            ]),
          );
        }
      } else {
        add(
          signalsToRecord(
            relative(dirname(parent), join(parent, entry.name)),
            join(parent, entry.name),
            [
              {
                class: "unknown_store_noise",
                evidence: "non-record entry in store path",
              },
            ],
          ),
        );
      }
    }
  }
}

async function enumerateQuarantine(
  paths: ProjectPaths,
  add: (record: StoreResidueRecord) => void,
  shouldStop: () => boolean,
): Promise<void> {
  for (const entry of await listEntries(paths.quarantineChanges)) {
    if (shouldStop()) return;
    add(
      signalsToRecord(
        `quarantine:${entry.name}`,
        join(paths.quarantineChanges, entry.name),
        [
          {
            class: "quarantined_record",
            evidence: "record is present under the quarantine store",
          },
        ],
      ),
    );
  }
}

async function enumerateUnknownStoreNoise(
  paths: ProjectPaths,
  add: (record: StoreResidueRecord) => void,
  shouldStop: () => boolean,
): Promise<void> {
  const storeRoot = dirname(paths.changes);
  const configured = [
    paths.changes,
    paths.summariesDir,
    paths.archive,
    paths.closed,
    paths.activeEpics,
    paths.retiredEpics,
    paths.wisdom,
    paths.reflections,
    paths.projectMetadata,
    paths.artifactMetadataMigrationMarker,
    paths.snapshotRepairAudit,
    paths.quarantineChanges,
    paths.reconcileDir,
    // Launcher aggregate projection (ADR 0009) — a known top-level store
    // file, not noise. Written by the mutation coordinator piggyback and
    // the adv_launcher_projection_rebuild tool.
    join(storeRoot, "active-launcher-state.json"),
  ];
  for (const entry of await listEntries(storeRoot)) {
    if (shouldStop()) return;
    const candidate = join(storeRoot, entry.name);
    if (
      configured.some((path) => path === candidate || isUnder(path, candidate))
    )
      continue;
    add(
      signalsToRecord(`noise:${entry.name}`, candidate, [
        {
          class: "unknown_store_noise",
          evidence: "unknown non-record store entry",
        },
      ]),
    );
  }
}

export async function runStoreResidueScan(
  options: StoreResidueScanOptions,
): Promise<StoreResidueScan> {
  const paths =
    options.paths ??
    (options.directory
      ? getProjectPaths(options.directory, undefined, {
          externalRoot: options.externalRoot,
        })
      : undefined);
  if (!paths)
    throw new Error("runStoreResidueScan requires directory or paths");
  const maxRecords = Math.max(
    1,
    Math.floor(options.maxRecords ?? Number.MAX_SAFE_INTEGER),
  );
  const deadline =
    options.budgetMs === undefined
      ? Number.POSITIVE_INFINITY
      : Date.now() + Math.max(1, options.budgetMs);
  const records: StoreResidueRecord[] = [];
  let resumeCursorFound =
    options.resumeAfter === undefined ||
    options.resumeAfter === RECONCILE_START_CURSOR;
  let pastResumeCursor = resumeCursorFound;
  const countersByClass = Object.fromEntries(
    ResidueClassSchema.options.map((className) => [className, 0]),
  ) as StoreResidueCounters;
  const shouldStop = () =>
    records.length >= maxRecords || Date.now() >= deadline;
  const add = (record: StoreResidueRecord) => {
    if (!pastResumeCursor) {
      if (record.record_id === options.resumeAfter) {
        pastResumeCursor = true;
        resumeCursorFound = true;
      }
      return;
    }
    if (records.length >= maxRecords) return;
    records.push(record);
    countersByClass[record.class] += 1;
  };

  const [activeEpics, retiredEpics] = await Promise.all([
    listActiveEpicProjections(paths.activeEpics),
    listRetiredEpicProjections(paths.retiredEpics),
  ]);
  const epicIndex = new Map<
    string,
    { entries: EpicEntry[]; retired: boolean }
  >();
  if (activeEpics.success) {
    for (const epic of activeEpics.data) {
      epicIndex.set(epic.id, { entries: epic.entries, retired: false });
    }
  }
  if (retiredEpics.success) {
    for (const epic of retiredEpics.data) {
      epicIndex.set(epic.id, { entries: epic.entries, retired: true });
    }
  }

  await enumerateCanonicalRecords(
    paths,
    epicIndex,
    options.localProjectId,
    add,
    shouldStop,
  );
  await enumerateQuarantine(paths, add, shouldStop);
  await enumerateUnknownStoreNoise(paths, add, shouldStop);
  const budgetExceeded = Date.now() >= deadline;
  const missingResumeCursor =
    options.resumeAfter !== undefined && !resumeCursorFound;
  const totalKnown = records.length;
  return {
    schema_version: 1,
    records,
    counters: countersByClass,
    scanned: totalKnown,
    omitted:
      missingResumeCursor || budgetExceeded || records.length >= maxRecords
        ? 1
        : 0,
    truncated:
      missingResumeCursor || budgetExceeded || records.length >= maxRecords,
    budget_exceeded: budgetExceeded,
    ...(records.length >= maxRecords || budgetExceeded
      ? {
          continuation_cursor:
            records.at(-1)?.record_id ?? RECONCILE_START_CURSOR,
        }
      : {}),
    resume_cursor_found: resumeCursorFound,
  };
}
