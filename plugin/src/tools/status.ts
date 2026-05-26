/**
 * Status Tool
 *
 * Project-wide status overview with manifest-driven recommendations.
 * Uses the workflow manifest to recommend next commands based on
 * gate status of active changes.
 */

import { basename, join } from "path";
import { access, readdir } from "fs/promises";
import type { Store } from "../storage/store";
import { buildProjectTaskQueue } from "../temporal/client";
import { getTemporalHealth } from "../temporal/health-probe";
import {
  getTemporalWorkerAliveness,
  getTemporalWorkerDiagnostics,
  getTemporalWorkerRole,
} from "../plugin-init";
import {
  classifyQueueServiceability,
  probeTaskQueuePollers,
  type QueueServiceability,
} from "../temporal/queue-serviceability";
import { getTemporalFallbackTelemetry } from "../temporal/fallback-telemetry";
import {
  classifyTemporalError,
  getTemporalRetryTelemetry,
} from "../temporal/retry-wrapper";
import {
  getService,
  getStslStats,
  isStslInitialized,
} from "../temporal/service";
import { formatToolOutput } from "../utils/tool-output";
import { formatStatusOutput } from "../utils/tool-formatters";
import { listPeerSessions } from "./session/index";
import {
  createDefaultGates,
  GATE_ORDER,
  isGateSatisfied,
  type GateId,
  type FeatureFlags,
  type ChangeRecency,
  type ProjectStatus,
  withStabilityFeatureDefaults,
} from "../types";
import { getCommandsByGate } from "../manifest";
import {
  buildChangeContextSnapshot,
  buildChangeContextTicker,
} from "../utils/context-snapshot";
import {
  loadProjectConfigWithDiagnostics,
  loadProposalWithFallback,
} from "../storage/json";
import { readProjectMetadata } from "../storage/project-metadata";
import { getWorktreeCensus } from "../utils/worktree-census";
import { getMetrics } from "../utils/metrics";
import { scanOpenCodeSessionDebt } from "../utils/opencode-session-debt";
import { runClarifyReadinessChecks } from "../validator/clarify-readiness";
import { z } from "zod";
import { withOptionalTargetPathStore } from "./target-project";
import { buildExternalDependencyStatus } from "./external-dependency-status";
import { listChangeDirs, loadChange } from "../storage/json";
import { archiveBundleExists } from "../archive/archive";
import {
  getDataHome,
  getWorktreeBase,
  SYNTHETIC_TEST_PROJECT_ID_PREFIX,
} from "../utils/project-id";
import { getPluginRuntimeInfo } from "../utils/plugin-runtime-info";
import { createProbeCache, type ProbeCacheFreshness } from "./probe-cache";
import { scanSnapshotHealth } from "./snapshot-scan";
import { advWorktreeCleanup } from "./worktree";
import {
  getPendingDeletes,
  initStateDb as initWorktreeStateDb,
  summarizePendingDeletes,
  type PendingDeleteSummary,
} from "./worktree/state";

// =============================================================================
// Health Snapshot Cache
// =============================================================================

const HEALTH_SNAPSHOT_TTL_MS = 30000;

interface HealthSnapshot {
  leaked_source_dirs: number;
  leaked_archived_source_dirs: number;
  archive_dirs: number;
  closed_to_active_ratio: number;
}

interface ExternalStateHygieneReport {
  dry_run_only: true;
  deletion_requires_approval: true;
  external_root: string | null;
  nested_adv_dir: boolean;
  stale_db_dir: boolean;
  worker_locks_excluded: true;
  synthetic_project_dirs: number;
  synthetic_worktree_dirs: number;
  empty_worktree_prefix_dirs: string[];
  in_repo_changes: boolean;
  in_repo_archive: boolean;
  recommendations: string[];
}

type TemporalHealthSnapshot = Awaited<ReturnType<typeof getTemporalHealth>>;
type WorktreeCensusSnapshot = Awaited<ReturnType<typeof getWorktreeCensus>>;

interface SearchAttributesSnapshot {
  ok: boolean;
  checkedAt?: number;
  error?: string;
}

interface StatusQueueServiceabilitySnapshot {
  expectedQueue: string;
  serviceability: QueueServiceability;
  workerDiagnostics: ReturnType<typeof getTemporalWorkerDiagnostics>;
}

const healthSnapshotCache = new Map<
  string,
  { snapshot: HealthSnapshot; computedAt: number }
>();

const STATUS_PROBE_TTL_MS = 2_000;
const STATUS_PROBE_TIMEOUT_MS = 2_000;
const MISSING_PROJECT_ID_CACHE_KEY = "__current_project__";

const statusTemporalHealthProbeCache = createProbeCache<
  TemporalHealthSnapshot,
  string
>({
  name: "status.temporal_health",
  ttlMs: STATUS_PROBE_TTL_MS,
  timeoutMs: STATUS_PROBE_TIMEOUT_MS,
  fetch: async (key) =>
    getTemporalHealth(key === MISSING_PROJECT_ID_CACHE_KEY ? undefined : key),
});

const statusWorktreeCensusProbeCache = createProbeCache<
  WorktreeCensusSnapshot,
  string
>({
  name: "status.worktree_census",
  ttlMs: STATUS_PROBE_TTL_MS,
  timeoutMs: STATUS_PROBE_TIMEOUT_MS,
  fetch: async (root) => getWorktreeCensus(root),
});

const statusSearchAttributesProbeCache = createProbeCache<
  SearchAttributesSnapshot,
  string
>({
  name: "status.search_attributes",
  ttlMs: STATUS_PROBE_TTL_MS,
  timeoutMs: STATUS_PROBE_TIMEOUT_MS,
  fetch: async () => computeSearchAttributesSnapshot(),
});

const statusQueueServiceabilityInputs = new Map<
  string,
  { projectId: string | undefined; health: TemporalHealthSnapshot }
>();

type SnapshotHealthSnapshot = Awaited<ReturnType<typeof scanSnapshotHealth>>;

const SNAPSHOT_HEALTH_TTL_MS = 60_000;
const SNAPSHOT_HEALTH_TIMEOUT_MS = 10_000;

const snapshotHealthProbeCache = createProbeCache<
  SnapshotHealthSnapshot,
  string
