import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { readBoundedProjectionDocument } from "../storage/change-projection-reader";
import {
  DeltaSchema,
  SHA256DigestSchema,
  SpecSchema,
  type Delta,
  type Spec,
} from "../types";
import { loadAllSpecs, saveSpec } from "../storage/json";
import { spawnSyncGit } from "../utils/git-binary";
import { generateSpecDocFile } from "./docs";
import {
  canonicalSha256,
  planSpecProjection,
  requirementSha256,
  specSha256,
} from "./projection";
import { withArchiveProjectionLock } from "./projection-lock";

export type HistoricalArchiveDisposition =
  | "complete"
  | "repaired"
  | "conflict"
  | "unreadable";

export interface HistoricalArchiveRepairRow {
  changeId: string;
  archivePath: string;
  disposition: HistoricalArchiveDisposition;
  details: string[];
  conflictBindings?: HistoricalConflictBinding[];
  appliedConflictDispositions?: HistoricalConflictDisposition[];
}

export const HistoricalConflictDispositionSchema = z
  .object({
    changeId: z.string().min(1),
    deltaId: z.string().min(1),
    resolution: z.literal("preserve_current"),
    currentRequirementSha256: SHA256DigestSchema,
    rejectedPostimageSha256: SHA256DigestSchema,
    evidence: z.string().trim().min(1),
  })
  .strict();
export type HistoricalConflictDisposition = z.infer<
  typeof HistoricalConflictDispositionSchema
>;

export interface HistoricalConflictBinding {
  changeId: string;
  deltaId: string;
  operation: Delta["operation"];
  currentRequirementSha256?: string;
  rejectedPostimageSha256?: string;
}

export interface HistoricalArchiveRepairResult {
  success: boolean;
  dryRun: boolean;
  seedHeadSha: string;
  seedProjectionSha256: string;
  rows: HistoricalArchiveRepairRow[];
  affectedCapabilities: Array<{
    capability: string;
    version: string;
    specSha256: string;
  }>;
  specsDir: string;
  docsDir: string;
}

const HistoricalArchiveChangeSchema = z
  .object({
    id: z.string().min(1),
    created_at: z.string(),
    phase9_status: z
      .object({
        completedAt: z.string().optional(),
        changeTipSha: z.string().optional(),
      })
      .passthrough()
      .optional(),
    deltas: z.record(z.string(), z.array(DeltaSchema)),
  })
  .passthrough();
type HistoricalArchiveChange = z.infer<typeof HistoricalArchiveChangeSchema>;

function projectionMapSha256(specs: Map<string, Spec>): string {
  return canonicalSha256(
    [...specs.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([capability, spec]) => ({
        capability,
        spec: SpecSchema.parse(spec),
      })),
  );
}

function dispositionKey(changeId: string, deltaId: string): string {
  return `${changeId}\u0000${deltaId}`;
}

function gitText(repo: string, args: string[]): string | null {
  const result = spawnSyncGit(args, { cwd: repo, encoding: "utf8" });
  return result.status === 0 ? String(result.stdout).trim() : null;
}

function loadBaselineSpec(
  repo: string,
  change: HistoricalArchiveChange,
  capability: string,
): Spec | undefined {
  const refs = [
    ...(change.phase9_status?.changeTipSha
      ? [
          `${change.phase9_status.changeTipSha}^`,
          change.phase9_status.changeTipSha,
        ]
      : []),
    `change/${change.id}^`,
    `change/${change.id}`,
  ];
  for (const ref of refs) {
    const raw = gitText(repo, [
      "show",
      `${ref}:.adv/specs/${capability}/spec.json`,
    ]);
    if (!raw) continue;
    try {
      return SpecSchema.parse(JSON.parse(raw));
    } catch {
      continue;
    }
  }
  return undefined;
}

async function loadArchiveChanges(archiveDir: string): Promise<
  Array<{
    path: string;
    archivedAt: string;
    changeId: string;
    change?: HistoricalArchiveChange;
    error?: string;
  }>
