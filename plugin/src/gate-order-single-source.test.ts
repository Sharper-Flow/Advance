import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const GATE_IDS = [
  "proposal",
  "discovery",
  "design",
  "planning",
  "execution",
  "acceptance",
  "release",
] as const;

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") files.push(...sourceFiles(path));
    } else if (
      /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) &&
      !/\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)
    ) {
      files.push(path);
    }
  }
  return files;
}

function stringProperty(
  element: ts.Expression,
  propertyName: string,
): string | undefined {
  if (!ts.isObjectLiteralExpression(element)) return undefined;
  const property = element.properties.find(
    (candidate): candidate is ts.PropertyAssignment =>
      ts.isPropertyAssignment(candidate) &&
      ts.isIdentifier(candidate.name) &&
      candidate.name.text === propertyName,
  );
  return property && ts.isStringLiteral(property.initializer)
    ? property.initializer.text
    : undefined;
}

function declaresGateSequence(source: string): boolean {
  const file = ts.createSourceFile(
    "source.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let found = false;

  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      (node.name.text === "GATE_ORDER" || node.name.text === "GATE_DEFS") &&
      node.initializer
    ) {
      let initializer = node.initializer;
      while (
        ts.isAsExpression(initializer) ||
        ts.isTypeAssertionExpression(initializer) ||
        ts.isParenthesizedExpression(initializer)
      ) {
        initializer = initializer.expression;
      }
      if (ts.isArrayLiteralExpression(initializer)) {
        const ids = initializer.elements.map((element) =>
          ts.isStringLiteral(element)
            ? element.text
            : stringProperty(element, "id"),
        );
        found = GATE_IDS.every((gateId, index) => ids[index] === gateId);
      }
    }
    if (!found) ts.forEachChild(node, visit);
  }

  visit(file);
  return found;
}

describe("GATE_ORDER declarations", () => {
  it("allows gate sequences only at approved boundaries", () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const matches = [
      ...sourceFiles(resolve(repoRoot, "plugin/src")),
      ...sourceFiles(resolve(repoRoot, "bin")),
    ]
      .filter((path) => declaresGateSequence(readFileSync(path, "utf8")))
      .map((path) => relative(repoRoot, path))
      .sort();

    expect(matches).toEqual([
      "plugin/src/shared/cli-projection.ts",
      "plugin/src/types/gates.ts",
    ]);
  });
});
