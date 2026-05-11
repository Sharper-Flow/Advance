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
import { readGitHubProjectConfig } from "../storage/github-project-config";
import { getProjectId } from "../utils/project-id";
import { getService } from "../temporal/service";
import { queryActiveChangesByIssueNumbers } from "../temporal/visibility-claim-queries";

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
  // rq-repoFilter01: optional bare repo name used when snapshot was produced
  // from a shared GitHub Project with server-side repo scoping.
  repository_filter?: string;
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
  /**
   * rq-backlogCoord01 — Annotation freshness TTL contract.
   *
   * `last_refreshed` records the moment the snapshot was last written from
   * GitHub Project state. `ttl_ms` defines how long active-change annotation
   * derived from this snapshot remains acceptably fresh. `next_refresh_after`
   * is the computed `last_refreshed + ttl_ms` — provided redundantly so
   * external readers can decide without parsing arithmetic.
   *
   * These fields are optional on the type so legacy snapshots load without
   * manual migration; consumers MUST treat absence as "stale, refresh now"
   * to keep cross-session claim visibility fresh.
   *
   * Distinct from `FILE_SNAPSHOT_STALE_AFTER_MS` (2h) which covers WSJF-content
   * staleness, refreshed by user-initiated `/adv-triage`. Annotation TTL is
   * agent-driven and shorter (default 5 min).
   */
  last_refreshed?: string;
  ttl_ms?: number;
  next_refresh_after?: string;
}

const SNAPSHOT_RELATIVE_PATH = ".adv/roadmap-snapshot.json";
const FILE_SNAPSHOT_STALE_AFTER_MS = 2 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * rq-backlogCoord01 default annotation-freshness window. Configurable
 * future-extension: read from `.adv/github-project.json.cache_ttl_ms`
 * (validator-recommended location). 5 min balances GH API rate limits
 * (5000 req/hr ÷ 12 reads/hr/session × N sessions) against agent-visible
 * drift.
 */
export const DEFAULT_ANNOTATION_TTL_MS = 5 * 60 * 1000;

export interface RoadmapFreshness {
  status: "live" | "fresh" | "stale" | "unknown";
  checked_at: string;
  generated_at: string;
  age_hours: number | null;
  stale_after_hours: number;
  needs_refresh: boolean;
}

export function assessRoadmapFreshness(
  source: "file" | "live",
  generatedAt: string,
  now = new Date(),
): RoadmapFreshness {
  const staleAfterHours = FILE_SNAPSHOT_STALE_AFTER_MS / MS_PER_HOUR;
  if (source === "live") {
    return {
      status: "live",
      checked_at: now.toISOString(),
      generated_at: generatedAt,
      age_hours: 0,
      stale_after_hours: staleAfterHours,
      needs_refresh: false,
    };
  }

  const generatedTime = Date.parse(generatedAt);
  if (!Number.isFinite(generatedTime)) {
    return {
      status: "unknown",
      checked_at: now.toISOString(),
      generated_at: generatedAt,
      age_hours: null,
      stale_after_hours: staleAfterHours,
      needs_refresh: true,
    };
  }

  const ageMs = Math.max(0, now.getTime() - generatedTime);
  const stale = ageMs > FILE_SNAPSHOT_STALE_AFTER_MS;
  return {
    status: stale ? "stale" : "fresh",
    checked_at: now.toISOString(),
    generated_at: generatedAt,
    age_hours: Number((ageMs / MS_PER_HOUR).toFixed(2)),
    stale_after_hours: staleAfterHours,
    needs_refresh: stale,
  };
}

/**
 * rq-backlogCoord01 — Annotation-freshness assessment.
 *
 * Returns whether the snapshot's active-change annotation needs to be
 * refreshed against GitHub Project + Temporal Visibility. Distinct from
 * `assessRoadmapFreshness` which covers WSJF-content staleness.
 *
 * Absent `last_refreshed` → forced refresh (legacy snapshot migration).
 * Absent `ttl_ms` → default `DEFAULT_ANNOTATION_TTL_MS` (5 min).
 */
export interface AnnotationFreshness {
  needs_refresh: boolean;
  /** Milliseconds since the last refresh. `null` when `last_refreshed` is absent. */
  age_ms: number | null;
  ttl_ms: number;
  last_refreshed: string | null;
  next_refresh_after: string | null;
}

export function assessAnnotationFreshness(
  snapshot: Pick<
    RoadmapSnapshot,
    "last_refreshed" | "ttl_ms" | "next_refresh_after"
  >,
  now: Date = new Date(),
): AnnotationFreshness {
  const ttlMs = snapshot.ttl_ms ?? DEFAULT_ANNOTATION_TTL_MS;

  if (!snapshot.last_refreshed) {
    return {
      needs_refresh: true,
      age_ms: null,
      ttl_ms: ttlMs,
      last_refreshed: null,
      next_refresh_after: null,
    };
  }

  const lastRefreshedMs = Date.parse(snapshot.last_refreshed);
  if (!Number.isFinite(lastRefreshedMs)) {
    return {
      needs_refresh: true,
      age_ms: null,
      ttl_ms: ttlMs,
      last_refreshed: snapshot.last_refreshed,
      next_refresh_after: snapshot.next_refresh_after ?? null,
    };
  }

  const ageMs = Math.max(0, now.getTime() - lastRefreshedMs);
  return {
    needs_refresh: ageMs > ttlMs,
    age_ms: ageMs,
    ttl_ms: ttlMs,
    last_refreshed: snapshot.last_refreshed,
    next_refresh_after:
      snapshot.next_refresh_after ??
      new Date(lastRefreshedMs + ttlMs).toISOString(),
  };
}

