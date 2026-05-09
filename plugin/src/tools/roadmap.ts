/**
 * Roadmap Tool — adv_roadmap
 *
 * Read-only access to the prioritized backlog. Two modes:
 *   - source: 'file' (default) — reads `.adv/roadmap-snapshot.json` at repo
 *     root (sidecar emitted by /adv-triage alongside ROADMAP.md). Fast,
 *     no network, deterministic per /adv-triage run.
 *   - source: 'live' — queries GitHub Project v2 directly via `gh`.
 *     Always fresh; pays one GraphQL `item-list` per call.
 *
 * Filters compose: kind ∈ {bug, feature, all}, top N (features only),
 * priority ∈ {critical, high, medium, low} (bugs only).
 *
 * Source of truth is always GitHub Project v2; the snapshot file is the
 * canonical mirror, mirrored to disk so that read access works without
 * network and across cold sessions.
 */

import { z } from "zod";
import { join } from "path";
import { readFile } from "fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Store } from "../storage/store";
import { formatToolOutput } from "../utils/tool-output";
import { readProjectMetadata } from "../storage/project-metadata";

const execFileP = promisify(execFile);

// =============================================================================
// Snapshot schema (canonical disk format for `.adv/roadmap-snapshot.json`)
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

const SNAPSHOT_RELATIVE_PATH = ".adv/roadmap-snapshot.json";

// =============================================================================
// File-mode reader
// =============================================================================

async function readSnapshotFile(repoRoot: string): Promise<
  | {
      ok: true;
      snapshot: RoadmapSnapshot;
      path: string;
    }
  | {
      ok: false;
      error: string;
      hint: string;
    }
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
        hint: 'Run `/adv-triage --execute` to generate the snapshot, or pass `source: "live"` to query the GitHub Project directly.',
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
      hint: "Re-run /adv-triage --execute to regenerate the snapshot.",
    };
  }

  // Minimal structural validation: confirm the version and required keys.
  // We do NOT deep-validate every field — the file is agent-generated and
  // any drift from this shape indicates a bug to surface, not silently coerce.
  const obj = parsed as Partial<RoadmapSnapshot>;
  if (
    !obj ||
    typeof obj !== "object" ||
    obj.version !== 1 ||
    !Array.isArray(obj.bugs) ||
    !Array.isArray(obj.features) ||
    !Array.isArray(obj.deferred)
  ) {
    return {
      ok: false,
      error:
        "Snapshot has unexpected shape (version mismatch or missing required arrays).",
      hint: "Re-run /adv-triage --execute to regenerate with the current schema.",
    };
  }

  return { ok: true, snapshot: obj as RoadmapSnapshot, path };
}

// =============================================================================
// Live-mode reader
// =============================================================================

interface LiveProjectItem {
  content?: { number?: number; title?: string; type?: string };
  labels?: string[];
  // Project custom fields surface as plain top-level keys with
  // lower-cased field names. The single-select Priority field surfaces
  // as `priority` (string), and ADV Type as `aDV Type` (with literal
  // space — quirk of the gh CLI when field names contain spaces).
  priority?: string;
  value?: number;
  timeCriticality?: number;
  rROE?: number;
  effort?: number;
  wSJF?: number;
  ["aDV Type"]?: string;
}

async function readLiveProject(metadata: {
  owner: string;
  number: number;
  title: string;
}): Promise<
  | {
      ok: true;
      snapshot: RoadmapSnapshot;
    }
  | {
      ok: false;
      error: string;
      hint: string;
    }
> {
  let stdout: string;
  try {
    const result = await execFileP("gh", [
      "project",
      "item-list",
      String(metadata.number),
      "--owner",
      metadata.owner,
      "--format",
      "json",
      "--limit",
      "500",
    ]);
    stdout = result.stdout;
  } catch (err) {
    return {
      ok: false,
      error: `gh project item-list failed: ${(err as Error).message}`,
      hint: "Verify gh is authenticated (`gh auth status`) and the project exists.",
    };
  }

  let parsed: { items?: LiveProjectItem[] };
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    return {
      ok: false,
      error: `gh project output is not valid JSON: ${(err as Error).message}`,
      hint: "Try running `gh project item-list <N> --owner <owner> --format json` manually to diagnose.",
    };
  }

  const items = parsed.items ?? [];
  const bugs: RoadmapBug[] = [];
  const features: RoadmapFeature[] = [];
  const deferred: RoadmapDeferred[] = [];

  for (const item of items) {
    if (item.content?.type !== "Issue") continue;
    const number = item.content.number;
    const title = item.content.title;
    if (number === undefined || title === undefined) continue;
    const advType = item["aDV Type"];
    const labels = item.labels ?? [];

    if (advType === "bug") {
      bugs.push({
        number,
        title,
        priority: (item.priority as RoadmapBug["priority"] | undefined) ?? null,
        labels,
      });
    } else if (advType === "feature") {
      const hasValue = item.value !== undefined && item.value !== null;
      if (hasValue) {
        features.push({
          number,
          title,
          value: item.value ?? null,
          time_criticality: item.timeCriticality ?? null,
          rroe: item.rROE ?? null,
          effort: item.effort ?? null,
          wsjf: item.wSJF ?? null,
          labels,
        });
      } else {
        deferred.push({
          number,
          title,
          reason: "missing Value",
        });
      }
    } else {
      // No ADV Type — surface in deferred bucket.
      deferred.push({
        number,
        title,
        reason: "missing kind (no ADV Type)",
      });
    }
  }

  return {
    ok: true,
    snapshot: {
      version: 1,
      generated_at: new Date().toISOString(),
      project: metadata,
      counts: {
        total: bugs.length + features.length + deferred.length,
        bugs: bugs.length,
        features: features.length,
        deferred: deferred.length,
      },
      bugs,
      features,
      deferred,
    },
  };
}

