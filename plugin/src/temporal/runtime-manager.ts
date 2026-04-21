import { dirname, join } from "path";
import { mkdir } from "fs/promises";
import {
  spawn,
  spawnSync,
  type ChildProcess,
} from "child_process";
import { statSync, accessSync, constants as fsConstants } from "node:fs";
import * as net from "node:net";
import { tmpdir } from "os";
import { acquireFileLock } from "../utils/fs";
import { getTemporalAddress, getTemporalNamespace } from "./client";

type TemporalEnv = Record<string, string | undefined>;

export interface TemporalRuntimeProbeInput {
  runtime?: "bun" | "node";
  bunVersion?: string;
  hasBunSpawn?: boolean;
}

export interface TemporalRuntimeProbeResult {
  supported: boolean;
  runtime: "bun" | "node";
  reason: string;
  remediation?: string;
}

function detectRuntime(): TemporalRuntimeProbeInput {
  const bunRuntime = typeof Bun !== "undefined";
  return bunRuntime
    ? {
        runtime: "bun",
        bunVersion: process.versions.bun,
        hasBunSpawn: typeof Bun.spawn === "function",
      }
    : { runtime: "node" };
}

export function probeTemporalClientRuntime(
  input: TemporalRuntimeProbeInput = detectRuntime(),
): TemporalRuntimeProbeResult {
  if (input.runtime === "node") {
    return {
      supported: true,
      runtime: "node",
      reason: "Temporal TypeScript SDK is officially supported on Node.",
    };
  }

  if (!input.hasBunSpawn) {
    return {
      supported: false,
      runtime: "bun",
      reason:
        "Bun runtime does not expose Bun.spawn for local runtime/bootstrap management.",
      remediation:
        "Run the plugin on Node or upgrade Bun before enabling Temporal-backed storage.",
    };
  }

  return {
    supported: true,
    runtime: "bun",
    reason: `Bun ${input.bunVersion ?? "unknown"} detected. Temporal client use is allowed only behind runtime probing and fail-fast diagnostics.`,
    remediation:
      "If runtime bootstrap or client connection fails, switch to Node or a supported Bun version.",
  };
}

export interface NodeExecutableResolution {
  found: boolean;
  path?: string;
  source: "env" | "path" | "none";
  remediation?: string;
}

