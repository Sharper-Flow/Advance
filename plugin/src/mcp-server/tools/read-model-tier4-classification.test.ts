/**
 * Structural test for the Tier-4 MCP read-model classification table.
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

function literalUnionMembers(
  source: ts.SourceFile,
  typeName: string,
): string[] {
  const members: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === typeName) {
      function collectUnion(n: ts.TypeNode) {
        if (ts.isUnionTypeNode(n)) {
          for (const t of n.types) collectUnion(t);
        } else if (ts.isLiteralTypeNode(n) && ts.isStringLiteral(n.literal)) {
          members.push(n.literal.text);
        }
      }
      collectUnion(node.type);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return members;
}

function unwrapExpression(node: ts.Expression): ts.Expression {
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    return unwrapExpression(node.expression);
  }
  return node;
}

function toolClassificationMap(
  source: ts.SourceFile,
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "TOOL_CLASSIFICATIONS" &&
      node.initializer
    ) {
      const unwrapped = unwrapExpression(node.initializer);
      if (ts.isObjectLiteralExpression(unwrapped)) {
        for (const prop of unwrapped.properties) {
          if (
            ts.isPropertyAssignment(prop) &&
            ts.isArrayLiteralExpression(prop.initializer)
          ) {
            const key = prop.name.getText(source).replace(/^["']|["']$/g, "");
            map[key] = prop.initializer.elements.map((e) => {
              if (ts.isStringLiteral(e)) return e.text;
              return e.getText(source).replace(/^["']|["']$/g, "");
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return map;
}

describe("Tier-4 read-model classification", () => {
  const source = parseSource("./index.ts");

  it("ToolClassification type includes needs-read-model", () => {
    expect(literalUnionMembers(source, "ToolClassification")).toContain(
      "needs-read-model",
    );
  });

  it("read-model-backed tools are classified as needs-read-model", () => {
    const map = toolClassificationMap(source);
    for (const tool of ["epic_list", "epic_show", "wip_state"]) {
      expect(map[tool], `expected ${tool} to be needs-read-model`).toContain(
        "needs-read-model",
      );
    }
  });

  it("status is read-model-backed", () => {
    const map = toolClassificationMap(source);
    expect(map["status"]).toContain("needs-read-model");
  });
});