>({
  name: "status.snapshot_health",
  ttlMs: SNAPSHOT_HEALTH_TTL_MS,
  timeoutMs: SNAPSHOT_HEALTH_TIMEOUT_MS,
  fetch: async (key) =>
    scanSnapshotHealth({
      scope: "project",
      projectId: key === MISSING_PROJECT_ID_CACHE_KEY ? "unknown" : key,
    }),
});

const statusQueueServiceabilityProbeCache = createProbeCache<
  StatusQueueServiceabilitySnapshot | null,
  string
>({
  name: "status.queue_serviceability",
  ttlMs: STATUS_PROBE_TTL_MS,
  timeoutMs: STATUS_PROBE_TIMEOUT_MS,
  fetch: async (key) => {
    const input = statusQueueServiceabilityInputs.get(key);
    if (!input) return null;
    return computeStatusQueueServiceability(input);
  },
});

/** Exported for test isolation only */
export const _statusProbeCaches = {
  clear(): void {
    statusTemporalHealthProbeCache.clear();
    statusWorktreeCensusProbeCache.clear();
    statusSearchAttributesProbeCache.clear();
    statusQueueServiceabilityProbeCache.clear();
    snapshotHealthProbeCache.clear();
    statusQueueServiceabilityInputs.clear();
  },
};

async function fetchStatusSnapshotHealth(
  projectId: string | undefined,
): Promise<{
  value: SnapshotHealthSnapshot;
  freshness: ProbeCacheFreshness;
}> {
  return snapshotHealthProbeCache.fetch(
    projectId ?? MISSING_PROJECT_ID_CACHE_KEY,
  );
}

/** Exported for test isolation only */
export const _healthSnapshotCache = healthSnapshotCache;

function computeSearchAttributesSnapshot(): SearchAttributesSnapshot {
  const stslStats = getStslStats();
  const stslReady = isStslInitialized();
  if (!stslReady) {
    return {
      ok: false,
      error: "STSL not initialized",
    };
  }
  if (stslStats.saVerification) {
    return {
      ok: stslStats.saVerification.ok,
      checkedAt: stslStats.saVerification.checkedAt,
    };
  }
  return { ok: false, error: "Not yet verified" };
}

async function fetchStatusTemporalHealth(
  projectId: string | undefined,
): Promise<{
  value: TemporalHealthSnapshot;
  freshness: ProbeCacheFreshness;
}> {
  return statusTemporalHealthProbeCache.fetch(
    projectId ?? MISSING_PROJECT_ID_CACHE_KEY,
  );
}

async function fetchStatusQueueServiceability(input: {
  projectId: string | undefined;
  health: TemporalHealthSnapshot;
}): Promise<{
  value: StatusQueueServiceabilitySnapshot | null;
  freshness: ProbeCacheFreshness;
}> {
  const key = input.projectId ?? MISSING_PROJECT_ID_CACHE_KEY;
  statusQueueServiceabilityInputs.set(key, input);
  return statusQueueServiceabilityProbeCache.fetch(key);
}

async function computeHealthSnapshot(store: Store): Promise<HealthSnapshot> {
  const cacheKey = store.paths.external
    ? basename(store.paths.external)
    : store.paths.root;

  const cached = healthSnapshotCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.computedAt < HEALTH_SNAPSHOT_TTL_MS) {
    return cached.snapshot;
  }

  const changesDir = store.paths.changes;
  const archiveDir = store.paths.archive;

  const [changeIds, archiveIds] = await Promise.all([
    listChangeDirs(changesDir),
    listChangeDirs(archiveDir),
  ]);

  let leakedSourceDirs = 0;
  let leakedArchivedSourceDirs = 0;
  let closedCount = 0;
  let activeCount = 0;

  await Promise.all(
    changeIds.map(async (id) => {
      const result = await loadChange(changesDir, id);
      if (!result.success || !result.data) return;

      const status = result.data.status;
      if (status === "closed") {
        closedCount++;
        const hasArchive = await archiveBundleExists(archiveDir, id);
        if (!hasArchive) {
          leakedSourceDirs++;
        }
      } else if (status === "archived") {
        leakedArchivedSourceDirs++;
      } else if (status === "active") {
        activeCount++;
      }
    }),
  );

  const snapshot: HealthSnapshot = {
    leaked_source_dirs: leakedSourceDirs,
    leaked_archived_source_dirs: leakedArchivedSourceDirs,
    archive_dirs: archiveIds.length,
    closed_to_active_ratio:
      Math.round((closedCount / Math.max(activeCount, 1)) * 100) / 100,
  };

  healthSnapshotCache.set(cacheKey, { snapshot, computedAt: now });
  return snapshot;
}

function statusDiagnosticsIncludeQueue(
  diagnostics: ReturnType<typeof getTemporalWorkerDiagnostics>,
  expectedQueue: string,
): boolean {
  return diagnostics.some((worker) => {
    const failed = new Set(worker.failedQueues);
    return worker.queues.some(
      (queue) => queue === expectedQueue && !failed.has(queue),
    );
  });
}

function statusDiagnosticsShowAliveQueue(
  diagnostics: ReturnType<typeof getTemporalWorkerDiagnostics>,
  expectedQueue: string,
): boolean {
  return diagnostics.some((worker) => {
    const failed = new Set(worker.failedQueues);
    return (
      worker.alive &&
      worker.queues.some(
        (queue) => queue === expectedQueue && !failed.has(queue),
      )
    );
  });
}

function statusLocalOwnership(
  health: TemporalHealthSnapshot,
): "owned" | "peer" | "unknown" {
  if (!health.worker_lock) return "unknown";
  return health.worker_lock.holder_pid === process.pid ? "owned" : "peer";
}

