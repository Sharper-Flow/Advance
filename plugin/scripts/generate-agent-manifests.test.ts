import { describe, expect, test } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  readdirSync,
} from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { AGENT_TOOL_POLICY } from "../src/tool-role-policy";
import { ADV_TOOL_NAMES } from "../src/tool-registry";
import {
  generateAdvToolsBlock,
  generateManifestContent,
  runGenerate,
  ADV_TOOLS_BLOCK_START,
  ADV_TOOLS_BLOCK_END,
} from "./generate-agent-manifests";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const COMMITTED_AGENTS_DIR = join(REPO_ROOT, ".opencode/agents");

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "generate-agent-manifests-"));
}

function copyCommittedAgents(targetDir: string): void {
  for (const policy of AGENT_TOOL_POLICY) {
    const src = join(COMMITTED_AGENTS_DIR, `${policy.agent}.md`);
    const dest = join(targetDir, `${policy.agent}.md`);
    writeFileSync(dest, readFileSync(src, "utf8"), "utf8");
  }
}

function assertValidAdvBlock(block: string): void {
  const retained = new Set(ADV_TOOL_NAMES);
  retained.add("adv_*");
  const lines = block.split("\n");
  for (const line of lines) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const match = line.match(/^\s+(adv_[A-Za-z0-9_*]+):\s*(true|false)\s*$/);
    expect(
      match,
      `every non-comment line must be a valid adv_* entry, got: ${line}`,
    ).toBeTruthy();
    expect(
      retained.has(match![1]),
      `${match![1]} must be a registered ADV tool or wildcard`,
    ).toBe(true);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markerCount(content: string, marker: string): number {
  return (
    content.match(new RegExp(`^\\s*${escapeRegExp(marker.trim())}$`, "gm")) ||
    []
  ).length;
}

describe("generate-agent-manifests", () => {
  test("generateAdvToolsBlock is deterministic", () => {
    const first = generateAdvToolsBlock("adv-engineer");
    const second = generateAdvToolsBlock("adv-engineer");
    expect(first).toBe(second);
  });

  test("generateAdvToolsBlock emits only registered ADV tool names", () => {
    for (const policy of AGENT_TOOL_POLICY) {
      const block = generateAdvToolsBlock(policy.agent);
      assertValidAdvBlock(block);
    }
  });

  test("generateManifestContent is idempotent (generate ∘ generate == generate)", () => {
    const agent = "adv-engineer";
    const original = readFileSync(
      join(COMMITTED_AGENTS_DIR, `${agent}.md`),
      "utf8",
    );
    const once = generateManifestContent(original, agent);
    const twice = generateManifestContent(once, agent);
    expect(twice).toBe(once);
  });

  test("generateManifestContent inserts markers on first-run and round-trips", () => {
    const agent = "adv-engineer";
    const base = [
      "---",
      "description: test",
      "tools:",
      "  read: true",
      "  # === ADV role policy ===",
      "  adv_*: false",
      "  adv_spec: true",
      "  adv_change_create: false",
      "  task: false",
      "---",
      "body",
    ].join("\n");
    const generated = generateManifestContent(base, agent);
    expect(markerCount(generated, ADV_TOOLS_BLOCK_START)).toBe(1);
    expect(markerCount(generated, ADV_TOOLS_BLOCK_END)).toBe(1);
    const twice = generateManifestContent(generated, agent);
    expect(twice).toBe(generated);
    // Bytes outside the adv_* region are preserved.
    expect(generated).toContain("read: true");
    expect(generated).toContain("task: false");
    expect(generated).toContain("body");
  });

  test("generateManifestContent preserves bytes outside markers", () => {
    const agent = "adv-engineer";
    const beforeText = "---\ndescription: test\ntools:\n  read: true\n";
    const afterText = "  task: false\n---\nbody\nmore body";
    const base = `${beforeText}  adv_*: false\n  adv_spec: true\n${afterText}`;
    const generated = generateManifestContent(base, agent);
    const [before, after] = generated.split(ADV_TOOLS_BLOCK_START);
    expect(before).toContain("read: true");
    expect(after).toContain("task: false");
    expect(after).toContain("body\nmore body");
  });

  test("generateManifestContent preserves hand-owned non-adv_* lines inside the generated region", () => {
    const agent = "adv-engineer";
    const original = readFileSync(
      join(COMMITTED_AGENTS_DIR, `${agent}.md`),
      "utf8",
    );
    const endMarker = original.indexOf(ADV_TOOLS_BLOCK_END);
    expect(endMarker).toBeGreaterThan(-1);
    const handOwnedLine = "  # Hand-owned non-adv_* line";
    const modified =
      original.slice(0, endMarker) +
      handOwnedLine +
      "\n" +
      original.slice(endMarker);
    const generated = generateManifestContent(modified, agent);
    expect(generated).toContain(handOwnedLine);
    const twice = generateManifestContent(generated, agent);
    expect(twice).toBe(generated);
  });

  test("generateManifestContent fails on duplicate markers", () => {
    const base = [
      "---",
      "tools:",
      ADV_TOOLS_BLOCK_START,
      "  adv_spec: true",
      ADV_TOOLS_BLOCK_END,
      ADV_TOOLS_BLOCK_START,
      "  adv_spec: true",
      ADV_TOOLS_BLOCK_END,
      "---",
    ].join("\n");
    expect(() => generateManifestContent(base, "adv-engineer")).toThrow(
      /exactly one/i,
    );
  });

  test("generateManifestContent fails on incomplete marker pair", () => {
    const base = [
      "---",
      "tools:",
      ADV_TOOLS_BLOCK_START,
      "  adv_spec: true",
      "---",
    ].join("\n");
    expect(() => generateManifestContent(base, "adv-engineer")).toThrow(
      /Incomplete marker pair/i,
    );
  });

  test("emitted block parses as valid YAML", () => {
    for (const policy of AGENT_TOOL_POLICY) {
      const block = generateAdvToolsBlock(policy.agent);
      assertValidAdvBlock(block);
    }
  });

  test("runGenerate --check exits non-zero on injected drift", async () => {
    const agentsDir = createTempDir();
    try {
      copyCommittedAgents(agentsDir);
      const agent = "adv-engineer";
      const path = join(agentsDir, `${agent}.md`);
      const drifted = readFileSync(path, "utf8").replace(
        "adv_task_list: true",
        "adv_task_list: false",
      );
      writeFileSync(path, drifted, "utf8");
      const result = await runGenerate({ check: true, agentsDir });
      expect(result.ok).toBe(false);
      expect(result.diffs.length).toBeGreaterThan(0);
    } finally {
      rmSync(agentsDir, { recursive: true, force: true });
    }
  });

  test("runGenerate --check exits zero when no drift", async () => {
    const agentsDir = createTempDir();
    try {
      copyCommittedAgents(agentsDir);
      const result = await runGenerate({ check: true, agentsDir });
      expect(result.ok).toBe(true);
      expect(result.diffs).toEqual([]);
    } finally {
      rmSync(agentsDir, { recursive: true, force: true });
    }
  });

  test("runGenerate --check tolerates hand-owned non-adv_* lines inside the generated region", async () => {
    const agentsDir = createTempDir();
    try {
      copyCommittedAgents(agentsDir);
      const agent = "adv-engineer";
      const path = join(agentsDir, `${agent}.md`);
      const original = readFileSync(path, "utf8");
      const endMarker = original.indexOf(ADV_TOOLS_BLOCK_END);
      expect(endMarker).toBeGreaterThan(-1);
      const inserted = "  # Hand-owned non-adv_* line";
      const modified =
        original.slice(0, endMarker) +
        inserted +
        "\n" +
        original.slice(endMarker);
      writeFileSync(path, modified, "utf8");
      const result = await runGenerate({ check: true, agentsDir });
      expect(result.ok).toBe(true);
      expect(result.diffs).toEqual([]);
    } finally {
      rmSync(agentsDir, { recursive: true, force: true });
    }
  });

  test("runGenerate --check fails when markers are missing", async () => {
    const agentsDir = createTempDir();
    try {
      copyCommittedAgents(agentsDir);
      const agent = "adv-engineer";
      const path = join(agentsDir, `${agent}.md`);
      const content = readFileSync(path, "utf8");
      // Strip markers to simulate a manifest that has not been normalized yet.
      const missingMarkers = content
        .replace(
          new RegExp(
            `^\\s*${escapeRegExp(ADV_TOOLS_BLOCK_START.trim())}$\\n?`,
            "gm",
          ),
          "",
        )
        .replace(
          new RegExp(
            `^\\s*${escapeRegExp(ADV_TOOLS_BLOCK_END.trim())}$\\n?`,
            "gm",
          ),
          "",
        );
      writeFileSync(path, missingMarkers, "utf8");
      const result = await runGenerate({ check: true, agentsDir });
      expect(result.ok).toBe(false);
    } finally {
      rmSync(agentsDir, { recursive: true, force: true });
    }
  });

  test("runGenerate write mode updates drifted files to committed output", async () => {
    const agentsDir = createTempDir();
    try {
      copyCommittedAgents(agentsDir);
      const agent = "adv-engineer";
      const path = join(agentsDir, `${agent}.md`);
      const original = readFileSync(path, "utf8");
      const drifted = original.replace("adv_spec: true", "adv_spec: false");
      writeFileSync(path, drifted, "utf8");
      const result = await runGenerate({ check: false, agentsDir });
      expect(result.ok).toBe(true);
      const fixed = readFileSync(path, "utf8");
      expect(fixed).toBe(original);
    } finally {
      rmSync(agentsDir, { recursive: true, force: true });
    }
  });
});
