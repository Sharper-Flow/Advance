import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  buildToolSchemaManifest,
  getToolSchemaManifest,
  initializeToolSchemaTelemetry,
  resetToolSchemaTelemetry,
} from "./tool-schema-telemetry";
import * as toolSchemaTelemetry from "./tool-schema-telemetry";

describe("buildToolSchemaManifest", () => {
  it("measures host-equivalent JSON schema UTF-8 bytes and an advisory estimate", () => {
    const manifest = buildToolSchemaManifest([
      ["adv_hello", { greeting: z.string().describe("héllo") }],
      ["bash", { command: z.string() }],
    ]);

    const expectedBytes = Buffer.byteLength(
      JSON.stringify(
        z.toJSONSchema(z.object({ greeting: z.string().describe("héllo") })),
      ),
      "utf8",
    );

    expect(manifest.total_tools).toBe(1);
    expect(manifest.total_schema_bytes).toBe(expectedBytes);
    expect(manifest.total_approx_tokens_4char_rule).toBe(
      Math.ceil(expectedBytes / 4),
    );
    expect(manifest.tools.adv_hello).toEqual({
      status: "available",
      schema_bytes: expectedBytes,
      approx_tokens_4char_rule: Math.ceil(expectedBytes / 4),
    });
  });

  it("records per-tool conversion failures without aborting other tools", () => {
    const manifest = buildToolSchemaManifest([
      ["adv_valid", { value: z.string() }],
      ["adv_invalid", { value: undefined as unknown as z.ZodType }],
    ]);

    expect(manifest.total_tools).toBe(2);
    expect(manifest.conversion_errors).toBe(1);
    expect(manifest.tools.adv_valid.status).toBe("available");
    expect(manifest.tools.adv_invalid).toMatchObject({
      status: "conversion_error",
      schema_bytes: null,
      approx_tokens_4char_rule: null,
    });
  });
});

describe("initializeToolSchemaTelemetry", () => {
  it("caches the manifest and does not rebuild on reads", () => {
    resetToolSchemaTelemetry();
    const manifest = initializeToolSchemaTelemetry([
      ["adv_test", { value: z.string() }],
    ]);

    const buildSpy = vi
      .spyOn(toolSchemaTelemetry, "buildToolSchemaManifest")
      .mockImplementation(() => {
        throw new Error("manifest should not be rebuilt on read");
      });

    const read = getToolSchemaManifest();
    expect(read.total_tools).toBe(manifest.total_tools);
    expect(buildSpy).toHaveBeenCalledTimes(0);
  });
});
