import { describe, expect, it } from "vitest";

import { isSameOrChildPath } from "./path.js";

describe("isSameOrChildPath", () => {
  it("matches identical paths", () => {
    expect(isSameOrChildPath("/repo", "/repo")).toBe(true);
  });

  it("matches child paths", () => {
    expect(isSameOrChildPath("/repo/src/index.ts", "/repo")).toBe(true);
  });

  it("normalizes trailing slashes", () => {
    expect(isSameOrChildPath("/repo/src/", "/repo/")).toBe(true);
    expect(isSameOrChildPath("/repo/", "/repo")).toBe(true);
  });

  it("does not match path prefixes that are not children", () => {
    expect(isSameOrChildPath("/repo-other/file.ts", "/repo")).toBe(false);
  });
});