// =============================================================================
// Filter helpers
// =============================================================================

function sortFeaturesByWsjf(features: RoadmapFeature[]): RoadmapFeature[] {
  return [...features].sort((a, b) => {
    const wsjfDiff = (b.wsjf ?? 0) - (a.wsjf ?? 0);
    if (Math.abs(wsjfDiff) > 0.05) return wsjfDiff;
    const valueDiff = (b.value ?? 0) - (a.value ?? 0);
    if (valueDiff !== 0) return valueDiff;
    return a.number - b.number;
  });
}

function groupBugsByPriority(
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

function applyFilters(
  snapshot: RoadmapSnapshot,
  args: {
    kind?: "bug" | "feature" | "all";
    top?: number;
    priority?: "critical" | "high" | "medium" | "low";
  },
): {
  bugs: ReturnType<typeof groupBugsByPriority>;
  features: RoadmapFeature[];
  deferred: RoadmapDeferred[];
  applied_filters: Record<string, unknown>;
} {
  const kind = args.kind ?? "all";
  const ranked = sortFeaturesByWsjf(snapshot.features);
  let features: RoadmapFeature[] = kind === "bug" ? [] : ranked;
  if (args.top !== undefined && args.top > 0) {
    features = features.slice(0, args.top);
  }

  const allBuckets = groupBugsByPriority(snapshot.bugs);
  let bugs = allBuckets;
  if (kind === "feature") {
    bugs = {
      critical: [],
      high: [],
      medium: [],
      low: [],
      unprioritized: [],
    };
  } else if (args.priority) {
    bugs = {
      critical: args.priority === "critical" ? allBuckets.critical : [],
      high: args.priority === "high" ? allBuckets.high : [],
      medium: args.priority === "medium" ? allBuckets.medium : [],
      low: args.priority === "low" ? allBuckets.low : [],
      unprioritized: [],
    };
  }

  return {
    bugs,
    features,
    deferred: snapshot.deferred,
    applied_filters: {
      kind,
      top: args.top ?? null,
      priority: args.priority ?? null,
    },
  };
}

// =============================================================================
// Tool definition
// =============================================================================

export const roadmapTools = {
  adv_roadmap: {
    description:
      "Read the prioritized backlog (bugs by priority, features ranked by WSJF). Defaults to reading the file snapshot emitted by /adv-triage; pass `source: 'live'` to query the GitHub Project directly. Filter via `kind`, `top` (features), `priority` (bugs).",
    args: {
      source: z
        .enum(["file", "live"])
        .optional()
        .describe(
          "Where to read from. 'file' (default) reads .adv/roadmap-snapshot.json at repo root. 'live' calls `gh project item-list` for fresh data.",
        ),
      kind: z
        .enum(["bug", "feature", "all"])
        .optional()
        .describe(
          "Filter by item kind. Default 'all' returns both bugs and features.",
        ),
      top: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Limit features to the top N by WSJF (after sorting). No effect on bugs.",
        ),
      priority: z
        .enum(["critical", "high", "medium", "low"])
        .optional()
        .describe(
          "Filter bugs to a single priority tier. Has no effect on features.",
        ),
    },
    execute: async (
      args: {
        source?: "file" | "live";
        kind?: "bug" | "feature" | "all";
        top?: number;
        priority?: "critical" | "high" | "medium" | "low";
      },
      store: Store,
    ): Promise<string> => {
      const source = args.source ?? "file";
      let snapshot: RoadmapSnapshot;
      let snapshotPath: string | null = null;

      if (source === "file") {
        const result = await readSnapshotFile(store.paths.root);
        if (!result.ok) {
          return formatToolOutput({
            error: result.error,
            hint: result.hint,
            source,
          });
        }
        snapshot = result.snapshot;
        snapshotPath = result.path;
      } else {
        const externalPath = store.paths.external;
        if (!externalPath) {
          return formatToolOutput({
            error:
              "Project external state path is not configured; cannot read github_project metadata.",
            hint: "Live source requires the ADV external-state directory; ensure the project is initialized via plugin init.",
            source,
          });
        }
        const allMetadata = await readProjectMetadata(externalPath);
        const entry = allMetadata["github_project"];
        if (!entry?.summary) {
          return formatToolOutput({
            error:
              "github_project metadata not persisted. Run /adv-triage --execute once to bootstrap the project link.",
            source,
          });
        }
        let metadata: { owner: string; number: number; title: string };
        try {
          const parsed = JSON.parse(entry.summary);
          metadata = {
            owner: parsed.owner,
            number: parsed.project_number ?? parsed.number,
            title: parsed.title,
          };
        } catch (err) {
          return formatToolOutput({
            error: `github_project metadata is not valid JSON: ${(err as Error).message}`,
            source,
          });
        }
        const result = await readLiveProject(metadata);
        if (!result.ok) {
          return formatToolOutput({
            error: result.error,
            hint: result.hint,
            source,
          });
        }
        snapshot = result.snapshot;
      }

      const filtered = applyFilters(snapshot, args);

      // Cross-reference: which roadmap items already have an active ADV change
      // pointing at them via origin.issue_number? Surfaces "already in flight".
      // Reads ADV state via the store; safe even when the snapshot is stale.
      const activeByIssue = await buildActiveChangeIndex(store);
      const annotatedFeatures = filtered.features.map((f) =>
        activeByIssue.has(f.number)
          ? { ...f, active_change: activeByIssue.get(f.number) }
          : f,
      );
      const annotatedBugs: typeof filtered.bugs = {
        critical: filtered.bugs.critical.map((b) =>
          activeByIssue.has(b.number)
            ? { ...b, active_change: activeByIssue.get(b.number) }
            : b,
        ),
        high: filtered.bugs.high.map((b) =>
          activeByIssue.has(b.number)
            ? { ...b, active_change: activeByIssue.get(b.number) }
            : b,
        ),
        medium: filtered.bugs.medium.map((b) =>
          activeByIssue.has(b.number)
            ? { ...b, active_change: activeByIssue.get(b.number) }
            : b,
        ),
        low: filtered.bugs.low.map((b) =>
          activeByIssue.has(b.number)
            ? { ...b, active_change: activeByIssue.get(b.number) }
            : b,
        ),
        unprioritized: filtered.bugs.unprioritized.map((b) =>
          activeByIssue.has(b.number)
            ? { ...b, active_change: activeByIssue.get(b.number) }
            : b,
        ),
      };

      return formatToolOutput({
        source,
        snapshot_path: snapshotPath,
        generated_at: snapshot.generated_at,
        project: snapshot.project,
        counts: snapshot.counts,
        applied_filters: filtered.applied_filters,
        active_changes_indexed: activeByIssue.size,
        bugs: annotatedBugs,
        features: annotatedFeatures,
        deferred: filtered.deferred,
      });
    },
  },
};

