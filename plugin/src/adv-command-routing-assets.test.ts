import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_DIR = join(REPO_ROOT, ".opencode/command");
const OVERLAY_DIR = join(REPO_ROOT, ".opencode/overlays");

const AGENT_DIR = join(REPO_ROOT, ".opencode/agents");

describe("ADV orchestrator agent", () => {
  test("adv.md exists with required frontmatter", () => {
    const content = readFileSync(join(AGENT_DIR, "adv.md"), "utf8");
    const frontmatter = content.split("---")[1] ?? "";
    expect(frontmatter).toMatch(/mode:\s*primary/);
    expect(frontmatter).toMatch(/task:\s*true/);
    expect(frontmatter).toMatch(/temperature:\s*0\.2/);
  });

  test("adv.md is a pure ADV orchestrator with no generic workflow", () => {
    const content = readFileSync(join(AGENT_DIR, "adv.md"), "utf8");
    expect(content).not.toMatch(/generic workflow/i);
    expect(content).not.toMatch(/non-adv/i);
    expect(content).not.toContain("Orca");
    expect(content).not.toContain("orca");
  });

  test("adv.md uses correct 7-gate model", () => {
    const content = readFileSync(join(AGENT_DIR, "adv.md"), "utf8");
    for (const gate of [
      "proposal",
      "discovery",
      "design",
      "planning",
      "execution",
      "acceptance",
      "release",
    ]) {
      expect(content, `missing gate: ${gate}`).toContain(gate);
    }
  });

  test("adv.md respects collaborative workflow", () => {
    const content = readFileSync(join(AGENT_DIR, "adv.md"), "utf8");
    expect(content).toMatch(/clarif/i);
    expect(content).toMatch(/question/i);
    expect(content).toMatch(/user.*approv|user.*confirm|user.*judgment/i);
  });

  test("orca.md does not exist in repo agents", () => {
    const files = readdirSync(AGENT_DIR);
    expect(files).not.toContain("orca.md");
  });
});

describe("ADV command routing assets", () => {
  test("top-level ADV commands do not declare agent frontmatter routing", () => {
    const commandFiles = readdirSync(COMMAND_DIR).filter(
      (name) => name.startsWith("adv-") && name.endsWith(".md"),
    );

    expect(commandFiles.length).toBeGreaterThan(0);

    for (const file of commandFiles) {
      const content = readFileSync(join(COMMAND_DIR, file), "utf8");
      const frontmatter = content.split("---")[1] ?? "";
      expect(
        frontmatter,
        `${file} should not route through agent frontmatter`,
      ).not.toMatch(/^agent:\s+/m);
    }
  });

  test("shared-agent overlay source files exist for all managed global agents", () => {
    const expected = ["adv", "general", "build", "plan", "scout", "refine"];

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
