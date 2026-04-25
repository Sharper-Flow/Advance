import { describe, expect, it } from "vitest";

import { formatToolOutput } from "./tool-output";

describe("tool-output", () => {
  it("truncates objects containing undefined values without throwing", () => {
    const raw = formatToolOutput(
      {
        small: "kept",
        missing: undefined,
        nested: {
          alsoMissing: undefined,
        },
        large: "x".repeat(2_000),
      },
      { maxChars: 300 },
    );

    const parsed = JSON.parse(raw);
    expect(parsed._truncated).toBe(true);
    expect(parsed.data.small).toBe("kept");
  });
});
