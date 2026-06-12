import { describe, expect, test } from "bun:test";

import { createToolRunner, normalizeCoverageFromExecution } from "./runner";

describe("slop-scan runner", () => {
  test("classifies successful command execution", async () => {
    const runner = createToolRunner();
    const result = await runner.run({
      detectorId: "bun-version",
      command: [process.execPath, "--version"],
      cwd: process.cwd(),
      timeoutMs: 5000,
    });

    expect(result.status).toBe("success");
    expect(normalizeCoverageFromExecution("bun-version", "Bun", result).state).toBe("run");
  });

  test("classifies missing command as unavailable", async () => {
    const runner = createToolRunner();
    const result = await runner.run({
      detectorId: "missing",
      command: ["definitely-not-a-real-slop-tool"],
      cwd: process.cwd(),
      timeoutMs: 5000,
    });

    expect(result.status).toBe("unavailable");
    expect(normalizeCoverageFromExecution("missing", "Missing", result).state).toBe("unavailable");
  });

  test("classifies timeout", async () => {
    const runner = createToolRunner();
    const result = await runner.run({
      detectorId: "timeout",
      command: [process.execPath, "-e", "setTimeout(() => {}, 1000)"],
      cwd: process.cwd(),
      timeoutMs: 50,
    });

    expect(result.status).toBe("timed_out");
    expect(normalizeCoverageFromExecution("timeout", "Timeout", result).state).toBe("timed_out");
  });
});
