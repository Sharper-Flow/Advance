/**
 * Structural tests for canonical `ArtifactKind` and `ArtifactPayload`.
 *
 * Verifies:
 * 1. Schema exports present and exhaustive.
 * 2. All six artifact kinds present in canonical order.
 * 3. ArtifactPayload accepts and rejects shapes per Zod schema.
 * 4. Size cap constants exported with correct values.
 *
 * The compile-time `keyof ArtifactPayload === ArtifactKind` invariant is
 * verified by `_check` in `artifacts.ts` itself — if it drifts, `tsc` fails
 * before this test runs.
 */

import { describe, expect, it } from "vitest";

import {
  AGGREGATE_HARD_CAP,
  AGGREGATE_SOFT_CAP,
  ARTIFACT_HARD_CAP,
  ARTIFACT_SOFT_CAP,
  ArtifactKindSchema,
  ArtifactPayloadSchema,
  type ArtifactKind,
  type ArtifactPayload,
} from "./artifacts";

describe("ArtifactKindSchema", () => {
  it("enumerates all six kinds in canonical order", () => {
    expect(ArtifactKindSchema.options).toEqual([
      "proposal",
      "problemStatement",
      "agreement",
      "design",
      "executiveSummary",
      "acceptance",
    ]);
  });

  it("parses every canonical kind", () => {
    for (const kind of ArtifactKindSchema.options) {
      expect(ArtifactKindSchema.parse(kind)).toBe(kind);
    }
  });

  it("rejects kebab-case variants (camelCase is canonical)", () => {
    expect(() => ArtifactKindSchema.parse("problem-statement")).toThrow();
    expect(() => ArtifactKindSchema.parse("executive-summary")).toThrow();
  });

  it("rejects unknown kinds", () => {
    expect(() => ArtifactKindSchema.parse("unknown")).toThrow();
  });
});

describe("ArtifactPayloadSchema", () => {
  it("accepts an empty payload", () => {
    expect(ArtifactPayloadSchema.parse({})).toEqual({});
  });

  it("accepts a payload with any subset of fields", () => {
    const payload: ArtifactPayload = {
      proposal: "p",
      executiveSummary: "es",
    };
    expect(ArtifactPayloadSchema.parse(payload)).toEqual(payload);
  });

  it("accepts a fully populated payload", () => {
    const payload: ArtifactPayload = {
      proposal: "p",
      problemStatement: "ps",
      agreement: "a",
      design: "d",
      executiveSummary: "es",
      acceptance: "ac",
    };
    expect(ArtifactPayloadSchema.parse(payload)).toEqual(payload);
  });

  it("rejects non-string content", () => {
    expect(() =>
      ArtifactPayloadSchema.parse({ proposal: 123 as unknown }),
    ).toThrow();
  });

  it("strips unknown keys", () => {
    // Zod default-strips unknown keys for z.object schemas
    const parsed = ArtifactPayloadSchema.parse({
      proposal: "p",
      unknownField: "should-be-dropped",
    });
    expect(parsed).toEqual({ proposal: "p" });
    expect("unknownField" in parsed).toBe(false);
  });
});

describe("ArtifactKind / ArtifactPayload compile-time alignment", () => {
  it("every ArtifactKind has a corresponding ArtifactPayload field", () => {
    // Structural mirror of the compile-time invariant: for every canonical
    // kind, the payload schema must have a matching key.
    const payloadKeys = Object.keys(ArtifactPayloadSchema.shape);
    for (const kind of ArtifactKindSchema.options) {
      expect(payloadKeys).toContain(kind);
    }
  });

  it("every ArtifactPayload field corresponds to an ArtifactKind", () => {
    const kinds = ArtifactKindSchema.options as readonly string[];
    for (const key of Object.keys(ArtifactPayloadSchema.shape)) {
      expect(kinds).toContain(key);
    }
  });

  it("ArtifactKind union matches the payload schema key set exactly", () => {
    const kinds = new Set<string>(ArtifactKindSchema.options);
    const payloadKeys = new Set<string>(
      Object.keys(ArtifactPayloadSchema.shape),
    );
    expect(payloadKeys).toEqual(kinds);
  });
});

describe("size cap constants", () => {
  it("exports per-artifact caps with documented values", () => {
    expect(ARTIFACT_SOFT_CAP).toBe(64 * 1024);
    expect(ARTIFACT_HARD_CAP).toBe(256 * 1024);
  });

  it("exports aggregate caps with documented values", () => {
    expect(AGGREGATE_SOFT_CAP).toBe(1024 * 1024);
    expect(AGGREGATE_HARD_CAP).toBe(Math.floor(1.8 * 1024 * 1024));
  });

  it("per-artifact hard cap stays well below Temporal 2 MB per-payload limit", () => {
    const TEMPORAL_PAYLOAD_CAP = 2 * 1024 * 1024;
    expect(ARTIFACT_HARD_CAP).toBeLessThan(TEMPORAL_PAYLOAD_CAP);
    // Leave ~8x headroom — single artifact can never push payload past cap
    expect(ARTIFACT_HARD_CAP * 8).toBeLessThanOrEqual(TEMPORAL_PAYLOAD_CAP);
  });

  it("aggregate hard cap stays under Temporal 2 MB continueAsNew seed limit", () => {
    const TEMPORAL_PAYLOAD_CAP = 2 * 1024 * 1024;
    expect(AGGREGATE_HARD_CAP).toBeLessThan(TEMPORAL_PAYLOAD_CAP);
  });

  it("soft caps are strictly less than hard caps (warn-before-reject)", () => {
    expect(ARTIFACT_SOFT_CAP).toBeLessThan(ARTIFACT_HARD_CAP);
    expect(AGGREGATE_SOFT_CAP).toBeLessThan(AGGREGATE_HARD_CAP);
  });
});

// Compile-time anchor — referencing the type ensures it exists and is exported.
// If the type is missing, tsc fails here.
const _typeAnchor: ArtifactKind = "proposal";
const _payloadAnchor: ArtifactPayload = { proposal: _typeAnchor };
void _payloadAnchor;
