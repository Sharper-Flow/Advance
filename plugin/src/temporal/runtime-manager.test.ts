import { describe, expect, it } from "vitest";
import {
  buildTemporalServerCommand,
  getTemporalRuntimeLockPath,
  probeTemporalClientRuntime,
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