/**
 * rq-backlogCoord01 — Build TTL metadata for a snapshot write.
 *
 * Helper consumed by the snapshot writer (currently `adv_backlog_state`
 * via task C1 when triggering a refresh; in the future also `/adv-triage`
 * Phase 5) to populate `last_refreshed`, `ttl_ms`, and the redundant
 * `next_refresh_after` consistently.
 */
export interface RefreshMetadataInput {
  now: Date;
  ttl_ms?: number;
}

export interface RefreshMetadata {
  last_refreshed: string;
  ttl_ms: number;
  next_refresh_after: string;
}

export function buildRefreshMetadata(
  input: RefreshMetadataInput,
): RefreshMetadata {
  const ttlMs = input.ttl_ms ?? DEFAULT_ANNOTATION_TTL_MS;
  return {
    last_refreshed: input.now.toISOString(),
    ttl_ms: ttlMs,
    next_refresh_after: new Date(input.now.getTime() + ttlMs).toISOString(),
  };
}

// =============================================================================
// File-mode reader
// =============================================================================

export async function readSnapshotFile(repoRoot: string): Promise<
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
        hint: 'Run `/adv-triage` to generate the snapshot, or pass `source: "live"` to query the GitHub Project directly.',
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
      hint: "Re-run /adv-triage to regenerate with the current schema.",
    };
  }

  return { ok: true, snapshot: obj as RoadmapSnapshot, path };
}

// =============================================================================
// Live-mode reader
// =============================================================================