async function computeStatusQueueServiceability(input: {
  projectId: string | undefined;
  health: TemporalHealthSnapshot;
}): Promise<StatusQueueServiceabilitySnapshot | null> {
  if (!input.projectId) return null;
  const expectedQueue = buildProjectTaskQueue(input.projectId);
  const workerDiagnostics = getTemporalWorkerDiagnostics();
  const bundle = getService();
  const serverPollerProbe = bundle
    ? await probeTaskQueuePollers({
        connection: bundle.connection as unknown as Parameters<
          typeof probeTaskQueuePollers
        >[0]["connection"],
        namespace: bundle.namespace,
        taskQueue: expectedQueue,
      })
    : {
        status: "unavailable" as const,
        lastAccessMs: null,
        error: "Temporal service layer not initialized",
      };
  const staleRunningWorkflowCount = input.health.stale_queues
    .filter((queue) => queue.queue === expectedQueue)
    .reduce((total, queue) => total + queue.running_count, 0);
  const localRegistered =
    input.health.registered_queues.includes(expectedQueue) ||
    statusDiagnosticsIncludeQueue(workerDiagnostics, expectedQueue);
  const localWorkerAlive =
    getTemporalWorkerAliveness() ||
    statusDiagnosticsShowAliveQueue(workerDiagnostics, expectedQueue);

  return {
    expectedQueue,
    workerDiagnostics,
    serviceability: classifyQueueServiceability({
      projectId: input.projectId,
      expectedQueue,
      localRegistered,
      localWorkerAlive,
      localOwnership: statusLocalOwnership(input.health),
      workerDiagnostics,
      serverPollerProbe,
      staleRunningWorkflowCount,
      staleQueueProbe: input.health.server_alive ? "ok" : "unavailable",
    }),
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function listSubdirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function isEmptyDir(path: string): Promise<boolean> {
  try {
    const entries = await readdir(path);
    return entries.length === 0;
  } catch {
    return false;
  }
}

async function computeExternalStateHygiene(
  store: Store,
): Promise<ExternalStateHygieneReport> {
  const externalRoot = store.paths.external;
  const dataHome = getDataHome();
  const projectId = externalRoot ? basename(externalRoot) : null;
  const recommendations: string[] = [];

  const nestedAdvDir = externalRoot
    ? await pathExists(join(externalRoot, ".adv"))
    : false;
  const staleDbDir = externalRoot
    ? await pathExists(join(externalRoot, "db"))
    : false;

  const syntheticProjectDirs = (
    await listSubdirs(join(dataHome, "opencode", "plugins", "advance"))
  ).filter((dir) => dir.startsWith(SYNTHETIC_TEST_PROJECT_ID_PREFIX)).length;
  const syntheticWorktreeDirs = (
    await listSubdirs(join(dataHome, "opencode", "worktree"))
  ).filter((dir) => dir.startsWith(SYNTHETIC_TEST_PROJECT_ID_PREFIX)).length;

  const emptyWorktreePrefixDirs: string[] = [];
  if (projectId) {
    const worktreeBase = getWorktreeBase(projectId);
    const prefixDirs = await listSubdirs(worktreeBase);
    for (const prefix of prefixDirs) {
      const fullPath = join(worktreeBase, prefix);
      if (await isEmptyDir(fullPath)) emptyWorktreePrefixDirs.push(fullPath);
    }
  }

  // In-repo .adv/archive/ is valid (addagentmeshandinrepoarchive policy).
  // Only flag .adv/changes/ as a recommendation if present — pre-Temporal
  // migrations may have left stale data there, but the dir itself is the
  // configured changes_dir and expected to exist.
  const repoRoot = store.paths.root;
  const inRepoChanges = repoRoot
    ? await pathExists(join(repoRoot, ".adv", "changes"))
    : false;
  // .adv/archive/ is intentional in-repo state; skip legacy flagging.
  const inRepoArchive = false;

  // rq-hygieneActionableCommands01 (#122): emit concrete shell commands the
  // operator can copy-paste rather than prose "dry-run: X detected". Each
  // recommendation is prefixed with `dry-run:` to preserve the historical
  // grep pattern, then followed by the exact command(s) on subsequent lines.
  // Operator inspects, then runs.
  if (nestedAdvDir && externalRoot) {
    recommendations.push(
      `dry-run: nested external .adv/ detected at ${externalRoot}/.adv\n` +
        `  Inspect: ls -la "${externalRoot}/.adv"\n` +
        `  Backup:  tar -czf /tmp/adv-nested-backup-$(date +%s).tar.gz -C "${externalRoot}" .adv\n` +
        `  Remove:  rm -rf "${externalRoot}/.adv"`,
    );
  }
  if (staleDbDir && externalRoot) {
    recommendations.push(
      `dry-run: stale physical db/ detected at ${externalRoot}/db (legacy pre-Temporal SQLite)\n` +
        `  Inspect: du -sh "${externalRoot}/db" && ls "${externalRoot}/db"\n` +
        `  Backup:  tar -czf /tmp/adv-legacy-db-$(date +%s).tar.gz -C "${externalRoot}" db\n` +
        `  Remove:  rm -rf "${externalRoot}/db"`,
    );
  }
  if (emptyWorktreePrefixDirs.length > 0) {
    const list = emptyWorktreePrefixDirs.map((p) => `"${p}"`).join(" ");
    recommendations.push(
      `dry-run: ${emptyWorktreePrefixDirs.length} empty worktree branch-prefix dir(s) detected\n` +
        `  Inspect: ls -la ${list}\n` +
        `  Remove:  rmdir ${list}  # rmdir refuses non-empty; safe`,
    );
  }
  if (syntheticProjectDirs > 0 || syntheticWorktreeDirs > 0) {
    const dataHome = getDataHome();
    const projectsGlob = `"${join(dataHome, "opencode", "plugins", "advance")}/${SYNTHETIC_TEST_PROJECT_ID_PREFIX}*"`;
    const worktreesGlob = `"${join(dataHome, "opencode", "worktree")}/${SYNTHETIC_TEST_PROJECT_ID_PREFIX}*"`;
    recommendations.push(
      `dry-run: ${syntheticProjectDirs} synthetic test project dir(s) + ${syntheticWorktreeDirs} synthetic worktree dir(s) detected (prefix ${SYNTHETIC_TEST_PROJECT_ID_PREFIX})\n` +
        `  Inspect: ls -d ${projectsGlob} ${worktreesGlob}\n` +
        `  Backup:  tar -czf /tmp/adv-synthetic-backup-$(date +%s).tar.gz ${projectsGlob} ${worktreesGlob} 2>/dev/null\n` +
        `  Remove:  rm -rf ${projectsGlob} ${worktreesGlob}`,
    );
  }
  if (inRepoChanges && repoRoot) {
    recommendations.push(
      `dry-run: in-repo .adv/changes/ detected at ${repoRoot}/.adv/changes\n` +
        `  This may be pre-Temporal data. Specs (.adv/specs/) are always in-repo and OK.\n` +
        `  Inspect: ls -la "${repoRoot}/.adv/changes"\n` +
        `  Backup:  tar -czf /tmp/adv-repo-changes-backup-$(date +%s).tar.gz -C "${repoRoot}/.adv" changes\n` +
        `  Remove:  rm -rf "${repoRoot}/.adv/changes"  # after confirming specs are preserved`,
    );
  }

  return {
    dry_run_only: true,
    deletion_requires_approval: true,
    external_root: externalRoot,
    nested_adv_dir: nestedAdvDir,
    stale_db_dir: staleDbDir,
    worker_locks_excluded: true,
    synthetic_project_dirs: syntheticProjectDirs,
    synthetic_worktree_dirs: syntheticWorktreeDirs,
    empty_worktree_prefix_dirs: emptyWorktreePrefixDirs.sort((a, b) =>
      a.localeCompare(b),
    ),
    in_repo_changes: inRepoChanges,
    in_repo_archive: inRepoArchive,
    recommendations,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Map a gate ID to a recommended slash command string.
 * Uses the manifest to find commands that trigger the given gate.
 * Falls back to a sensible default if no manifest entry exists.
 */
function getRecommendationForGate(
  gateId: GateId,
  changeId: string,
  parentContext?: string,
): string | null {
  const cmds = getCommandsByGate(gateId);
  if (cmds.length === 0) {
    return null;
  }

  // Pick the first (primary) command for this gate
  const cmd = cmds[0];
  const label = parentContext
    ? `Change \`${changeId}\` (fast-follow of \`${parentContext}\`)`
    : `Change \`${changeId}\``;
  return `${label}: next gate is \`${gateId}\` → run \`/${cmd.name} ${changeId}\``;
}

async function getFastFollowParentContext(
  store: Store,
  parentChangeId: string,
): Promise<string> {
  const parent = await store.changes.get(parentChangeId);
  if (parent.success && parent.data) {
    const terminal =
      parent.data.status === "archived" || parent.data.status === "closed";
    return terminal
      ? `${parentChangeId} (${parent.data.status})`
      : parentChangeId;
  }
  return parentChangeId;
}

async function enrichRecentChangeStatus(
  rc: ChangeRecency,
  status: { recommendations: string[] },
  store: Store,
  clarifyMode: string,
  isPrimary: boolean,
): Promise<void> {
  const changeId = String(rc.id);
  const changeResult = await store.changes.get(changeId);
  if (!changeResult.success || !changeResult.data) return;

  const gates = changeResult.data.gates ?? createDefaultGates();
  const changeDir = join(store.paths.changes, changeId);
  const { content: proposalText } = await loadProposalWithFallback(
    changeDir,
    changeResult.data.title,
  );

  const snapshotInput = {
    change: changeResult.data,
    proposalText,
    gates: gates ?? undefined,
    workdir: store.paths.root,
  };

  Object.assign(rc, {
    parent_change_id: changeResult.data.fast_follow_of?.parent_change_id,
    _contextSnapshot: isPrimary
      ? buildChangeContextSnapshot(snapshotInput)
      : buildChangeContextTicker(snapshotInput),
  });

  const dependencyStatus = await buildExternalDependencyStatus(
    changeResult.data.external_dependencies,
  );
  if (dependencyStatus) {
    (rc as unknown as Record<string, unknown>)._externalDependencyStatus =
      dependencyStatus.summary;
  }

  const nextGate = GATE_ORDER.find((gateId) => !isGateSatisfied(gates[gateId]));
  if (nextGate) {
    const parentContext = changeResult.data.fast_follow_of
      ? await getFastFollowParentContext(
          store,
          changeResult.data.fast_follow_of.parent_change_id,
        )
      : undefined;
    const rec = getRecommendationForGate(
      nextGate as GateId,
      changeId,
      parentContext,
    );
    if (rec) status.recommendations.push(rec);
  }

  appendClarifyRecommendation(
    status.recommendations,
    clarifyMode,
    changeResult.data,
    proposalText,
    changeId,
  );
  appendRecencyRecommendation(status.recommendations, rc, changeId);
}

function appendClarifyRecommendation(
  recommendations: string[],
  clarifyMode: string,
  change: Parameters<typeof runClarifyReadinessChecks>[0],
  proposalText: string,
  changeId?: string,
): void {
  const resolvedChangeId = changeId ?? change.id;
  if (clarifyMode === "off") return;

  // Suppress clarify recommendations once every gate is satisfied — the change
  // is archive-eligible (or already archived) and ambiguity findings are no
  // longer actionable. See GH issue #14.
  const gates = change.gates;
  if (gates && GATE_ORDER.every((g) => isGateSatisfied(gates[g]))) return;

  const clarifyResult = runClarifyReadinessChecks(change, proposalText);
  if (clarifyResult.findings.length === 0) return;

  recommendations.push(
    `⚠️ Change \`${resolvedChangeId}\` has ${clarifyResult.findings.length} ambiguity finding(s) — run \`/adv-clarify ${resolvedChangeId}\` to resolve`,
  );
}

function appendRecencyRecommendation(
  recommendations: string[],
  rc: ChangeRecency & { workerSessionId?: string },
  changeId: string,
  currentSessionId?: string,
): void {
  const minutesSinceActivity = Number(rc.minutesSinceActivity ?? 0);
  if (minutesSinceActivity >= 180) {
    const hours = Math.floor(minutesSinceActivity / 60);
    const label =
      hours >= 24 ? `${Math.floor(hours / 24)}d ago` : `${hours}h ago`;
    recommendations.push(
      `⏰ Stale change \`${changeId}\` (last activity ${label}, ${rc.completedTasks}/${rc.taskCount} tasks done) — resume with \`/adv-apply ${changeId}\``,
    );
    return;
  }

  if (minutesSinceActivity <= 60) {
    const isSelfOwned =
      Boolean(currentSessionId) && rc.workerSessionId === currentSessionId;
    recommendations.push(
      isSelfOwned
        ? `🔥 Change \`${changeId}\` is hot (active ${minutesSinceActivity}m ago) — you are the active worker`
        : `🔥 Change \`${changeId}\` is hot (active ${minutesSinceActivity}m ago) — likely in-flight by another agent`,
    );
  }
}

export const _test = {
  appendRecencyRecommendation,
};

async function filterRecentChangesForProductScope(
  recentChanges: ChangeRecency[],
  store: Store,
  scope: "repo" | "product" | undefined,
): Promise<ChangeRecency[]> {
  const productContext = store.productContext;
  if (!productContext || productContext.mode === "single_repo") {
    return recentChanges;
  }
  if (scope === "product") return recentChanges;

  const scoped: ChangeRecency[] = [];
  for (const change of recentChanges) {
    const full = await store.changes.get(String(change.id));
    if (!full.success || !full.data?.scope_repos?.length) {
      scoped.push(change);
      continue;
    }
    if (
      full.data.scope_repos.some(
        (repo) => repo.repo_id === productContext.currentRepoId,
      )
    ) {
      scoped.push(change);
    }
  }
  return scoped;
}

function buildProductContextOutput(
  store: Store,
  scope: "repo" | "product" | undefined,
): Record<string, unknown> | undefined {
  const context = store.productContext;
  if (!context || context.mode === "single_repo") return undefined;
  return {
    productId: context.productId,
    productProjectId: context.productProjectId,
    currentRepoId: context.currentRepoId,
    repoProjectId: context.repoProjectId,
    primaryRepoId: context.primaryRepoId,
    mode: context.mode,
    scope: scope ?? "repo",
    ...(context.degraded !== undefined && { degraded: context.degraded }),
    ...(context.readOnly !== undefined && { readOnly: context.readOnly }),
    ...(context.warning !== undefined && { warning: context.warning }),
  };
}

async function loadMigrationStatus(_store: Store) {
  // Migration ledger retired with projectWorkflow.
  return null;
}

const STATUS_BOOTSTRAP_RETRY_DELAY_MS = 50;
const STATUS_BOOTSTRAP_MAX_ATTEMPTS = 3;

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadStatusWithBootstrapRetry(store: Store): Promise<{
  status: ProjectStatus;
  bootstrapDiagnostic?: {
    recovered: boolean;
    lastErrorClass: "bootstrap_in_progress";
    error: string;
  };
}> {
  let lastBootstrapError: unknown;

  for (let attempt = 1; attempt <= STATUS_BOOTSTRAP_MAX_ATTEMPTS; attempt++) {
    try {
      const status = await store.status();
      return lastBootstrapError
        ? {
            status,
            bootstrapDiagnostic: {
              recovered: true,
              lastErrorClass: "bootstrap_in_progress",
              error:
                lastBootstrapError instanceof Error
                  ? lastBootstrapError.message
                  : String(lastBootstrapError),
            },
          }
        : { status };
    } catch (error) {
      if (classifyTemporalError(error) !== "fallback") throw error;
      lastBootstrapError = error;
      if (attempt < STATUS_BOOTSTRAP_MAX_ATTEMPTS) {
        await delay(STATUS_BOOTSTRAP_RETRY_DELAY_MS);
      }
    }
  }

  const error =
    lastBootstrapError instanceof Error
      ? lastBootstrapError.message
      : String(lastBootstrapError);
  return {
    status: {
      specs: { count: 0, capabilities: [] },
      changes: {
        active: 0,
        byStatus: {
          draft: 0,
          pending: 0,
          active: 0,
          archived: 0,
          closed: 0,
        },
        recent: [],
      },
      recommendations: [
        "⚠️ Temporal bootstrap in progress — status read hit replay recovery errors repeatedly; retry shortly.",
      ],
    },
    bootstrapDiagnostic: {
      recovered: false,
      lastErrorClass: "bootstrap_in_progress",
      error,
    },
  };
}

// =============================================================================
// View Filter
// =============================================================================

/** Status output view selector type — exported for shared typing.
 *  rq-advStatusView01. */
export type AdvStatusView = "summary" | "health" | "changes" | "hygiene";

/**
 * Apply the view filter to the full status output.
 *
 * The full output is built unconditionally (the cost of computing it is
 * dominated by the tool's underlying queries, not by serialization). The
 * filter scopes the response shape per `view`. `formatted` is preserved
 * across all views since it is the human-readable summary block.
 *
 * Field selection per design spec:
 *   - summary  (default): specs count + recent changes (id+title+recency
 *                         only) + recommendations + temporal_health.ok
 *                         (boolean) + worktree count + formatted.
 *   - health             : full temporal_health + search_attributes +
 *                         opencode_session_debt + diagnostics + metrics
 *                         counters (placeholder until AC6 lands).
 *   - changes            : full status.changes detail (recent + byStatus).
 *   - hygiene            : recommendations full + opencode_session_debt
 *                         detail + project_metadata + _healthSnapshot
 *                         (closed-vs-active leak signals).
 */
export function applyStatusView(
  full: Record<string, unknown>,
  view: AdvStatusView,
): Record<string, unknown> {
  const projection: Record<string, unknown> = {
    formatted: full.formatted,
    ...(full._projectContext ? { _projectContext: full._projectContext } : {}),
    ...(full.product_context ? { product_context: full.product_context } : {}),
    view,
  };

  const changesObj = full.changes as
    | {
        recent?: Array<{
          id: string;
          title: string;
          recency?: unknown;
          minutesSinceActivity?: number;
        }>;
        byStatus?: Record<string, number>;
      }
    | undefined;
  const temporalHealth = full.temporal_health as
    | { server_alive?: boolean }
    | undefined;
  const worktreeCensus = full.worktree_census as { total?: number } | undefined;
  const specs = full.specs as { count?: number } | undefined;

  switch (view) {
    case "summary": {
      projection.specs = { count: specs?.count };
      projection.changes = {
        recent: (changesObj?.recent ?? []).map((c) => ({
          id: c.id,
          title: c.title,
          recency: c.recency,
          minutesSinceActivity: c.minutesSinceActivity,
        })),
      };
      projection.recommendations = full.recommendations ?? [];
      projection.temporal_health_ok = !!temporalHealth?.server_alive;
      projection.worktree_count = worktreeCensus?.total ?? 0;
      projection.terminal_cleanup_retained = full.terminal_cleanup_retained;
      if (full.bootstrap_retry) {
        projection.diagnostics = full.diagnostics;
        projection.bootstrap_retry = full.bootstrap_retry;
      }
      break;
    }
    case "health": {
      projection.temporal_health = full.temporal_health;
      projection._freshness = full._freshness;
      projection.expected_queue = full.expected_queue;
      projection.temporal_queue_serviceability =
        full.temporal_queue_serviceability;
      projection.worker_diagnostics = full.worker_diagnostics;
      projection.worker_role = full.worker_role;
      projection.feature_flags = full.feature_flags;
      // rq-autoManageAdvWorktrees AC2 — surface resolved-flag source +
      // auto-managed change census in health view so operators can audit
      // the worktree_guard_enforce posture and migration progress.
      projection.feature_flag_sources = full.feature_flag_sources;
      projection.auto_managed_changes = full.auto_managed_changes;
      projection.search_attributes = full.search_attributes;
      projection.opencode_session_debt = full.opencode_session_debt;
      projection.diagnostics = full.diagnostics;
      // migration_status is a diagnostic field — surface here in addition
      // to hygiene view so operators see migration health alongside
      // temporal/STSL diagnostics.
      projection.migration_status = full.migration_status;
      // Recommendations array is small and useful for next-step routing
      // even when callers ask for the diagnostic view.
      projection.recommendations = full.recommendations ?? [];
      // Metrics counters (AC6).
      if (full.metrics) projection.metrics = full.metrics;
      projection.plugin_runtime = full.plugin_runtime;
      projection.snapshot_health = full.snapshot_health;
      projection.terminal_cleanup_retained = full.terminal_cleanup_retained;
      break;
    }
    case "changes": {
      projection.changes = full.changes;
      projection.recommendations = full.recommendations ?? [];
      break;
    }
    case "hygiene": {
      projection.recommendations = full.recommendations ?? [];
      projection.opencode_session_debt = full.opencode_session_debt;
      projection.project_metadata = full.project_metadata;
      projection._healthSnapshot = full._healthSnapshot;
      projection.external_state_hygiene = full.external_state_hygiene;
      projection.migration_status = full.migration_status;
      projection.snapshot_health = full.snapshot_health;
      projection.terminal_cleanup_retained = full.terminal_cleanup_retained;
      break;
    }
  }

  return projection;
}

// =============================================================================
// Tool Definitions
// =============================================================================

// rq-advcfg01: Status Config Diagnostics and Feature Flags
//
// rq-advStatusView01 — adv_status accepts an optional view selector that
// scopes the response to one of four lenses (summary / health / changes /
// hygiene). The default "summary" view omits the hygiene-archaeology fields
// that bloat the response when callers only need orientation.
export const statusTools = {
  adv_status: {
    description:
      "Show project overview: specs, active changes, and next-step recommendations. " +
      "Use the optional `view` selector to scope the response: " +
      "`summary` (default) returns lightweight orientation; " +
      "`health` returns full Temporal/STSL/session-debt diagnostics + metrics; " +
      "`changes` returns full active-change detail; " +
      "`hygiene` returns leak detection + recommendations + project metadata.",
    args: {
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, reads that project as a disk snapshot and returns _projectContext.",
        ),
      view: z
        .enum(["summary", "health", "changes", "hygiene"])
        .optional()
        .default("summary")
        .describe(
          "Output view selector. `summary` (default) omits hygiene archaeology and full diagnostics; " +
            "`health` surfaces Temporal/STSL/session-debt detail + metrics counters; " +
            "`changes` returns the full recent-change list; " +
            "`hygiene` surfaces archived/closed leaks + recommendations + project metadata.",
        ),
      scope: z
        .enum(["repo", "product"])
        .optional()
        .default("repo")
        .describe(
          "Product-linked visibility scope. `repo` (default) shows changes scoped to the current repo; `product` shows all product changes.",
        ),
    },
    execute: async (
      {
        target_path,
        view = "summary",
        scope = "repo",
      }: {
        target_path?: string;
        view?: "summary" | "health" | "changes" | "hygiene";
        scope?: "repo" | "product";
      },
      store: Store,
    ) => {
      return withOptionalTargetPathStore(
        { store, target_path },
        async (activeStore, projectContext) => {
          const { status, bootstrapDiagnostic } =
            await loadStatusWithBootstrapRetry(activeStore);
          const migrationStatus = await loadMigrationStatus(activeStore);

          const projectId = activeStore.paths.external
            ? basename(activeStore.paths.external)
            : undefined;

          const probeFreshness: Record<string, ProbeCacheFreshness> = {};
          let temporalHealth: TemporalHealthSnapshot;
          try {
            const temporalProbe = await fetchStatusTemporalHealth(projectId);
            temporalHealth = temporalProbe.value;
            probeFreshness.temporal_health = temporalProbe.freshness;
          } catch (err) {
            temporalHealth = {
              server_alive: false,
              worker_alive: false,
              worker_process_alive: false,
              registered_queues: [],
              last_op_at: null,
              last_error: err instanceof Error ? err.message : String(err),
              fallback_counts: { ...getTemporalFallbackTelemetry() },
              stale_queues: [],
              reconnect_count: 0,
              op_counters: [],
              worker_lock: null,
              last_worker_run_error: null,
            };
            probeFreshness.temporal_health = {
              cached_at: new Date().toISOString(),
              stale: true,
              error: err instanceof Error ? err.message : String(err),
            };
          }

          const queueServiceabilityProbe = await fetchStatusQueueServiceability(
            {
              projectId,
              health: temporalHealth,
            },
          );
          const queueServiceability = queueServiceabilityProbe.value;
          probeFreshness.queue_serviceability =
            queueServiceabilityProbe.freshness;

          if (temporalHealth.stale_queues.length > 0) {
            const serviceableQueue =
              queueServiceability?.serviceability.status === "serviceable"
                ? queueServiceability.expectedQueue
                : null;
            for (const sq of temporalHealth.stale_queues) {
              if (sq.queue === serviceableQueue) continue;
              status.recommendations.push(
                `⚠️ Stale Temporal queue \`${sq.queue}\` has ${sq.running_count} Running workflows older than 5 min with no local poller. See docs/temporal-recovery.md § "Stale \`adv/change/*\` and \`adv/project/*\` workflows".`,
              );
            }
          }

          if (
            queueServiceability?.serviceability.status !== "serviceable" &&
            temporalHealth.worker_lock?.schema_version === 1
          ) {
            status.recommendations.push(
              "⚠️ Suspect live legacy v1 worker.lock with unproven queue serviceability — explicit approval is required for reclaim, or restart the owning OpenCode session.",
            );
          }

          // Search attributes health from STSL cache
          const searchAttributesProbe =
            await statusSearchAttributesProbeCache.fetch(
              projectId ?? MISSING_PROJECT_ID_CACHE_KEY,
            );
          const searchAttributes = searchAttributesProbe.value;
          probeFreshness.search_attributes = searchAttributesProbe.freshness;

          if (!searchAttributes.ok) {
            status.recommendations.push(
              "⚠️ Temporal search attributes not verified — " +
                "run `adv_temporal_register_search_attributes` to register missing search attributes.",
            );
          }

          // Load project config with diagnostics — surface errors instead of silently ignoring
          const configResult = await loadProjectConfigWithDiagnostics(
            activeStore.paths.root,
          );
          let featureFlags: Record<string, unknown> =
            withStabilityFeatureDefaults(undefined);
          let rawFeatures: Record<string, unknown> | undefined;

          // Warn when external state is unavailable — worktree sharing and
          // state isolation won't function.  This happens when the plugin
          // directory is not inside a git repo and no project.path fallback
          // was available (e.g. GUI clients starting from $HOME).
          if (!activeStore.paths.external) {
            status.recommendations.unshift(
              "⚠️  Running without external state — ADV state is stored in-repo (.adv/). " +
                "Worktree sharing and state isolation are unavailable. " +
                "Ensure OpenCode is started from a git repository.",
            );
          }

          if (!configResult.success) {
            // Prepend config error/warning to recommendations so it's visible
            const prefix =
              configResult.type === "not_found"
                ? "⚠️  Config warning"
                : "❌ Config error";
            status.recommendations.unshift(`${prefix}: ${configResult.error}`);
          } else {
            // Expose feature flags in status output for visibility
            rawFeatures = configResult.data.features as
              | Record<string, unknown>
              | undefined;
            featureFlags = withStabilityFeatureDefaults(rawFeatures);
          }

          // rq-autoManageAdvWorktrees AC2 — surface the source (default vs
          // explicit) of each resolved flag so the agent can audit whether a
          // given value was inherited or set in project.json. Computed
          // regardless of config-load success so the census is always
          // present even when project.json is missing/invalid.
          const featureFlagSources: Record<string, "default" | "explicit"> = {};
          for (const key of Object.keys(featureFlags)) {
            featureFlagSources[key] =
              rawFeatures && typeof rawFeatures[key] !== "undefined"
                ? "explicit"
                : "default";
          }

          // rq-autoManageAdvWorktrees AC2 — auto-managed change census from
          // the in-flight changes list. New changes (post-A3) get marker
          // true; legacy changes get false via lazy migration (A4). The
          // counts help operators see migration progress without scanning
          // every change.json by hand.
          const recentForCensus = status.changes.recent ?? [];
          const autoManagedCensus = {
            auto: 0,
            legacy: 0,
            unmigrated: 0,
          };
          for (const c of recentForCensus) {
            const marker = (c as { worktree_auto_managed?: boolean })
              .worktree_auto_managed;
            if (marker === true) autoManagedCensus.auto += 1;
            else if (marker === false) autoManagedCensus.legacy += 1;
            else autoManagedCensus.unmigrated += 1;
          }

          // Single-pass over recent changes: context snapshot, gate recommendation,
          // clarify readiness, and recency labels — all built in one traversal.
          // First active/draft/pending change gets full-box snapshot; others get ticker.
          const recentChanges = await filterRecentChangesForProductScope(
            status.changes.recent ?? [],
            activeStore,
            scope,
          );
          status.changes.recent = recentChanges;
          const features = activeStore.config?.features as
            | FeatureFlags
            | undefined;
          const clarifyMode = features?.clarify_enforcement ?? "advisory";

          let primaryAssigned = false;
          for (const rc of recentChanges) {
            const isPrimary =
              !primaryAssigned &&
              (rc.status === "active" ||
                rc.status === "draft" ||
                rc.status === "pending");
            if (isPrimary) primaryAssigned = true;
            await enrichRecentChangeStatus(
              rc,
              status,
              activeStore,
              clarifyMode,
              isPrimary,
            );
          }

          // Worktree census
          let terminalCleanupRetained: PendingDeleteSummary = {
            total: 0,
            classes: {},
          };
          try {
            const worktreeAccess = await initWorktreeStateDb(
              activeStore.paths.root,
            );
            await advWorktreeCleanup("status", {
              projectRoot: activeStore.paths.root,
              database: worktreeAccess,
              log: {
                debug: () => undefined,
                info: () => undefined,
                warn: () => undefined,
                error: () => undefined,
              },
              store: activeStore,
              forceAttempts: false,
            });
            terminalCleanupRetained = summarizePendingDeletes(
              await getPendingDeletes(worktreeAccess),
            );
          } catch {
            // Status cleanup discovery is best-effort; status itself must remain available.
          }

          const worktreeCensusProbe =
            await statusWorktreeCensusProbeCache.fetch(activeStore.paths.root);
          const worktreeCensus = worktreeCensusProbe.value;
          probeFreshness.worktree_census = worktreeCensusProbe.freshness;

          const opencodeSessionDebt = await scanOpenCodeSessionDebt();
          const opencodeDebtCounts = opencodeSessionDebt.available
            ? {
                orphanGhost:
                  (opencodeSessionDebt.total_orphan_ghost as
                    | number
                    | undefined) ?? opencodeSessionDebt.orphan_ghost.length,
                liveInFlight:
                  (opencodeSessionDebt.total_live_in_flight as
                    | number
                    | undefined) ?? opencodeSessionDebt.live_in_flight.length,
                idleActiveSession:
                  (opencodeSessionDebt.total_idle_active_session as
                    | number
                    | undefined) ??
                  opencodeSessionDebt.idle_active_session.length,
                repairableToolPart:
                  (opencodeSessionDebt.total_repairable_tool_parts as
                    | number
                    | undefined) ??
                  opencodeSessionDebt.repairable_tool_parts?.length ??
                  0,
                liveToolPart:
                  (opencodeSessionDebt.total_live_tool_parts as
                    | number
                    | undefined) ??
                  opencodeSessionDebt.live_tool_parts?.length ??
                  0,
                idleToolPart:
                  (opencodeSessionDebt.total_idle_tool_parts as
                    | number
                    | undefined) ??
                  opencodeSessionDebt.idle_tool_parts?.length ??
                  0,
              }
            : null;
          if (
            opencodeSessionDebt.available &&
            opencodeDebtCounts &&
            (opencodeDebtCounts.orphanGhost > 0 ||
              opencodeDebtCounts.repairableToolPart > 0)
          ) {
            status.recommendations.push(
              `[doctor] OpenCode blank assistant session debt detected (${opencodeDebtCounts.orphanGhost} orphan ghost blank assistant row(s), ${opencodeDebtCounts.repairableToolPart} repairable stale tool part row(s)) — run \`bun scripts/opencode-session-doctor.ts --dry-run\` to classify live vs orphan rows before any cleanup.`,
            );
          }

          const healthSnapshot = await computeHealthSnapshot(activeStore);
          const externalStateHygiene =
            await computeExternalStateHygiene(activeStore);
          // rq-snapshotHealthSurface01 — append snapshot-health probe
          const snapshotHealthProbe =
            await fetchStatusSnapshotHealth(projectId);
          const snapshotHealth = snapshotHealthProbe.value;
          probeFreshness.snapshot_health = snapshotHealthProbe.freshness;
          if (healthSnapshot.closed_to_active_ratio > 5) {
            const ratio = healthSnapshot.closed_to_active_ratio;
            status.recommendations.push(
              `⚠️  Closed-change disk leak detected (ratio ${ratio}:1). Run \`adv_cleanup\` to inspect stale changes.`,
            );
          }

          const specsList = await activeStore.specs.list();
          const requirementCount = specsList.specs.reduce(
            (sum, s) => sum + (s.requirementCount ?? 0),
            0,
          );

          // T22: Peer Sessions — read session_registry, project to public
          // schema, apply PID-liveness filter. Best-effort: any error
          // surfaces as "unavailable".
          let peerSessions:
            | Array<{
                sessionId: string;
                startedAt: string;
                worktree: string;
                isSelf: boolean;
              }>
            | { unavailable: true };
          try {
            const peerResult = await listPeerSessions({
              projectRoot: activeStore.paths.root,
            });
            if (peerResult.unavailable) {
              peerSessions = { unavailable: true };
            } else {
              peerSessions = peerResult.sessions;
            }
          } catch {
            peerSessions = { unavailable: true };
          }

          // rq-runtimeProvenance01: compute plugin runtime provenance once
          // and reuse for both the formatted health surface and the raw
          // diagnostic field.
          const pluginRuntimeInfo = await getPluginRuntimeInfo();

          const formatted = formatStatusOutput({
            specCount: status.specs.count,
            requirementCount,
            activeChanges: status.changes.recent.map((c) => ({
              id: c.id,
              title: c.title,
              minutesSinceActivity: c.minutesSinceActivity,
              parent_change_id: c.parent_change_id,
            })),
            archivedCount: status.changes.byStatus.archived ?? 0,
            recommendations: status.recommendations,
            temporalAlive: !!temporalHealth?.server_alive,
            temporalHealth: {
              worker_alive: temporalHealth?.worker_alive ?? false,
              worker_process_alive:
                temporalHealth?.worker_process_alive ?? false,
              worker_lock: temporalHealth?.worker_lock ?? null,
              last_worker_run_error:
                temporalHealth?.last_worker_run_error ?? null,
            },
            temporalQueueServiceability:
              queueServiceability?.serviceability ?? null,
            pluginRuntime: {
              source_dist_freshness: pluginRuntimeInfo.source_dist_freshness,
              recovery_hint: pluginRuntimeInfo.recovery_hint,
            },
            worktreeCensus: worktreeCensus
              ? {
                  total: worktreeCensus.total,
                  stale: worktreeCensus.stale,
                }
              : undefined,
            terminalCleanupRetained,
            peerSessions,
            opencodeSessionDebt: opencodeSessionDebt.available
              ? {
                  available: true,
                  orphanGhostCount: opencodeDebtCounts?.orphanGhost ?? 0,
                  liveInFlightCount: opencodeDebtCounts?.liveInFlight ?? 0,
                  idleActiveSessionCount:
                    opencodeDebtCounts?.idleActiveSession ?? 0,
                  repairableToolPartCount:
                    opencodeDebtCounts?.repairableToolPart ?? 0,
                  liveToolPartCount: opencodeDebtCounts?.liveToolPart ?? 0,
                  idleToolPartCount: opencodeDebtCounts?.idleToolPart ?? 0,
                }
              : {
                  available: false,
                  reason: opencodeSessionDebt.reason,
                },
            snapshotHealth: snapshotHealth
              ? {
                  critical: snapshotHealth.summary.critical,
                  warnings: snapshotHealth.summary.warnings,
                  info: snapshotHealth.summary.info,
                }
              : undefined,
          });

          const projectMetadata = await readProjectMetadata(
            activeStore.paths.root,
            activeStore.paths.projectMetadata,
          );

          const fullOutput = {
            ...status,
            ...(buildProductContextOutput(activeStore, scope)
              ? {
                  product_context: buildProductContextOutput(
                    activeStore,
                    scope,
                  ),
                }
              : {}),
            feature_flags: featureFlags,
            // rq-autoManageAdvWorktrees AC2 — per-flag source (default | explicit)
            feature_flag_sources: featureFlagSources,
            // rq-autoManageAdvWorktrees AC2 — auto-managed change census
            auto_managed_changes: autoManagedCensus,
            worker_role: getTemporalWorkerRole(),
            _freshness: probeFreshness,
            temporal_health: temporalHealth,
            ...(queueServiceability
              ? {
                  expected_queue: queueServiceability.expectedQueue,
                  temporal_queue_serviceability:
                    queueServiceability.serviceability,
                  worker_diagnostics: queueServiceability.workerDiagnostics,
                }
              : {}),
            search_attributes: searchAttributes,
            opencode_session_debt: opencodeSessionDebt,
            migration_status: migrationStatus,
            project_metadata: projectMetadata,
            external_state_hygiene: externalStateHygiene,
            worktree_census: worktreeCensus,
            terminal_cleanup_retained: terminalCleanupRetained,
            snapshot_health: snapshotHealth,
            _healthSnapshot: healthSnapshot,
            // AC6: in-memory counters surfaced via view: "health".
            // Counters reset on plugin init (JC-1).
            metrics: getMetrics(),
            plugin_runtime: pluginRuntimeInfo,
            diagnostics: {
              temporalWorker: temporalHealth?.worker_alive
                ? ("healthy" as const)
                : temporalHealth?.server_alive
                  ? ("degraded" as const)
                  : ("unknown" as const),
              lastErrorClass:
                bootstrapDiagnostic?.recovered === false
                  ? bootstrapDiagnostic.lastErrorClass
                  : (getTemporalRetryTelemetry().lastError ?? undefined),
            },
            ...(bootstrapDiagnostic
              ? { bootstrap_retry: bootstrapDiagnostic }
              : {}),
            formatted,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          };

          const output = applyStatusView(fullOutput, view);
          return formatToolOutput(output);
        },
      );
    },
  },
};
