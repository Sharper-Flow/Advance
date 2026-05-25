import { mkdtempSync, rmSync, chmodSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildTemporalServerCommand,
  getTemporalRuntimeLockPath,
  probeTemporalClientRuntime,
  probeTemporalWorkerRuntime,
  resolveNodeExecutable,
} from "./runtime-manager";

describe("temporal runtime manager helpers", () => {
  it("builds a local temporal dev-server command", () => {
    expect(buildTemporalServerCommand("127.0.0.1:7233", "default")).toEqual({
      command: "temporal",
      args: [
        "server",
        "start-dev",
        "--ip",
        "127.0.0.1",
        "--port",
        "7233",
        "--namespace",
        "default",
        "--headless",
      ],
    });
  });

  it("derives a stable lock path for a project", () => {
    const lockPath = getTemporalRuntimeLockPath("proj123", {
      ADV_CACHE_DIR: "/tmp/advance-cache",
    });
    expect(lockPath).toBe(
      "/tmp/advance-cache/advance-temporal/proj123.runtime.lock",
    );
  });

  it("treats node as supported runtime", () => {
    expect(probeTemporalClientRuntime({ runtime: "node" })).toMatchObject({
      supported: true,
      runtime: "node",
    });
  });

  it("treats bun without spawn support as unsupported", () => {
    expect(
      probeTemporalClientRuntime({
        runtime: "bun",
        bunVersion: "1.3.12",
        hasBunSpawn: false,
      }),
    ).toMatchObject({ supported: false, runtime: "bun" });
  });
});

describe("probeTemporalWorkerRuntime", () => {
  it("treats node as supported worker runtime", () => {
    expect(probeTemporalWorkerRuntime({ runtime: "node" })).toMatchObject({
      supported: true,
      runtime: "node",
    });
  });

  it("treats bun as unsupported worker runtime with SETUP.md remediation", () => {
    const result = probeTemporalWorkerRuntime({
      runtime: "bun",
      bunVersion: "1.3.8",
      hasBunSpawn: true,
    });
    expect(result).toMatchObject({
      supported: false,
      runtime: "bun",
    });
    expect(result.reason).toMatch(/worker thread|@temporalio\/common|Bun/i);
    expect(result.remediation).toMatch(/Node child process|SETUP\.md/i);
  });

  it("treats bun as unsupported even when client runtime probe would pass", () => {
    // probeTemporalClientRuntime returns supported:true for Bun with spawn.
    // The worker probe is stricter because the worker-thread module resolution
    // fails under Bun's compiled-executable cache.
    const clientProbe = probeTemporalClientRuntime({
      runtime: "bun",
      bunVersion: "1.3.8",
      hasBunSpawn: true,
    });
    expect(clientProbe.supported).toBe(true);

    const workerProbe = probeTemporalWorkerRuntime({
      runtime: "bun",
      bunVersion: "1.3.8",
      hasBunSpawn: true,
    });
    expect(workerProbe.supported).toBe(false);
  });
});

describe("resolveNodeExecutable", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "adv-node-probe-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeFakeNode(name = "node"): string {
    const path = join(tmpDir, name);
    writeFileSync(path, "#!/bin/sh\nexit 0\n");
    chmodSync(path, 0o755);
    return path;
  }

  it("honors ADV_NODE_PATH when the value points at an executable file", () => {
    const nodePath = makeFakeNode("custom-node");
    const result = resolveNodeExecutable({
      ADV_NODE_PATH: nodePath,
      PATH: "",
    });

    expect(result).toMatchObject({
      found: true,
      path: nodePath,
      source: "env",
    });
  });

  it("ignores ADV_NODE_PATH when the value is not an executable file", () => {
    const missingPath = join(tmpDir, "does-not-exist");
    // No PATH either → should fall through to `none`
    const result = resolveNodeExecutable({
      ADV_NODE_PATH: missingPath,
      PATH: "",
    });

    expect(result.found).toBe(false);
    expect(result.source).toBe("none");
    expect(result.remediation).toMatch(/PATH|ADV_NODE_PATH/i);
  });

  it("falls back to `which node` on PATH when ADV_NODE_PATH is unset", () => {
    const nodePath = makeFakeNode("node");
    const result = resolveNodeExecutable({
      PATH: tmpDir,
    });

    expect(result).toMatchObject({
      found: true,
      path: nodePath,
      source: "path",
    });
  });

  it("returns found:false with actionable remediation when no Node is available", () => {
    const result = resolveNodeExecutable({
      PATH: tmpDir, // empty dir, no node inside
    });

    expect(result.found).toBe(false);
    expect(result.source).toBe("none");
    expect(result.remediation).toMatch(/install Node|ADV_NODE_PATH|PATH/i);
  });
});
