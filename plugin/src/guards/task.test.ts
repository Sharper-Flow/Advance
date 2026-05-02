import { describe, it, expect } from "vitest";
import {
  enforceTaskPolicy,
  MAX_SUBAGENT_NESTING_DEPTH,
  MAX_PARALLEL_SUBAGENTS,
} from "./task";

describe("Task Guard", () => {
  it("sets max sub-agent nesting depth to one worker layer", () => {
    expect(MAX_SUBAGENT_NESTING_DEPTH).toBe(1);
  });

  it("sets max parallel sub-agents to 3", () => {
    expect(MAX_PARALLEL_SUBAGENTS).toBe(3);
  });

  describe("enforceTaskPolicy", () => {
    // --- Top-level agent (primary) parallelism ---

    it("should allow task tool call when no sub-agents are active (primary, no agent name)", () => {
      expect(() => enforceTaskPolicy(0)).not.toThrow();
    });

    it("should allow primary agent to spawn when 1 sub-agent is active", () => {
      expect(() => enforceTaskPolicy(1, "adv")).not.toThrow();
    });

    it("should allow primary agent to spawn when 2 sub-agents are active", () => {
      expect(() => enforceTaskPolicy(2, "adv")).not.toThrow();
    });

    it("should block primary agent when MAX_PARALLEL_SUBAGENTS reached", () => {
      expect(() => enforceTaskPolicy(3, "adv")).toThrow(/parallel sub-agent cap/i);
    });

    it("should block primary agent when above MAX_PARALLEL_SUBAGENTS", () => {
      expect(() => enforceTaskPolicy(5, "adv")).toThrow(/parallel sub-agent cap/i);
    });

    it("should include the active count in parallel cap error message", () => {
      expect(() => enforceTaskPolicy(3, "adv")).toThrow(/3 currently active/);
    });

    it("should include batch guidance in parallel cap error message", () => {
      expect(() => enforceTaskPolicy(3, "adv")).toThrow(/batch/i);
    });

    // All primary agents can spawn sub-agents
    it.each(["adv", "adv-claude", "adv-gpt", "adv-glm", "adv-kimi", "build", "plan"])(
      "should allow primary agent %s to spawn with 0 active",
      (agent) => {
        expect(() => enforceTaskPolicy(0, agent)).not.toThrow();
      },
    );

    it.each(["adv", "adv-claude", "adv-gpt", "adv-glm", "adv-kimi", "build", "plan"])(
      "should block primary agent %s at parallel cap",
      (agent) => {
        expect(() => enforceTaskPolicy(MAX_PARALLEL_SUBAGENTS, agent)).toThrow();
      },
    );

    // --- Sub-agent nesting prevention ---

    it("should block sub-agent (explore) from spawning at any active count", () => {
      expect(() => enforceTaskPolicy(0, "explore")).toThrow(/nested task/i);
    });

    it("should block sub-agent (general) from spawning", () => {
      expect(() => enforceTaskPolicy(0, "general")).toThrow(/nested task/i);
    });

    it("should block sub-agent (librarian) from spawning", () => {
      expect(() => enforceTaskPolicy(0, "librarian")).toThrow(/nested task/i);
    });

    it("should block sub-agent (adv-engineer) from spawning", () => {
      expect(() => enforceTaskPolicy(0, "adv-engineer")).toThrow(/nested task/i);
    });

    it("should block sub-agent (adv-researcher) from spawning", () => {
      expect(() => enforceTaskPolicy(0, "adv-researcher")).toThrow(/nested task/i);
    });

    it("should block sub-agent (adv-tron) from spawning", () => {
      expect(() => enforceTaskPolicy(0, "adv-tron")).toThrow(/nested task/i);
    });

    it("should block sub-agent (mechanic) from spawning", () => {
      expect(() => enforceTaskPolicy(0, "mechanic")).toThrow(/nested task/i);
    });

    it("should include agent name in nested task error", () => {
      expect(() => enforceTaskPolicy(1, "explore")).toThrow(/explore/);
    });

    it("should include remediation guidance in nested task error", () => {
      let errorMessage = "";
      try {
        enforceTaskPolicy(0, "explore");
      } catch (e) {
        errorMessage = (e as Error).message;
      }
      expect(errorMessage).toMatch(/sub-agent/i);
      expect(errorMessage).toMatch(/maximum sub-agent nesting depth is 1/i);
    });

    // --- Fallback: no agent name provided ---

    it("should treat activeSubAgents=0 with no agent name as top-level (allowed)", () => {
      expect(() => enforceTaskPolicy(0)).not.toThrow();
    });

    it("should treat activeSubAgents>0 with no agent name as sub-agent (blocked)", () => {
      // Fallback: without agent name, >0 active means we assume caller is a sub-agent
      expect(() => enforceTaskPolicy(1)).toThrow(/nested task/i);
      expect(() => enforceTaskPolicy(2)).toThrow(/nested task/i);
    });

    it("should throw for any unknown agent name (treated as sub-agent)", () => {
      expect(() => enforceTaskPolicy(0, "some-new-agent")).toThrow(/nested task/i);
    });
  });
});
