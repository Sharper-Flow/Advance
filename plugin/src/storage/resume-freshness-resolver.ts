/**
 * Resume Freshness resolver — entrypoint + sub-resolvers.
 *
 * Computes a bounded advisory comparing a resumed change against current
 * ADV state + repo state. Emitted at ADV Step 2 Load State when the change's
 * `lastActivityAgeMinutes > 60` (trigger band — C4).
 *
 * Design (D1, D5, D9, D9b): storage-side resolver; pure-formatter stays pure.
 * Reuses `intersectFileLists` (T1) and `execGit` (plugin/src/utils/git.ts).
 *
 * Contract references:
 * - AC1 trigger guard at entrypoint (lastActivityAgeMinutes > 60)
 * - AC2 emits stable codes
 * - AC4 no state mutation
 * - AC7 fallback paths covered
 * - AC8 current-project only (no cross-project fan-out)
 * - AC9 stateless (no dismissal memory)
 * - C2 reuses intersectFileLists + execGit
 * - C3 bounded cost (DDC1 8s budget, DDC2-4 caps)
 * - DONT2 no greenfield
 * - DONT3 no state mutation
 * - DONT4 no dismissal memory
 */

import type { Store } from "./store";
import type { Change } from "../types";
import type { ChangeListResponse } from "../types";
import { execGit } from "../utils/git";
import { intersectFileLists } from "../utils/file-intersection";
import type {
  ResumeFreshnessFinding,
  ResumeFreshnessInput,
  ResumeFreshnessLabel,
  ResumeFreshnessResult,
} from "./resume-freshness";

/** Trigger band (C4): skip advisory entirely when lastActivityAgeMinutes <= 60. */
export const RESUME_FRESHNESS_TRIGGER_MINUTES = 60;

/** Wall-clock budget for the entire resolver (DDC1). */
export const RESUME_FRESHNESS_BUDGET_MS = 8000;

/** Cap on sibling-overlap scan (DDC2). */
export const SIBLING_OVERLAP_SCAN_CAP = 50;

/** Cap on archived-since scan (DDC3). */
export const ARCHIVED_SINCE_SCAN_CAP = 50;

/** Cap on git log commit count for codebase drift (DDC4). */
export const CODEBASE_DRIFT_COMMIT_CAP = 100;

/**
 * Extract the change's capability scope from deltas[capability] keys.
 */
function extractCapabilities(change: Change): string[] {
  const deltas = (change as unknown as { deltas?: Record<string, unknown[]> })
    .deltas;
  if (!deltas || typeof deltas !== "object") return [];
  return Object.keys(deltas);
}

/**
 * Extract the change's touched-file scope from the union of task touched_files.
 */
function extractTouchedFiles(change: Change): string[] {
  const tasks = (
    change as unknown as { tasks?: Array<{ touched_files?: string[] }> }
  ).tasks;
  if (!Array.isArray(tasks)) return [];
  const seen = new Set<string>();
  for (const task of tasks) {
    const files = task?.touched_files;
    if (!Array.isArray(files)) continue;
    for (const f of files) {
      if (typeof f === "string") seen.add(f);
    }
  }
  return [...seen];
}

/**
 * Compute the change's lastActivityAt. Uses the persisted value when present.
 * Falls back to created_at if missing.
 *
 * Kept for callers that need a single timestamp; the sub-resolvers below use
 * the ChangeListResponse's `lastActivityAt` field directly.
 */
function _extractLastActivityAt(change: Change): string {
  const v = (change as unknown as { lastActivityAt?: string }).lastActivityAt;
  if (typeof v === "string" && v.length > 0) return v;
  return change.created_at;
}

/**
 * T2: Resolve active-sibling overlap findings.
 *
 * Scans the current project's active (non-archived, non-closed) changes for
 * capability OR touched-file overlap with the current change. Capped at top
 * 50 most-recent active siblings (DDC2). For each candidate, calls
 * `store.changes.get` to access full deltas/tasks (summary list does not
 * include capability or path fields).
 *
 * Returns 0..N findings, each with `resume:sibling_overlap` code.
 */
