import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workerSource = readFileSync(
  fileURLToPath(new URL("./worker.ts", import.meta.url)),
  "utf8",
);

const inProcessWorkerSource = readFileSync(
  fileURLToPath(new URL("./in-process-worker.ts", import.meta.url)),
  "utf8",
);

describe("source-mode worker path resolver (A4a)", () => {
  it("worker.ts has a resolveWorkflowsPath helper that prefers workflows.js and falls back to workflows.ts", () => {
    expect(workerSource).toMatch(/function resolveWorkflowsPath\(\)/);
    expect(workerSource).toMatch(
      /new URL\("\.\/workflows\.js", import\.meta\.url\)/,
    );
    expect(workerSource).toMatch(
      /new URL\("\.\/workflows\.ts", import\.meta\.url\)/,
    );
    expect(workerSource).toMatch(/existsSync\(/);
  });

  it("worker.ts passes the resolved workflowsPath into Worker.create", () => {
    expect(workerSource).toMatch(
      /workflowsPath: options\.workflowsPath \?\? resolveWorkflowsPath\(\)/,
    );
  });

  it("in-process-worker.ts has a resolveWorkflowsPath helper mirroring the worker.ts pattern", () => {
    expect(inProcessWorkerSource).toMatch(/function resolveWorkflowsPath\(\)/);
    expect(inProcessWorkerSource).toMatch(
      /new URL\("\.\/workflows\.js", import\.meta\.url\)/,
    );
    expect(inProcessWorkerSource).toMatch(
      /new URL\("\.\/workflows\.ts", import\.meta\.url\)/,
    );
    expect(inProcessWorkerSource).toMatch(/existsSync\(/);
  });

  it("in-process-worker.ts passes the resolved workflowsPath into Worker.create", () => {
    // Module computes `workflowsPath` once via `const workflowsPath = input.workflowsPath ?? resolveWorkflowsPath();`
    // then forwards the local into Worker.create for every registered queue.
    expect(inProcessWorkerSource).toMatch(
      /const workflowsPath = input\.workflowsPath \?\? resolveWorkflowsPath\(\);/,
    );
    expect(inProcessWorkerSource).toMatch(/Worker\.create\(\{[\s\S]*?workflowsPath[\s\S]*?\}\)/);
  });
});
