import { describe, expect, it } from "vitest";
import {
  buildWorkflowReachabilityGraph,
  evaluateWorkflowBehaviorChangeEvidence,
  extractPatchMarkers,
  importSources,
  resolveLocalImport,
  type FileSystemReader,
  type WorkflowBehaviorChangeEvidenceInput,
} from "./workflow-evolution-guard";

function inMemoryReader(files: Record<string, string>): FileSystemReader {
  return {
    readFile(path: string): string | undefined {
      return files[path];
    },
    isFile(path: string): boolean {
      return path in files;
    },
  };
}

const repoRoot = "/repo";
const entryPoint = "/repo/src/workflows.ts";

const baseFiles: Record<string, string> = {
  [entryPoint]: `
import { helper } from "./helper";
import type { X } from "../types";
export async function workflow() { helper(); }
`,
  "/repo/src/helper.ts": `
import { inner } from "./inner";
export function helper() { inner(); }
`,
  "/repo/src/inner.ts": `
import * as wf from "@temporalio/workflow";
export function inner() { if (wf.patched("inner-patch-v1")) { return 1; } return 0; }
`,
  "/repo/types.ts": `export interface X {}`,
  "/repo/src/unrelated.ts": `export const x = 1;`,
};

describe("buildWorkflowReachabilityGraph", () => {
  it("follows local imports from the entry point", () => {
    const graph = buildWorkflowReachabilityGraph(
      entryPoint,
      inMemoryReader(baseFiles),
    );
    expect(graph.has(entryPoint)).toBe(true);
    expect(graph.has("/repo/src/helper.ts")).toBe(true);
    expect(graph.has("/repo/src/inner.ts")).toBe(true);
    expect(graph.has("/repo/types.ts")).toBe(true);
    expect(graph.has("/repo/src/unrelated.ts")).toBe(false);
  });

  it("records parent pointers for diagnostics", () => {
    const graph = buildWorkflowReachabilityGraph(
      entryPoint,
      inMemoryReader(baseFiles),
    );
    expect(graph.get("/repo/src/helper.ts")).toBe(entryPoint);
    expect(graph.get("/repo/src/inner.ts")).toBe("/repo/src/helper.ts");
  });

  it("resolves directory index imports", () => {
    const files: Record<string, string> = {
      "/repo/src/workflows.ts": `import { x } from "./dir"; export async function w() {}`,
      "/repo/src/dir/index.ts": `export const x = 1;`,
    };
    const graph = buildWorkflowReachabilityGraph(
      "/repo/src/workflows.ts",
      inMemoryReader(files),
    );
    expect(graph.has("/repo/src/dir/index.ts")).toBe(true);
  });
});

describe("importSources", () => {
  it("collects import and export sources, ignoring type-only imports", () => {
    const sources = importSources(`
      import { a } from "./a";
      import type { B } from "./b";
      export { c } from "./c";
      export type { D } from "./d";
      export async function x() {}
    `);
    expect(sources).toContain("./a");
    expect(sources).toContain("./b");
    expect(sources).toContain("./c");
    expect(sources).toContain("./d");
  });
});

describe("resolveLocalImport", () => {
  it("returns undefined for non-local imports", () => {
    expect(
      resolveLocalImport(
        entryPoint,
        "@temporalio/workflow",
        inMemoryReader(baseFiles),
      ),
    ).toBeUndefined();
  });

  it("resolves an explicit .ts import", () => {
    expect(
      resolveLocalImport(entryPoint, "./helper.ts", inMemoryReader(baseFiles)),
    ).toBe("/repo/src/helper.ts");
  });

  it("resolves a bare relative import to the .ts file", () => {
    expect(
      resolveLocalImport(entryPoint, "./helper", inMemoryReader(baseFiles)),
    ).toBe("/repo/src/helper.ts");
  });

  it("returns undefined for a non-existent relative import", () => {
    expect(
      resolveLocalImport(entryPoint, "./missing", inMemoryReader(baseFiles)),
    ).toBeUndefined();
  });
});

