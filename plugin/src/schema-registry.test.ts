import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

import {
  ADV_SCHEMA_BASE_URL,
  PUBLIC_JSON_SCHEMAS,
  renderAllJsonSchemas,
  renderJsonSchemaFile,
} from "./schema-registry";

const PLUGIN_ROOT = resolve(__dirname, "..");

describe("generated ADV JSON schema registry", () => {
  test("defines the existing public schema artifact set", () => {
    expect(PUBLIC_JSON_SCHEMAS.map((entry) => entry.name).sort()).toEqual([
      "change",
      "delta",
      "project",
      "requirement",
      "scenario",
      "spec",
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
});
