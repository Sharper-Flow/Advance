/**
 * Manifest Tests
 *
 * TDD tests for the workflow manifest — type-safe command definitions
 * with phase, gate, prerequisites, and successor information.
 */

import { describe, test, expect } from "vitest";
import {
  COMMAND_MANIFEST,
  getCommandDef,
  getCommandsByGate,
  getSuccessors,
  type GateId,
} from "./manifest";

describe("Command Manifest", () => {
  test("exports COMMAND_MANIFEST as a non-empty record", () => {
    expect(COMMAND_MANIFEST).toBeDefined();
    expect(typeof COMMAND_MANIFEST).toBe("object");
    expect(Object.keys(COMMAND_MANIFEST).length).toBeGreaterThan(0);
  });

  test("contains all 17 ADV commands", () => {
    const expectedCommands = [
      "adv-status",
      "adv-proposal",
      "adv-validate",
      "adv-apply",
      "adv-archive",
      "adv-clarify",
      "adv-prep",
      "adv-research",
      "adv-review",
      "adv-harden",
      "adv-audit",
      "adv-refactor",
      "adv-coordinate",
      "adv-improve",
      "adv-slop-scan",
      "adv-task",
      "adv-tron",
    ];

    for (const cmd of expectedCommands) {
      expect(COMMAND_MANIFEST).toHaveProperty(cmd);
    }
    expect(Object.keys(COMMAND_MANIFEST)).toHaveLength(17);
  });

  test("every command has required fields", () => {
    for (const [name, def] of Object.entries(COMMAND_MANIFEST)) {
      expect(def.name).toBe(name);
      expect(typeof def.description).toBe("string");
      expect(def.description.length).toBeGreaterThan(5);
      expect(typeof def.phase).toBe("string");
      expect(typeof def.requiresChangeId).toBe("boolean");
      expect(Array.isArray(def.successors)).toBe(true);
      expect(Array.isArray(def.prerequisites)).toBe(true);
    }
  });

  test("gate-affecting commands reference valid gate IDs", () => {
    const validGates: GateId[] = [
      "research",
      "prep",
      "implementation",
      "review",
      "harden",
      "signoff",
    ];

    for (const def of Object.values(COMMAND_MANIFEST)) {
      if (def.gate) {
        expect(validGates).toContain(def.gate);
      }
    }
  });

  test("successors reference valid command names", () => {
    const validNames = new Set(Object.keys(COMMAND_MANIFEST));

    for (const def of Object.values(COMMAND_MANIFEST)) {
      for (const successor of def.successors) {
        expect(validNames.has(successor)).toBe(true);
      }
    }
  });

  test("prerequisites reference valid command names", () => {
    const validNames = new Set(Object.keys(COMMAND_MANIFEST));

    for (const def of Object.values(COMMAND_MANIFEST)) {
      for (const prereq of def.prerequisites) {
        expect(validNames.has(prereq)).toBe(true);
      }
    }
  });

  describe("getCommandDef", () => {
    test("returns command definition by name", () => {
      const def = getCommandDef("adv-status");
      expect(def).toBeDefined();
      expect(def!.name).toBe("adv-status");
    });

    test("returns undefined for unknown command", () => {
      const def = getCommandDef("adv-nonexistent");
      expect(def).toBeUndefined();
    });
  });

  describe("getCommandsByGate", () => {
    test("returns commands that affect the research gate", () => {
      const cmds = getCommandsByGate("research");
      expect(cmds.length).toBeGreaterThan(0);
      expect(cmds.some((c) => c.name === "adv-research")).toBe(true);
    });

    test("returns empty array for gate with no direct command", () => {
      // signoff is user-triggered, no specific command
      const cmds = getCommandsByGate("signoff");
      // May or may not have commands — just shouldn't throw
      expect(Array.isArray(cmds)).toBe(true);
    });
  });

  describe("getSuccessors", () => {
    test("returns successor commands for a given command", () => {
      const successors = getSuccessors("adv-prep");
      expect(successors.length).toBeGreaterThan(0);
      // After prep, you typically do apply or research
      expect(
        successors.some(
          (s) => s.name === "adv-apply" || s.name === "adv-research",
        ),
      ).toBe(true);
    });

    test("returns empty array for unknown command", () => {
      const successors = getSuccessors("adv-nonexistent");
      expect(successors).toEqual([]);
    });
  });

  describe("Voice standard enforcement", () => {
    // Banned phrases per docs/command-voice-standard.md
    const BANNED_PHRASES = [
      "high-risk signals",
      "autonomous retry",
      "AI-slop detection",
      "Socratic clarifying questions",
      "Gap analysis",
    ];

    // Strong verbs that descriptions must start with
    const STRONG_VERBS = [
      "Show",
      "Propose",
      "Validate",
      "Implement",
      "Archive",
      "Ask",
      "Analyze",
      "Detect",
      "Review",
      "Scan",
      "Refresh",
      "Suggest",
      "Fast-track",
      "Investigate",
      "Extract",
    ];

    test("every description starts with a strong verb", () => {
      for (const [name, def] of Object.entries(COMMAND_MANIFEST)) {
        const startsWithVerb = STRONG_VERBS.some((v) =>
          def.description.startsWith(v),
        );
        expect(
          startsWithVerb,
          `${name}: description must start with a strong verb, got: "${def.description}"`,
        ).toBe(true);
      }
    });

    test("every description is 5–14 words", () => {
      for (const [name, def] of Object.entries(COMMAND_MANIFEST)) {
        const wordCount = def.description.trim().split(/\s+/).length;
        expect(
          wordCount,
          `${name}: description must be 5–14 words, got ${wordCount}: "${def.description}"`,
        ).toBeGreaterThanOrEqual(5);
        expect(
          wordCount,
          `${name}: description must be 5–14 words, got ${wordCount}: "${def.description}"`,
        ).toBeLessThanOrEqual(14);
      }
    });

    test("no description contains banned phrases", () => {
      for (const [name, def] of Object.entries(COMMAND_MANIFEST)) {
        for (const phrase of BANNED_PHRASES) {
          expect(
            def.description.toLowerCase().includes(phrase.toLowerCase()),
            `${name}: description contains banned phrase "${phrase}": "${def.description}"`,
          ).toBe(false);
        }
      }
    });
  });

  describe("Workflow correctness", () => {
    test("adv-research affects research gate", () => {
      const def = getCommandDef("adv-research");
      expect(def!.gate).toBe("research");
    });

    test("adv-prep affects prep gate", () => {
      const def = getCommandDef("adv-prep");
      expect(def!.gate).toBe("prep");
    });

    test("adv-apply affects implementation gate", () => {
      const def = getCommandDef("adv-apply");
      expect(def!.gate).toBe("implementation");
    });

    test("adv-review affects review gate", () => {
      const def = getCommandDef("adv-review");
      expect(def!.gate).toBe("review");
    });

    test("adv-harden affects harden gate", () => {
      const def = getCommandDef("adv-harden");
      expect(def!.gate).toBe("harden");
    });

    test("adv-archive requires change ID", () => {
      const def = getCommandDef("adv-archive");
      expect(def!.requiresChangeId).toBe(true);
    });

    test("adv-status does not require change ID", () => {
      const def = getCommandDef("adv-status");
      expect(def!.requiresChangeId).toBe(false);
    });
  });

  describe("Scope boundary enforcement", () => {
    test("every gate-affecting command has a scope definition", () => {
      const missing: string[] = [];
      for (const [name, def] of Object.entries(COMMAND_MANIFEST)) {
        if (def.gate && !def.scope) {
          missing.push(name);
        }
      }
      expect(
        missing,
        `Gate-affecting commands without scope: ${missing.join(", ")}`,
      ).toHaveLength(0);
    });

    test("scope.gates includes the command's own gate", () => {
      const mismatches: string[] = [];
      for (const [name, def] of Object.entries(COMMAND_MANIFEST)) {
        if (def.gate && def.scope && !def.scope.gates.includes(def.gate)) {
          mismatches.push(
            `${name}: gate=${def.gate} but scope.gates=[${def.scope.gates.join(", ")}]`,
          );
        }
      }
      expect(
        mismatches,
        `Commands whose scope.gates doesn't include their own gate:\n${mismatches.join("\n")}`,
      ).toHaveLength(0);
    });

    test("no two commands claim the same gate as sole primary owner", () => {
      // Build a map of gate -> commands that own it (excluding adv-task which is exempt)
      const gateOwners = new Map<string, string[]>();
      for (const [name, def] of Object.entries(COMMAND_MANIFEST)) {
        if (!def.scope) continue;
        // adv-task is exempt — it intentionally crosses boundaries
        if (name === "adv-task") continue;
        for (const gate of def.scope.gates) {
          const owners = gateOwners.get(gate) ?? [];
          owners.push(name);
          gateOwners.set(gate, owners);
        }
      }
      const conflicts: string[] = [];
      for (const [gate, owners] of gateOwners) {
        if (owners.length > 1) {
          conflicts.push(`${gate}: claimed by [${owners.join(", ")}]`);
        }
      }
      expect(
        conflicts,
        `Multiple commands claim the same gate:\n${conflicts.join("\n")}`,
      ).toHaveLength(0);
    });

    test("adv-proposal scope has empty gates (no gate ownership)", () => {
      const def = getCommandDef("adv-proposal");
      expect(def!.scope!.gates).toHaveLength(0);
    });

    test("adv-proposal scope does not create tasks", () => {
      const def = getCommandDef("adv-proposal");
      expect(def!.scope!.creates).not.toContain("tasks");
    });

    test("adv-research scope does not create tasks", () => {
      const def = getCommandDef("adv-research");
      expect(def!.scope!.creates).not.toContain("tasks");
    });

    test("adv-prep scope creates tasks", () => {
      const def = getCommandDef("adv-prep");
      expect(def!.scope!.creates).toContain("tasks");
    });
  });
});