describe("extractPatchMarkers", () => {
  it("extracts wf.patched and wf.deprecatePatch markers", () => {
    expect(
      extractPatchMarkers(`
        if (wf.patched("feature-v1")) { return 1; }
        wf.deprecatePatch("legacy-v2");
      `),
    ).toEqual(["feature-v1", "legacy-v2"]);
  });

  it("returns empty when no markers are present", () => {
    expect(extractPatchMarkers(`const x = 1;`)).toEqual([]);
  });
});

function evaluate(
  changedFiles: string[],
  fixtureCoverage: string[],
  files: Record<string, string> = baseFiles,
): ReturnType<typeof evaluateWorkflowBehaviorChangeEvidence> {
  const input: WorkflowBehaviorChangeEvidenceInput = {
    repoRoot,
    entryPoint,
    changedFiles,
    fixtureCoverage,
    fs: inMemoryReader(files),
  };
  return evaluateWorkflowBehaviorChangeEvidence(input);
}

describe("evaluateWorkflowBehaviorChangeEvidence", () => {
  it("passes when no changed file reaches workflow code", () => {
    const result = evaluate(["src/unrelated.ts"], ["inner-patch-v1"]);
    expect(result.ok).toBe(true);
    expect(result.reachedWorkflow).toBe(false);
    expect(result.reachedFiles).toEqual([]);
  });

  it("passes when a reachable change introduces a covered patch marker", () => {
    const result = evaluate(["src/inner.ts"], ["inner-patch-v1"]);
    expect(result.ok).toBe(true);
    expect(result.reachedWorkflow).toBe(true);
    expect(result.patchMarkers).toEqual(["inner-patch-v1"]);
  });

  it("fails when a reachable change introduces an uncovered patch marker", () => {
    const result = evaluate(["src/inner.ts"], ["other-patch-v2"]);
    expect(result.ok).toBe(false);
    expect(result.reachedWorkflow).toBe(true);
    expect(result.missing).toEqual([
      'workflow-reachable patch marker "inner-patch-v1" is not covered by a replay fixture',
    ]);
  });

  it("passes when a reachable change has no patch marker but is listed in fixture coverage", () => {
    const files = {
      ...baseFiles,
      "/repo/src/helper.ts": `export function helper() { return 1; }`,
    };
    const result = evaluate(["src/helper.ts"], ["src/helper.ts"], files);
    expect(result.ok).toBe(true);
    expect(result.reachedWorkflow).toBe(true);
  });

  it("fails when a reachable change has no patch marker and no fixture coverage", () => {
    const files = {
      ...baseFiles,
      "/repo/src/helper.ts": `export function helper() { return 1; }`,
    };
    const result = evaluate(["src/helper.ts"], [], files);
    expect(result.ok).toBe(false);
    expect(result.reachedWorkflow).toBe(true);
    expect(result.missing).toEqual([
      "workflow-reachable behavior change introduces no Temporal patch marker and no listed replay fixture coverage",
    ]);
  });

  it("fails when at least one of multiple markers is uncovered", () => {
    const files = {
      ...baseFiles,
      "/repo/src/inner.ts": `
        import * as wf from "@temporalio/workflow";
        export function inner() {
          if (wf.patched("patch-a")) return 1;
          if (wf.patched("patch-b")) return 2;
          return 0;
        }
      `,
    };
    const result = evaluate(["src/inner.ts"], ["patch-a"], files);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain(
      'workflow-reachable patch marker "patch-b" is not covered by a replay fixture',
    );
  });

  it("reports all reachable changed files", () => {
    const result = evaluate(
      ["src/inner.ts", "src/unrelated.ts"],
      ["inner-patch-v1"],
    );
    expect(result.reachedFiles).toEqual(["/repo/src/inner.ts"]);
  });
});
