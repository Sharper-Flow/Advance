import { describe, expect, it } from "vitest";

describe("unit project membership", () => {
  it("runs in the unit project with file parallelism enabled", () => {
    expect(process.env.ADV_TEST_PROJECT).toBe("unit");
    expect(process.env.ADV_TEST_FILE_PARALLELISM).toBe("true");
  });
});
