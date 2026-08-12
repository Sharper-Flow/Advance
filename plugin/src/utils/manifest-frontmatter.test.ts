import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  parseFrontmatterText,
  parseFrontmatter,
  assertPolicyMatch,
  scanDir,
  runtimeFrontmatterCheck,
} from "./manifest-frontmatter";

describe("parseFrontmatterText", () => {
  it("returns ok=false with error for a blockquote inside frontmatter", () => {
    const text = `---
name: adv-tron
tools:
  adv_*: false
> **Invoke routing:** this breaks YAML
  adv_spec: true
---
body text`;
    const result = parseFrontmatterText(text);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.error).toContain("Implicit keys");
  });

  it("returns ok=false for unquoted colon-space in a scalar value", () => {
    const text = `---
name: adv-archive
description: Archive completed change: apply spec deltas
---`;
    const result = parseFrontmatterText(text);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns ok=true with parsed doc for valid frontmatter", () => {
    const text = `---
name: adv-verifier
description: "Verify things"
tools:
  adv_*: false
  adv_spec: true
---
body`;
    const result = parseFrontmatterText(text);
    expect(result.ok).toBe(true);
    expect(result.doc).not.toBeNull();
    expect((result.doc as Record<string, unknown>).name).toBe("adv-verifier");
  });

  it("returns ok=true with null doc when there is no frontmatter", () => {
    const text = `# Just a body
No frontmatter here.`;
    const result = parseFrontmatterText(text);
    expect(result.ok).toBe(true);
    expect(result.doc).toBeNull();
  });

  it("returns ok=false for unterminated frontmatter", () => {
    const text = `---
name: broken
tools:
  adv_*: false
no closing marker`;
    const result = parseFrontmatterText(text);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not terminated");
  });
});

describe("parseFrontmatter (file I/O)", () => {
  const tmp = join(tmpdir(), `fm-test-${Date.now()}`);

  it("reads and parses a file from disk", () => {
    mkdirSync(tmp, { recursive: true });
    const filePath = join(tmp, "agent.md");
    writeFileSync(
      filePath,
      `---
name: x
tools:
  adv_spec: true
---
body`,
    );
    const result = parseFrontmatter(filePath);
    expect(result.ok).toBe(true);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns ok=true with null doc for a missing file", () => {
    const result = parseFrontmatter(join(tmp, "nonexistent.md"));
    expect(result.ok).toBe(true);
    expect(result.doc).toBeNull();
  });
});

describe("assertPolicyMatch", () => {
  it("detects an empty tools map", () => {
    const doc = { name: "adv-engineer", tools: {} };
    const result = assertPolicyMatch(
      doc as Record<string, unknown>,
      "adv-engineer",
    );
    expect(result.ok).toBe(false);
    expect(result.drift).toContain("tools map is empty");
  });

  it("detects a missing tools key entirely", () => {
    const doc = { name: "adv-engineer" };
    const result = assertPolicyMatch(
      doc as Record<string, unknown>,
      "adv-engineer",
    );
    expect(result.ok).toBe(false);
  });

  it("detects drifted adv_* grants", () => {
    // adv-verifier's policy allows 11 Tier-1 tools; give it only 2
    const doc = {
      tools: {
        "adv_*": false,
        adv_change_show: true,
        adv_tool_catalog: true,
      },
    };
    const result = assertPolicyMatch(
      doc as Record<string, unknown>,
      "adv-verifier",
    );
    expect(result.ok).toBe(false);
    expect(result.drift).toBeTruthy();
    expect(result.drift!.length).toBeGreaterThan(0);
  });

  it("passes when grants match the declared policy", () => {
    // Build a doc that matches adv-verifier's policy exactly
    // adv-verifier gets the 16-tool Tier-1 allowlist + adv_*: false
    const tier1 = [
      "adv_change_archive",
      "adv_change_close",
      "adv_change_create",
      "adv_change_list",
      "adv_change_show",
      "adv_change_update",
      "adv_gate_complete",
      "adv_gate_status",
      "adv_run_test",
      "adv_subagent_report_submit",
      "adv_task_add",
      "adv_task_checkpoint",
      "adv_task_list",
      "adv_task_update",
      "adv_tool_catalog",
      "adv_tool_invoke",
    ];
    const tools: Record<string, boolean> = { "adv_*": false };
    for (const t of tier1) tools[t] = true;
    const doc = { tools };
    const result = assertPolicyMatch(
      doc as Record<string, unknown>,
      "adv-verifier",
    );
    expect(result.ok).toBe(true);
  });
});

describe("scanDir", () => {
  const tmp = join(tmpdir(), `fm-scan-${Date.now()}`);

  it("aggregates per-file results and reports failures", () => {
    mkdirSync(tmp, { recursive: true });
    writeFileSync(
      join(tmp, "clean.md"),
      `---
name: clean
tools:
  adv_spec: true
---
body`,
    );
    writeFileSync(
      join(tmp, "broken.md"),
      `---
name: broken
> **bad line**
---
body`,
    );
    const result = scanDir(tmp);
    expect(result.checked).toBe(2);
    expect(result.failures.length).toBe(1);
    expect(result.failures[0].file).toContain("broken.md");
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("runtimeFrontmatterCheck", () => {
  it("reports failures for broken files and respects budget", () => {
    const tmp = join(tmpdir(), `fm-rt-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    writeFileSync(
      join(tmp, "clean.md"),
      `---
name: clean
tools:
  adv_spec: true
---
body`,
    );
    writeFileSync(
      join(tmp, "broken.md"),
      `---
name: broken
> **bad**
---
body`,
    );

    const result = runtimeFrontmatterCheck(300, [tmp]);
    expect(result.checked).toBe(2);
    expect(result.failures).toBe(1);
    expect(result.elapsedMs).toBeLessThan(300);
    expect(result.budgetExceeded).toBe(false);

    rmSync(tmp, { recursive: true, force: true });
  });

  it("stops scanning when budget is exceeded", () => {
    // Use an absurdly small budget to force early exit
    const tmp = join(tmpdir(), `fm-budget-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    for (let i = 0; i < 50; i++) {
      writeFileSync(join(tmp, `f${i}.md`), `---\nname: f${i}\n---\n`);
    }
    const result = runtimeFrontmatterCheck(0, [tmp]);
    expect(result.budgetExceeded).toBe(true);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("handles a nonexistent directory gracefully", () => {
    const result = runtimeFrontmatterCheck(300, [
      join(tmpdir(), `nonexistent-${Date.now()}`),
    ]);
    expect(result.checked).toBe(0);
    expect(result.failures).toBe(0);
  });
});
