import { describe, expect, test, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const SYNC_SCRIPT_PATH = join(REPO_ROOT, "scripts/sync-global.sh");

// sync-global.sh copies provider-specific agent assets and can exceed the
// default 5s Vitest timeout on loaded machines.
vi.setConfig({ testTimeout: 20_000 });

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

  test("bootstraps missing shared adv agent on --fix", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-bootstrap-"));

    try {
      const configDir = join(tempHome, ".config/opencode");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({ plugin: [], instructions: [] }),
      );

      const result = spawnSync("bash", [SYNC_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      const advPath = join(configDir, "agents", "adv.md");
      expect(result.status).toBe(0);
      expect(readFileSync(advPath, "utf8")).toContain("ADV_SYNC:START adv");
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("removes stale global orca agent on --fix", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-orca-cleanup-"));

    try {
      const configDir = join(tempHome, ".config/opencode");
      const globalAgents = join(configDir, "agents");
      mkdirSync(globalAgents, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({ plugin: [], instructions: [] }),
      );
      writeFileSync(
        join(globalAgents, "adv.md"),
        "---\ndescription: temp adv\n---\n",
      );
      writeFileSync(join(globalAgents, "orca.md"), "stale orca\n");

      const result = spawnSync("bash", [SYNC_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(() =>
        readFileSync(join(globalAgents, "orca.md"), "utf8"),
      ).toThrow();
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("removes stale global scout and refine agents on --fix", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-scout-refine-cleanup-"));

    try {
      const configDir = join(tempHome, ".config/opencode");
      const globalAgents = join(configDir, "agents");
      mkdirSync(globalAgents, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({ plugin: [], instructions: [] }),
      );
      writeFileSync(
        join(globalAgents, "adv.md"),
        "---\ndescription: temp adv\n---\n",
      );
      writeFileSync(join(globalAgents, "scout.md"), "stale scout\n");
      writeFileSync(join(globalAgents, "refine.md"), "stale refine\n");

      const result = spawnSync("bash", [SYNC_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(() =>
        readFileSync(join(globalAgents, "scout.md"), "utf8"),
      ).toThrow();
      expect(() =>
        readFileSync(join(globalAgents, "refine.md"), "utf8"),
      ).toThrow();
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("removes stale scout and refine agent config keys on --fix", () => {
    const tempHome = mkdtempSync(
      join(tmpdir(), "adv-scout-refine-config-cleanup-"),
    );

    try {
      const configDir = join(tempHome, ".config/opencode");
      const globalAgents = join(configDir, "agents");
      mkdirSync(globalAgents, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({
          plugin: [],
          instructions: [],
          agent: {
            scout: { model: "zai-coding-plan/glm-5.1" },
            refine: { model: "anthropic/claude-opus-4-7" },
            plan: {},
            build: {},
          },
        }),
      );
      writeFileSync(
        join(globalAgents, "adv.md"),
        "---\ndescription: temp adv\n---\n",
      );

      const result = spawnSync("bash", [SYNC_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      const patched = JSON.parse(
        readFileSync(join(configDir, "opencode.json"), "utf8"),
      );
      expect(patched.agent.scout).toBeUndefined();
      expect(patched.agent.refine).toBeUndefined();
      expect(patched.agent.plan).toEqual({});
      expect(patched.agent.build).toEqual({});
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  // ===========================================================================
  // Cost Governance Instruction Management (addCostTimeInvestment)
  // ===========================================================================

  test("sync script defines ADV_COST_GOVERNANCE_PATH variable", () => {
    expect(content).toContain("ADV_COST_GOVERNANCE_PATH");
    expect(content).toContain(".opencode/instructions/cost-governance.md");
  });

  test("sync script checks for cost-governance.md registration in instructions[]", () => {
    // check_config() block
    expect(content).toMatch(
      /cost-governance\.md registered|cost-governance\.md missing/,
    );
  });

  test("sync script patches instructions[] to include cost-governance.md", () => {
    // fix_config() block — jq patch for the new path
    expect(content).toMatch(/Added instruction:\s*\$ADV_COST_GOVERNANCE_PATH/);
  });

  test("sync --fix patches instructions[] with cost-governance.md when file exists", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-cost-gov-sync-"));

    try {
      const configDir = join(tempHome, ".config/opencode");
      const globalAgents = join(configDir, "agents");
      mkdirSync(globalAgents, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({ plugin: [], instructions: [] }),
      );
      writeFileSync(
        join(globalAgents, "adv.md"),
        "---\ndescription: temp adv\n---\n",
      );

      const result = spawnSync("bash", [SYNC_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      const patched = JSON.parse(
        readFileSync(join(configDir, "opencode.json"), "utf8"),
      );
      // Instructions array should now include the cost-governance path
      expect(
        patched.instructions.some((p: string) =>
          p.endsWith("cost-governance.md"),
        ),
      ).toBe(true);
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("sync run from a worktree canonicalizes plugin/instruction paths back to the main repo root", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-worktree-home-"));
    const tempWorktreeRoot = mkdtempSync(join(tmpdir(), "adv-worktree-root-"));
    const tempWorktree = join(tempWorktreeRoot, "repo-worktree");

    try {
      const configDir = join(tempHome, ".config/opencode");
      const globalAgents = join(configDir, "agents");
      mkdirSync(globalAgents, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({ plugin: [], instructions: [] }),
      );
      writeFileSync(
        join(globalAgents, "adv.md"),
        "---\ndescription: temp adv\n---\n",
      );

      const addResult = spawnSync(
        "git",
        ["worktree", "add", "--detach", tempWorktree],
        {
          cwd: REPO_ROOT,
          env: { ...process.env, CI: "true" },
          encoding: "utf8",
        },
      );
      expect(addResult.status).toBe(0);

      // The temp worktree is created from HEAD, but this test needs to execute
      // the *current* working-tree version of sync-global.sh under test.
      writeFileSync(join(tempWorktree, "scripts", "sync-global.sh"), content);

      const worktreeScript = join(tempWorktree, "scripts", "sync-global.sh");
      const fixResult = spawnSync("bash", [worktreeScript, "--fix"], {
        cwd: tempWorktree,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });
      expect(fixResult.status).toBe(0);
      const syncOutput = `${fixResult.stdout}${fixResult.stderr}`;
      const canonicalRootMatch = syncOutput.match(
        /ADV sync-global \(fix\):\s+(.*?)\s+->/,
      );
      const canonicalRoot = canonicalRootMatch?.[1] ?? REPO_ROOT;

      const patched = JSON.parse(
        readFileSync(join(configDir, "opencode.json"), "utf8"),
      );

      expect(patched.plugin).toContain(join(canonicalRoot, "plugin"));
      expect(patched.plugin).not.toContain(join(tempWorktree, "plugin"));

      expect(patched.instructions).toContain(
        join(canonicalRoot, "ADV_INSTRUCTIONS.md"),
      );
      expect(patched.instructions).toContain(
        join(canonicalRoot, ".opencode", "instructions", "cost-governance.md"),
      );
      expect(patched.instructions).not.toContain(
        join(tempWorktree, "ADV_INSTRUCTIONS.md"),
      );
      expect(patched.instructions).not.toContain(
        join(tempWorktree, ".opencode", "instructions", "cost-governance.md"),
      );
    } finally {
      spawnSync("git", ["worktree", "remove", "--force", tempWorktree], {
        cwd: REPO_ROOT,
        env: { ...process.env, CI: "true" },
        encoding: "utf8",
      });
      rmSync(tempWorktreeRoot, { recursive: true, force: true });
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  // ===========================================================================
  // Provider ADV variant generation (providerAdvAgentAssemblySystem)
  // ===========================================================================

  test("sync --fix generates provider ADV variants in global agents dir", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-provider-variants-"));

    try {
      const configDir = join(tempHome, ".config/opencode");
      const globalAgents = join(configDir, "agents");
      mkdirSync(globalAgents, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({ plugin: [], instructions: [] }),
      );
      writeFileSync(
        join(globalAgents, "adv.md"),
        "---\ndescription: temp adv\n---\nCANONICAL BODY SHOULD MOVE TO PROMPT PART\n",
      );

      const result = spawnSync("bash", [SYNC_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      for (const p of ["claude", "gpt", "glm", "kimi"]) {
        const variantPath = join(globalAgents, `adv-${p}.md`);
        expect(existsSync(variantPath), `missing variant: adv-${p}.md`).toBe(
          true,
        );
      }
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("generated provider variants contain runtime bodies backed by prompt parts", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-provider-hints-"));

    try {
      const configDir = join(tempHome, ".config/opencode");
      const globalAgents = join(configDir, "agents");
      const promptParts = join(configDir, "agent-parts", "advance");
      mkdirSync(globalAgents, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({ plugin: [], instructions: [] }),
      );
      writeFileSync(
        join(globalAgents, "adv.md"),
        "---\ndescription: temp adv\n---\nCANONICAL BODY SHOULD MOVE TO PROMPT PART\n",
      );

      const result = spawnSync("bash", [SYNC_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(readFileSync(join(promptParts, "adv.md"), "utf8")).toContain(
        "## ADV Overlay",
      );

      const config = JSON.parse(
        readFileSync(join(configDir, "opencode.json"), "utf8"),
      );
      for (const p of ["claude", "gpt", "glm", "kimi"]) {
        const variantContent = readFileSync(
          join(globalAgents, `adv-${p}.md`),
          "utf8",
        );
        expect(
          variantContent,
          `adv-${p}.md still has stub diagnostic`,
        ).not.toContain("[ADV:PROVIDER_STUB_UNEXPANDED]");
        expect(variantContent, `adv-${p}.md missing provider hint`).toContain(
          `<!-- PROVIDER_HINT:${p} -->`,
        );
        expect(variantContent, `adv-${p}.md missing canonical body`).toContain(
          "## ADV Overlay",
        );
        expect(
          readFileSync(join(promptParts, "providers", `${p}.md`), "utf8"),
        ).toContain(`<!-- PROVIDER_HINT:${p} -->`);
        expect(config.agent[`adv-${p}`].prompt).toBe(
          `{file:./agent-parts/advance/adv-${p}.md}`,
        );
      }
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("check mode warns and continues when opencode is unavailable for runtime canary", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-provider-canary-skip-"));

    try {
      const configDir = join(tempHome, ".config/opencode");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({ plugin: [], instructions: [] }),
      );

      const fixResult = spawnSync("bash", [SYNC_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });
      expect(fixResult.status).toBe(0);

      const pathWithoutOpencode = (process.env.PATH ?? "")
        .split(":")
        .filter((entry) => !entry.includes(".opencode"))
        .join(":");
      const checkResult = spawnSync("bash", [SYNC_SCRIPT_PATH, "--check"], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          HOME: tempHome,
          CI: "true",
          PATH: pathWithoutOpencode,
        },
        encoding: "utf8",
      });

      expect(checkResult.status).toBe(0);
      expect(checkResult.stdout).toContain(
        "runtime canary: skipped (opencode not found on PATH)",
      );
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("check mode rejects stale concatenated provider prompts", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-provider-stale-prompt-"));

    try {
      const configDir = join(tempHome, ".config/opencode");
      const promptParts = join(configDir, "agent-parts", "advance");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({ plugin: [], instructions: [] }),
      );

      const fixResult = spawnSync("bash", [SYNC_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });
      expect(fixResult.status).toBe(0);

      writeFileSync(join(promptParts, "adv-gpt.md"), "stale prompt body\n");

      const checkResult = spawnSync("bash", [SYNC_SCRIPT_PATH, "--check"], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          HOME: tempHome,
          ADV_SKIP_RUNTIME_CANARY: "1",
          CI: "true",
        },
        encoding: "utf8",
      });

      expect(checkResult.status).not.toBe(0);
      expect(checkResult.stdout).toContain(
        "Concatenated provider prompt stale (content mismatch)",
      );
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("generated provider variants patch frontmatter name", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-provider-names-"));

    try {
      const configDir = join(tempHome, ".config/opencode");
      const globalAgents = join(configDir, "agents");
      mkdirSync(globalAgents, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({ plugin: [], instructions: [] }),
      );
      writeFileSync(
        join(globalAgents, "adv.md"),
        "---\ndescription: temp adv\n---\n",
      );

      const result = spawnSync("bash", [SYNC_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      for (const p of ["claude", "gpt", "glm", "kimi"]) {
        const variantContent = readFileSync(
          join(globalAgents, `adv-${p}.md`),
          "utf8",
        );
        expect(variantContent, `adv-${p}.md missing name frontmatter`).toMatch(
          new RegExp(`name:\\s*adv-${p}`),
        );
      }
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("prompt-only provider activation check tolerates non-object agent entries", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-provider-prompt-only-"));

    try {
      const configDir = join(tempHome, ".config/opencode");
      const globalAgents = join(configDir, "agents");
      mkdirSync(globalAgents, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({
          plugin: [],
          instructions: [],
          agent: {
            build: "openai/gpt-5.5",
            "adv-gpt": {
              prompt:
                "{file:./agent-parts/advance/adv.md}\n\n{file:./agent-parts/advance/providers/gpt.md}",
            },
          },
        }),
      );
      writeFileSync(
        join(globalAgents, "adv.md"),
        "---\ndescription: temp adv\n---\n",
      );

      const result = spawnSync(
        "bash",
        [SYNC_SCRIPT_PATH, "--dry-run", "--diff"],
        {
          cwd: REPO_ROOT,
          env: { ...process.env, HOME: tempHome, CI: "true" },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).not.toContain("jq: error");
      expect(result.stdout).toContain("kept legacy adv.md");
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("dry-run works when provider mode removed global adv.md", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-provider-dryrun-no-adv-"));

    try {
      const configDir = join(tempHome, ".config/opencode");
      const globalAgents = join(configDir, "agents");
      mkdirSync(globalAgents, { recursive: true });
      writeFileSync(
        join(configDir, "opencode.json"),
        JSON.stringify({
          plugin: [],
          instructions: [],
          agent: {
            "adv-gpt": { disable: false },
          },
        }),
      );

      const result = spawnSync(
        "bash",
        [SYNC_SCRIPT_PATH, "--dry-run", "--diff"],
        {
          cwd: REPO_ROOT,
          env: { ...process.env, HOME: tempHome, CI: "true" },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("dry-run sync provider prompt parts");
      expect(result.stderr).not.toContain("canonical adv.md missing");
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  test("refuses to strip JSONC comments during --fix", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "adv-jsonc-protect-"));

    try {
      const configDir = join(tempHome, ".config/opencode");
      mkdirSync(configDir, { recursive: true });
      const jsoncPath = join(configDir, "opencode.jsonc");
      writeFileSync(
        jsoncPath,
        `{
          // This is a comment
          "plugin": [],
          "instructions": []
        }`,
      );

      const result = spawnSync("bash", [SYNC_SCRIPT_PATH, "--fix"], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: tempHome, CI: "true" },
        encoding: "utf8",
      });

      // Should fail rather than silently strip comments.
      expect(result.status).not.toBe(0);
      const content = readFileSync(jsoncPath, "utf8");
      expect(content).toContain("// This is a comment");
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
