import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("index startup no longer depends on handoff.json (B3)", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./index.ts", import.meta.url)),
    "utf8",
  );

  it("does not import consumeHandoff from storage/handoff", () => {
    expect(source).not.toMatch(/import \{ consumeHandoff \} from "\.\/storage\/handoff";/);
  });

  it("does not call consumeHandoff during plugin startup", () => {
    expect(source).not.toMatch(/consumeHandoff\(/);
  });

  it("does not mention handoff hydration in startup comments/logs", () => {
    expect(source).not.toMatch(/handoff hydration/i);
    expect(source).not.toMatch(/Hydrated from handoff/i);
  });
});
