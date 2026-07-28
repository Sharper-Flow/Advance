/**
 * RED-phase structural tests for the ReadStore / CommandStore boundary.
 *
 * These tests prove that the current Store interface is a single mixed-authority
 * facade and that the projected ReadSnapshot<T> union and the read/command
 * split are not yet present. They should fail until the read-model split is
 * implemented.
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

function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true
  );
}

function findInterface(
  source: ts.SourceFile,
  name: string,
): ts.InterfaceDeclaration | undefined {
  let found: ts.InterfaceDeclaration | undefined;
  function visit(node: ts.Node) {
    if (
      ts.isInterfaceDeclaration(node) &&
      node.name.text === name &&
      isExported(node)
    ) {
      found = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

function findTypeAlias(
  source: ts.SourceFile,
  name: string,
): ts.TypeAliasDeclaration | undefined {
  let found: ts.TypeAliasDeclaration | undefined;
  function visit(node: ts.Node) {
    if (
      ts.isTypeAliasDeclaration(node) &&
      node.name.text === name &&
      isExported(node)
    ) {
      found = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

function interfaceMemberNames(
  source: ts.SourceFile,
  decl: ts.InterfaceDeclaration,
): string[] {
  return decl.members.map((m) => {
    if (
      (ts.isPropertySignature(m) || ts.isMethodSignature(m)) &&
      (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name))
    ) {
      return m.name.text;
    }
    return m.getText(source).split(/[:\s?]/)[0];
  });
}

describe("ReadStore / CommandStore boundary", () => {
  const source = parseSource("store-types.ts");

  it("Store is a single interface that currently mixes read and mutation authority", () => {
    const store = findInterface(source, "Store");
    expect(store).toBeDefined();
    const members = interfaceMemberNames(source, store!);

    // Read surfaces
    expect(members).toContain("specs");
    expect(members).toContain("changes");
    expect(members).toContain("status");

    // Mutation surfaces
    expect(members).toContain("tasks");
    expect(members).toContain("gates");
    expect(members).toContain("wisdom");
    expect(members).toContain("epics");
  });

  it("exports a separate ReadStore interface", () => {
    expect(
      findInterface(source, "ReadStore") ?? findTypeAlias(source, "ReadStore"),
    ).toBeDefined();
  });

  it("exports a separate CommandStore interface", () => {
    expect(
      findInterface(source, "CommandStore") ??
        findTypeAlias(source, "CommandStore"),
    ).toBeDefined();
  });

  it("Store is composed from ReadStore and CommandStore", () => {
    const store = findInterface(source, "Store");
    expect(store).toBeDefined();
    const heritage =
      store!.heritageClauses?.flatMap((h) =>
        h.types.map((t) => t.getText(source)),
      ) ?? [];
    expect(heritage).toContain("ReadStore");
    expect(heritage).toContain("CommandStore");
  });
});

describe("ReadSnapshot<T> typed union", () => {
  const source = parseSource("store-types.ts");

  it("exports a ReadSnapshot<T> type alias", () => {
    expect(findTypeAlias(source, "ReadSnapshot")).toBeDefined();
  });

  it("ReadSnapshot<T> includes found and not-found branches with provenance metadata", () => {
    const decl = findTypeAlias(source, "ReadSnapshot");
    expect(decl).toBeDefined();
    const typeText = decl!.type.getText(source);

    expect(typeText).toMatch(/found\s*:\s*true/);
    expect(typeText).toMatch(/found\s*:\s*false/);
    expect(typeText).toMatch(/stateRevision/);
    expect(typeText).toMatch(/projectionRevision/);
    expect(typeText).toMatch(/source/);
    expect(typeText).toMatch(/degraded/);
  });
});