> {
  let entries: string[];
  try {
    entries = (await readdir(archiveDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
  const loaded: Array<{
    path: string;
    archivedAt: string;
    changeId: string;
    change?: HistoricalArchiveChange;
    error?: string;
  }> = [];
  for (const entry of entries) {
    const path = join(archiveDir, entry);
    const changePath = join(path, "change.json");
    try {
      const readResult = await readBoundedProjectionDocument(changePath);
      if (readResult.kind !== "ok") {
        loaded.push({
          path,
          archivedAt: entry.slice(0, 10),
          changeId: `unreadable:${entry}`,
          error:
            readResult.kind === "oversized"
              ? `change.json oversized: ${readResult.actual} bytes > ${readResult.limit} bytes`
              : readResult.kind === "not_found"
                ? "change.json not found"
                : `${readResult.kind}: ${readResult.error ?? "unknown"}`,
        });
        continue;
      }
      const change = HistoricalArchiveChangeSchema.parse(
        JSON.parse(readResult.content),
      );
      loaded.push({
        path,
        archivedAt: change.phase9_status?.completedAt ?? entry.slice(0, 10),
        changeId: change.id,
        change,
      });
    } catch (error) {
      loaded.push({
        path,
        archivedAt: entry.slice(0, 10),
        changeId: `unreadable:${entry}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return loaded.sort(
    (left, right) =>
      left.archivedAt.localeCompare(right.archivedAt) ||
      left.changeId.localeCompare(right.changeId),
  );
}

export interface ReconcileHistoricalArchiveDeltasInput {
  archiveDir: string;
  repairWorktree: string;
  dryRun: boolean;
  expectedSeedHeadSha?: string;
  expectedSeedProjectionSha256?: string;
  conflictDispositions?: HistoricalConflictDisposition[];
}

async function reconcileHistoricalArchiveDeltasUnderLock(
  input: ReconcileHistoricalArchiveDeltasInput,
): Promise<HistoricalArchiveRepairResult> {
  const seedHeadSha =
    gitText(input.repairWorktree, ["rev-parse", "HEAD"]) ?? "unresolved";
  if (seedHeadSha === "unresolved") {
    throw new Error("Unable to pin repair worktree HEAD");
  }
  const specsDir = join(input.repairWorktree, ".adv", "specs");
  const docsDir = join(input.repairWorktree, "docs", "specs");
  const cumulative = await loadAllSpecs(specsDir);
  const seedProjectionSha256 = projectionMapSha256(cumulative);
  if (!input.dryRun) {
    if (!input.expectedSeedHeadSha || !input.expectedSeedProjectionSha256) {
      throw new Error(
        "Historical repair execution requires reviewed seed HEAD and projection digest",
      );
    }
    if (
      seedHeadSha !== input.expectedSeedHeadSha ||
      seedProjectionSha256 !== input.expectedSeedProjectionSha256
    ) {
      throw new Error(
        "Historical repair seed changed after dry-run; run and review a new dry-run",
      );
    }
  }
  const dispositions = (input.conflictDispositions ?? []).map((row) =>
    HistoricalConflictDispositionSchema.parse(row),
  );
  const dispositionKeys = dispositions.map((row) =>
    dispositionKey(row.changeId, row.deltaId),
  );
  if (new Set(dispositionKeys).size !== dispositionKeys.length) {
    throw new Error(
      "Historical repair received duplicate conflict disposition for the same change and delta",
    );
  }
  const dispositionByKey = new Map(
    dispositions.map((row) => [dispositionKey(row.changeId, row.deltaId), row]),
  );
  const usedDispositions = new Set<string>();
  const affected = new Set<string>();
  const rows: HistoricalArchiveRepairRow[] = [];
  const archives = await loadArchiveChanges(input.archiveDir);

  for (const archive of archives) {
    if (!archive.change) {
      rows.push({
        changeId: archive.changeId,
        archivePath: archive.path,
        disposition: "unreadable",
        details: [
          `change.json is unreadable or schema-invalid: ${archive.error ?? "unknown parse failure"}`,
        ],
      });
      continue;
    }
    const proposed = new Map(cumulative);
    const details: string[] = [];
    let blocked: HistoricalArchiveDisposition | null = null;
    let missing = false;
    const archiveAffected = new Set<string>();
    const conflictBindings: HistoricalConflictBinding[] = [];
    const appliedConflictDispositions: HistoricalConflictDisposition[] = [];
    const validatedConflictDispositions: HistoricalConflictDisposition[] = [];

    for (const [capability, deltas] of Object.entries(archive.change.deltas)) {
      if (deltas.length === 0) continue;
      const existing = proposed.get(capability);
      if (!existing && !deltas.every((delta) => delta.operation === "add")) {
        details.push(`${capability}: current spec is absent`);
        blocked = "unreadable";
        break;
      }
      const current: Spec = existing ?? {
        name: capability,
        title: capability,
        purpose: `Requirements for ${capability}`,
        version: "0.0.0",
        updated_at: archive.archivedAt,
        requirements: [],
      };
      const baselineSpec = loadBaselineSpec(
        input.repairWorktree,
        archive.change,
        capability,
      );
      let plan = planSpecProjection({
        spec: current,
        deltas,
        authority: { kind: "historical", baselineSpec },
        projectedAt:
          archive.change.phase9_status?.completedAt ??
          archive.change.created_at ??
          new Date(0).toISOString(),
      });
      const initialConflictRows = plan.dispositions.filter(
        (row) => row.status === "conflicting",
      );
      const capabilityAppliedDispositions: HistoricalConflictDisposition[] = [];
      const hasUnverified = plan.dispositions.some(
        (row) => row.status === "unverified",
      );
      if (
        plan.status === "blocked" &&
        initialConflictRows.length > 0 &&
        !hasUnverified
      ) {
        const excludedDeltaIds = new Set<string>();
        let dispositionFailure = false;
        for (const conflictRow of initialConflictRows) {
          const delta = deltas.find((row) => row.id === conflictRow.deltaId);
          const binding: HistoricalConflictBinding = {
            changeId: archive.change.id,
            deltaId: conflictRow.deltaId,
            operation: delta?.operation ?? "add",
          };
          if (delta?.operation === "add") {
            const currentRequirement = current.requirements.find(
              (row) => row.id === delta.requirement.id,
            );
            if (currentRequirement) {
              binding.currentRequirementSha256 =
                requirementSha256(currentRequirement);
              binding.rejectedPostimageSha256 = requirementSha256(
                delta.requirement,
              );
            }
          }
          conflictBindings.push(binding);
          const key = dispositionKey(archive.change.id, conflictRow.deltaId);
          const disposition = dispositionByKey.get(key);
          if (
            !disposition ||
            delta?.operation !== "add" ||
            !binding.currentRequirementSha256 ||
            !binding.rejectedPostimageSha256 ||
            disposition.currentRequirementSha256 !==
              binding.currentRequirementSha256 ||
            disposition.rejectedPostimageSha256 !==
              binding.rejectedPostimageSha256
          ) {
            dispositionFailure = true;
            continue;
          }
          usedDispositions.add(key);
          excludedDeltaIds.add(conflictRow.deltaId);
          validatedConflictDispositions.push(disposition);
          capabilityAppliedDispositions.push(disposition);
        }
        if (!dispositionFailure) {
          const remainingDeltas = deltas.filter(
            (delta) => !excludedDeltaIds.has(delta.id),
          );
          plan =
            remainingDeltas.length === 0
              ? {
                  status: "safe",
                  capability,
                  baseVersion: current.version,
                  targetVersion: current.version,
                  dispositions: [],
                  targetSpec: structuredClone(current),
                }
              : planSpecProjection({
                  spec: current,
                  deltas: remainingDeltas,
                  authority: { kind: "historical", baselineSpec },
                  projectedAt:
                    archive.change.phase9_status?.completedAt ??
                    archive.change.created_at,
                });
        }
      }
      const preservedDetails = capabilityAppliedDispositions.map(
        (row) => `${row.deltaId}=preserved_current`,
      );
      details.push(
        `${capability}: ${[
          ...preservedDetails,
          ...plan.dispositions.map(
            (row) =>
              `${row.deltaId}${row.targetId ? `[${row.targetId}]` : ""}=${row.status}${row.reason ? ` (${row.reason})` : ""}`,
          ),
        ].join(", ")}`,
      );
      if (plan.status === "blocked" || !plan.targetSpec) {
        blocked = plan.dispositions.some((row) => row.status === "conflicting")
          ? "conflict"
          : "unreadable";
        break;
      }
      if (!existing) {
        plan.targetSpec.version = "1.0.0";
        plan.targetVersion = "1.0.0";
      }
      missing ||= plan.dispositions.some((row) => row.status === "missing");
      if (plan.dispositions.some((row) => row.status === "missing")) {
        archiveAffected.add(capability);
      }
      proposed.set(capability, plan.targetSpec);
    }

    if (blocked) {
      rows.push({
        changeId: archive.change.id,
        archivePath: archive.path,
        disposition: blocked,
        details,
        ...(conflictBindings.length > 0 ? { conflictBindings } : {}),
        ...(appliedConflictDispositions.length > 0
          ? { appliedConflictDispositions }
          : {}),
      });
      continue;
    }
    appliedConflictDispositions.push(...validatedConflictDispositions);
    for (const [capability, spec] of proposed) cumulative.set(capability, spec);
    for (const capability of archiveAffected) affected.add(capability);
    rows.push({
      changeId: archive.change.id,
      archivePath: archive.path,
      disposition: missing ? "repaired" : "complete",
      details,
      ...(conflictBindings.length > 0 ? { conflictBindings } : {}),
      ...(appliedConflictDispositions.length > 0
        ? { appliedConflictDispositions }
        : {}),
    });
  }

  const unusedDispositions = dispositions.filter(
    (row) => !usedDispositions.has(dispositionKey(row.changeId, row.deltaId)),
  );
  if (unusedDispositions.length > 0) {
    throw new Error(
      `Historical conflict disposition did not bind an exact conflicting add: ${unusedDispositions
        .map((row) => `${row.changeId}/${row.deltaId}`)
        .join(", ")}`,
    );
  }

  if (!input.dryRun) {
    const currentHead = gitText(input.repairWorktree, ["rev-parse", "HEAD"]);
    const currentSpecs = await loadAllSpecs(specsDir);
    if (
      currentHead !== seedHeadSha ||
      projectionMapSha256(currentSpecs) !== seedProjectionSha256
    ) {
      throw new Error(
        "Historical repair seed changed before write; no projection was written",
      );
    }
  }

  const affectedCapabilities: HistoricalArchiveRepairResult["affectedCapabilities"] =
    [];
  for (const capability of [...affected].sort((left, right) =>
    left.localeCompare(right),
  )) {
    const spec = cumulative.get(capability);
    if (!spec) continue;
    affectedCapabilities.push({
      capability,
      version: spec.version,
      specSha256: specSha256(spec),
    });
    if (!input.dryRun) {
      await saveSpec(specsDir, spec);
      await generateSpecDocFile(spec, docsDir);
      const readback = await loadAllSpecs(specsDir);
      const persisted = readback.get(capability);
      if (!persisted || specSha256(persisted) !== specSha256(spec)) {
        throw new Error(`Historical repair readback failed for ${capability}`);
      }
    }
  }

  return {
    success: true,
    dryRun: input.dryRun,
    seedHeadSha,
    seedProjectionSha256,
    rows,
    affectedCapabilities: affectedCapabilities.sort((left, right) =>
      left.capability.localeCompare(right.capability),
    ),
    specsDir,
    docsDir,
  };
}

export async function reconcileHistoricalArchiveDeltas(
  input: ReconcileHistoricalArchiveDeltasInput,
): Promise<HistoricalArchiveRepairResult> {
  return withArchiveProjectionLock(input.repairWorktree, () =>
    reconcileHistoricalArchiveDeltasUnderLock(input),
  );
}