export async function resolveSiblingOverlap(
  store: Store,
  changeId: string,
  scope: { capabilities: string[]; touchedFiles: string[] },
): Promise<ResumeFreshnessFinding[]> {
  let response: ChangeListResponse;
  try {
    response = await store.changes.list({});
  } catch {
    return [
      {
        code: "resume:sibling_overlap",
        label: "freshness_limited",
        summary: "sibling overlap scan unavailable",
      },
    ];
  }

  // Filter active, non-self. Sort by lastActivity desc, cap.
  const activeIds = response.changes
    .filter(
      (c) =>
        c.id !== changeId && c.status !== "archived" && c.status !== "closed",
    )
    .sort((a, b) =>
      (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
    )
    .slice(0, SIBLING_OVERLAP_SCAN_CAP)
    .map((c) => c.id);

  const findings: ResumeFreshnessFinding[] = [];
  for (const peerId of activeIds) {
    let peer: Change | null = null;
    try {
      const r = await store.changes.get(peerId);
      if (r.success && r.data) peer = r.data;
    } catch {
      continue;
    }
    if (!peer) continue;

    const peerCaps = extractCapabilities(peer);
    const peerFiles = extractTouchedFiles(peer);
    const sharedCaps = scope.capabilities.filter((c) => peerCaps.includes(c));
    const sharedPaths = intersectFileLists(scope.touchedFiles, peerFiles);

    if (sharedCaps.length === 0 && sharedPaths.length === 0) continue;

    const label: ResumeFreshnessLabel =
      sharedCaps.length > 0 && sharedPaths.length > 0
        ? "repo_backed_fact"
        : "judgment_call";

    findings.push({
      code: "resume:sibling_overlap",
      label,
      summary:
        label === "repo_backed_fact"
          ? `sibling ${peer.id} shares ${sharedCaps.length} capabilities and ${sharedPaths.length} paths`
          : `sibling ${peer.id} may overlap (${sharedCaps.length} capabilities, ${sharedPaths.length} paths)`,
      evidenceChangeIds: [peer.id],
      evidencePaths: sharedPaths.slice(0, 5),
    });
  }

  return findings;
}

/**
 * T3: Resolve archived-since duplicate findings.
 *
 * Scans the current project's archived changes for entries archived after
 * the target change's lastActivityAt. Capped at top 50 most-recent archives
 * (DDC3). Skips fast-follow parent (when target is a child) to avoid
 * self-match. For each candidate, calls `store.changes.get` to access full
 * deltas/tasks.
 *
 * Returns 0..N findings with `resume:archived_duplicate` code.
 * HIGH-confidence (`repo_backed_fact`) requires capability overlap AND
 * ≥3 path overlap.
 */
export async function resolveArchivedSinceDuplicates(
  store: Store,
  changeId: string,
  lastActivityAt: string,
  scope: { capabilities: string[]; touchedFiles: string[] },
): Promise<ResumeFreshnessFinding[]> {
  let response: ChangeListResponse;
  try {
    response = await store.changes.list({
      includeArchived: true,
    } as never);
  } catch {
    return [
      {
        code: "resume:archived_duplicate",
        label: "freshness_limited",
        summary: "archived-since scan unavailable",
      },
    ];
  }

  // Identify fast-follow parent (skip self-match)
  let target: Change | null = null;
  try {
    const result = await store.changes.get(changeId);
    if (result.success && result.data) target = result.data;
  } catch {
    // ignore
  }
  const parentId =
    target &&
    (
      target as unknown as {
        fast_follow_of?: { parent_change_id?: string };
      }
    ).fast_follow_of?.parent_change_id;

  // Filter archived, shipped after lastActivityAt, non-self, non-parent.
  const candidateIds = response.changes
    .filter(
      (c) =>
        c.status === "archived" &&
        c.id !== changeId &&
        c.id !== parentId &&
        (c.lastActivityAt ?? "") > lastActivityAt,
    )
    .sort((a, b) =>
      (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
    )
    .slice(0, ARCHIVED_SINCE_SCAN_CAP)
    .map((c) => c.id);

  const findings: ResumeFreshnessFinding[] = [];
  for (const candidateId of candidateIds) {
    let candidate: Change | null = null;
    try {
      const r = await store.changes.get(candidateId);
      if (r.success && r.data) candidate = r.data;
    } catch {
      continue;
    }
    if (!candidate) continue;

    const candCaps = extractCapabilities(candidate);
    const candFiles = extractTouchedFiles(candidate);
    const sharedCaps = scope.capabilities.filter((c) => candCaps.includes(c));
    const sharedPaths = intersectFileLists(scope.touchedFiles, candFiles);

    if (sharedCaps.length === 0 && sharedPaths.length < 3) continue;

    const label: ResumeFreshnessLabel =
      sharedCaps.length > 0 && sharedPaths.length >= 3
        ? "repo_backed_fact"
        : "judgment_call";

    findings.push({
      code: "resume:archived_duplicate",
      label,
      summary:
        label === "repo_backed_fact"
          ? `archived ${candidate.id} shipped after lastActivity shares ${sharedCaps.length} capabilities and ${sharedPaths.length} paths`
          : `archived ${candidate.id} may overlap (${sharedCaps.length} capabilities, ${sharedPaths.length} paths)`,
      evidenceChangeIds: [candidate.id],
      evidencePaths: sharedPaths.slice(0, 5),
    });
  }

  return findings;
}

/**
 * T4: Resolve codebase drift findings.
 *
 * Runs `git log --since <lastActivityAt> --name-only` against the union of
 * the change's touched_files. Capped at top 100 commits (DDC4). Maps any
 * git failure to a `freshness_limited` finding.
 */
export async function resolveCodebaseDrift(
  workdir: string,
  lastActivityAt: string,
  touchedFiles: string[],
): Promise<ResumeFreshnessFinding[]> {
  if (touchedFiles.length === 0) return [];

  let stdout: string;
  try {
    stdout = await execGit(
      [
        "log",
        `--since=${lastActivityAt}`,
        "--name-only",
        "--pretty=format:",
        `--max-count=${CODEBASE_DRIFT_COMMIT_CAP}`,
      ],
      workdir,
    );
  } catch {
    return [
      {
        code: "resume:codebase_drift",
        label: "freshness_limited",
        summary: "git log unavailable",
      },
    ];
  }

  const committedPaths = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const drifted = intersectFileLists(touchedFiles, committedPaths);
  if (drifted.length === 0) return [];

  // Count unique commits that touched drifted files (approximation: line count
  // in the name-only output that includes one of our drifted files).
  const driftedSet = new Set(drifted);
  let touchEvents = 0;
  for (const line of committedPaths) {
    if (driftedSet.has(line)) touchEvents++;
  }

  const label: ResumeFreshnessLabel =
    touchEvents >= 3 ? "repo_backed_fact" : "judgment_call";

  return [
    {
      code: "resume:codebase_drift",
      label,
      summary: `${touchEvents} commit-touch event(s) since ${lastActivityAt} across ${drifted.length} of your task-referenced files`,
      evidencePaths: drifted.slice(0, 5),
    },
  ];
}

/**
 * T5: Public resolver entrypoint.
 *
 * Trigger guard (AC1): if lastActivityAgeMinutes <= 60, returns `skipped`
 * without invoking any sub-resolver. Formatter stays agnostic (D9).
 *
 * Stateless (AC9, DONT4): no caching, no persisted dismissal memory.
 *
 * No ADV state mutation (AC4, DONT3): read-only.
 *
 * Budget guard (DDC1): 8s wall-clock; on exceed, short-circuits remaining
 * sub-resolvers and appends a `freshness_limited` finding with
 * `budgetExceededMs` set.
 */
export async function resolveResumeFreshness(
  store: Store,
  changeId: string,
  input: ResumeFreshnessInput,
): Promise<ResumeFreshnessResult> {
  // AC1: trigger guard
  if (input.lastActivityAgeMinutes <= RESUME_FRESHNESS_TRIGGER_MINUTES) {
    return { findings: [], skipped: true };
  }

  // Load target change
  let target: Change;
  try {
    const r = await store.changes.get(changeId);
    if (!r.success || !r.data) {
      return {
        findings: [
          {
            code: "resume:freshness_limited",
            label: "freshness_limited",
            summary: "target change unreadable",
          },
        ],
        skipped: false,
      };
    }
    target = r.data;
  } catch {
    return {
      findings: [
        {
          code: "resume:freshness_limited",
          label: "freshness_limited",
          summary: "target change load failed",
        },
      ],
      skipped: false,
    };
  }

  const capabilities = extractCapabilities(target);
  const touchedFiles = extractTouchedFiles(target);
  const scope = { capabilities, touchedFiles };
  const workdir = store.paths.root;

  const findings: ResumeFreshnessFinding[] = [];
  const start = Date.now();
  const deadline = start + RESUME_FRESHNESS_BUDGET_MS;
  let budgetExceededMs: number | undefined;

  const runSubResolver = async (
    name: string,
    fn: () => Promise<ResumeFreshnessFinding[]>,
  ): Promise<void> => {
    if (Date.now() >= deadline) {
      if (budgetExceededMs === undefined) {
        budgetExceededMs = Date.now() - start;
      }
      findings.push({
        code: "resume:freshness_limited",
        label: "freshness_limited",
        summary: `${name} skipped (budget exceeded)`,
      });
      return;
    }
    try {
      const sub = await fn();
      findings.push(...sub);
    } catch {
      findings.push({
        code: "resume:freshness_limited",
        label: "freshness_limited",
        summary: `${name} threw unexpectedly`,
      });
    }
  };

  // Run sub-resolvers in sequence (each respects budget check at start).
  // Sequence chosen: cheap ones first (sibling, archive), expensive (git) last
  // so budget exhaustion still leaves useful findings.
  await runSubResolver("sibling-overlap", () =>
    resolveSiblingOverlap(store, changeId, scope),
  );
  await runSubResolver("archived-since", () =>
    resolveArchivedSinceDuplicates(
      store,
      changeId,
      input.lastActivityAt,
      scope,
    ),
  );
  await runSubResolver("codebase-drift", () =>
    resolveCodebaseDrift(workdir, input.lastActivityAt, touchedFiles),
  );

  return { findings, skipped: false, budgetExceededMs };
}
