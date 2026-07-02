import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { GATE_ORDER as PluginGateOrder } from "./types/gates";
import { GATE_ORDER as SharedGateOrder } from "./shared/cli-projection";

const REPO_ROOT = resolve(__dirname, "../..");
const BIN_CHANGES_TS = resolve(REPO_ROOT, "bin/lib/changes.ts");

describe("GATE_ORDER cross-boundary parity", () => {
  test("shared GATE_ORDER equals plugin GATE_DEFS-derived order", () => {
    expect(SharedGateOrder).toEqual(PluginGateOrder);
  });

  test("bin/lib/changes.ts re-exports GATE_ORDER from shared module", () => {
    const source = readFileSync(BIN_CHANGES_TS, "utf8");

    expect(source).toContain("../../plugin/src/shared/cli-projection");

    const importMatch = source.match(
      /import\s+\{\s*GATE_ORDER[^}]*\}\s+from\s+["']\.\.\/\.\.\/plugin\/src\/shared\/cli-projection["']/,
    );
    expect(
      importMatch,
      "bin/lib/changes.ts must import GATE_ORDER from the shared module",
    ).toBeTruthy();

    const exportMatch = source.match(/export\s+\{\s*GATE_ORDER[^}]*\}\s*;?/);
    expect(
      exportMatch,
      "bin/lib/changes.ts must re-export GATE_ORDER",
    ).toBeTruthy();
  });
});
