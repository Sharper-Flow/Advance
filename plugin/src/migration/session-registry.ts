/**
 * session-registry — live-session loaded-build identity (AC9/DDC5, C5).
 *
 * After the bridge build deploys, every plugin session records which build
 * digest it loaded (`<migrationRoot>/sessions/<pid>.json`) at init and
 * removes the record at shutdown. Cutover activation then proves every live
 * session restarted onto the migrated build:
 *
 *   - Dead-PID records are reaped using PID-reuse-safe liveness (start-tick
 *     comparison from `./procfs`).
 *   - Live records whose digest differs from the deployed build block
 *     activation (`session_digest_mismatch`).
 *   - Malformed records are unknown inventory and block activation
 *     (`session_record_malformed`) — they are never silently dropped.
 *
 * Registry writes are best-effort and MUST never break plugin init or
 * shutdown (plugin-init resilience contract): all public functions report
 * errors instead of throwing.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type { BuildIdentity } from "./build-identity";
import { isProcessAlive, readProcessStartTicks } from "./procfs";

export const LoadedBuildSessionSchema = z
  .object({
    schemaVersion: z.literal(1),
    pid: z.number().int().positive(),
    /** `/proc` start ticks recorded at registration (PID-reuse guard). */
    processStartTicks: z.string().nullable(),
    projectId: z.string().min(1),
    /** Opaque session ID generated once per plugin-init lifecycle. */
    sessionId: z.string().min(1).optional(),
    buildDigest: z.string().min(1),
    pluginRoot: z.string().min(1),
    startedAt: z.string().min(1),
    lastSeenAt: z.string().min(1),
  })
  .strict();
export type LoadedBuildSession = z.infer<typeof LoadedBuildSessionSchema>;

function sessionsDir(migrationRoot: string): string {
  return join(migrationRoot, "sessions");
}

export interface RegisterSessionResult {
  registered: boolean;
  path?: string;
  error?: string;
}

/** Record this session's loaded-build identity. Never throws. */
export function registerLoadedBuildSession(input: {
  migrationRoot: string;
  projectId: string;
  buildDigest: string;
  pluginRoot: string;
  sessionId?: string;
  pid?: number;
  startTicks?: string | null;
  now?: Date;
}): RegisterSessionResult {
  const pid = input.pid ?? process.pid;
  try {
    const now = (input.now ?? new Date()).toISOString();
    const record: LoadedBuildSession = {
      schemaVersion: 1,
      pid,
      processStartTicks:
        input.startTicks !== undefined
          ? input.startTicks
          : readProcessStartTicks(pid),
      projectId: input.projectId,
      sessionId: input.sessionId,
      buildDigest: input.buildDigest,
      pluginRoot: input.pluginRoot,
      startedAt: now,
      lastSeenAt: now,
    };
    const dir = sessionsDir(input.migrationRoot);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${pid}.json`);
    const tmp = `${path}.tmp-${pid}`;
    writeFileSync(tmp, JSON.stringify(record, null, 2) + "\n");
    renameSync(tmp, path);
    return { registered: true, path };
  } catch (error) {
    return {
      registered: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Best-effort removal of this session's record during shutdown. */
export function unregisterLoadedBuildSession(input: {
  migrationRoot: string;
  pid?: number;
}): void {
  try {
    unlinkSync(
      join(
        sessionsDir(input.migrationRoot),
        `${input.pid ?? process.pid}.json`,
      ),
    );
  } catch {
    // Already gone — shutdown must not fail on registry cleanup.
  }
}

export interface LiveSessionListing {
  live: LoadedBuildSession[];
  /** Records removed because their PID is dead (or reused). */
  reaped: number;
  /** Paths of records that failed to parse/validate — unknown inventory. */
  malformed: string[];
}

/**
 * List live session records, reaping entries whose process is gone. A record
 * whose `/proc` start ticks no longer match belongs to a reused PID and is
 * reaped as dead.
 */
export function listLiveBuildSessions(input: {
  migrationRoot: string;
  isAlive?: (pid: number, startTicks: string | null) => boolean;
  procRoot?: string;
}): LiveSessionListing {
  const dir = sessionsDir(input.migrationRoot);
  if (!existsSync(dir)) return { live: [], reaped: 0, malformed: [] };
  const alive =
    input.isAlive ??
    ((pid: number, startTicks: string | null) =>
      isProcessAlive(pid, { procRoot: input.procRoot, startTicks }));
  const live: LoadedBuildSession[] = [];
  const malformed: string[] = [];
  let reaped = 0;
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    const path = join(dir, name);
    let record: LoadedBuildSession;
    try {
      record = LoadedBuildSessionSchema.parse(
        JSON.parse(readFileSync(path, "utf8")),
      );
    } catch {
      malformed.push(path);
      continue;
    }
    if (alive(record.pid, record.processStartTicks)) {
      live.push(record);
    } else {
      try {
        unlinkSync(path);
        reaped += 1;
      } catch {
        // Reaping is best-effort; a lingering dead record blocks activation
        // via digest comparison only if its process is actually dead — the
        // next listing retries the reap.
      }
    }
  }
  return { live, reaped, malformed };
}

export interface RegisterPluginSessionResult {
  registered: boolean;
  skipped?: "test_mode" | "no_identity";
  error?: string;
}

/**
 * Plugin-init seam: register the current session's loaded-build identity.
 * Self-guarding — skips in test mode (vitest fixtures must not write machine
 * state) and when no deployed build identity is available (dev/src mode).
 * Never throws; plugin-init resilience takes precedence over registration.
 */
export function registerPluginSession(input: {
  projectId: string;
  migrationRoot: string;
  identity: BuildIdentity | null;
  sessionId: string;
  env?: NodeJS.ProcessEnv;
  pid?: number;
}): RegisterPluginSessionResult {
  const env = input.env ?? process.env;
  if (env.VITEST === "true" || env.ADV_TEST_MODE === "1") {
    return { registered: false, skipped: "test_mode" };
  }
  if (!input.identity) {
    return { registered: false, skipped: "no_identity" };
  }
  const result = registerLoadedBuildSession({
    migrationRoot: input.migrationRoot,
    projectId: input.projectId,
    buildDigest: input.identity.digest,
    pluginRoot: input.identity.pluginRoot,
    sessionId: input.sessionId,
    pid: input.pid,
  });
  return result.registered
    ? { registered: true }
    : { registered: false, error: result.error };
}