export interface LiveProjectItem {
  content?: {
    number?: number;
    title?: string;
    type?: string;
    repository?: string;
  };
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

export function buildProjectItemListArgs(metadata: {
  owner: string;
  number: number;
  repository_filter?: string;
}): string[] {
  const args = [
    "project",
    "item-list",
    String(metadata.number),
    "--owner",
    metadata.owner,
    "--format",
    "json",
    "--limit",
    "500",
  ];
  if (metadata.repository_filter) {
    args.push(
      "--query",
      `repo:${metadata.owner}/${metadata.repository_filter}`,
    );
  }
  return args;
}

/**
 * Filter live project items, removing those whose GitHub issue number
 * appears in `closedNumbers`. Items without a number are preserved
 * (defensive — surface upstream rather than silently drop).
 *
 * Pure function for testability — closed-set lookup happens upstream
 * via `gh issue list -s closed --json number`.
 */
export function filterOpenItemsOnly(
  items: LiveProjectItem[],
  closedNumbers: Set<number>,
): LiveProjectItem[] {
  return items.filter((item) => {
    const n = item.content?.number;
    if (n === undefined) return true;
    return !closedNumbers.has(n);
  });
}

/**
 * Query closed issue numbers for every distinct repository observed in
 * `items`. Returns a single Set keyed by issue number — adequate when
 * all items live under the same repo (current ADV Project layout). If
 * multiple repos are observed, numbers across repos collapse into one
 * Set; collision risk is low but documented here.
 */
async function fetchClosedIssueNumbers(
  items: LiveProjectItem[],
): Promise<Set<number>> {
  const repos = new Set<string>();
  for (const item of items) {
    const repo = item.content?.repository;
    if (repo) repos.add(repo);
  }
  const closed = new Set<number>();
  for (const repo of repos) {
    try {
      const { stdout } = await execFileP("gh", [
        "issue",
        "list",
        "-R",
        repo,
        "-s",
        "closed",
        "--json",
        "number",
        "--limit",
        "1000",
      ]);
      const parsed = JSON.parse(stdout) as Array<{ number?: number }>;
      for (const row of parsed) {
        if (typeof row.number === "number") closed.add(row.number);
      }
    } catch {
      // Non-fatal — closed filter degrades to "no filter" rather than
      // blocking the whole roadmap query. Caller still gets results.
    }
  }
  return closed;
}

async function readLiveProject(metadata: {
  owner: string;
  number: number;
  title: string;
  repository_filter?: string;
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
    const result = await execFileP("gh", buildProjectItemListArgs(metadata));
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

  const allItems = parsed.items ?? [];

  // Filter out closed GH issues — `gh project item-list` returns the
  // full Project board including done/closed issues, but the roadmap
  // is a backlog (open work only).
  const closedNumbers = await fetchClosedIssueNumbers(allItems);
  const items = filterOpenItemsOnly(allItems, closedNumbers);

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
      repository_filter: metadata.repository_filter,
      project: {
        owner: metadata.owner,
        number: metadata.number,
        title: metadata.title,
      },
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
      "Read the prioritized backlog (bugs by priority, features ranked by WSJF). Defaults to reading the file snapshot emitted by /adv-triage and reports freshness warnings after 2h; pass `source: 'live'` to query the GitHub Project directly. Filter via `kind`, `top` (features), `priority` (bugs).",
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
        // rq-issueChangeLinkage03: read GitHub Project linkage config from
        // the dedicated typed-config file (`.adv/github-project.json`),
        // falling back to legacy `project_metadata['github_project']` raw
        // and migrating forward on first read. The legacy `summary: max(200)`
        // schema rejected long config blobs silently — readGitHubProjectConfig
        // bypasses that constraint by reading the legacy file raw and
        // validating against GitHubProjectConfigSchema directly.
        const config = await readGitHubProjectConfig(
          store.paths.root,
          store.paths.external,
        );
        if (!config) {
          return formatToolOutput({
            error:
              "github_project config not persisted. Run /adv-triage once to bootstrap the project link.",
            hint: "Config lives at `.adv/github-project.json` (preferred) or legacy `project_metadata['github_project']` (auto-migrated on first read).",
            source,
          });
        }
        const metadata = {
          owner: config.owner,
          number: config.project_number,
          title: config.title,
          repository_filter: config.repository_filter,
        };
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
      const freshness = assessRoadmapFreshness(source, snapshot.generated_at);

      // rq-backlogCoord05 — Cross-reference active changes via a single
      // Temporal Visibility query (O(1) Visibility call) rather than the
      // legacy O(n×m) `buildActiveChangeIndex` (N × store.changes.get).
      // Falls back to the store-loop helper only when Temporal Visibility is
      // unreachable (offline / no service / no project ID).
      const allIssueNumbers = [
        ...snapshot.bugs.map((b) => b.number),
        ...snapshot.features.map((f) => f.number),
      ];
      const activeByIssue = await resolveActiveChangeIndex(
        store,
        allIssueNumbers,
      );
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
      const warnings: string[] = [];
      if (freshness.needs_refresh) {
        warnings.push(
          `Roadmap ${source} snapshot is ${freshness.status}; run /adv-roadmap --live before starting work and /adv-triage to refresh the mirror.`,
        );
      }
      if (
        source === "file" &&
        freshness.needs_refresh &&
        snapshot.counts.bugs > 0 &&
        activeByIssue.size === 0
      ) {
        warnings.push(
          "Snapshot lists bugs but no in-flight changes; recent ATC/archive closures may have made this bug list stale.",
        );
      }

      return formatToolOutput({
        source,
        snapshot_path: snapshotPath,
        generated_at: snapshot.generated_at,
        freshness,
        warnings,
        project: snapshot.project,
        repository_filter: snapshot.repository_filter ?? null,
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
 * rq-backlogCoord05 — Visibility-first active-change resolver.
 *
 * Tries a single Temporal Visibility query first (O(1) regardless of how
 * many active changes exist) using `AdvBacklogIssueNumber IN (...)`. Falls
 * back to the legacy store-loop only when Visibility is unreachable
 * (offline, no Temporal service, no project ID). Failures from EITHER path
 * are non-fatal: callers receive an empty map and the roadmap renders
 * without active-change annotations.
 */
async function resolveActiveChangeIndex(
  store: Store,
  issueNumbers: number[],
): Promise<Map<number, string>> {
  // Empty input short-circuits both paths.
  if (issueNumbers.length === 0) return new Map();

  // Path 1: Visibility-backed lookup.
  try {
    const bundle = getService();
    if (bundle) {
      const projectId = await getProjectId(store.paths.root);
      if (projectId) {
        const client = bundle.client as unknown as Parameters<
          typeof queryActiveChangesByIssueNumbers
        >[0];
        const map = await queryActiveChangesByIssueNumbers(
          client,
          projectId,
          issueNumbers,
        );
        const result = new Map<number, string>();
        for (const [issue, info] of map) {
          result.set(issue, info.changeId);
        }
        return result;
      }
    }
  } catch {
    // Fall through to store-loop fallback.
  }

  // Path 2: Legacy store-loop fallback (slower; works without Temporal).
  return buildActiveChangeIndexFromStore(store);
}

/**
 * Legacy fallback: build a map from GitHub issue number → active change ID
 * by walking the store's active-change list and reading each change's
 * `origin.issue_number`. O(n×m) on number of active changes. Preserved
 * only as fallback when Temporal Visibility is unreachable.
 *
 * Active = status ∈ {draft, pending, active}. Archived/closed changes are
 * intentionally excluded — they don't represent in-flight work.
 *
 * Failures are non-fatal: if the store list call fails, return an empty
 * map and let the caller render the roadmap without active-change
 * annotations. The roadmap surface MUST NOT block on side-channel reads.
 */
async function buildActiveChangeIndexFromStore(
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
