import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

import {
  ADV_SCHEMA_BASE_URL,
  PUBLIC_JSON_SCHEMAS,
  renderAllJsonSchemas,
  renderJsonSchemaFile,
  renderJsonSchemaObject,
} from "./schema-registry";

const PLUGIN_ROOT = resolve(__dirname, "..");

describe("generated ADV JSON schema registry", () => {
  test("defines the existing public schema artifact set", () => {
    expect(PUBLIC_JSON_SCHEMAS.map((entry) => entry.name).sort()).toEqual([
      "backlog-item",
      "change",
      "delta",
      "project",
      "reconcile-plan",
      "reconcile-receipt",
      "reconcile-run-report",
      "requirement",
      "scenario",
      "spec",
      "store-residue-scan",
      "task",
    ]);
  });

  test("renders non-empty draft-07 schemas with canonical Advance ids", () => {
    for (const entry of PUBLIC_JSON_SCHEMAS) {
      const rendered = renderJsonSchemaFile(entry);
      const parsed = JSON.parse(rendered);

      expect(parsed.$schema).toBe("http://json-schema.org/draft-07/schema#");
      expect(parsed.$id).toBe(`${ADV_SCHEMA_BASE_URL}${entry.filename}`);
      expect(JSON.stringify(parsed)).not.toContain("anomalyco/oc-plugins");
      expect(JSON.stringify(parsed).length).toBeGreaterThan(200);
      expect(parsed.definitions).not.toEqual({ [entry.name]: {} });
      expect(rendered.endsWith("\n")).toBe(true);
    }
  });

  test("committed schema files match deterministic generated output", () => {
    const generated = renderAllJsonSchemas();

    for (const [filename, rendered] of Object.entries(generated)) {
      const current = readFileSync(
        join(PLUGIN_ROOT, "schemas", filename),
        "utf8",
      );
      expect(current).toBe(rendered);
    }
  });

  test("AC8: generated change schema keeps contract-item variant optional", () => {
    const changeEntry = PUBLIC_JSON_SCHEMAS.find(
      (entry) => entry.name === "change",
    );
    expect(changeEntry).toBeDefined();

    const schema = renderJsonSchemaObject(changeEntry!);
    const itemsSchema = schema.properties?.contract?.properties?.items;
    expect(itemsSchema).toBeDefined();

    const itemProperties = (itemsSchema as any).items.properties;
    expect(itemProperties).toHaveProperty("variant");
    expect(itemProperties).toHaveProperty("text");
    expect((itemsSchema as any).items.required).toContain("text");
    expect((itemsSchema as any).items.required).not.toContain("variant");
  });

  test("AC8: generated change schema variant includes all four criterion kinds", () => {
    const changeEntry = PUBLIC_JSON_SCHEMAS.find(
      (entry) => entry.name === "change",
    );
    const schema = renderJsonSchemaObject(changeEntry!);
    const variantSchema = (
      schema.properties?.contract?.properties?.items as any
    ).items.properties.variant;

    const variants = variantSchema.oneOf as any[];
    const kinds = new Set(
      variants.map((variant: any) => variant.properties.kind.const),
    );

    expect(kinds).toEqual(
      new Set(["behavioral", "evidence", "spec_law", "constraint"]),
    );
  });
});
