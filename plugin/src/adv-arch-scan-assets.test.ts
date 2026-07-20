import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMMAND_PATH = join(REPO_ROOT, ".opencode/command/adv-arch-scan.md");
const SKILL_PATH = join(REPO_ROOT, "skills/adv-arch-detection/SKILL.md");
const SPEC_PATH = join(REPO_ROOT, ".adv/specs/arch-scan/spec.json");
const DOC_PATH = join(REPO_ROOT, "docs/specs/arch-scan.md");
const ADV_INSTRUCTIONS_PATH = join(REPO_ROOT, "ADV_INSTRUCTIONS.md");
const REGISTRY_PATH = join(REPO_ROOT, "bin/lib/arch-scan/registry.ts");
const FIXTURES_DIR = join(REPO_ROOT, "bin/lib/arch-scan/__tests__/fixtures");

/**
 * Extract the 5 capability-consistency relationship IDs from the typed
 * registry by text-scanning `registry.ts`. The registry is the single
 * source of truth (read-only to this asset test); the markdown/spec layer
 * must stay in sync with every entry.
 */
function extractRegistryIds(): string[] {
  const content = readFileSync(REGISTRY_PATH, "utf8");
  // Matches `id: "<kebab-case>"` literals inside CAPABILITY_RELATIONSHIPS.
  // The CapabilityRelationship interface declaration uses `readonly id: string;`
  // (no quoted literal), so this regex only captures the 5 shipped entries.
  const matches = [...content.matchAll(/id:\s*"([a-z0-9-]+)"/g)];
  return matches.map((m) => m[1]);
}

