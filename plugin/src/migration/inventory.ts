/**
 * inventory — local project/workflow/process/session inventory (AC9/DDC5, OOS2).
 *
 * Structural full-machine migration proof. `collectMachineInventory` gathers:
 *
 *   - build: the deployed build's immutable identity, re-verified against
 *     deployed content (unknown or stale identity blocks activation);
 *   - projects: every local ADV project state dir, canonical and oc-shard
 *     layouts (synthetic test ids and non-project leftovers excluded);
 *   - workflows: running change workflows per project via an injectable
 *     Temporal probe (an unavailable probe is incomplete inventory);
 *   - processes: deployed/foreign Temporal workers and live OpenCode
 *     sessions from the process table;
 *   - sessions: loaded-build registry entries (digest attribution).
 *
 * `validateMigrationReadiness` converts the inventory into typed blockers.
 * ANY unknown or stale component blocks activation (C5) — partial per-
 * project migration after deployment is out of scope (OOS2), so readiness
 * is machine-wide or not at all.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  buildIdentityInstalledAtMs,
  BUILD_IDENTITY_FILENAME,
  readBuildIdentityFile,
  verifyDeployedBuildIdentity,
} from "./build-identity";
import {
  collectProcessInventory,
  type ProcessInventory,
} from "./process-inventory";
import { SYNTHETIC_TEST_PROJECT_ID_PREFIX } from "../utils/project-id";
import {
  listLiveBuildSessions,
  type LoadedBuildSession,
} from "./session-registry";

// =============================================================================
// Project inventory
// =============================================================================

export interface ProjectInventoryEntry {
  projectId: string;
  root: string;
  readable: boolean;
}

const PROJECT_ID_PATTERN = /^[0-9a-f]{40}$/;

/**
 * Candidate project-state roots: the canonical data home plus every
 * `oc` per-project shard. Missing roots are skipped.
 */
export function listProjectInventoryRoots(homeDir: string): string[] {
  const share = join(homeDir, ".local", "share");
  const roots: string[] = [join(share, "opencode", "plugins", "advance")];
  const shardsDir = join(share, "opencode-projects");
  try {
    for (const shard of readdirSync(shardsDir)) {
      if (!PROJECT_ID_PATTERN.test(shard)) continue;
      roots.push(join(shardsDir, shard, "opencode", "plugins", "advance"));
    }
  } catch {
    // No shard layout on this machine.
  }
  return roots;
}

/**
 * Enumerate local ADV projects across all inventory roots. Entries whose
 * directory cannot be stat'ed are returned unreadable — the validator turns
 * them into blockers. Synthetic test ids and non-40-hex leftovers are not
 * projects and are excluded.
 */
export function collectProjectInventory(input: {
  homeDir: string;
  extraRoots?: string[];
}): ProjectInventoryEntry[] {
  const roots = [
    ...listProjectInventoryRoots(input.homeDir),
    ...(input.extraRoots ?? []),
  ];
  const seen = new Set<string>();
  const projects: ProjectInventoryEntry[] = [];
  for (const root of roots) {
    let names: string[];
    try {
      names = readdirSync(root);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!PROJECT_ID_PATTERN.test(name)) continue;
      if (name.startsWith(SYNTHETIC_TEST_PROJECT_ID_PREFIX)) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      const projectRoot = join(root, name);
      let readable = true;
      try {
        statSync(projectRoot);
      } catch {
        readable = false;
      }
      projects.push({ projectId: name, root: projectRoot, readable });
    }
  }
  projects.sort((a, b) => a.projectId.localeCompare(b.projectId));
  return projects;
}

// =============================================================================
// Machine inventory
// =============================================================================

