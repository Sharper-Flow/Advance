/**
 * RED-phase structural test proving that pure filesystem readers still import
 * helpers through the Temporal activities module instead of a neutral
 * filesystem boundary.
 */
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseSource(file: string): ts.SourceFile {
  const path = resolve(import.meta.dirname, file);
  const text = readFileSync(path, "utf-8");
  return ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
}

function importsFromTemporalActivities(source: ts.SourceFile): string[] {
  const names: string[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const specifier = node.moduleSpecifier.text;
      if (
        specifier.endsWith("temporal/activities") ||
        specifier.includes("/temporal/activities")
      ) {
        const clause = node.importClause;
        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const el of clause.namedBindings.elements) {
            names.push(el.name.text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return names;
}

describe("Temporal-free filesystem reader boundary", () => {
  it("store-temporal index does not import filesystem helpers from temporal/activities", () => {
    const source = parseSource("./store-temporal/index.ts");
    const imports = importsFromTemporalActivities(source);
    expect(imports).toEqual([]);
  });

  it("project-context tool does not import from temporal/activities", () => {
    const source = parseSource("../tools/project.ts");
    expect(importsFromTemporalActivities(source)).toEqual([]);
  });
});
