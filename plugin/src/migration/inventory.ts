/**
 * inventory — disk-backed project/build/session inventory (AC9/DDC5, OOS2).
 *
 * Structural full-machine migration proof. `collectMachineInventory` gathers:
 *
 *   - build: the deployed build's immutable identity, re-verified against
 *     deployed content (unknown or stale identity blocks activation);
 *   - projects: every local ADV project state dir, canonical and oc-shard
 *     layouts (synthetic test ids and non-project leftovers excluded);
 *   - sessions: loaded-build registry entries (digest attribution).
 *
 * `validateMigrationReadiness` converts the inventory into typed blockers.
 * ANY unknown or stale component blocks activation (C5) — partial per-
 * project migration after deployment is out of scope (OOS2), so readiness
 * is machine-wide or not at all.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { verifyDeployedBuildIdentity } from "./build-identity";
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
  };
  projects: ProjectInventoryEntry[];
  sessions: {
    live: LoadedBuildSession[];
    reaped: number;
    malformed: string[];
  };
  summary: {
    projects: number;
    liveSessions: number;
  };
}

export interface CollectMachineInventoryInput {
  pluginRoot: string;
  migrationRoot: string;
  homeDir: string;
  extraProjectRoots?: string[];
  isAlive?: (pid: number, startTicks: string | null) => boolean;
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

  const sessions = listLiveBuildSessions({
    migrationRoot: input.migrationRoot,
    isAlive: input.isAlive,
  });

  return {
    collectedAt: new Date().toISOString(),
    build: {
      status: verification.status,
      digest,
    },
    projects,
    sessions,
    summary: {
      projects: projects.length,
      liveSessions: sessions.live.length,
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
  | "session_record_malformed"
  | "session_digest_mismatch";

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
 * readable, and no malformed or mismatched disk session records.
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

  return { complete: blockers.length === 0, blockers };
}
