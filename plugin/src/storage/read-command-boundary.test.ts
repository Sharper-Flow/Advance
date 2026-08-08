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
import {
  readFileSync,
  statSync,
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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

type FsReadBinding = {
  moduleName: string;
  importedName: string | null;
};

function isFsModule(moduleName: string): boolean {
  return (
    moduleName === "node:fs" ||
    moduleName === "fs" ||
    moduleName === "node:fs/promises" ||
    moduleName === "fs/promises"
  );
}

function collectFsReadBindings(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
): Map<ts.Symbol, FsReadBinding> {
  const bindings = new Map<ts.Symbol, FsReadBinding>();

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) {
      continue;
    }

    const moduleSpecifier = statement.moduleSpecifier;
    if (
      !ts.isStringLiteral(moduleSpecifier) ||
      !isFsModule(moduleSpecifier.text)
    ) {
      continue;
    }

    const { namedBindings } = statement.importClause;
    if (!namedBindings) continue;

    if (ts.isNamespaceImport(namedBindings)) {
      const symbol = checker.getSymbolAtLocation(namedBindings.name);
      if (symbol) {
        bindings.set(symbol, {
          moduleName: moduleSpecifier.text,
          importedName: null,
        });
      }
      continue;
    }

    for (const element of namedBindings.elements) {
      if (element.isTypeOnly) continue;
      const symbol = checker.getSymbolAtLocation(element.name);
      if (symbol) {
        bindings.set(symbol, {
          moduleName: moduleSpecifier.text,
          importedName: element.propertyName?.text ?? element.name.text,
        });
      }
    }
  }

  // Track local aliases too: importing `readFileSync as rfs` is covered above,
  // but `const rfs = readFileSync` must not create a guard bypass.
  function collectAliases(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const reference = resolveFsReference(node.initializer, checker, bindings);
      const symbol = checker.getSymbolAtLocation(node.name);
      if (reference && symbol) {
        bindings.set(symbol, {
          moduleName: reference.binding.moduleName,
          importedName:
            reference.properties.at(-1) ?? reference.binding.importedName,
        });
      }
    }
    ts.forEachChild(node, collectAliases);
  }
  collectAliases(source);

  return bindings;
}

function resolveFsReference(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  bindings: Map<ts.Symbol, FsReadBinding>,
): { binding: FsReadBinding; properties: string[] } | undefined {
  if (ts.isIdentifier(expression)) {
    const symbol = checker.getSymbolAtLocation(expression);
    const binding = symbol && bindings.get(symbol);
    if (!binding) return undefined;
    return {
      binding,
      properties: binding.importedName ? [binding.importedName] : [],
    };
  }

  if (ts.isPropertyAccessExpression(expression)) {
    const root = resolveFsReference(expression.expression, checker, bindings);
    if (!root) return undefined;
    return {
      binding: root.binding,
      properties: [...root.properties, expression.name.text],
    };
  }

  return undefined;
}

function isChangeJsonReader(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
  bindings: Map<ts.Symbol, FsReadBinding>,
): boolean {
  const reference = resolveFsReference(call.expression, checker, bindings);
  if (!reference) return false;

  const { moduleName, importedName } = reference.binding;
  const { properties } = reference;
  if (moduleName === "node:fs" || moduleName === "fs") {
    return (
      (importedName === "readFileSync" && properties.length === 1) ||
      (importedName === "readFile" && properties.length === 1) ||
      (importedName === "promises" &&
        properties.join(".") === "promises.readFile") ||
      (importedName === null &&
        (properties.join(".") === "readFileSync" ||
          properties.join(".") === "readFile" ||
          properties.join(".") === "promises.readFile"))
    );
  }

  return (
    (moduleName === "node:fs/promises" || moduleName === "fs/promises") &&
    properties.length === 1 &&
    properties[0] === "readFile" &&
    (importedName === null || importedName === "readFile")
  );
}

function isChangeJsonLiteral(expression: ts.Expression): boolean {
  if (!ts.isStringLiteralLike(expression)) return false;
  const normalized = expression.text.replaceAll("\\", "/");
  return normalized === "change.json" || normalized.endsWith("/change.json");
}

/**
 * Modules permitted to read a `change.json` path directly, each with the
 * reason the bounded/validated reader is not the right tool there.
 *
 * This is an explicit allowlist on purpose. An earlier revision instead
 * conjoined the traversal with "file also contains an `as ChangeState` cast",
 * which silently hid four other raw readers and would have let any future
 * violator through by casting to a different type. Membership here must be a
 * deliberate, reviewed decision (P33) — not a side effect of how a file
 * happens to be written.
 */