describe("adv-arch-scan structural correctness assets", () => {
  test("spec defines P33 structural correctness boundary detection", () => {
    const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as {
      name: string;
      requirements: Array<{ id: string; title: string }>;
    };

    expect(spec.name).toBe("arch-scan");
    expect(spec.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "rq-archp33",
          title: "Structural Correctness Boundary Detection",
        }),
      ]),
    );
  });

  test("command scans structural correctness boundaries (P33)", () => {
    const content = readFileSync(COMMAND_PATH, "utf8");

    expect(content).toContain("Structural Correctness Boundary Checks (P33)");
    expect(content).toContain("parser/schema/allowlist recognition");
    expect(content).toContain("Gate/spec/compliance boundaries");
    expect(content).toContain(
      "heuristic-owned persistence/gates/spec/security",
    );
  });

  test("skill carries structural correctness scan methodology", () => {
    const content = readFileSync(SKILL_PATH, "utf8");

    expect(content).toContain("<!-- rq-archp33 -->");
    expect(content).toContain("structural ownership");
    expect(content).toContain(
      "workflow state, gate completion, or spec compliance",
    );
    expect(content).toContain("Structural-correctness severity");
  });

  test("spec defines stack packs before generic fallback", () => {
    const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as {
      requirements: Array<{ id: string; title: string }>;
    };

    expect(spec.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "rq-archstack01",
          title: "Stack Packs Before Generic Fallback",
        }),
      ]),
    );
  });

  test("docs mirror architecture spec requirement ids", () => {
    const doc = readFileSync(DOC_PATH, "utf8");
    const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as {
      version: string;
      requirements: Array<{ id: string }>;
    };

    expect(doc).toContain(`**Version:** ${spec.version}`);
    for (const requirement of spec.requirements) {
      expect(doc).toContain(`**ID:** \`${requirement.id}\``);
    }
  });

  test("command and skill document initial ADV stack pack", () => {
    const command = readFileSync(COMMAND_PATH, "utf8");
    const skill = readFileSync(SKILL_PATH, "utf8");
    const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as {
      requirements: Array<{ id: string }>;
    };

    expect(spec.requirements.map((rq) => rq.id)).toContain("rq-archstack02");
    expect(command).toContain("Stack Packs");
    expect(command).toContain("ADV stack pack");
    expect(command).toContain("TypeScript/Bun/OpenCode plugin/Temporal");
    expect(command).toContain("workflow bundle boundary");
    expect(command).toContain("command/manifest symmetry");
    expect(command).toContain("spec/asset anchors");
    expect(skill).toContain("Stack Packs");
    expect(skill).toContain("ADV stack pack");
    expect(skill).toContain("workflow bundle boundary");
  });

  test("command and skill document architecture scanner coverage reporting", () => {
    const command = readFileSync(COMMAND_PATH, "utf8");
    const skill = readFileSync(SKILL_PATH, "utf8");
    const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as {
      requirements: Array<{ id: string }>;
    };

    expect(spec.requirements.map((rq) => rq.id)).toContain("rq-archcov01");
    expect(command).toContain("Architecture Scanner Coverage Report");
    expect(command).toContain("coverage.detectedStacks");
    expect(command).toContain("coverage.appliedPacks");
    expect(command).toContain("coverage.missingPacks");
    expect(command).toContain("coverage.skippedDetectors");
    expect(command).toContain("coverage.degradedDetectors");
    expect(skill).toContain("coverage.detectedStacks");
    expect(skill).toContain("coverage.missingPacks");
  });

  test("command and skill document phase 3 trigger semantics", () => {
    const command = readFileSync(COMMAND_PATH, "utf8");
    const skill = readFileSync(SKILL_PATH, "utf8");

    expect(command).toContain("--phase 3");
    expect(command).toContain(
      "only when Phase 1 and Phase 2 produce no findings",
    );
    expect(command).toContain("single-phase heuristic scan");
    expect(skill).toContain("when the user requests `--phase 3`");
    expect(skill).toContain("produce no findings");
  });

  test("command and skill document evidence-backed rewrite assessment", () => {
    const command = readFileSync(COMMAND_PATH, "utf8");
    const skill = readFileSync(SKILL_PATH, "utf8");

    for (const content of [command, skill]) {
      expect(content).toContain("Rewrite Assessment");
      expect(content).toContain(
        "If the project/app were completely rewritten, what architecture would definitely change?",
      );
      expect(content).toContain(
        "If the project/app were completely rewritten, what would definitely not be carried over?",
      );
      expect(content).toContain("No definite conclusion from scan evidence");
      expect(content).toContain("indeterminate");
      expect(content).toContain("never a no-change conclusion");
      expect(content).toContain("never authorize deletion");
      expect(content).toContain("rewriteAssessment");
    }
    expect(command).toContain('"rewriteAssessment"');
    expect(command).toContain('"complete" | "indeterminate"');
    expect(command).toContain('"wouldChange": {');
    expect(command).toContain('"wouldNotCarryOver": {');
    expect(command).toContain('"confidence": "confirmed" | "tentative"');
    expect(command).toContain("wouldChange");
    expect(command).toContain("wouldNotCarryOver");
    expect(command).toContain("tentative");
    expect(command).toContain("command-level `rewriteAssessment`");
  });

  test("ADV instructions classify arch-scan as inline with dedicated skill", () => {
    const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

    expect(content).toContain("| arch-scan");
    expect(content).toContain("/adv-arch-scan");
    expect(content).toContain("adv-arch-scan` → `adv-arch-detection");
  });

  test("spec defines capability consistency pack requirement", () => {
    const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as {
      requirements: Array<{ id: string; title: string }>;
    };

    expect(spec.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "rq-archcap01",
          title: "Capability Consistency Detection",
        }),
      ]),
    );
  });

  test("command and skill document capability consistency pack", () => {
    const command = readFileSync(COMMAND_PATH, "utf8");
    const skill = readFileSync(SKILL_PATH, "utf8");
    const doc = readFileSync(DOC_PATH, "utf8");
    const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as {
      requirements: Array<{ id: string }>;
    };

    // The new requirement ID must remain synchronized across all four
    // contract surfaces: spec source, command, skill, and rendered docs.
    expect(spec.requirements.map((requirement) => requirement.id)).toContain(
      "rq-archcap01",
    );
    for (const content of [command, skill, doc]) {
      expect(content).toContain("rq-archcap01");
      expect(content).toContain("Capability Consistency");
    }
    for (const content of [command, skill]) {
      expect(content).toContain("`bun run bin/arch-scan.ts`");
    }
  });

  test("registry IDs cross-checked against spec requirement IDs", () => {
    const registryIds = extractRegistryIds();
    // Sanity: the registry ships exactly 5 capability relationships.
    expect(registryIds).toHaveLength(5);

    const specText = readFileSync(SPEC_PATH, "utf8");

    // Every shipped rule id must be referenced somewhere in spec.json
    // scenarios so the spec stays in sync with the typed registry.
    for (const ruleId of registryIds) {
      expect(specText).toContain(ruleId);
    }
  });

  test("at least one fixture per registry entry", () => {
    const registryIds = extractRegistryIds();
    expect(registryIds).toHaveLength(5);

    const fixtureDirs = readdirSync(FIXTURES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(fixtureDirs.length).toBeGreaterThanOrEqual(5);

    // Each rule id must be exercised by at least one fixture whose README
    // names the rule. Fixture READMEs are the structural anchor that proves
    // the fixture was built for that rule (not a name-substring heuristic).
    for (const ruleId of registryIds) {
      const matching = fixtureDirs.filter((name) => {
        const readme = readFileSync(
          join(FIXTURES_DIR, name, "README.md"),
          "utf8",
        );
        return readme.includes(ruleId);
      });
      expect(matching.length).toBeGreaterThan(0);
    }
  });

  test("command Phase 1 sub-step mentions bun run bin/arch-scan.ts", () => {
    const command = readFileSync(COMMAND_PATH, "utf8");

    // The Phase 1 sub-step must document the typed-pipeline invocation for
    // capability-consistency findings, citing the CLI command verbatim.
    expect(command).toContain("Phase 1");
    expect(command).toContain("capability-consistency pack");
    expect(command).toContain("bun run bin/arch-scan.ts");
  });

  test("capability sub-phase documented separately from default Phase 3", () => {
    const command = readFileSync(COMMAND_PATH, "utf8");

    // The capability sub-phase must be documented as a distinct section,
    // not folded into default Phase 3 skip-on-no-prior-findings behavior.
    expect(command).toContain("Capability Sub-Phase");
    expect(command).toContain("intent_required");
    expect(command).toContain("explicit sub-phase");
  });
});