/**
 * Build a map from GitHub issue number → active change ID by walking the
 * store's active-change list and reading each change's `origin.issue_number`.
 *
 * Active = status ∈ {draft, pending, active}. Archived/closed changes are
 * intentionally excluded — they don't represent in-flight work.
 *
 * Failures are non-fatal: if the store list call fails, return an empty
 * map and let the caller render the roadmap without active-change
 * annotations. The roadmap surface MUST NOT block on side-channel reads.
 */
async function buildActiveChangeIndex(
  store: Store,
): Promise<Map<number, string>> {
  const index = new Map<number, string>();
  // "in-flight" is a tool-layer filter, not a stored status enum value.
  // Fetch the full list (excluding archived/closed by default) and filter
  // here to {draft, pending, active}.
  let listResult: Awaited<ReturnType<typeof store.changes.list>>;
  try {
    listResult = await store.changes.list({});
  } catch {
    return index;
  }
  const summaries = (
    listResult as { changes?: Array<{ id: string; status: string }> }
  ).changes;
  if (!Array.isArray(summaries)) {
    return index;
  }
  const inFlight = new Set(["draft", "pending", "active"]);
  for (const summary of summaries) {
    if (!inFlight.has(summary.status)) continue;
    const changeResult = await store.changes.get(summary.id);
    if (!changeResult.success || !changeResult.data) continue;
    const origin = changeResult.data.origin;
    if (origin?.issue_number !== undefined) {
      // First-write wins: if multiple active changes claim the same issue,
      // surface the earliest (by created_at) — extremely rare; UI can flag.
      if (!index.has(origin.issue_number)) {
        index.set(origin.issue_number, summary.id);
      }
    }
  }
  return index;
}
