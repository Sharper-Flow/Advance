import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");
const SETUP_PATH = join(REPO_ROOT, "SETUP.md");

const CANONICAL_RULES = YAML.parse(`
P35:
  name: architecture-over-hacks
  rule: >-
    Prefer a clean change to the owning mechanism over a bespoke branch,
    duplicate path, one-off adapter, local exception, wrapper, override, or
    manual state manipulation. Before using an interim repair, name the
    structural end-state and explain why it cannot land immediately. Interim
    containment is allowed only when needed to reach or safely await that
    end-state; record a named follow-up and remove the interim path when the
    structural fix lands. Do not use “structural” to justify an unrelated
    rewrite: preserve approved scope and choose the smallest cohesive
    mechanism that resolves the full problem. This includes source-of-truth
    bypasses such as ad-hoc symlinks, environment overrides, shell aliases,
    generated-file rewrites, or hand-edited deployed artifacts. Legitimate
    indirection remains allowed when produced and repaired by its owning
    build, package, or runtime system.
  tags: [architecture, maintainability, source-of-truth, anti-hack]
  hint: architecture_over_hacks
  priority: 8

P40:
  name: root-cause-first
  scope: >-
    Correcting observed unintended behavior in agent/application code.
  rule: >-
    Establish a causal path or executable reproduction before compensating an
    unexplained defect. Repair the owning invariant or mechanism before
    introducing a fallback, retry, duplicate validation, suppression,
    compatibility shim, or catch-all guard. Do not merely mask or bypass
    unexplained behavior. Defense-in-depth is permitted only for an
    independently stated failure mode that already has a primary control and
    verification; it must never replace a known-cause repair. Emergency
    containment is allowed only when paired with a named root-cause follow-up.
  tags: [correctness, root-cause, remediation, reliability, security]
  hint: root_cause_first
  priority: 9

P41:
  name: subtractive-first
  scope: >-
    Editing existing code. Governs removal of constructs a change supersedes
    and demonstrably dead code in the touched subsystem. Complements P40,
    which covers causal repair of observed defects.
  rule: >-
    Default to subtraction when editing existing code. Remove the construct a
    change supersedes in the same change, or name and justify its retention.
    Remove other dead code in the touched subsystem only when structural
    evidence establishes no static or configured caller, dynamic, reflective,
    registry, public API, generated-entry, test-only, or plugin-discovered use;
    analyzer findings are leads, never sole authority, and uncertainty means
    retain and surface. Prohibited: Guard-and-Go, which hides superseded code
    behind a guard, fallback, feature flag, or compatibility shim; and
    Clone-instead-of-call, which copies an implementation instead of invoking
    or extracting it. Never delete tests, validation, error handling, or
    observability merely to reduce code. This is not a line-count target.
  tags: [maintainability, refactor, deletion, accretion, code-quality]
  hint: subtractive_first
  priority: 8
`);

function publishedRules(setup: string): Record<string, unknown> {
  const rules: Record<string, unknown> = {};
  const yamlBlocks = setup.matchAll(/```yaml\n([\s\S]*?)\n```/g);

  for (const match of yamlBlocks) {
    const document = YAML.parse(match[1] ?? "") as Record<string, unknown>;
    const nestedRules = document.rules as Record<string, unknown> | undefined;
    for (const [id, value] of Object.entries(document)) {
      if (/^P\d+$/.test(id)) rules[id] = value;
    }
    for (const [id, value] of Object.entries(nestedRules ?? {})) {
      if (/^P\d+$/.test(id)) rules[id] = value;
    }
  }

  return rules;
}

describe("SETUP published quality rules", () => {
  const setup = readFileSync(SETUP_PATH, "utf8");
  const rules = publishedRules(setup);

  test("publishes canonical P35, P40, and P41 entries exactly", () => {
    expect(rules.P35).toEqual(CANONICAL_RULES.P35);
    expect(rules.P40).toEqual(CANONICAL_RULES.P40);
    expect(rules.P41).toEqual(CANONICAL_RULES.P41);
    expect((rules.P40 as { scope: string }).scope).toContain(
      "Correcting observed unintended behavior",
    );
    expect((rules.P40 as { scope: string }).scope).not.toContain(
      "all implementation work",
    );
  });

  test("keeps the published rule boundary at P41", () => {
    expect(Object.keys(rules).sort()).toEqual([
      "P16",
      "P19",
      "P29",
      "P30",
      "P31",
      "P32",
      "P33",
      "P34",
      "P35",
      "P36",
      "P37",
      "P38",
      "P39",
      "P40",
      "P41",
    ]);
    expect(rules).not.toHaveProperty("P42");
    expect(rules).not.toHaveProperty("P43");
  });
});
