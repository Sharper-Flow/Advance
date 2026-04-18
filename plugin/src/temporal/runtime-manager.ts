import { mkdir } from "fs/promises";
import { spawn, type ChildProcess } from "child_process";
import * as net from "node:net";
import { dirname, join } from "path";
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
      reason: "Bun runtime does not expose Bun.spawn for local runtime/bootstrap management.",
      remediation:
        "Run the plugin on Node or upgrade Bun before enabling Temporal-backed storage.",
    };
  }

  return {
    supported: true,
    runtime: "bun",
    reason:
      `Bun ${input.bunVersion ?? "unknown"} detected. Temporal client use is allowed only behind runtime probing and fail-fast diagnostics.`,
    remediation:
      "If runtime bootstrap or client connection fails, switch to Node or a supported Bun version.",
  };
}

export function getTemporalRuntimeLockPath(
  projectId: string,
  env: TemporalEnv = process.env,
): string {
  const baseDir =
    env.OPEN_CHAD_CACHE_DIR
      ? join(env.OPEN_CHAD_CACHE_DIR, "advance-temporal")
      :
    (env.XDG_RUNTIME_DIR
      ? join(env.XDG_RUNTIME_DIR, "advance-temporal")
      : join(tmpdir(), "advance-temporal"));
  return join(baseDir, `${projectId}.runtime.lock`);
}

export function buildTemporalServerCommand(
  address: string,
  namespace: string,
): { command: string; args: string[] } {
  const [host, port = "7233"] = address.split(":", 2);
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
      namespace,
      "--headless",
    ],
  };
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
  const [host, rawPort = "7233"] = address.split(":", 2);
  const port = Number(rawPort);

  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: host || "127.0.0.1",
      port,
    });

    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
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

    const { command, args } = buildTemporalServerCommand(address, namespace);
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
