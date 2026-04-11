import { describe, expect, test } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const SYNC_SCRIPT_PATH = join(REPO_ROOT, "scripts/sync-global.sh");

describe("overlay sync script support", () => {
  const content = readFileSync(SYNC_SCRIPT_PATH, "utf8");

  test("supports dry-run and diff options for overlay review", () => {
    expect(content).toContain("--dry-run");
    expect(content).toContain("--diff");
  });

  test("contains a helper for applying managed overlay blocks", () => {
    expect(content).toContain("apply_overlay_block()");
    expect(content).toContain("ADV_SYNC:START");
    expect(content).toContain("ADV_SYNC:END");
  });

  test("detects duplicate overlay markers and skips unsafe writes", () => {
    expect(content).toContain("duplicate overlay marker");
    expect(content).toContain("skipped missing shared agent");
  });

  test("fails fast on orphaned overlay markers", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-sync-"));

    try {
      const globalAgents = join(tempHome, ".config/opencode/agents");
      mkdirSync(globalAgents, { recursive: true });
      writeFileSync(
        join(globalAgents, "adv.md"),
        [
          "---",
          'description: "temp adv agent"',
          "---",
          "",
          "<!-- ADV_SYNC:START adv -->",
          "stale overlay without end marker",
          "",
        ].join("\n"),
      );

      const result = spawnSync("bash", [SYNC_SCRIPT_PATH, "--dry-run"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      const output = `${result.stdout}${result.stderr}`;
      expect(result.status).toBe(1);
      expect(output).toContain("orphaned overlay marker: adv.md");
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
