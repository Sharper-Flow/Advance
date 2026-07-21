import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { getAdvWorkerTuningOptions } from "./worker-tuning";

const thisDir = dirname(fileURLToPath(import.meta.url));

function temporalSourceFiles(): string[] {
  return readdirSync(thisDir, { recursive: true })
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
  // The spread is inside the options object, after Worker.create(. Restrict the
  // ten-line scan to that object so a nearby, separately-created worker cannot
  // satisfy this call's guard.
  const window = lines.slice(lineNumber - 1, lineNumber + 10).join("\n");
  const objectStart = window.indexOf("{");
  if (objectStart < 0) return false;

  let braceDepth = 0;
  for (let i = objectStart; i < window.length; i++) {
    if (window[i] === "{") braceDepth++;
    if (
      braceDepth > 0 &&
      window.slice(i).match(/^\.\.\.\s*getAdvWorkerTuningOptions\s*\(/)
    ) {
      return true;
    }
    if (window[i] === "}" && --braceDepth === 0) return false;
  }
  return false;
}

describe("getAdvWorkerTuningOptions", () => {
  it("returns defaults when env is empty", () => {
    const result = getAdvWorkerTuningOptions({});

    expect(result.workflowTaskPollerBehavior).toEqual({
      type: "simple-maximum",
      // SDK invariant: max_cached_workflows > 0 requires ≥2 workflow pollers.
      maximum: 2,
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
      ADV_WORKER_WORKFLOW_POLLER_CAP: "4",
    });

    expect(result.workflowTaskPollerBehavior.maximum).toBe(4);
  });

  it("falls back to defaults for malformed env values", () => {
    const result = getAdvWorkerTuningOptions({
      ADV_WORKER_WORKFLOW_POLLER_CAP: "not-a-number",
    });

    expect(result.workflowTaskPollerBehavior.maximum).toBe(2);
  });

  it("falls back to defaults for negative env values", () => {
    const result = getAdvWorkerTuningOptions({
      ADV_WORKER_ACTIVITY_RATE: "-5",
    });

    expect(result.maxActivitiesPerSecond).toBe(10);
  });

  it("rejects zero for any cap (would silently disable polling/slots)", () => {
    const result = getAdvWorkerTuningOptions({
      ADV_WORKER_WORKFLOW_POLLER_CAP: "0",
      ADV_WORKER_ACTIVITY_POLLER_CAP: "0",
      ADV_WORKER_WORKFLOW_SLOT_CAP: "0",
      ADV_WORKER_ACTIVITY_SLOT_CAP: "0",
      ADV_WORKER_LOCAL_ACTIVITY_SLOT_CAP: "0",
      ADV_WORKER_ACTIVITY_RATE: "0",
    });

    // All caps should fall back to defaults — zero is never a valid cap.
    expect(result.workflowTaskPollerBehavior.maximum).toBe(2);
    expect(result.activityTaskPollerBehavior.maximum).toBe(1);
    expect(result.maxConcurrentWorkflowTaskExecutions).toBe(4);
    expect(result.maxConcurrentActivityTaskExecutions).toBe(4);
    expect(result.maxConcurrentLocalActivityExecutions).toBe(4);
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
