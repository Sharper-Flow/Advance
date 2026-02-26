import { describe, it, expect } from "vitest";
import { enforceTaskPolicy } from "./task";

describe("Task Anti-Recursion Guard", () => {
  describe("enforceTaskPolicy", () => {
    it("should allow task tool call when no sub-agents are active (first level)", () => {
      expect(() => enforceTaskPolicy(0)).not.toThrow();
    });

    it("should throw when task tool called while one sub-agent is active (nested recursion)", () => {
      expect(() => enforceTaskPolicy(1)).toThrow(/nested task/i);
    });

    it("should throw when task tool called while multiple sub-agents are active", () => {
      expect(() => enforceTaskPolicy(3)).toThrow(/nested task/i);
    });

    it("should include the active sub-agent count in the error message", () => {
      expect(() => enforceTaskPolicy(2)).toThrow(/2/);
    });

    it("should include remediation guidance in the error message", () => {
      let errorMessage = "";
      try {
        enforceTaskPolicy(1);
      } catch (e) {
        errorMessage = (e as Error).message;
      }
      expect(errorMessage).toMatch(/sub-agent/i);
    });

    it("should not throw for exactly 0 active sub-agents", () => {
      expect(() => enforceTaskPolicy(0)).not.toThrow();
    });

    it("should throw for any positive count of active sub-agents", () => {
      for (const count of [1, 2, 5, 10, 100]) {
        expect(() => enforceTaskPolicy(count)).toThrow();
      }
    });
  });
});
