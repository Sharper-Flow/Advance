/**
 * Positive regression test for tool catalog / describe purity.
 *
 * The catalog/describe tools are read-only projections of the canonical tool
 * inventory and must not depend on a Store, Temporal, or any other runtime
 * authority.
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

function objectLiteralText(
  source: ts.SourceFile,
  variableName: string,
): string {
  let text = "";
  function visit(node: ts.Node) {
    if (text) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === variableName &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      text = node.initializer.getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return text;
}

describe("tool catalog / describe purity", () => {
  const source = parseSource("./tool-registry.ts");

  it("toolCatalogTools object literal has no Store, Temporal, or storage dependency", () => {
    const text = objectLiteralText(source, "toolCatalogTools");
    expect(text).toBeTruthy();
    expect(text).not.toMatch(/\bStore\b/);
    expect(text).not.toMatch(/\btemporal\b/i);
    expect(text).not.toMatch(/\bstorage\b/i);
    expect(text).not.toMatch(/\bcreateToolMap\b/);
  });
});
