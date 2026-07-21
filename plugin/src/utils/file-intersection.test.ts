import { describe, expect, it } from "vitest";
import { intersectFileLists } from "./file-intersection.js";

describe("intersectFileLists", () => {
  it("returns the intersection of two non-empty lists", () => {
    expect(intersectFileLists(["a.ts", "b.ts"], ["b.ts", "c.ts"])).toEqual([
      "b.ts",
    ]);
  });

  it("returns empty array when planned is empty", () => {
    expect(intersectFileLists([], ["a.ts", "b.ts"])).toEqual([]);
  });

  it("returns empty array when peer is empty", () => {
    expect(intersectFileLists(["a.ts", "b.ts"], [])).toEqual([]);
  });

  it("returns empty array when there is no overlap", () => {
    expect(intersectFileLists(["a.ts"], ["b.ts"])).toEqual([]);
  });

  it("preserves planned order in the intersection", () => {
    expect(
      intersectFileLists(["z.ts", "a.ts", "m.ts"], ["m.ts", "z.ts"]),
    ).toEqual(["z.ts", "m.ts"]);
  });

  it("dedupes entries that appear multiple times in planned", () => {
    expect(intersectFileLists(["a.ts", "a.ts", "b.ts"], ["a.ts"])).toEqual([
      "a.ts",
    ]);
  });

  it("handles full overlap (identical lists)", () => {
    expect(intersectFileLists(["a.ts", "b.ts"], ["a.ts", "b.ts"])).toEqual([
      "a.ts",
      "b.ts",
    ]);
  });

  it("does not include peer-only entries", () => {
    const result = intersectFileLists(["a.ts"], ["a.ts", "b.ts", "c.ts"]);
    expect(result).toEqual(["a.ts"]);
    expect(result).not.toContain("b.ts");
    expect(result).not.toContain("c.ts");
  });
});
