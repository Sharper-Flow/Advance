import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("loop-ledger projection purity (DDC6)", () => {
  /**
   * Architecture invariant: the loop-ledger projector is a pure formatter over
   * already-loaded data and must not fetch persistence or call tool surfaces.
   */
  it("projector does not import storage or tool layers", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./loop-ledger.ts", import.meta.url)),
      "utf8",
    );

    expect(source).not.toMatch(/from "\.\.\/storage\//);
    expect(source).not.toMatch(/from "\.\.\/tools\//);
    expect(source).not.toMatch(/from "node:/);
  });

  it("loop-ledger types stay zod-only (workflow-safe)", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../types/loop-ledger.ts", import.meta.url)),
      "utf8",
    );

    // Types module must remain dependency-free beyond zod so it is reachable
    // from workflow code without crossing layer boundaries.
    expect(source).not.toMatch(/from "\.\./);
    expect(source).not.toMatch(/from "node:/);
    expect(source).toMatch(/from "zod"/);
  });
});
