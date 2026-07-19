import { describe, expect, it } from "vitest";

describe("temporal project membership", () => {
  it("runs in the temporal project with file parallelism disabled", () => {
    expect(process.env.ADV_TEST_PROJECT).toBe("temporal");
    expect(process.env.ADV_TEST_FILE_PARALLELISM).toBe("false");
  });
});
