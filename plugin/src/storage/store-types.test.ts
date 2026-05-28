/**
 * Type-level tests for the options-object overloads on
 * `Store.changes.create()` and `Store.changes.updateArtifacts()`.
 *
 * These tests confirm the new options-object call shapes typecheck cleanly.
 * Both shapes coexist during the migration window; T20 deletes the
 * positional shape atomically.
 *
 * Runtime behavior is tested by the disk-store and temporal-store
 * implementation tests; this file is a compile-time anchor.
 */

import { describe, expect, it } from "vitest";

import {
  normalizeCreateArgs,
  normalizeUpdateArtifactsArgs,
} from "./_artifact-args";
import type { Store } from "./store-types";

describe("Store.changes.create — options-object overload", () => {
  // Type-level anchors: these declarations exist purely to assert the
  // new call shapes typecheck. The values are not executed; vitest only
  // needs at least one runtime expectation per `it` block.

  it("accepts the options-object call shape (compile-time)", () => {
    // Compile-time anchor
    type CreateFn = Store["changes"]["create"];

    // Options-object shape with full ArtifactPayload
    const _optionsObject: Parameters<CreateFn> = [
      "title",
      {
        capability: "cap",
        artifacts: {
          proposal: "p",
          problemStatement: "ps",
          agreement: "a",
          design: "d",
          executiveSummary: "es",
          acceptance: "ac",
        },
      },
    ];

    // Options-object with minimal payload
    const _minimal: Parameters<CreateFn> = ["title", { artifacts: {} }];

    // Options-object with only summary (artifacts implicit empty)
    const _summaryOnly: Parameters<CreateFn> = ["title"];

    expect(_optionsObject[0]).toBe("title");
    expect(_minimal[0]).toBe("title");
    expect(_summaryOnly[0]).toBe("title");
  });

  it("retains the legacy positional call shape during migration window (compile-time)", () => {
    type CreateFn = Store["changes"]["create"];

    const _positional: Parameters<CreateFn> = [
      "title",
      "cap",
      "proposal",
      "problemStatement",
      "agreement",
      "design",
      "executiveSummary",
    ];

    expect(_positional[2]).toBe("proposal");
  });
});

describe("Store.changes.updateArtifacts — options-object overload", () => {
  it("accepts the options-object call shape (compile-time)", () => {
    type UpdateFn = Store["changes"]["updateArtifacts"];

    const _newShape: Parameters<UpdateFn> = [
      "change-id",
      {
        proposal: "p",
        executiveSummary: "es",
        acceptance: "ac",
      },
    ];

    expect(_newShape[0]).toBe("change-id");
  });

  it("retains the legacy positional call shape during migration window (compile-time)", () => {
    type UpdateFn = Store["changes"]["updateArtifacts"];

    const _positional: Parameters<UpdateFn> = [
      "change-id",
      "proposal",
      "ps",
      "ag",
      "design",
      "es",
    ];

    expect(_positional[1]).toBe("proposal");
  });
});

describe("artifact-args normalizers", () => {
  it("normalizeCreateArgs detects options-object shape", () => {
    const out = normalizeCreateArgs([
      "title",
      { capability: "cap", artifacts: { proposal: "p" } },
    ]);
    expect(out.capability).toBe("cap");
    expect(out.artifacts).toEqual({ proposal: "p" });
  });

  it("normalizeCreateArgs detects legacy positional shape", () => {
    const out = normalizeCreateArgs([
      "title",
      "cap",
      "p",
      "ps",
      "ag",
      "design",
      "es",
    ]);
    expect(out.capability).toBe("cap");
    expect(out.artifacts).toEqual({
      proposal: "p",
      problemStatement: "ps",
      agreement: "ag",
      design: "design",
      executiveSummary: "es",
    });
  });

  it("normalizeCreateArgs handles summary-only call", () => {
    const out = normalizeCreateArgs(["title"]);
    expect(out.capability).toBeUndefined();
    expect(out.artifacts).toEqual({});
  });

  it("normalizeCreateArgs preserves initialMetadata from options-object", () => {
    const out = normalizeCreateArgs([
      "title",
      {
        artifacts: {},
        initialMetadata: { origin: { kind: "adhoc" } as any },
      },
    ]);
    expect(out.initialMetadata?.origin).toEqual({ kind: "adhoc" });
  });

  it("normalizeCreateArgs preserves initialMetadata from legacy 8th positional arg", () => {
    const out = normalizeCreateArgs([
      "title",
      "cap",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { initialMetadata: { origin: { kind: "adhoc" } as any } },
    ]);
    expect(out.initialMetadata?.origin).toEqual({ kind: "adhoc" });
  });

  it("normalizeUpdateArtifactsArgs detects options-object shape", () => {
    const out = normalizeUpdateArtifactsArgs([
      "id",
      { proposal: "p", executiveSummary: "es" },
    ]);
    expect(out).toEqual({ proposal: "p", executiveSummary: "es" });
  });

  it("normalizeUpdateArtifactsArgs detects legacy positional shape", () => {
    const out = normalizeUpdateArtifactsArgs([
      "id",
      "p",
      "ps",
      "ag",
      "design",
      "es",
    ]);
    expect(out).toEqual({
      proposal: "p",
      problemStatement: "ps",
      agreement: "ag",
      design: "design",
      executiveSummary: "es",
    });
  });

  it("normalizeUpdateArtifactsArgs skips undefined positional fields", () => {
    const out = normalizeUpdateArtifactsArgs([
      "id",
      "p",
      undefined,
      undefined,
      "design",
      undefined,
    ]);
    expect(out).toEqual({ proposal: "p", design: "design" });
    expect("problemStatement" in out).toBe(false);
    expect("agreement" in out).toBe(false);
    expect("executiveSummary" in out).toBe(false);
  });
});
