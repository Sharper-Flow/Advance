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
} from "./manifest";
import type { GateId } from "./types";

describe("Command Manifest", () => {
  test("exports COMMAND_MANIFEST as a non-empty record", () => {
    expect(COMMAND_MANIFEST).toBeDefined();
    expect(typeof COMMAND_MANIFEST).toBe("object");
    expect(Object.keys(COMMAND_MANIFEST).length).toBeGreaterThan(0);
  });

  test("contains all 18 ADV commands", () => {
    const expectedCommands = [
      "adv-status",
      "adv-proposal",
      "adv-discover",
      "adv-design",
      "adv-validate",
      "adv-apply",
      "adv-archive",
      "adv-clarify",
      "adv-prep",
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
    expect(Object.keys(COMMAND_MANIFEST)).toHaveLength(18);
    // Removed commands must not be present (collapsed into other commands)
    expect(COMMAND_MANIFEST).not.toHaveProperty("adv-research");
    expect(COMMAND_MANIFEST).not.toHaveProperty("adv-agree");
    expect(COMMAND_MANIFEST).not.toHaveProperty("adv-present");
    expect(COMMAND_MANIFEST).not.toHaveProperty("adv-accept");
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
      "proposal",
      "discovery",
      "design",
      "planning",
      "execution",
      "acceptance",
      "release",
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
    test("returns commands that affect the proposal gate", () => {
      const cmds = getCommandsByGate("proposal");
      expect(cmds.length).toBeGreaterThan(0);
      expect(cmds.some((c) => c.name === "adv-proposal")).toBe(true);
    });

    test("returns commands that affect the release gate", () => {
      const cmds = getCommandsByGate("release");
      expect(cmds.some((c) => c.name === "adv-archive")).toBe(true);
    });
  });

  describe("getSuccessors", () => {
    test("returns successor commands for a given command", () => {
      const successors = getSuccessors("adv-prep");
      expect(successors.length).toBeGreaterThan(0);
      expect(successors.some((s) => s.name === "adv-apply")).toBe(true);
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
      "Gather",
      "Present",
      "Retired:",
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
    test("adv-proposal affects proposal gate", () => {
      const def = getCommandDef("adv-proposal");
      expect(def!.gate).toBe("proposal");
    });

    test("adv-discover affects discovery gate", () => {
      const def = getCommandDef("adv-discover");
      expect(def!.gate).toBe("discovery");
    });

    test("adv-design affects design gate", () => {
      const def = getCommandDef("adv-design");
      expect(def!.gate).toBe("design");
    });

    test("adv-prep affects planning gate", () => {
      const def = getCommandDef("adv-prep");
      expect(def!.gate).toBe("planning");
    });

    test("adv-apply affects execution gate", () => {
      const def = getCommandDef("adv-apply");
      expect(def!.gate).toBe("execution");
    });

    test("adv-review affects acceptance gate", () => {
      const def = getCommandDef("adv-review");
      expect(def!.gate).toBe("acceptance");
    });

    test("adv-review is the sole owner of acceptance gate", () => {
      const def = getCommandDef("adv-review");
      expect(def!.gate).toBe("acceptance");
      // No other command should own the acceptance gate after merge
      const acceptanceOwners = Object.entries(COMMAND_MANIFEST).filter(
        ([, d]) => d.gate === "acceptance",
      );
      expect(acceptanceOwners).toHaveLength(1);
      expect(acceptanceOwners[0][0]).toBe("adv-review");
    });

    test("adv-archive affects release gate", () => {
      const def = getCommandDef("adv-archive");
      expect(def!.gate).toBe("release");
    });

    test("adv-harden remains a stage command without direct gate ownership", () => {
      expect(getCommandDef("adv-harden")!.gate).toBeUndefined();
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

    test("adv-proposal scope owns the proposal gate", () => {
      const def = getCommandDef("adv-proposal");
      expect(def!.scope!.gates).toEqual(["proposal"]);
    });

    test("adv-proposal scope does not create tasks", () => {
      const def = getCommandDef("adv-proposal");
      expect(def!.scope!.creates).not.toContain("tasks");
    });

    test("adv-prep scope creates tasks", () => {
      const def = getCommandDef("adv-prep");
      expect(def!.scope!.creates).toContain("tasks");
    });
  });

  // =============================================================================
  // 7-gate model manifest tests
  // =============================================================================

  describe("7-gate collaborative model commands", () => {
    test("manifest contains the remaining discovery/design expansion commands", () => {
      const newCommands = ["adv-discover", "adv-design", "adv-review"];
      for (const cmd of newCommands) {
        expect(COMMAND_MANIFEST, `Missing command: ${cmd}`).toHaveProperty(cmd);
      }
    });

    test("adv-discover owns discovery gate", () => {
      const def = getCommandDef("adv-discover");
      expect(def).toBeDefined();
      expect(def!.gate).toBe("discovery");
    });

    test("adv-design owns design gate", () => {
      const def = getCommandDef("adv-design");
      expect(def).toBeDefined();
      expect(def!.gate).toBe("design");
    });

    test("adv-prep now owns planning gate (renamed from prep)", () => {
      const def = getCommandDef("adv-prep");
      expect(def!.gate).toBe("planning");
    });

    test("adv-apply now owns execution gate (renamed from implementation)", () => {
      const def = getCommandDef("adv-apply");
      expect(def!.gate).toBe("execution");
    });

    test("adv-review owns acceptance gate", () => {
      const def = getCommandDef("adv-review");
      expect(def).toBeDefined();
      expect(def!.gate).toBe("acceptance");
    });

    test("adv-archive now owns release gate", () => {
      const def = getCommandDef("adv-archive");
      expect(def!.gate).toBe("release");
    });

    test("adv-proposal owns proposal gate", () => {
      const def = getCommandDef("adv-proposal");
      expect(def!.gate).toBe("proposal");
    });

    test("successor chain follows 7-gate workflow", () => {
      // proposal → discover → design → prep → apply → review → harden → archive
      expect(getCommandDef("adv-proposal")!.successors).toContain(
        "adv-discover",
      );
      expect(getCommandDef("adv-discover")!.successors).toContain("adv-design");
      expect(getCommandDef("adv-design")!.successors).toContain("adv-prep");
      expect(getCommandDef("adv-prep")!.successors).toContain("adv-apply");
      expect(getCommandDef("adv-apply")!.successors).toContain("adv-review");
      expect(getCommandDef("adv-review")!.successors).toContain("adv-harden");
      expect(getCommandDef("adv-harden")!.successors).toContain("adv-archive");
    });

    test("adv-task fast-track covers proposal through planning gates", () => {
      const def = getCommandDef("adv-task");
      expect(def!.scope!.gates).toEqual(
        expect.arrayContaining(["proposal", "discovery", "design", "planning"]),
      );
    });

    test("adv-research is absent from the forward-only manifest", () => {
      expect(getCommandDef("adv-research")).toBeUndefined();
    });
  });
});
