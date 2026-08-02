import { describe, expect, it } from "vitest";
import { glob } from "node:fs/promises";
import path from "node:path";
import { readFile, mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";

/**
 * Structural source boundary test for the Temporal client-operation owner.
 *
 * Only `src/temporal/operations.ts` may directly import, hold, or invoke the
 * raw `@temporalio/client` SDK surface. All other production code routes
 * Temporal client RPCs through the typed owner API (`TemporalOperations`).
 *
 * The detector is intentionally conservative: if a production file contains any
 * of the forbidden patterns, it is a boundary violation. Test files, the worker
 * bundle root (`src/temporal/workflows.ts`), and worker construction files are
 * exempt from import checks but still guarded from raw-handle storage and
 * structural client interfaces.
 *
 * Patterns guarded:
 *   - named/default/namespace/dynamic imports from `@temporalio/client`
 *   - raw bundle factories: `TemporalClientBundle`, `createTemporalClientBundle`
 *   - raw handle storage: `__handle`, `WorkflowHandleLike`, `WorkflowClientLike`
 *   - structural client interfaces: `workflow: { list|getHandle|start... }`,
 *     `connection: { workflowService|withDeadline|... }`, `workflowService: {...}`
 *   - direct SDK access: `client.workflow.*`, `connection.workflowService.*`,
 *     `connection.withDeadline`, `connection.withAbortSignal`, `connection.close`
 *   - iterator escape: `AsyncIterable` used for visibility lists
 *   - optional/hardcoded 30s budget holes in Temporal operation contexts
 */

const OWNER_FILE = path.normalize("temporal/operations.ts");

const WORKER_CONSTRUCTION_FILES = new Set([
  path.normalize("temporal/worker.ts"),
  path.normalize("temporal/worker-multi.ts"),
  path.normalize("temporal/in-process-worker.ts"),
]);

/** Raw client import patterns (named, default, namespace, dynamic, aliased). */
const CLIENT_IMPORT_RE =
  /import\s+(?:type\s+)?(?:\*\s+as\s+\w+|\w+|\{[^}]*\})\s*,?\s*(?:\*\s+as\s+\w+)?\s*from\s+["']@temporalio\/client["']|import\s*\(\s*["']@temporalio\/client["']\s*\)|const\s+\{\s*[^}]*\}\s*=\s*await\s+import\s*\(\s*["']@temporalio\/client["']\s*\)/;

/** Raw bundle factories that must be private to the owner. */
const BUNDLE_FACTORY_RE =
  /\b(TemporalClientBundle|createTemporalClientBundle)\b/;

/** Raw handle storage patterns. */
const RAW_HANDLE_STORAGE_RE =
  /\b(__handle|WorkflowHandleLike|WorkflowClientLike)\b/;

/** Direct client/connection RPC access, including optional chaining. */
const DIRECT_SDK_ACCESS_RES = [
  /\bclient\.?workflow\.?(list|getHandle|start|signalWithStart|cancel|terminate|query|describe)\b/,
  /\bconnection\.?workflowService\b/,
  /\bconnection\.?(withDeadline|withAbortSignal)\b/,
  /\bconnection\.?close\s*\(/,
];

/** Structural interface definitions that mimic the raw SDK client surface. */
const STRUCTURAL_CLIENT_INTERFACE_RE =
  /interface\s+\w+[^}]*\{[^}]*(?:workflow\s*:\s*\{[^}]*(?:list|getHandle|start|signalWithStart)\b|connection\s*:\s*\{[^}]*(?:workflowService|withDeadline|withAbortSignal)\b|workflowService\s*:\s*\{[^}]*(?:describeNamespace|describeWorkflowExecution|describeTaskQueue)\b)/;

/** Iterator escape: AsyncIterable used for visibility workflow lists. */
const ITERATOR_ESCAPE_RE = /\bAsyncIterable\s*<[^>]*workflowId/;

/** Optional budget holes and legacy 30s defaults. */
const OPTIONAL_BUDGET_RE = /\bbudgetMs\s*(\?\s*:|=\s*30_000)\b/;

/** Strip line and block comments to avoid false-positives in prose. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** Variable aliases and destructuring that can bypass the literal access checks. */
const ALIAS_RE = [
  /(?:const|let|var)\s+\w+\s*=\s*(client|connection)\b(?!\.)/,
  /(?:const|let|var)\s*\{\s*[^}]*\b(?:workflow|workflowService)\b[^}]*\}\s*=\s*(client|connection)\b/,
];

