/**
 * RED-phase structural test for the read/command boundary of disk-first active
 * reads.
 *
 * The approved architecture is:
 *
 *   - Routine readers (change-summary-shard,
 *     launcher-projection, epic-projection) must be Temporal-free: no import
 *     path may reach a Temporal module, and they may not call workflow
 *     query/list/describe/getHandle APIs.
 *
 *   - Pure metadata/spec/catalog tools must depend only on neutral read/types
 *     surfaces. Their static and dynamic import graph must not reach Temporal
 *     modules or low-level writer modules (saveChange, summary pointer, active
 *     Epic projection writers).
 *
 *   - Direct active-projection writes are confined to the named transaction /
 *     projection modules. Command adapters route through those helpers.
 *
 *   - Workflow query / handle calls are allowed only in the command
 *     confirmation / recovery / diagnostics allowlist, proving the ban on
 *     routine reads is not overbroad.
 */
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { readFileSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join, relative, extname } from "node:path";
import {
  findExecutableSaveChangeCalls,
  isAllowedSaveChangeCaller,
} from "./save-change-allow-list";

const pluginSrc = resolve(import.meta.dirname, "..");

function parseSource(file: string): ts.SourceFile {
  const text = readFileSync(file, "utf-8");
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
}

function resolveTsPath(p: string): string | undefined {
  const e = extname(p);
  if (e === ".ts" || e === ".tsx" || e === ".js") {
    if (existsSync(p) && statSync(p).isFile()) return p;
    return undefined;
  }
  if (existsSync(p) && statSync(p).isFile()) return p;
  for (const ext of [".ts", ".tsx", ".js"]) {
    const candidate = p + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  const index = join(p, "index.ts");
  if (existsSync(index) && statSync(index).isFile()) return index;
  return undefined;
}

type ModuleRef =
  | { kind: "file"; path: string }
  | { kind: "package"; name: string };

function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
  if (node.importClause?.isTypeOnly) return true;
  const named = node.importClause?.namedBindings;
  if (named && ts.isNamedImports(named)) {
    return (
      named.elements.length > 0 && named.elements.every((el) => el.isTypeOnly)
    );
  }
  return false;
}

function collectDirectImports(
  source: ts.SourceFile,
  baseDir: string,
): ModuleRef[] {
  const refs: ModuleRef[] = [];
  function add(specifier: string) {
    if (specifier.startsWith(".")) {
      const resolved = resolveTsPath(resolve(baseDir, specifier));
      if (resolved) {
        refs.push({ kind: "file", path: resolved });
      }
    } else {
      refs.push({ kind: "package", name: specifier });
    }
  }

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      if (isTypeOnlyImport(node)) {
        return;
      }
      const specifier = node.moduleSpecifier;
      if (specifier && ts.isStringLiteral(specifier)) {
        add(specifier.text);
      }
    } else if (ts.isExportDeclaration(node)) {
      if (node.isTypeOnly) {
        return;
      }
      const specifier = node.moduleSpecifier;
      if (specifier && ts.isStringLiteral(specifier)) {
        add(specifier.text);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        add(arg.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return refs;
}

function reachableModules(entry: string): ModuleRef[] {
  const visited = new Set<string>();
  const result: ModuleRef[] = [];
  const queue: string[] = [entry];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    if (current.includes(".test.") || current.includes(".itest.")) continue;
    const ext = extname(current);
    if (ext !== ".ts" && ext !== ".tsx" && ext !== ".js") continue;
    visited.add(current);

    let source: ts.SourceFile;
    try {
      source = parseSource(current);
    } catch {
      continue;
    }

    const baseDir = dirname(current);
    const refs = collectDirectImports(source, baseDir);
    for (const ref of refs) {
      result.push(ref);
      if (
        ref.kind === "file" &&
        !visited.has(ref.path) &&
        !ref.path.includes(".test.") &&
        !ref.path.includes(".itest.")
      ) {
        queue.push(ref.path);
      }
    }
  }

  return result;
}

function isTemporalModule(ref: ModuleRef): boolean {
  if (ref.kind === "package") {
    return ref.name.includes("/temporal/");
  }
  // Match the dedicated retired Temporal source directory.
  return /\/temporal\//.test(ref.path);
}

const writerModules = new Set(
  [
    "storage/json.ts",
    "storage/change-summary-shard.ts",
    "storage/epic-projection.ts",
    "storage/launcher-projection-writer.ts",
    "storage/store-disk.ts",
    "storage/change-projection-transaction.ts",
  ].map((p) => resolve(pluginSrc, p)),
);

function isWriterModule(ref: ModuleRef): boolean {
  return ref.kind === "file" && writerModules.has(ref.path);
}

function refName(ref: ModuleRef): string {
  return ref.kind === "file" ? relative(pluginSrc, ref.path) : ref.name;
}

function hasWorkflowApiCall(source: ts.SourceFile): boolean {
  const names = new Set(["query", "getHandle", "listWorkflows", "describe"]);
  let found = false;
  function visit(node: ts.Node) {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        names.has(callee.name.text)
      ) {
        found = true;
        return;
      }
      if (ts.isIdentifier(callee) && names.has(callee.text)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

function directStoreImports(source: ts.SourceFile): string[] {
  const specs: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      const spec = node.moduleSpecifier.getText(source).replace(/['"]/g, "");
      if (
        spec.includes("/storage/store") &&
        !spec.includes("/storage/store-types") &&
        !spec.includes("/storage/store-disk")
      ) {
        specs.push(spec);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return specs;
}

const routineReaders = [
  "storage/change-summary-shard-reader.ts",
  "storage/launcher-projection.ts",
  "storage/epic-projection-reader.ts",
].map((p) => resolve(pluginSrc, p));

const pureMetadataRoots = [
  "tools/project.ts",
  "tools/spec.ts",
  "mcp-server/tools/index.ts",
].map((p) => resolve(pluginSrc, p));

describe("routine disk-first readers are Temporal-free", () => {
  for (const file of routineReaders) {
    const rel = relative(pluginSrc, file);

    it(`${rel} import graph does not reach Temporal modules`, () => {
      const temporal = reachableModules(file).filter(isTemporalModule);
      expect(temporal.map(refName)).toEqual([]);
    });

    it(`${rel} does not call workflow query/list/describe/getHandle APIs`, () => {
      const source = parseSource(file);
      expect(hasWorkflowApiCall(source)).toBe(false);
    });
  }
});

describe("pure metadata/spec/catalog roots are isolated", () => {
  for (const file of pureMetadataRoots) {
    const rel = relative(pluginSrc, file);

    it(`${rel} does not reach Temporal or writer modules`, () => {
      const bad = reachableModules(file).filter(
        (ref) => isTemporalModule(ref) || isWriterModule(ref),
      );
      expect(bad.map(refName)).toEqual([]);
    });

    it(`${rel} imports Store only from store-types`, () => {
      const mixed = directStoreImports(parseSource(file));
      expect(mixed).toEqual([]);
    });
  }
});

describe("writer allowlist", () => {
  it("direct saveChange call sites are confined to the allow-list", async () => {
    const repoRoot = resolve(pluginSrc, "../..");
    const calls = await findExecutableSaveChangeCalls(repoRoot);
    const violations: string[] = [];

    for (const call of calls) {
      if (call.file.endsWith(".test.ts") || call.file.endsWith(".itest.ts")) {
        continue;
      }
      if (!isAllowedSaveChangeCaller(call.file, call.contexts).allowed) {
        violations.push(
          `${call.file}:${call.line}:${call.column}: ${call.content.trim()}`,
        );
      }
    }

    expect(violations).toEqual([]);
  });
});
