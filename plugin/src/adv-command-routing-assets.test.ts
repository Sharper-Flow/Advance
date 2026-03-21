import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_DIR = join(REPO_ROOT, ".opencode/command");
const OVERLAY_DIR = join(REPO_ROOT, ".opencode/overlays");

describe("ADV command routing assets", () => {
  test("top-level ADV commands do not declare agent frontmatter routing", () => {
    const commandFiles = readdirSync(COMMAND_DIR).filter(
      (name) => name.startsWith("adv-") && name.endsWith(".md"),
    );

    expect(commandFiles.length).toBeGreaterThan(0);

    for (const file of commandFiles) {
      const content = readFileSync(join(COMMAND_DIR, file), "utf8");
      const frontmatter = content.split("---")[1] ?? "";
      expect(frontmatter, `${file} should not route through agent frontmatter`).not.toMatch(
        /^agent:\s+/m,
      );
    }
  });

  test("shared-agent overlay source files exist for all managed global agents", () => {
    const expected = ["orca", "general", "plan", "scout"];

    for (const name of expected) {
      const file = join(OVERLAY_DIR, `${name}.overlay.md`);
      const content = readFileSync(file, "utf8");

      expect(content).toContain(`ADV_SYNC:START ${name}`);
      expect(content).toContain(`ADV_SYNC:END ${name}`);
      expect(content).toContain("NEVER invoke `/adv-*`");
      expect(content).toContain("must not spawn additional sub-agents");
    }
  });
});
