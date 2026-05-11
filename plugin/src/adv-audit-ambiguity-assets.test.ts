import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const repoRoot = path.resolve(__dirname, "../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf-8");
}

describe("adv-audit ambiguity contract assets", () => {
  describe(".opencode/command/adv-audit.md", () => {
    const content = readFile(".opencode/command/adv-audit.md");

    it("contains ambiguity detection in Phase 3", () => {
      expect(content).toContain("## Phase 3: Synthesis");
      expect(content).toContain("runSpecAmbiguityChecks");
      expect(content).toMatch(
        /Inline Ambiguity Detection|inline ambiguity detection/i,
      );
    });

    it("quality gate table includes CRITICAL ambiguity row", () => {
      expect(content).toContain("CRITICAL ambiguity");
    });

    it("quality gate table includes HIGH ambiguity row", () => {
      expect(content).toContain("HIGH ambiguity");
    });

    it("report schema includes ambiguity[] section", () => {
      expect(content).toContain('"ambiguity":');
      expect(content).toContain('"category": "B|F|S|Q|E"');
    });

    it("documents clarify_enforcement flag behavior", () => {
      expect(content).toContain("clarify_enforcement");
      expect(content).toContain("off");
      expect(content).toContain("advisory");
      expect(content).toContain("strict");
    });

    it("remediation mentions /adv-clarify handoff", () => {
      expect(content).toContain("/adv-clarify");
      expect(content).toMatch(/informational handoff|informational.*handoff/i);
    });
  });

  describe("skills/adv-audit/SKILL.md", () => {
    const content = readFile("skills/adv-audit/SKILL.md");

    it("contains Ambiguity Detection dimension", () => {
      expect(content).toMatch(/### Ambiguity Detection/i);
      expect(content).toContain("runSpecAmbiguityChecks");
    });

    it("quality gate section includes ambiguity rows", () => {
      expect(content).toContain("CRITICAL ambiguity");
      expect(content).toContain("HIGH ambiguity");
    });
  });

  describe("plugin/src/validator/spec-ambiguity.ts", () => {
    const content = readFile("plugin/src/validator/spec-ambiguity.ts");

    it("exports runSpecAmbiguityChecks", () => {
      expect(content).toContain("export function runSpecAmbiguityChecks");
    });

    it("exports isAmbiguityFinding", () => {
      expect(content).toContain("export function isAmbiguityFinding");
    });
  });

  describe(".opencode/command/adv-clarify.md", () => {
    const content = readFile(".opencode/command/adv-clarify.md");

    it("mentions spec-input entry point", () => {
      expect(content).toContain("/adv-audit");
      expect(content).toContain("specCapability");
    });
  });

  describe("ADV_INSTRUCTIONS.md", () => {
    const content = readFile("ADV_INSTRUCTIONS.md");

    it("taxonomy section mentions spec-law surface", () => {
      expect(content).toContain("Two-surface taxonomy");
      expect(content).toContain("Spec laws");
      expect(content).toContain("/adv-audit");
    });
  });
});