/** Detect all boundary violations in a single source file. */
function detectViolations(relativePath: string, rawSource: string): string[] {
  const violations: string[] = [];
  const isOwner = relativePath === OWNER_FILE;
  const isWorkerConstructionFile = WORKER_CONSTRUCTION_FILES.has(relativePath);
  const source = stripComments(rawSource);

  if (!isOwner) {
    const importMatch = source.match(CLIENT_IMPORT_RE);
    if (importMatch) {
      violations.push(`${relativePath}: ${importMatch[0]}`);
    }
  }

  if (!isOwner) {
    const bundleMatch = source.match(BUNDLE_FACTORY_RE);
    if (bundleMatch) {
      violations.push(`${relativePath}: ${bundleMatch[0]}`);
    }
  }

  if (!isOwner) {
    const handleMatch = source.match(RAW_HANDLE_STORAGE_RE);
    if (handleMatch) {
      violations.push(`${relativePath}: ${handleMatch[0]}`);
    }
  }

  if (!isOwner) {
    // Worker construction files use @temporalio/worker's NativeConnection, not
    // the @temporalio/client Connection surface; skip direct SDK access checks.
    if (!isWorkerConstructionFile) {
      for (const re of DIRECT_SDK_ACCESS_RES) {
        const match = source.match(re);
        if (match) {
          violations.push(`${relativePath}: ${match[0]}`);
        }
      }
      for (const re of ALIAS_RE) {
        const match = source.match(re);
        if (match) {
          violations.push(`${relativePath}: alias/destructuring ${match[0]}`);
        }
      }
    }
  }

  if (!isOwner) {
    const structuralMatch = source.match(STRUCTURAL_CLIENT_INTERFACE_RE);
    if (structuralMatch) {
      violations.push(`${relativePath}: structural client interface`);
    }
  }

  if (!isOwner) {
    const iterMatch = source.match(ITERATOR_ESCAPE_RE);
    if (iterMatch) {
      violations.push(`${relativePath}: ${iterMatch[0]}`);
    }
  }

  if (!isOwner) {
    const budgetMatch = source.match(OPTIONAL_BUDGET_RE);
    if (budgetMatch) {
      violations.push(`${relativePath}: ${budgetMatch[0]}`);
    }
  }

  return violations;
}

async function findProductionFiles(srcRoot: string): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of glob("**/*.ts", { cwd: srcRoot })) {
    const relative = path.normalize(entry);
    if (relative.startsWith("__tests__/")) continue;
    if (relative.startsWith("__fixtures__/")) continue;
    if (relative.startsWith("__mocks__/")) continue;
    if (relative.includes("/__tests__/")) continue;
    if (relative.includes("/__fixtures__/")) continue;
    if (relative.includes("/__mocks__/")) continue;
    if (
      relative.endsWith(".test.ts") ||
      relative.endsWith(".itest.ts") ||
      relative.endsWith(".assets.test.ts")
    ) {
      continue;
    }
    if (relative.endsWith(".d.ts")) continue;
    files.push(relative);
  }
  return files;
}

async function scanForViolations(root: string): Promise<string[]> {
  const files = await findProductionFiles(root);
  const violations: string[] = [];
  for (const relative of files) {
    const content = await readFile(path.join(root, relative), "utf-8");
    violations.push(...detectViolations(relative, content));
  }
  return violations;
}

