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
    const MAIN = "session-main-abc";
    const SUB = "session-sub-xyz";

    // --- Primary (callerSessionId === mainSessionId) parallelism ---

    it("allows primary to spawn at activeSubAgents=0 (1st parallel)", () => {
      expect(() => enforceTaskPolicy(0, MAIN, MAIN)).not.toThrow();
    });

    it("allows primary to spawn at activeSubAgents=1 (2nd parallel)", () => {
      expect(() => enforceTaskPolicy(1, MAIN, MAIN)).not.toThrow();
    });

    it("allows primary to spawn at activeSubAgents=2 (3rd parallel)", () => {
      expect(() => enforceTaskPolicy(2, MAIN, MAIN)).not.toThrow();
    });

    it("blocks primary at activeSubAgents=3 (parallel cap)", () => {
      expect(() => enforceTaskPolicy(3, MAIN, MAIN)).toThrow(
        /parallel sub-agent cap/i,
      );
    });

    it("blocks primary above MAX_PARALLEL_SUBAGENTS", () => {
      expect(() => enforceTaskPolicy(5, MAIN, MAIN)).toThrow(
        /parallel sub-agent cap/i,
      );
    });

    it("includes active count in parallel cap error message", () => {
      expect(() => enforceTaskPolicy(3, MAIN, MAIN)).toThrow(
        /3 currently active/,
      );
    });

    it("includes batch guidance in parallel cap error message", () => {
      expect(() => enforceTaskPolicy(3, MAIN, MAIN)).toThrow(/batch/i);
    });

    // --- Sub-agent (callerSessionId !== mainSessionId) nesting prevention ---

    it("blocks sub-agent spawn at activeSubAgents=0", () => {
      expect(() => enforceTaskPolicy(0, SUB, MAIN)).toThrow(/nested task/i);
    });

    it("blocks sub-agent spawn at activeSubAgents=1", () => {
      expect(() => enforceTaskPolicy(1, SUB, MAIN)).toThrow(/nested task/i);
    });

    it("blocks sub-agent spawn at activeSubAgents=2", () => {
      expect(() => enforceTaskPolicy(2, SUB, MAIN)).toThrow(/nested task/i);
    });

    it("includes session info in nested task error", () => {
      let errorMessage = "";
      try {
        enforceTaskPolicy(1, SUB, MAIN);
      } catch (e) {
        errorMessage = (e as Error).message;
      }
      expect(errorMessage).toMatch(/sub-agent/i);
      expect(errorMessage).toMatch(/maximum sub-agent nesting depth is 1/i);
    });

    // --- Null mainSessionId fail-open policy ---

    it("allows spawn when mainSessionId is null (fail-open at activeSubAgents=0)", () => {
      expect(() => enforceTaskPolicy(0, MAIN, null)).not.toThrow();
    });

    it("allows spawn when mainSessionId is null (fail-open at activeSubAgents=1)", () => {
      expect(() => enforceTaskPolicy(1, MAIN, null)).not.toThrow();
    });

    it("allows spawn when mainSessionId is null (fail-open at activeSubAgents=2)", () => {
      expect(() => enforceTaskPolicy(2, MAIN, null)).not.toThrow();
    });

    it("still enforces parallel cap when mainSessionId is null", () => {
      expect(() => enforceTaskPolicy(3, MAIN, null)).toThrow(
        /parallel sub-agent cap/i,
      );
    });

    it("allows spawn when both callerSessionId and mainSessionId are undefined (fail-open)", () => {
      expect(() => enforceTaskPolicy(0)).not.toThrow();
    });

    it("allows spawn when callerSessionId undefined and mainSessionId null (fail-open)", () => {
      expect(() => enforceTaskPolicy(1, undefined, null)).not.toThrow();
    });

    // --- Null callerSessionId with set mainSessionId (cannot identify caller) ---

    it("blocks spawn when callerSessionId undefined but mainSessionId set", () => {
      // Cannot prove caller is primary; treat as sub-agent for safety
      expect(() => enforceTaskPolicy(0, undefined, MAIN)).toThrow(
        /nested task/i,
      );
    });

    it("blocks spawn when callerSessionId undefined but mainSessionId set, regardless of count", () => {
      expect(() => enforceTaskPolicy(2, undefined, MAIN)).toThrow(
        /nested task/i,
      );
    });
  });
});
