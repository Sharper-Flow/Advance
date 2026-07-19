import { describe, expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { ADV_TOOL_NAMES } from "./tool-registry";
import {
  activePromptCorpus,
  applyOverlay,
  CATALOG_SIGNATURE,
  countContractOccurrences,
  effectiveAgentPrompts,
  findConcreteSpellings,
  findPermissionKeyLines,
  ONE_MODE_CLAIM,
  splitFrontmatter,
} from "./prompt-corpus";

const REPO_ROOT = resolve(__dirname, "../..");
const ADV_TOOL_NAME_SET = new Set(ADV_TOOL_NAMES);
const BASELINE_PATH = join(
  REPO_ROOT,
  "plugin/src/__fixtures__/codemode-mcp-contract-baseline.json",
);

interface PromptBaseline {
  bytes: number;
  mcpCapable: boolean;
  grants: string[];
}

interface ContractBaseline {
  byteBudget: number;
  contractBytes: number;
  prompts: Record<string, PromptBaseline>;
}

function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

function markdownFiles(relativeDir: string): string[] {
  return readdirSync(join(REPO_ROOT, relativeDir))
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(relativeDir, name));
}

function loadBaseline(): ContractBaseline {
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as ContractBaseline;
}

describe("tool-name assets", () => {
  test("agent ADV tool allowlists only name registered ADV tools", () => {
    const offenders: string[] = [];

    for (const relativePath of markdownFiles(".opencode/agents")) {
      const content = readRepoFile(relativePath);
      const toolKeys = [
        ...content.matchAll(/^\s{2}(adv_[A-Za-z0-9_]+):/gm),
      ].map((match) => match[1]);

      for (const toolKey of toolKeys) {
        if (!ADV_TOOL_NAME_SET.has(toolKey)) {
          offenders.push(`${relativePath}: ${toolKey}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  test("live prompts do not reference unavailable ADV tool names", () => {
    const promptFiles = [
      "ADV_INSTRUCTIONS.md",
      ...markdownFiles(".opencode/agents"),
      ...markdownFiles(".opencode/command"),
      ...markdownFiles(".opencode/overlays"),
    ];
    const offenders: string[] = [];

    for (const relativePath of promptFiles) {
      const content = readRepoFile(relativePath);
      const refs = new Set(
        [...content.matchAll(/\b(adv_[A-Za-z0-9_]+)\b/g)].map(
          (match) => match[1],
        ),
      );

      for (const ref of refs) {
        // `adv_agenda_*` / `adv_wisdom_*` prose shorthand is not a callable.
        if (ref.endsWith("_")) continue;
        // Classification labels surfaced by the coordinate workflow
        // (`adv_backed_fact` is a label, not a callable MCP tool). Pre-existing
        // reference in `.opencode/command/adv-coordinate.md`.
        if (ref === "adv_backed_fact") continue;
        if (!ADV_TOOL_NAME_SET.has(ref)) {
          offenders.push(`${relativePath}: ${ref}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  test("canonical tool list does not include a standalone adv_briefing_packet tool", () => {
    expect(ADV_TOOL_NAMES).not.toContain("adv_briefing_packet");
  });

  test("Episode recall policy is scoped, advisory, and read-only", () => {
    const orchestrator = readRepoFile(".opencode/agents/adv.md");
    const researcher = readRepoFile(".opencode/agents/adv-researcher.md");

    for (const content of [orchestrator, researcher]) {
      expect(content).toMatch(/^\s{2}episode_recall: true$/m);
      expect(content).toContain("top_k: 5");
      expect(content).toMatch(/advisory/i);
      expect(content).not.toMatch(
        /^\s{2}episode_(?:remember|forget|stats): true$/m,
      );
    }
  });
});

describe("mode-neutral MCP prompt contract", () => {
  test("active corpus follows recursive deployment ownership", () => {
    const corpus = activePromptCorpus();
    const paths = corpus.map((file) => file.path);

    // Deployment-owned surfaces are all present.
    for (const expected of [
      ...markdownFiles(".opencode/agents"),
      ...readdirSync(join(REPO_ROOT, ".opencode/overlays"))
        .filter((name) => name.endsWith(".overlay.md"))
        .map((name) => join(".opencode/overlays", name)),
      ...markdownFiles(".opencode/command").filter((path) =>
        /(^|\/)adv-[^/]*\.md$/.test(path),
      ),
      "ADV_INSTRUCTIONS.md",
      "SETUP.md",
    ]) {
      expect(paths).toContain(expected);
    }

    // Recursive skill ownership: sibling/reference prose ships with skills.
    expect(paths).toContain("skills/adv-triage/BOOTSTRAP.md");
    for (const path of paths.filter((p) => p.startsWith("skills/"))) {
      expect(path).toMatch(/^skills\/adv-[^/]+\//);
    }

    // Commands are limited to the deployed adv-* glob (deploy ownership).
    for (const file of corpus.filter((f) => f.kind === "command")) {
      expect(file.path).toMatch(/^\.opencode\/command\/adv-[^/]*\.md$/);
    }

    // Archives are never part of the active corpus.
    for (const path of paths) {
      expect(path.startsWith(".adv/")).toBe(false);
      expect(path).not.toContain("/.adv/");
    }
  });

  test("YAML frontmatter is parsed separately from prompt-body prose", () => {
    for (const file of activePromptCorpus()) {
      const split = splitFrontmatter(readRepoFile(file.path));
      expect(split.frontmatter).toBe(file.frontmatter);
      expect(split.body).toBe(file.body);
      if (file.hasFrontmatter) {
        expect(file.body.startsWith("---")).toBe(false);
      }
      // Permission-key-shaped lines never leak into prompt bodies.
      expect(findPermissionKeyLines(file.body)).toEqual([]);
    }

    // Agents and commands carry frontmatter; overlays and references are prose-only.
    const corpus = activePromptCorpus();
    for (const file of corpus.filter(
      (f) => f.kind === "agent" || f.kind === "command",
    )) {
      expect(file.hasFrontmatter).toBe(true);
    }
  });

  test("frozen pre-change effective prompt baseline exists and covers every effective prompt", () => {
    const baseline = loadBaseline();
    expect(baseline.byteBudget).toBe(400);
    const effective = effectiveAgentPrompts();
    for (const prompt of effective) {
      const frozen = baseline.prompts[prompt.name];
      expect(
        frozen,
        `missing frozen baseline for ${prompt.name}`,
      ).toBeDefined();
      expect(frozen.bytes).toBeGreaterThan(0);
      expect(Array.isArray(frozen.grants)).toBe(true);
    }
    // No stale entries for retired prompts.
    for (const name of Object.keys(baseline.prompts)) {
      expect(effective.map((p) => p.name)).toContain(name);
    }
  });

  test("each applicable effective prompt carries exactly one mode-neutral contract", () => {
    const effective = effectiveAgentPrompts();
    const applicable = effective.filter(
      // Overlay-only surfaces (general) host agents whose capability sets are
      // not repo-controlled; the overlay is the only Advance-authored surface,
      // so the contract rides there.
      (prompt) => prompt.mcpCapable || prompt.name === "general",
    );
    const inapplicable = effective.filter(
      (prompt) => !prompt.mcpCapable && prompt.name !== "general",
    );

    expect(applicable.map((p) => p.name).sort()).toEqual([
      "adv",
      "adv-designer",
      "adv-engineer",
      "adv-researcher",
      "adv-reviewer",
      "adv-temporal-repair",
      "adv-tron",
      "adv-verifier",
      "adv-visual-review",
      "build",
      "general",
      "plan",
    ]);

    for (const prompt of applicable) {
      expect(
        countContractOccurrences(prompt.text),
        `${prompt.name} must carry exactly one contract`,
      ).toBe(1);
    }
    for (const prompt of inapplicable) {
      expect(
        countContractOccurrences(prompt.text),
        `${prompt.name} is not MCP-applicable and must not carry the contract`,
      ).toBe(0);
    }

    // Commands, skills, and reference prose never embed the contract.
    for (const file of activePromptCorpus()) {
      if (file.kind === "agent" || file.kind === "overlay") continue;
      expect(
        countContractOccurrences(file.body),
        `${file.path} must not duplicate the contract`,
      ).toBe(0);
    }
  });

  test("mode guidance adds at most 400 UTF-8 bytes per effective prompt", () => {
    const baseline = loadBaseline();
    for (const prompt of effectiveAgentPrompts()) {
      const frozen = baseline.prompts[prompt.name]!;
      const current = Buffer.byteLength(prompt.text, "utf8");
      const delta = current - frozen.bytes;
      expect(
        delta,
        `${prompt.name} added ${delta} bytes over frozen baseline (budget ${baseline.byteBudget})`,
      ).toBeLessThanOrEqual(baseline.byteBudget);
    }
  });

  test("active prompt bodies contain no unconditional one-mode external MCP invocation claim", () => {
    const offenders: string[] = [];
    for (const file of activePromptCorpus()) {
      for (const match of findConcreteSpellings(file.body)) {
        offenders.push(`${file.path}: concrete spelling ${match}`);
      }
      if (ONE_MODE_CLAIM.test(file.body)) {
        offenders.push(`${file.path}: one-mode claim phrase`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("no corpus prose duplicates the OpenCode-generated catalog signature", () => {
    const offenders: string[] = [];
    for (const file of activePromptCorpus()) {
      if (CATALOG_SIGNATURE.test(file.body)) {
        offenders.push(file.path);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("external MCP permission keys remain exact against the frozen baseline", () => {
    const baseline = loadBaseline();
    for (const prompt of effectiveAgentPrompts()) {
      const frozen = baseline.prompts[prompt.name]!;
      const current = prompt.mcpGrants.map(
        (grant) => `${grant.key}=${grant.allowed}`,
      );
      expect(current, `${prompt.name} frontmatter MCP grants changed`).toEqual(
        frozen.grants,
      );
    }
  });

  test("canonical agent files stay synchronized with their overlay sources", () => {
    for (const name of ["adv", "build", "plan"]) {
      const agentPath = join(REPO_ROOT, ".opencode/agents", `${name}.md`);
      const overlayPath = join(
        REPO_ROOT,
        ".opencode/overlays",
        `${name}.overlay.md`,
      );
      const agent = readFileSync(agentPath, "utf8");
      const overlay = readFileSync(overlayPath, "utf8");
      // Deploy semantics: the marked region in the canonical agent must equal
      // the overlay source, so repo files and deployed files cannot drift.
      const synced = applyOverlay(agent, overlay, name);
      expect(
        synced,
        `${name}.md inline ADV_SYNC block drifted from overlay`,
      ).toBe(agent);
    }
  });

  test("overlay-only sources each carry the canonical contract exactly once", () => {
    // Overlay-only managed agents are those WITHOUT a matching advance-source
    // agent file at `.opencode/agents/{name}.md`. For these agents the overlay
    // is the only advance-authored surface, so the mode-neutral contract must
    // ride there verbatim. Source-backed shared agents (adv, build, plan) may
    // carry the contract in the source body or the overlay; this test does not
    // constrain them (the effective-prompt test above does).
    //
    // rq: fixSubAgentMcpRouting — closes the gap that allowed explore.md to
    // silently miss the contract under CodeMode-on sessions.
    const overlayDir = join(REPO_ROOT, ".opencode/overlays");
    const agentsDir = join(REPO_ROOT, ".opencode/agents");
    const overlayOnly = readdirSync(overlayDir)
      .filter((name) => name.endsWith(".overlay.md"))
      .filter((name) => {
        const agentName = name.replace(/\.overlay\.md$/, ".md");
        return !existsSync(join(agentsDir, agentName));
      })
      .sort();
    // Today: explore.overlay.md (new) and general.overlay.md.
    expect(overlayOnly).toEqual(["explore.overlay.md", "general.overlay.md"]);
    for (const name of overlayOnly) {
      const content = readFileSync(join(overlayDir, name), "utf8");
      expect(
        countContractOccurrences(content),
        `${name} must carry the canonical contract exactly once`,
      ).toBe(1);
    }
  });
});
