import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ChangeSchema, SpecSchema, type Change, type Spec } from "../types";
import { loadAllSpecs, saveSpec } from "../storage/json";
import { spawnSyncGit } from "../utils/git-binary";
import { generateSpecDocFile } from "./docs";
import { planSpecProjection, specSha256 } from "./projection";

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
}

export interface HistoricalArchiveRepairResult {
  success: boolean;
  dryRun: boolean;
  seedHeadSha: string;
  rows: HistoricalArchiveRepairRow[];
  affectedCapabilities: Array<{
    capability: string;
    version: string;
    specSha256: string;
  }>;
  specsDir: string;
  docsDir: string;
}

function gitText(repo: string, args: string[]): string | null {
  const result = spawnSyncGit(args, { cwd: repo, encoding: "utf8" });
  return result.status === 0 ? String(result.stdout).trim() : null;
}

function loadBaselineSpec(
  repo: string,
  change: Change,
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
    change?: Change;
    error?: string;
  }>
> {
  let entries: string[];
  try {
    entries = await readdir(archiveDir);
  } catch {
    return [];
  }
  const loaded: Array<{
    path: string;
    archivedAt: string;
    changeId: string;
    change?: Change;
    error?: string;
  }> = [];
  for (const entry of entries) {
    const path = join(archiveDir, entry);
    try {
      const change = ChangeSchema.parse(
        JSON.parse(await readFile(join(path, "change.json"), "utf8")),
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

export async function reconcileHistoricalArchiveDeltas(input: {
  archiveDir: string;
  repairWorktree: string;
  dryRun: boolean;
}): Promise<HistoricalArchiveRepairResult> {
  const seedHeadSha =
    gitText(input.repairWorktree, ["rev-parse", "HEAD"]) ?? "unresolved";
  if (seedHeadSha === "unresolved") {
    throw new Error("Unable to pin repair worktree HEAD");
  }
  const specsDir = join(input.repairWorktree, ".adv", "specs");
  const docsDir = join(input.repairWorktree, "docs", "specs");
  const cumulative = await loadAllSpecs(specsDir);
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
      const plan = planSpecProjection({
        spec: current,
        deltas,
        authority: { kind: "historical", baselineSpec },
        projectedAt:
          archive.change.phase9_status?.completedAt ??
          archive.change.created_at ??
          new Date(0).toISOString(),
      });
      details.push(
        `${capability}: ${plan.dispositions
          .map((row) => `${row.deltaId}=${row.status}`)
          .join(", ")}`,
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
      });
      continue;
    }
    for (const [capability, spec] of proposed) cumulative.set(capability, spec);
    for (const capability of archiveAffected) affected.add(capability);
    rows.push({
      changeId: archive.change.id,
      archivePath: archive.path,
      disposition: missing ? "repaired" : "complete",
      details,
    });
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
    rows,
    affectedCapabilities: affectedCapabilities.sort((left, right) =>
      left.capability.localeCompare(right.capability),
    ),
    specsDir,
    docsDir,
  };
}
