import { describe, expect, it } from "vitest";
import {
  buildTemporalServerCommand,
  getTemporalRuntimeLockPath,
  probeTemporalClientRuntime,
  probeTemporalWorkerRuntime,
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
      OPEN_CHAD_CACHE_DIR: "/tmp/advance-cache",
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