function isExecutableFile(candidate: string): boolean {
  try {
    const stat = statSync(candidate);
    if (!stat.isFile()) return false;
    accessSync(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find a Node binary suitable for spawning the out-of-process Temporal worker.
 *
 * Priority:
 *   1. `ADV_NODE_PATH` env (explicit user override — points at a specific
 *      Node executable, useful for multi-version hosts like nvm).
 *   2. `node` on PATH (`which node` / `where node`).
 *   3. Not found → `{ found: false, source: "none", remediation: ... }`.
 *
 * The worker CANNOT run inside the Bun plugin host (see
 * `probeTemporalWorkerRuntime`). When the plugin host is Bun we spawn Node
 * out-of-process; when it's Node we could run the worker in-process — but
 * we still expose this helper for consistency.
 */
export function resolveNodeExecutable(
  env: NodeJS.ProcessEnv = process.env,
): NodeExecutableResolution {
  // 1. Explicit override
  const override = (env.ADV_NODE_PATH ?? "").trim();
  if (override && isExecutableFile(override)) {
    return { found: true, path: override, source: "env" };
  }

  // 2. PATH lookup
  const isWindows = process.platform === "win32";
  const lookupCmd = isWindows ? "where" : "which";
  const nodeName = isWindows ? "node.exe" : "node";

  // Pass a sanitized env so PATH is the only discovery signal (tests rely on
  // an isolated PATH; real callers just pass process.env).
  const result = spawnSync(lookupCmd, [nodeName], {
    env: {
      // Preserve HOME/PATHEXT for Windows lookups to work correctly.
      ...(env.HOME ? { HOME: env.HOME } : {}),
      ...(env.USERPROFILE ? { USERPROFILE: env.USERPROFILE } : {}),
      ...(env.PATHEXT ? { PATHEXT: env.PATHEXT } : {}),
      PATH: env.PATH ?? "",
    },
    encoding: "utf8",
  });

  if (result.status === 0 && typeof result.stdout === "string") {
    // `which` / `where` can return multiple lines (first match wins)
    const firstMatch = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (firstMatch && isExecutableFile(firstMatch)) {
      return { found: true, path: firstMatch, source: "path" };
    }
  }

  // Fallback: walk PATH manually — spawnSync of `which` can fail if
  // `which` itself isn't on the sanitized PATH (e.g. tests with PATH=tmpDir).
  const pathEntries = (env.PATH ?? "").split(isWindows ? ";" : ":");
  for (const dir of pathEntries) {
    if (!dir) continue;
    const candidate = join(dir, nodeName);
    if (isExecutableFile(candidate)) {
      return { found: true, path: candidate, source: "path" };
    }
  }

  return {
    found: false,
    source: "none",
    remediation:
      "Install Node.js (v20 or later) on PATH, or set ADV_NODE_PATH to a Node executable. The Temporal worker cannot run inside the Bun plugin host and is spawned as a Node child process.",
  };
}

/**
 * Probe whether the current runtime can host the Temporal **worker** (not just
 * the client). The worker is stricter than the client because
 * `@temporalio/worker.Worker.create()` internally spawns a Workflow Worker
 * Thread whose top-level `require('@temporalio/common')` fails under Bun's
 * compiled-executable module resolution (verified empirically — see
 * `docs/temporal-recovery.md` and the design for
 * `fixTemporalWorkerBundleFailure`).
 *
 * Returns `supported: false` under Bun regardless of whether `Bun.spawn` is
 * present — the worker cannot run in-process inside Bun today. The remediation
 * points callers at the out-of-process Node child-process worker model.
 */
export function probeTemporalWorkerRuntime(
  input: TemporalRuntimeProbeInput = detectRuntime(),
): TemporalRuntimeProbeResult {
  if (input.runtime === "node") {
    return {
      supported: true,
      runtime: "node",
      reason:
        "Node runtime supports @temporalio/worker in-process (Worker.create + worker_threads).",
    };
  }

  return {
    supported: false,
    runtime: "bun",
    reason:
      "Bun cannot run @temporalio/worker in-process: Worker.create spawns a Node worker thread whose require('@temporalio/common') fails from Bun's install-cache path.",
    remediation:
      "Use the out-of-process Node child-process worker (default when Node is on PATH), set ADV_NODE_PATH to a Node binary, or set ADV_ALLOW_DEGRADED_FALLBACK=1 to run on file-backed storage. See SETUP.md → Bun runtime troubleshooting.",
  };
}

export function getTemporalRuntimeLockPath(
  projectId: string,
  env: TemporalEnv = process.env,
): string {
  const baseDir = env.OPEN_CHAD_CACHE_DIR
    ? join(env.OPEN_CHAD_CACHE_DIR, "advance-temporal")
    : env.XDG_RUNTIME_DIR
      ? join(env.XDG_RUNTIME_DIR, "advance-temporal")
      : join(tmpdir(), "advance-temporal");
  return join(baseDir, `${projectId}.runtime.lock`);
}

export function buildTemporalServerCommand(
  env: NodeJS.ProcessEnv = process.env,
): { command: string; args: string[] } {
  const address = getTemporalAddress(env);
  const [host, port] = splitAddress(address);
  return {
    command: "temporal",
    args: [
      "server",
      "start-dev",
      "--ip",
      host || "127.0.0.1",
      "--port",
      port,
      "--namespace",
      getTemporalNamespace(env),
      "--headless",
    ],
  };
}

function splitAddress(address: string): [string, string] {
  const idx = address.lastIndexOf(":");
  if (idx <= 0 || idx === address.length - 1) {
    throw new Error(
      `Invalid Temporal address "${address}" — expected host:port`,
    );
  }
  const host = address.slice(0, idx);
  const port = address.slice(idx + 1);
  if (
    !/^[A-Za-z0-9.:[\]-]+$/.test(host) ||
    /^-/.test(host) ||
    /\s/.test(host)
  ) {
    throw new Error(`Invalid Temporal host "${host}"`);
  }
  if (!/^\d{1,5}$/.test(port)) {
    throw new Error(`Invalid Temporal port "${port}"`);
  }
  const portNum = Number(port);
  if (portNum < 1 || portNum > 65535) {
    throw new Error(`Temporal port out of range: ${port}`);
  }
  return [host, port];
}

export interface TemporalWorkerProcessSpec {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

export function buildTemporalWorkerProcessSpec(input: {
  workerScript: string;
  taskQueue: string;
  address: string;
  namespace: string;
  projectId: string;
}): TemporalWorkerProcessSpec {
  return {
    command: process.execPath,
    args: [input.workerScript],
    env: {
      ...process.env,
      ADV_TEMPORAL_ADDRESS: input.address,
      ADV_TEMPORAL_NAMESPACE: input.namespace,
      ADV_TEMPORAL_TASK_QUEUE: input.taskQueue,
      ADV_TEMPORAL_PROJECT_ID: input.projectId,
    },
  };
}

async function canReachAddress(
  address: string,
  timeoutMs = 500,
): Promise<boolean> {
  const [host, port] = splitAddress(address);
  return await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port: Number(port) });

    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.unref();
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));

    setTimeout(() => {
      finish(false);
    }, timeoutMs).unref();
  });
}

export async function waitForTemporalRuntime(
  address: string,
  attempts = 20,
  delayMs = 250,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await canReachAddress(address)) return;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(
    `Temporal runtime at ${address} did not become reachable within ${attempts * delayMs}ms`,
  );
}

export async function ensureTemporalRuntime(
  projectId: string,
  env: TemporalEnv = process.env,
): Promise<{ address: string; namespace: string; startedRuntime: boolean }> {
  const probe = probeTemporalClientRuntime();
  if (!probe.supported) {
    throw new Error(
      `${probe.reason}${probe.remediation ? ` ${probe.remediation}` : ""}`,
    );
  }

  const address = getTemporalAddress(env);
  const namespace = getTemporalNamespace(env);

  if (await canReachAddress(address)) {
    return { address, namespace, startedRuntime: false };
  }

  const lockPath = getTemporalRuntimeLockPath(projectId, env);
  await mkdir(dirname(lockPath), { recursive: true });
  const release = await acquireFileLock(lockPath, 10000);

  try {
    if (await canReachAddress(address)) {
      return { address, namespace, startedRuntime: false };
    }

    const { command, args } = buildTemporalServerCommand(env);
    const server = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, ...env },
    });
    server.unref();
    await waitForTemporalRuntime(address);

    return { address, namespace, startedRuntime: true };
  } finally {
    await release();
  }
}

export function spawnTemporalWorkerProcess(input: {
  workerScript: string;
  taskQueue: string;
  address: string;
  namespace: string;
  projectId: string;
  cwd: string;
}): ChildProcess {
  const spec = buildTemporalWorkerProcessSpec(input);
  return spawn(spec.command, spec.args, {
    cwd: input.cwd,
    env: spec.env,
    stdio: "ignore",
    detached: true,
  });
}
