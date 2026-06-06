/**
 * adv CLI — roadmap file-snapshot reader and renderer
 *
 * Mirrors plugin/src/tools/roadmap.ts snapshot shape and filter/sort logic.
 * Zero dependencies; compatible with Bun runtime.
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { emitJson } from "./render";

// =============================================================================
// Types
// =============================================================================

export interface RoadmapBug {
  number: number;
  title: string;
  priority: "critical" | "high" | "medium" | "low" | null;
  labels: string[];
}

export interface RoadmapFeature {
  number: number;
  title: string;
  value: number | null;
  time_criticality: number | null;
  rroe: number | null;
  effort: number | null;
  wsjf: number | null;
  labels: string[];
}

export interface RoadmapDeferred {
  number: number;
  title: string;
  reason: string;
}

export interface RoadmapSnapshot {
  version: 1;
  generated_at: string;
  project: { owner: string; number: number; title: string };
  counts: {
    total: number;
    bugs: number;
    features: number;
    deferred: number;
  };
  bugs: RoadmapBug[];
  features: RoadmapFeature[];
  deferred: RoadmapDeferred[];
}

export interface RoadmapFreshness {
  status: "fresh" | "stale" | "unknown";
  age_hours: number | null;
  stale_after_hours: number;
  needs_refresh: boolean;
}

export interface RoadmapOpts {
  kind?: "bug" | "feature" | "all";
  priority?: "critical" | "high" | "medium" | "low";
  top?: number;
}

// =============================================================================
// Constants
// =============================================================================

const SNAPSHOT_RELATIVE_PATH = ".adv/roadmap-snapshot.json";
const FILE_SNAPSHOT_STALE_AFTER_MS = 2 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

const PRIORITY_ORDER: Array<RoadmapBug["priority"] & string> = [
  "critical",
  "high",
  "medium",
  "low",
];

// =============================================================================
// File reader
// =============================================================================

export async function readSnapshotFile(
  repoRoot: string,
): Promise<
  | { ok: true; snapshot: RoadmapSnapshot }
  | { ok: false; error: string; hint: string }
> {
  const path = join(repoRoot, SNAPSHOT_RELATIVE_PATH);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {
        ok: false,
        error: `Roadmap snapshot not found at ${SNAPSHOT_RELATIVE_PATH}.`,
        hint: "Run `/adv-triage` to generate the snapshot.",
      };
    }
    return {
      ok: false,
      error: `Failed to read snapshot: ${(err as Error).message}`,
      hint: "Verify file permissions and re-run /adv-triage if the file is corrupted.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      error: `Snapshot is not valid JSON: ${(err as Error).message}`,
      hint: "Re-run /adv-triage to regenerate the snapshot.",
    };
  }

  const obj = parsed as Partial<RoadmapSnapshot>;
  if (
    !obj ||
    typeof obj !== "object" ||
    obj.version !== 1 ||
    typeof obj.generated_at !== "string" ||
    !Array.isArray(obj.bugs) ||
    !Array.isArray(obj.features) ||
    !Array.isArray(obj.deferred)
  ) {
    return {
      ok: false,
      error:
        "Snapshot has unexpected shape (version mismatch or missing required arrays).",
      hint: "Re-run /adv-triage to regenerate with the current schema.",
    };
  }

  return { ok: true, snapshot: obj as RoadmapSnapshot };
}

// =============================================================================
// Freshness
// =============================================================================

export function assessFileFreshness(
  generatedAt: string,
  now = new Date(),
): RoadmapFreshness {
  const staleAfterHours = FILE_SNAPSHOT_STALE_AFTER_MS / MS_PER_HOUR;
  const generatedTime = Date.parse(generatedAt);
  if (!Number.isFinite(generatedTime)) {
    return {
      status: "unknown",
      age_hours: null,
      stale_after_hours: staleAfterHours,
      needs_refresh: true,
    };
  }

  const ageMs = Math.max(0, now.getTime() - generatedTime);
  const stale = ageMs > FILE_SNAPSHOT_STALE_AFTER_MS;
  return {
    status: stale ? "stale" : "fresh",
    age_hours: Number((ageMs / MS_PER_HOUR).toFixed(2)),
    stale_after_hours: staleAfterHours,
    needs_refresh: stale,
  };
}

// =============================================================================
// Sort / filter
// =============================================================================

export function sortFeaturesByWsjf(
  features: RoadmapFeature[],
): RoadmapFeature[] {
  return [...features].sort((a, b) => {
    const wsjfDiff = (b.wsjf ?? 0) - (a.wsjf ?? 0);
    if (Math.abs(wsjfDiff) > 0.05) return wsjfDiff;
    const valueDiff = (b.value ?? 0) - (a.value ?? 0);
    if (valueDiff !== 0) return valueDiff;
    return a.number - b.number;
  });
}

export function groupBugsByPriority(
  bugs: RoadmapBug[],
): Record<
  "critical" | "high" | "medium" | "low" | "unprioritized",
  RoadmapBug[]
> {
  const buckets: Record<
    "critical" | "high" | "medium" | "low" | "unprioritized",
    RoadmapBug[]
  > = {
    critical: [],
    high: [],
    medium: [],
    low: [],
    unprioritized: [],
  };
  for (const bug of bugs) {
    if (bug.priority === null) buckets.unprioritized.push(bug);
    else buckets[bug.priority].push(bug);
  }
  return buckets;
}

export interface FilteredRoadmap {
  bugs: Record<
    "critical" | "high" | "medium" | "low" | "unprioritized",
    RoadmapBug[]
  >;
  features: RoadmapFeature[];
  deferred: RoadmapDeferred[];
}

export function applyFilters(
  snapshot: RoadmapSnapshot,
  opts: RoadmapOpts,
): FilteredRoadmap {
  const kind = opts.kind ?? "all";
  const ranked = sortFeaturesByWsjf(snapshot.features);
  let features: RoadmapFeature[] = kind === "bug" ? [] : ranked;
  if (opts.top !== undefined && opts.top > 0) {
    features = features.slice(0, opts.top);
  }

  const allBuckets = groupBugsByPriority(snapshot.bugs);
  let bugs = allBuckets;
  if (kind === "feature") {
    bugs = { critical: [], high: [], medium: [], low: [], unprioritized: [] };
  } else if (opts.priority) {
    bugs = {
      critical: opts.priority === "critical" ? allBuckets.critical : [],
      high: opts.priority === "high" ? allBuckets.high : [],
      medium: opts.priority === "medium" ? allBuckets.medium : [],
      low: opts.priority === "low" ? allBuckets.low : [],
      unprioritized: [],
    };
  }

  return {
    bugs,
    features,
    deferred: snapshot.deferred,
  };
}

// =============================================================================
// Render
// =============================================================================

export function renderRoadmap(
  snapshot: RoadmapSnapshot,
  opts: RoadmapOpts,
  useColor: boolean,
  now = new Date(),
): string {
  const filtered = applyFilters(snapshot, opts);
  const freshness = assessFileFreshness(snapshot.generated_at, now);

  const lines: string[] = [];

  // Header
  lines.push(`Roadmap (source: file, generated: ${snapshot.generated_at})`);
  lines.push(
    `Project: #${snapshot.project.number} (${snapshot.project.owner}/${snapshot.project.title})`,
  );
  lines.push(
    `Freshness: ${freshness.status}; age ${freshness.age_hours ?? "?"}h; refresh after ${freshness.stale_after_hours}h`,
  );
  lines.push(
    `Total: ${snapshot.counts.bugs}/${snapshot.counts.features}/${snapshot.counts.deferred} (bugs/features/deferred)`,
  );
  lines.push("");

  // Annotation notice
  lines.push(
    "active-change annotation: unavailable in CLI file mode (use adv_backlog_state / adv_roadmap MCP tool)",
  );
  lines.push("");

  const kind = opts.kind ?? "all";

  // Bugs
  if (kind !== "feature") {
    let hasBugs = false;
    for (const tier of PRIORITY_ORDER) {
      const list = filtered.bugs[tier];
      if (list.length === 0) continue;
      hasBugs = true;
      lines.push(`Bugs — ${tier}`);
      const header = "| # | Title |";
      const sep = "|---|---|";
      lines.push(header);
      lines.push(sep);
      for (const bug of list) {
        lines.push(`| #${bug.number} | ${bug.title} |`);
      }
      lines.push("");
    }
    const unprioritized = filtered.bugs.unprioritized;
    if (unprioritized.length > 0) {
      hasBugs = true;
      lines.push("Bugs — unprioritized");
      lines.push("| # | Title |");
      lines.push("|---|---|");
      for (const bug of unprioritized) {
        lines.push(`| #${bug.number} | ${bug.title} |`);
      }
      lines.push("");
    }
    if (!hasBugs && opts.priority) {
      lines.push(`(no bugs match priority=${opts.priority})`);
      lines.push("");
    }
  }

  // Features
  if (kind !== "bug") {
    if (filtered.features.length > 0) {
      const topSuffix = opts.top ? ` (top ${opts.top} by WSJF)` : "";
      lines.push(`Features${topSuffix}`);
      lines.push("| # | Title | V | TC | RROE | E | WSJF |");
      lines.push("|---|---|---|---|---|---|---|");
      for (const f of filtered.features) {
        const v = f.value ?? "—";
        const tc = f.time_criticality ?? "—";
        const rroe = f.rroe ?? "—";
        const e = f.effort ?? "—";
        const wsjf = f.wsjf ?? "—";
        lines.push(
          `| #${f.number} | ${f.title} | ${v} | ${tc} | ${rroe} | ${e} | ${wsjf} |`,
        );
      }
      lines.push("");
    } else if (opts.top) {
      lines.push(`(no features match top=${opts.top})`);
      lines.push("");
    }
  }

  // Deferred
  if (filtered.deferred.length > 0) {
    lines.push(`Deferred / Unscored (${filtered.deferred.length})`);
    for (const d of filtered.deferred) {
      lines.push(`- #${d.number} — ${d.title} — _${d.reason}_`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

// =============================================================================
// JSON output
// =============================================================================

export function roadmapJson(
  snapshot: RoadmapSnapshot,
  opts: RoadmapOpts,
  now = new Date(),
): string {
  const filtered = applyFilters(snapshot, opts);
  const freshness = assessFileFreshness(snapshot.generated_at, now);
  return emitJson({
    source: "file",
    generated_at: snapshot.generated_at,
    freshness,
    project: snapshot.project,
    counts: snapshot.counts,
    active_change_annotation: "unavailable_cli_file_mode",
    bugs: filtered.bugs,
    features: filtered.features,
    deferred: filtered.deferred,
  });
}
