import { describe, expect, test } from "bun:test";

import {
  analyzeCensus,
  resolveDataHomeRoot,
  type CensusInventory,
  type StoreInventoryEntry,
} from "./census";

describe("resolveDataHomeRoot", () => {
  test("unwraps an oc per-project shard to the machine-wide root", () => {
    expect(
      resolveDataHomeRoot(
        `/home/u/.local/share/opencode-projects/${"a".repeat(40)}`,
      ),
    ).toBe("/home/u/.local/share");
  });

  test("unwraps a non-hex shard such as nogit", () => {
    expect(
      resolveDataHomeRoot("/home/u/.local/share/opencode-projects/nogit"),
    ).toBe("/home/u/.local/share");
  });

  test("leaves an already machine-wide data home unchanged", () => {
    expect(resolveDataHomeRoot("/home/u/.local/share")).toBe(
      "/home/u/.local/share",
    );
  });

  test("tolerates a trailing separator", () => {
    expect(resolveDataHomeRoot("/home/u/.local/share/")).toBe(
      "/home/u/.local/share",
    );
  });
});

const PROJECT_ID = "a".repeat(40);
const SYNTHETIC_ID = "0".repeat(16) + "b".repeat(24);

function store(
  entry: string,
  options: Partial<StoreInventoryEntry> = {},
): StoreInventoryEntry {
  return {
    entry,
    path: `/data/opencode/plugins/advance/${entry}`,
    resolvedPath: `/real/${entry}`,
    position: { kind: "legacy" },
    ...options,
  };
}

function inventory(stores: StoreInventoryEntry[]): CensusInventory {
  return { stores, storeInventoryComplete: true };
}

describe("disk census analyzer", () => {
  test.each([
    ["canonical healthy", inventory([store(PROJECT_ID)])],
    ["bin-style non-store is excluded before classification", inventory([])],
  ])("reports zero findings for %s", (_name, input) => {
    const report = analyzeCensus(input);
    expect(report.clean).toBe(true);
    expect(report.exit_code).toBe(0);
    expect(Object.values(report.dimensions).every((d) => d.count === 0)).toBe(
      true,
    );
  });

  test.each([
    ["malformed name", inventory([store("nogit")]), "malformed_identity"],
    [
      "synthetic fixture id",
      inventory([store(SYNTHETIC_ID)]),
      "synthetic_fixture",
    ],
    [
      "pseudo-root position mismatch",
      inventory([
        store(PROJECT_ID, {
          position: { kind: "shard", shardId: "c".repeat(40) },
        }),
      ]),
      "pseudo_root",
    ],
  ] as const)("classifies %s", (_name, input, dimension) => {
    const report = analyzeCensus(input);
    expect(report.dimensions[dimension].count).toBe(1);
    expect(report.dimensions[dimension].items[0]?.why).toBeTruthy();
    expect(report.exit_code).toBe(1);
  });

  test("deduplicates symlinked legacy and shard entries by real path", () => {
    const report = analyzeCensus(
      inventory([
        store(PROJECT_ID, { resolvedPath: "/real/shared" }),
        store("nogit", {
          path: "/data/shard/opencode/plugins/advance/nogit",
          resolvedPath: "/real/shared",
          position: { kind: "shard", shardId: PROJECT_ID },
        }),
      ]),
    );
    expect(report.dimensions.malformed_identity.count).toBe(0);
    expect(report.dimensions.malformed_identity.items).toHaveLength(0);
  });

  test("bounds rows and reports omitted findings", () => {
    const report = analyzeCensus(
      inventory([store("nogit"), store("also-bad")]),
      { maxItems: 1 },
    );
    expect(report.dimensions.malformed_identity.count).toBe(2);
    expect(report.dimensions.malformed_identity.items).toHaveLength(1);
    expect(report.dimensions.malformed_identity.omitted).toBe(1);
  });

  test("fails closed when disk inventory is incomplete", () => {
    const report = analyzeCensus({
      stores: [],
      storeInventoryComplete: false,
    });

    expect(report.clean).toBe(false);
    expect(report.exit_code).toBe(1);
  });
});
