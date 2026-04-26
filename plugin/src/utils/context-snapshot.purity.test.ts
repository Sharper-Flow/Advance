import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("context-snapshot utility purity", () => {
  /**
   * Architecture invariant (see AGENTS.md): context-snapshot utilities are
   * pure formatters over already-loaded data and must not fetch persistence.
   */
  it("does not import storage or tool layers", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./context-snapshot.ts", import.meta.url)),
      "utf8",
    );

    expect(source).not.toMatch(/from "\.\.\/storage\//);
    expect(source).not.toMatch(/from "\.\.\/tools\//);
  });
});
