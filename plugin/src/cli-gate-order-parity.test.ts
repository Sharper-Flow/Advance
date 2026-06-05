import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { GATE_ORDER } from "./types";

const REPO_ROOT = resolve(__dirname, "../..");
const BIN_CHANGES_TS = resolve(REPO_ROOT, "bin/lib/changes.ts");

describe("GATE_ORDER cross-boundary parity", () => {
  test("bin/lib/changes.ts GATE_ORDER matches plugin GATE_ORDER", () => {
    const source = readFileSync(BIN_CHANGES_TS, "utf8");

    // Extract the GATE_ORDER array literal (contents between brackets)
    const match = source.match(/GATE_ORDER\s*=\s*\[([\s\S]*?)\]/);
    expect(
      match,
      "GATE_ORDER array literal not found in bin/lib/changes.ts",
    ).toBeTruthy();

    const inner = match![1];
    // Parse quoted ids, ignoring commas, whitespace, and comments
    const binOrder = inner
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => {
        const m = s.match(/^"([^"]+)"$/);
        if (!m) {
          // Could be a trailing comma line — skip
          return null;
        }
        return m[1];
      })
      .filter((s): s is string => s !== null);

    expect(binOrder).toEqual(GATE_ORDER);
  });
});