describe("Temporal client-operation boundary", () => {
  const srcRoot = path.resolve(import.meta.dirname, "..");
  const binRoot = path.resolve(import.meta.dirname, "..", "..", "..", "bin");
  const scriptsRoot = path.resolve(import.meta.dirname, "..", "..", "scripts");
  const rootScriptsRoot = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "scripts",
  );

  it("no production module imports from @temporalio/client except the owner", async () => {
    expect(await scanForViolations(srcRoot)).toEqual([]);
  });

  it("no root CLI production file imports from @temporalio/client or the raw bundle factory", async () => {
    expect(await scanForViolations(binRoot)).toEqual([]);
  });

  it("no scripts production file imports from @temporalio/client or the raw bundle factory", async () => {
    expect(await scanForViolations(scriptsRoot)).toEqual([]);
  });

  it("no root scripts production file imports from @temporalio/client or the raw bundle factory", async () => {
    expect(await scanForViolations(rootScriptsRoot)).toEqual([]);
  });

  it("detector catches synthetic violating fixtures", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "adv-boundary-"));
    try {
      const fixtures: Array<{ name: string; source: string; expect: string }> =
        [
          {
            name: "named-import.ts",
            source: `import { Client } from "@temporalio/client";\n`,
            expect: "@temporalio/client",
          },
          {
            name: "type-import.ts",
            source: `import type { Connection } from "@temporalio/client";\n`,
            expect: "@temporalio/client",
          },
          {
            name: "dynamic-import.ts",
            source: `const { Client } = await import("@temporalio/client");\n`,
            expect: "@temporalio/client",
          },
          {
            name: "bundle-factory.ts",
            source: `import { createTemporalClientBundle } from "./temporal/operations";\nconst b = createTemporalClientBundle();\n`,
            expect: "createTemporalClientBundle",
          },
          {
            name: "raw-handle-storage.ts",
            source: `export function wrap(h: any) { return { __handle: h }; }\n`,
            expect: "__handle",
          },
          {
            name: "structural-client.ts",
            source: `export interface ListClient { workflow: { list(opts: { query: string }): AsyncIterable<{ workflowId: string }> } }\n`,
            expect: "structural client interface",
          },
          {
            name: "direct-client-list.ts",
            source: `for await (const x of client.workflow.list({ query: "" })) {}\n`,
            expect: "client.workflow.list",
          },
          {
            name: "direct-connection-close.ts",
            source: `await connection.close();\n`,
            expect: "connection.close",
          },
          {
            name: "iterator-escape.ts",
            source: `export function list(): AsyncIterable<{ workflowId: string }> { throw new Error(); }\n`,
            expect: "AsyncIterable",
          },
          {
            name: "optional-budget.ts",
            source: `function makeCtx(budgetMs = 30_000) { return { budgetMs }; }\n`,
            expect: "budgetMs = 30_000",
          },
          {
            name: "bin-raw-client-import.ts",
            source: `import { Client } from "@temporalio/client";\n`,
            expect: "@temporalio/client",
          },
          {
            name: "bin-bundle-factory-from-boundary.ts",
            source: `import { createTemporalClientBundle } from "../../plugin/src/cli/temporal-boundary";\n`,
            expect: "createTemporalClientBundle",
          },
          {
            name: "bin-direct-getHandle-query.ts",
            source: `await client.workflow.getHandle("wf").query("q");\n`,
            expect: "client.workflow.getHandle",
          },
          {
            name: "root-scripts-raw-client-import.ts",
            source: `import { Client } from "@temporalio/client";\n`,
            expect: "@temporalio/client",
          },
          {
            name: "root-scripts-bundle-factory.ts",
            source: `import { createTemporalClientBundle } from "../plugin/src/temporal/operations";\n`,
            expect: "createTemporalClientBundle",
          },
        ];

      for (const f of fixtures) {
        await writeFile(path.join(tmp, f.name), f.source, "utf-8");
      }

      for (const f of fixtures) {
        const content = await readFile(path.join(tmp, f.name), "utf-8");
        const violations = detectViolations(f.name, content);
        expect(violations.length).toBeGreaterThan(0);
        expect(violations.some((v) => v.includes(f.expect))).toBe(true);
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("owner file is allowed to hold the raw SDK surface", async () => {
    const content = await readFile(path.join(srcRoot, OWNER_FILE), "utf-8");
    const violations = detectViolations(OWNER_FILE, content);
    expect(violations).toEqual([]);
  });

  it("only the canonical operations.ts owner is allowed across all scanned roots", async () => {
    const srcViolations = await scanForViolations(srcRoot);
    const binViolations = await scanForViolations(binRoot);
    const scriptsViolations = await scanForViolations(scriptsRoot);
    const rootScriptsViolations = await scanForViolations(rootScriptsRoot);
    expect(srcViolations).toEqual([]);
    expect(binViolations).toEqual([]);
    expect(scriptsViolations).toEqual([]);
    expect(rootScriptsViolations).toEqual([]);
  });

  it("synthetic second owner file is detected as a boundary violation", async () => {
    const tmp = await mkdtemp(
      path.join(tmpdir(), "adv-boundary-second-owner-"),
    );
    try {
      const ownerDir = path.join(tmp, "temporal");
      await mkdir(ownerDir, { recursive: true });
      await writeFile(
        path.join(ownerDir, "operations2.ts"),
        `import { Client } from "@temporalio/client";\n`,
        "utf-8",
      );
      const violations = await scanForViolations(tmp);
      expect(violations.length).toBeGreaterThan(0);
      expect(
        violations.some(
          (v) =>
            v.includes("operations2.ts") && v.includes("@temporalio/client"),
        ),
      ).toBe(true);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("synthetic root scripts owner file is detected as a boundary violation", async () => {
    const tmp = await mkdtemp(
      path.join(tmpdir(), "adv-boundary-root-scripts-owner-"),
    );
    try {
      const scriptsDir = path.join(tmp, "scripts");
      await mkdir(scriptsDir, { recursive: true });
      await writeFile(
        path.join(scriptsDir, "temporal-owner.ts"),
        `import { Client } from "@temporalio/client";\n`,
        "utf-8",
      );
      const violations = await scanForViolations(tmp);
      expect(violations.length).toBeGreaterThan(0);
      expect(
        violations.some(
          (v) =>
            v.includes("temporal-owner.ts") && v.includes("@temporalio/client"),
        ),
      ).toBe(true);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("worker construction files are allowed NativeConnection lifecycle", async () => {
    const workerFile = path.join(srcRoot, "temporal", "worker.ts");
    const content = await readFile(workerFile, "utf-8");
    const violations = detectViolations("temporal/worker.ts", content);
    expect(violations).toEqual([]);
  });
});

export { detectViolations };
