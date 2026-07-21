import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { getAdvWorkerTuningOptions } from "./worker-tuning";

const thisDir = dirname(fileURLToPath(import.meta.url));

function temporalSourceFiles(): string[] {
  return readdirSync(thisDir)
    .filter(
      (name) =>
        name.endsWith(".ts") &&
        !name.endsWith(".test.ts") &&
        !name.endsWith(".itest.ts"),
    )
    .map((name) => join(thisDir, name))
    .filter((filePath) => {
      const source = readFileSync(filePath, "utf-8");
      // Only inspect files that actually import Temporal Worker; this avoids
      // false positives from documentation/comments mentioning Worker.create.
      return /import\s+\{[^}]*\bWorker\b[^}]*\}\s+from\s+["']@temporalio\/worker["']/.test(
        source,
      );
    });
}

function findWorkerCreateLineNumbers(source: string): number[] {
  const lines = source.split("\n");
  const hits: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("Worker.create(")) {
      hits.push(i + 1); // 1-based line numbers
    }
  }
  return hits;
}

function hasTuningWithinTenLines(
  source: string,
  lineNumber: number,
): boolean {
  const lines = source.split("\n");
  // The spread appears inside the Worker.create options object, so it is on the
  // same line or the lines immediately following Worker.create(. We scan a
  // 10-line window around the call to detect the getAdvWorkerTuningOptions
  // spread.
  const start = Math.max(0, lineNumber - 10 - 1);
  const end = Math.min(lines.length, lineNumber + 10);
  for (let i = start; i < end; i++) {
    if (lines[i].includes("getAdvWorkerTuningOptions")) {
      return true;
    }
  }
  return false;
}

describe("getAdvWorkerTuningOptions", () => {
  it("returns defaults when env is empty", () => {
    const result = getAdvWorkerTuningOptions({});

    expect(result.workflowTaskPollerBehavior).toEqual({
      type: "simple-maximum",
      maximum: 1,
    });
    expect(result.activityTaskPollerBehavior).toEqual({
      type: "simple-maximum",
      maximum: 1,
    });
    expect(result.maxConcurrentWorkflowTaskExecutions).toBe(4);
    expect(result.maxConcurrentActivityTaskExecutions).toBe(4);
    expect(result.maxConcurrentLocalActivityExecutions).toBe(4);
    expect(result.maxActivitiesPerSecond).toBe(10);
  });

  it("overrides values from env", () => {
    const result = getAdvWorkerTuningOptions({
      ADV_WORKER_WORKFLOW_POLLER_CAP: "2",
    });

    expect(result.workflowTaskPollerBehavior.maximum).toBe(2);
  });

  it("falls back to defaults for malformed env values", () => {
    const result = getAdvWorkerTuningOptions({
      ADV_WORKER_WORKFLOW_POLLER_CAP: "not-a-number",
    });

    expect(result.workflowTaskPollerBehavior.maximum).toBe(1);
  });

  it("falls back to defaults for negative env values", () => {
    const result = getAdvWorkerTuningOptions({
      ADV_WORKER_ACTIVITY_RATE: "-5",
    });

    expect(result.maxActivitiesPerSecond).toBe(10);
  });
});

describe("Worker.create tuning drift guard", () => {
  it("every Worker.create in plugin/src/temporal/ spreads getAdvWorkerTuningOptions", () => {
    const files = temporalSourceFiles();
    const violations: { file: string; line: number }[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      const lineNumbers = findWorkerCreateLineNumbers(source);
      for (const line of lineNumbers) {
        if (!hasTuningWithinTenLines(source, line)) {
          violations.push({ file, line });
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