export interface MachineInventory {
  collectedAt: string;
  build: {
    status: "match" | "stale" | "missing" | "malformed";
    digest: string | null;
    installedAtMs: number | null;
  };
  projects: ProjectInventoryEntry[];
  workflows: {
    status: "available" | "unavailable";
    runningByProject: Record<string, number>;
    problems: string[];
  };
  processes: ProcessInventory;
  sessions: {
    live: LoadedBuildSession[];
    reaped: number;
    malformed: string[];
  };
  summary: {
    projects: number;
    runningWorkflows: number;
    liveSessions: number;
    workers: number;
  };
}

export interface CollectMachineInventoryInput {
  pluginRoot: string;
  deployRoot: string;
  migrationRoot: string;
  homeDir: string;
  procRoot?: string;
  extraProjectRoots?: string[];
  isAlive?: (pid: number, startTicks: string | null) => boolean;
  /**
   * Temporal probe: running change workflows for a project. When absent the
   * workflow inventory is unavailable — incomplete inventory blocks
   * activation (fail-safe).
   */
  listRunningWorkflows?: (projectId: string) => Promise<number>;
}

export async function collectMachineInventory(
  input: CollectMachineInventoryInput,
): Promise<MachineInventory> {
  const verification = verifyDeployedBuildIdentity(input.pluginRoot);
  const digest =
    verification.status === "match" || verification.status === "stale"
      ? verification.identity.digest
      : null;

  const projects = collectProjectInventory({
    homeDir: input.homeDir,
    extraRoots: input.extraProjectRoots,
  });

  const workflows: MachineInventory["workflows"] = {
    status: "available",
    runningByProject: {},
    problems: [],
  };
  if (!input.listRunningWorkflows) {
    workflows.status = "unavailable";
    workflows.problems.push("no workflow probe provided");
  } else {
    for (const project of projects) {
      try {
        workflows.runningByProject[project.projectId] =
          await input.listRunningWorkflows(project.projectId);
      } catch (error) {
        workflows.status = "unavailable";
        workflows.problems.push(
          `workflow probe failed for ${project.projectId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  const processes = collectProcessInventory({
    deployedWorkerScript: join(
      input.deployRoot,
      "plugin",
      "dist",
      "temporal",
      "worker.js",
    ),
    procRoot: input.procRoot,
  });

  const sessions = listLiveBuildSessions({
    migrationRoot: input.migrationRoot,
    isAlive: input.isAlive,
    procRoot: input.procRoot,
  });

  return {
    collectedAt: new Date().toISOString(),
    build: {
      status: verification.status,
      digest,
      installedAtMs: buildIdentityInstalledAtMs(input.pluginRoot),
    },
    projects,
    workflows,
    processes,
    sessions,
    summary: {
      projects: projects.length,
      runningWorkflows: Object.values(workflows.runningByProject).reduce(
        (sum, count) => sum + count,
        0,
      ),
      liveSessions: sessions.live.length,
      workers: processes.workers.length,
    },
  };
}

// =============================================================================
// Readiness validation
// =============================================================================

export type MigrationBlockerCode =
  | "build_identity_missing"
  | "build_identity_malformed"
  | "build_identity_stale"
  | "project_unreadable"
  | "workflow_inventory_unavailable"
  | "process_scan_incomplete"
  | "worker_stale"
  | "worker_foreign_unknown"
  | "worker_foreign_mismatch"
  | "session_record_malformed"
  | "session_digest_mismatch"
  | "session_process_unknown";

export interface MigrationBlocker {
  code: MigrationBlockerCode;
  detail: string;
}

export interface MigrationReadiness {
  complete: boolean;
  blockers: MigrationBlocker[];
}

/**
 * Validate a collected inventory. Readiness is complete only when every
 * component is known and current: immutable identity verified, all projects
 * readable, workflow inventory available, process table fully scanned, no
 * stale or unverifiable workers, no malformed/mismatched session records,
 * and every live OpenCode session registered with the current digest.
 */
export function validateMigrationReadiness(
  inv: MachineInventory,
): MigrationReadiness {
  const blockers: MigrationBlocker[] = [];
  const expectedDigest = inv.build.digest;

  if (inv.build.status === "missing") {
    blockers.push({
      code: "build_identity_missing",
      detail: "deployed build has no recorded build identity",
    });
  } else if (inv.build.status === "malformed") {
    blockers.push({
      code: "build_identity_malformed",
      detail: "deployed build identity file failed validation",
    });
  } else if (inv.build.status === "stale") {
    blockers.push({
      code: "build_identity_stale",
      detail:
        "deployed build content drifted from its recorded identity; redeploy and re-verify before activation",
    });
  }

  for (const project of inv.projects) {
    if (!project.readable) {
      blockers.push({
        code: "project_unreadable",
        detail: `project state dir unreadable: ${project.root}`,
      });
    }
  }

  if (inv.workflows.status !== "available") {
    blockers.push({
      code: "workflow_inventory_unavailable",
      detail: inv.workflows.problems.join("; ") || "workflow probe unavailable",
    });
  }

  if (!inv.processes.scanComplete) {
    blockers.push({
      code: "process_scan_incomplete",
      detail: inv.processes.problems.join("; ") || "process table unreadable",
    });
  }

  for (const worker of inv.processes.workers) {
    if (worker.root === "deployed") {
      const installedAt = inv.build.installedAtMs;
      if (
        installedAt === null ||
        worker.startTimeMs === null ||
        worker.startTimeMs < installedAt
      ) {
        blockers.push({
          code: "worker_stale",
          detail: `deployed worker pid ${worker.pid} predates the current build install (or its start time is unknown); bounce it before activation`,
        });
      }
      continue;
    }
    // Foreign worker: only a recorded identity with an equal digest proves
    // it executes the same build as the deployment.
    const foreignIdentity = readBuildIdentityFile(
      join(
        worker.workerScriptPath.slice(
          0,
          worker.workerScriptPath.length - "dist/temporal/worker.js".length,
        ),
        "dist",
        BUILD_IDENTITY_FILENAME,
      ),
    );
    if (!foreignIdentity) {
      blockers.push({
        code: "worker_foreign_unknown",
        detail: `foreign worker pid ${worker.pid} (${worker.workerScriptPath}) has no verifiable build identity`,
      });
    } else if (
      expectedDigest !== null &&
      foreignIdentity.digest !== expectedDigest
    ) {
      blockers.push({
        code: "worker_foreign_mismatch",
        detail: `foreign worker pid ${worker.pid} runs build ${foreignIdentity.digest.slice(0, 20)}… != deployed ${expectedDigest.slice(0, 20)}…`,
      });
    }
  }

  for (const malformed of inv.sessions.malformed) {
    blockers.push({
      code: "session_record_malformed",
      detail: `session record failed validation: ${malformed}`,
    });
  }
  if (expectedDigest !== null) {
    for (const session of inv.sessions.live) {
      if (session.buildDigest !== expectedDigest) {
        blockers.push({
          code: "session_digest_mismatch",
          detail: `session pid ${session.pid} (project ${session.projectId}) loaded ${session.buildDigest.slice(0, 20)}… != deployed ${expectedDigest.slice(0, 20)}…; restart the session`,
        });
      }
    }
  }

  // Every live OpenCode session process must appear in the loaded-build
  // registry (the bridge build registers at init). An unregistered live
  // session is a pre-bridge or otherwise unknown session → block.
  const registered = new Map(
    inv.sessions.live.map((s) => [`${s.pid}:${s.processStartTicks ?? ""}`, s]),
  );
  for (const sessionProc of inv.processes.sessions) {
    const key = `${sessionProc.pid}:${sessionProc.startTicks ?? ""}`;
    if (!registered.has(key)) {
      blockers.push({
        code: "session_process_unknown",
        detail: `live opencode session pid ${sessionProc.pid} is not in the loaded-build registry; restart it onto the current build`,
      });
    }
  }

  return { complete: blockers.length === 0, blockers };
}
