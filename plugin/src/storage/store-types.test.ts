/**
 * Type-level tests for `Store.changes.create()` and
 * `Store.changes.updateArtifacts()` post-positional-removal (T20).
 *
 * These tests confirm the options-object call shapes typecheck cleanly.
 * Runtime behavior is tested by the disk-store and temporal-store
 * implementation tests; this file is a compile-time anchor.
 */

import { describe, expect, it } from "vitest";

import type { Store } from "./store-types";

describe("Store.changes.create — options-object API", () => {
  it("accepts the options-object call shape (compile-time)", () => {
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

    // Options-object with only summary
    const _summaryOnly: Parameters<CreateFn> = ["title"];

    expect(_optionsObject[0]).toBe("title");
    expect(_minimal[0]).toBe("title");
    expect(_summaryOnly[0]).toBe("title");
  });

  it("accepts initialMetadata via options-object", () => {
    type CreateFn = Store["changes"]["create"];
    const _withMetadata: Parameters<CreateFn> = [
      "title",
      {
        artifacts: {},
        initialMetadata: { origin: { kind: "adhoc" } as never },
      },
    ];
    expect(_withMetadata[0]).toBe("title");
  });
});

describe("Store.changes.updateArtifacts — options-object API", () => {
  it("accepts the ArtifactPayload call shape (compile-time)", () => {
    type UpdateFn = Store["changes"]["updateArtifacts"];

    const _full: Parameters<UpdateFn> = [
      "change-id",
      {
        proposal: "p",
        problemStatement: "ps",
        agreement: "a",
        design: "d",
        executiveSummary: "es",
        acceptance: "ac",
      },
    ];

    const _partial: Parameters<UpdateFn> = [
      "change-id",
      { proposal: "p", executiveSummary: "es" },
    ];

    const _empty: Parameters<UpdateFn> = ["change-id", {}];

    expect(_full[0]).toBe("change-id");
    expect(_partial[0]).toBe("change-id");
    expect(_empty[0]).toBe("change-id");
  });
});
