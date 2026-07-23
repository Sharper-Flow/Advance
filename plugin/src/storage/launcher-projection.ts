import { z } from "zod";
import { readdir, readFile } from "fs/promises";
import type { Dirent } from "fs";
import { join } from "path";

// Canonical gate order — local to this pure module to avoid Temporal/ADV imports.
const GATE_ORDER: readonly string[] = [
  "proposal",
  "discovery",
  "design",
  "planning",
  "execution",
  "acceptance",
  "release",
];

export const LauncherChangeSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.literal("draft"),
  phase: z.string(),
  created_at: z.string(),
  last_activity: z.string(),
  task_count: z.number().int().nonnegative(),
  completed_tasks: z.number().int().nonnegative(),
  epic_membership: z
    .object({
      epic_id: z.string(),
      entry_id: z.string(),
      order: z.number().int().min(0),
      title: z.string(),
    })
    .optional(),
});

export type LauncherChangeSummary = z.infer<typeof LauncherChangeSummarySchema>;

export const LauncherProjectionSchema = z.object({
  schema_version: z.literal(1),
  generated_at: z.string(),
  source: z.literal("disk_projection"),
  freshness: z.string().nullable(),
  degraded: z.boolean(),
  degraded_threshold_ms: z.number(),
  epics_available: z.literal(false),
  active_count: z.number().int().nonnegative(),
  changes: z.array(LauncherChangeSummarySchema).max(50),
});

export type LauncherProjection = z.infer<typeof LauncherProjectionSchema>;

const ChangeProjectionFileSchema = z.object({
  schemaVersion: z.number(),
  changeId: z.string(),
  state: z
    .object({
      id: z.string(),
      title: z.string(),
      status: z.string(),
      createdAt: z.string(),
      lastSignalAt: z.string().optional(),
      tasks: z
        .array(z.object({ status: z.string() }).passthrough())
        .optional()
        .default([]),
      gates: z.record(z.string(), z.unknown()).optional().default({}),
      epic_membership: z
        .object({
          epic_id: z.string(),
          entry_id: z.string(),
          order: z.number(),
          title: z.string(),
        })
        .optional(),
    })
    .passthrough(),
});

function normalizeStatus(status: string): "draft" | null {
  if (status === "draft" || status === "active" || status === "pending") {
    return "draft";
  }
  return null;
}

function derivePhase(gates: Record<string, unknown>): string {
  for (const gateId of GATE_ORDER) {
    const gate = gates[gateId];
    const status =
      typeof gate === "object" &&
      gate !== null &&
      "status" in gate &&
      typeof (gate as { status: unknown }).status === "string"
        ? (gate as { status: string }).status
        : undefined;
    if (status !== "done") {
      return gateId;
    }
  }
  return "release";
}

function countDoneTasks(
  tasks: ReadonlyArray<{ readonly status: string }>,
): number {
  return tasks.filter((t) => t.status === "done").length;
}

async function safeReadDir(dir: string): Promise<Dirent[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

async function loadArchivedIds(archiveDir: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const entries = await safeReadDir(archiveDir);
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    try {
      const text = await readFile(
        join(archiveDir, entry.name, "change.json"),
        "utf-8",
      );
      const raw = JSON.parse(text) as unknown;
      if (
        typeof raw === "object" &&
        raw !== null &&
        "id" in raw &&
        typeof (raw as { id: unknown }).id === "string"
      ) {
        ids.add((raw as { id: string }).id);
      }
    } catch {
      // Skip malformed or unreadable archive bundles.
    }
  }
  return ids;
}

export interface BuildLauncherProjectionInput {
  changesDir: string;
  archiveDir: string;
  generatedAt: string;
  degradedThresholdMs: number;
}

export async function buildLauncherProjection(
  input: BuildLauncherProjectionInput,
): Promise<LauncherProjection> {
  const { changesDir, archiveDir, generatedAt, degradedThresholdMs } = input;

  const archivedIds = await loadArchivedIds(archiveDir);
  const activeSummaries: LauncherChangeSummary[] = [];
  let freshness: string | null = null;

  const entries = await safeReadDir(changesDir);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    let raw: unknown;
    try {
      const text = await readFile(join(changesDir, entry.name), "utf-8");
      raw = JSON.parse(text);
    } catch {
      continue;
    }

    const parsed = ChangeProjectionFileSchema.safeParse(raw);
    if (!parsed.success) {
      continue;
    }

    const { state } = parsed.data;
    const canonicalId = state.id;

    if (normalizeStatus(state.status) !== "draft") {
      continue;
    }
    if (archivedIds.has(canonicalId)) {
      continue;
    }

    const tasks = state.tasks;
    const completedTasks = countDoneTasks(tasks);
    const phase = derivePhase(state.gates);
    const lastActivity = state.lastSignalAt ?? state.createdAt;

    const summary: LauncherChangeSummary = {
      id: canonicalId,
      title: state.title,
      status: "draft",
      phase,
      created_at: state.createdAt,
      last_activity: lastActivity,
      task_count: tasks.length,
      completed_tasks: completedTasks,
    };

    if (state.epic_membership) {
      summary.epic_membership = {
        epic_id: state.epic_membership.epic_id,
        entry_id: state.epic_membership.entry_id,
        order: state.epic_membership.order,
        title: state.epic_membership.title,
      };
    }

    activeSummaries.push(summary);

    if (state.lastSignalAt) {
      if (freshness === null || state.lastSignalAt > freshness) {
        freshness = state.lastSignalAt;
      }
    }
  }

  activeSummaries.sort((a, b) => {
    return (
      new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime()
    );
  });

  const bounded = activeSummaries.slice(0, 50);

  const degraded =
    freshness !== null
      ? Date.now() - new Date(freshness).getTime() > degradedThresholdMs
      : false;

  return {
    schema_version: 1,
    generated_at: generatedAt,
    source: "disk_projection",
    freshness,
    degraded,
    degraded_threshold_ms: degradedThresholdMs,
    epics_available: false,
    active_count: bounded.length,
    changes: bounded,
  };
}