const CHANGE_JSON_READ_ALLOWLIST: ReadonlyArray<{
  readonly path: string;
  readonly reason: string;
}> = [
  {
    path: "storage/change-projection-reader.ts",
    reason:
      "Owns the bounded, ChangeSchema-validated read. This is the entry point every other caller must route through.",
  },
  {
    path: "storage/reconcile-action-quarantine.ts",
    reason:
      "Quarantine repair reads raw bytes precisely because the file may be corrupt. Routing through the validated reader would reject the input this module exists to recover.",
  },
  {
    path: "tools/_recovery-writers.ts",
    reason:
      "Reads an ARCHIVE BUNDLE manifest (bundleDir/change.json), not an active projection, and asserts object shape before use.",
  },
  {
    path: "tools/change/helpers.ts",
    reason:
      "Reads an ARCHIVE BUNDLE manifest and runs ChangeSchema.parse on it before use.",
  },
];

function findChangeJsonReaders(sourcePathsOverride?: string[]): string[] {
  const sourcePaths =
    sourcePathsOverride ??
    ts.sys
      .readDirectory(
        pluginSrc,
        [".ts", ".tsx", ".js"],
        ["node_modules", "dist"],
      )
      .filter((file) => !file.includes(".test.") && !file.includes(".itest."));
  const program = ts.createProgram(sourcePaths, {
    allowJs: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ESNext,
    skipLibCheck: true,
    types: ["node"],
  });
  const readers: string[] = [];
  const allowlisted = new Set(
    CHANGE_JSON_READ_ALLOWLIST.map((entry) => resolve(pluginSrc, entry.path)),
  );

  for (const file of sourcePaths) {
    if (allowlisted.has(file)) continue;
    const source = program.getSourceFile(file);
    if (!source) continue;
    const checker = program.getTypeChecker();
    const bindings = collectFsReadBindings(source, checker);
    const initializers = new Map<ts.Symbol, ts.Expression>();

    function collectInitializers(node: ts.Node) {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer
      ) {
        const symbol = checker.getSymbolAtLocation(node.name);
        if (symbol) initializers.set(symbol, node.initializer);
      }
      ts.forEachChild(node, collectInitializers);
    }
    collectInitializers(source);

    function resolvesToChangeJson(
      expression: ts.Expression,
      seen = new Set<ts.Symbol>(),
    ): boolean {
      if (isChangeJsonLiteral(expression)) return true;
      if (ts.isIdentifier(expression)) {
        const symbol = checker.getSymbolAtLocation(expression);
        const initializer = symbol && initializers.get(symbol);
        if (!symbol || !initializer || seen.has(symbol)) return false;
        const nextSeen = new Set(seen);
        nextSeen.add(symbol);
        return resolvesToChangeJson(initializer, nextSeen);
      }
      if (ts.isParenthesizedExpression(expression)) {
        return resolvesToChangeJson(expression.expression, seen);
      }
      if (ts.isCallExpression(expression)) {
        return expression.arguments.some((argument) =>
          resolvesToChangeJson(argument, seen),
        );
      }
      if (ts.isBinaryExpression(expression)) {
        return (
          resolvesToChangeJson(expression.left, seen) ||
          resolvesToChangeJson(expression.right, seen)
        );
      }
      if (ts.isTemplateExpression(expression)) {
        return expression.templateSpans.some((span) =>
          resolvesToChangeJson(span.expression, seen),
        );
      }
      return false;
    }

    let found = false;
    function visit(node: ts.Node) {
      if (found) return;
      if (
        ts.isCallExpression(node) &&
        isChangeJsonReader(node, checker, bindings) &&
        node.arguments[0] &&
        resolvesToChangeJson(node.arguments[0])
      ) {
        found = true;
        return;
      }
      ts.forEachChild(node, visit);
    }
    visit(source);

    if (found) readers.push(relative(pluginSrc, file));
  }

  return readers.sort();
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

describe("raw change.json reader boundary", () => {
  // findChangeJsonReaders builds a ts.Program over the whole of src, which
  // takes several seconds on its own and longer when the suite runs in
  // parallel. The 5s default timeout is not enough and made this guard fail
  // intermittently under load — a structural guard that reds CI at random
  // teaches people to ignore it, so the budget is explicit here.
  it("confines direct change.json reads to the reviewed allowlist", () => {
    // No violations: every change.json read now routes through the bounded,
    // ChangeSchema-validated loadChange. The guard catches reintroduction
    // including aliased imports and local-variable aliases.
    expect(findChangeJsonReaders()).toEqual([]);
  }, 120_000);

  it("detects imported and local aliases of an fs reader", () => {
    const root = mkdtempSync(join(tmpdir(), "adv-change-json-reader-"));
    const importedAliasFixture = join(root, "imported-alias.ts");
    const localAliasFixture = join(root, "local-alias.ts");
    try {
      writeFileSync(
        importedAliasFixture,
        [
          'import { readFileSync as rfs } from "node:fs";',
          'rfs("change.json", "utf8");',
        ].join("\n"),
      );
      writeFileSync(
        localAliasFixture,
        [
          'import { readFileSync } from "node:fs";',
          "const rfs = readFileSync;",
          'const path = "change.json";',
          'rfs(path, "utf8");',
        ].join("\n"),
      );
      expect(
        findChangeJsonReaders([importedAliasFixture, localAliasFixture]),
      ).toEqual([
        relative(pluginSrc, importedAliasFixture),
        relative(pluginSrc, localAliasFixture),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
