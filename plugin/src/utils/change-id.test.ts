/**
 * Change ID Generation Tests
 *
 * Tests for generating concise, specific camelCase change IDs from summaries.
 */

import { describe, test, expect } from "vitest";
import { generateChangeId } from "./change-id";

describe("generateChangeId", () => {
  describe("basic camelCase conversion", () => {
    test("converts simple summary to camelCase", () => {
      expect(generateChangeId("Add user auth")).toBe("addUserAuth");
    });

    test("handles single word", () => {
      expect(generateChangeId("Refactor")).toBe("refactor");
    });

    test("handles mixed case input", () => {
      expect(generateChangeId("ADD USER AUTH")).toBe("addUserAuth");
    });
  });

  describe("stop word filtering", () => {
    test("removes articles (a, an, the)", () => {
      expect(generateChangeId("Add the user authentication")).toBe(
        "addUserAuthentication",
      );
      expect(generateChangeId("Create a new feature")).toBe("createNewFeature");
      expect(generateChangeId("Fix an issue")).toBe("fixIssue");
    });

    test("removes prepositions (with, for, to, in, of, from, by, on, at)", () => {
      expect(generateChangeId("Add support for OAuth2")).toBe(
        "addSupportOauth2",
      );
      expect(generateChangeId("Fix issue with validation")).toBe(
        "fixIssueValidation",
      );
      expect(generateChangeId("Move data to new store")).toBe(
        "moveDataNewStore",
      );
    });

    test("removes adjective filler (comprehensive, various, etc.)", () => {
      expect(
        generateChangeId("Implement comprehensive user authentication"),
      ).toBe("addUserAuthentication");
      expect(generateChangeId("Add various error handlers")).toBe(
        "addErrorHandlers",
      );
    });

    test("replaces 'implement' with 'add' as action verb", () => {
      expect(generateChangeId("Implement user auth")).toBe("addUserAuth");
    });

    test("replaces 'introduce' with 'add' as action verb", () => {
      expect(generateChangeId("Introduce rate limiting")).toBe(
        "addRateLimiting",
      );
    });

    test("preserves 'create' as distinct action verb (not aliased)", () => {
      expect(generateChangeId("Create user model")).toBe("createUserModel");
    });
  });

  describe("length enforcement", () => {
    test("truncates at 30 characters", () => {
      const id = generateChangeId(
        "Add very detailed user authentication with comprehensive OAuth2 support and session management",
      );
      expect(id.length).toBeLessThanOrEqual(30);
    });

    test("truncates at word boundary, not mid-word", () => {
      const id = generateChangeId(
        "Add user authentication session management rate limiting",
      );
      expect(id.length).toBeLessThanOrEqual(30);
      // Should not end mid-word — must be valid camelCase
      expect(id).toMatch(/^[a-z][a-zA-Z0-9]*$/);
    });

    test("short summaries are not truncated", () => {
      expect(generateChangeId("Fix bug")).toBe("fixBug");
    });
  });

  describe("edge cases", () => {
    test("handles empty string", () => {
      expect(generateChangeId("")).toBe("change");
    });

    test("handles string of only stop words", () => {
      const id = generateChangeId("the a an with for");
      // Should fall back to original words since all are stop words
      expect(id.length).toBeGreaterThan(0);
    });

    test("handles special characters", () => {
      expect(generateChangeId("Fix bug #123")).toBe("fixBug123");
    });

    test("handles numbers", () => {
      expect(generateChangeId("Add OAuth2 support")).toBe("addOauth2Support");
    });

    test("preserves action verbs at the start", () => {
      expect(generateChangeId("Fix the broken validation")).toBe(
        "fixBrokenValidation",
      );
      expect(generateChangeId("Update user profile logic")).toBe(
        "updateUserProfileLogic",
      );
      expect(generateChangeId("Remove deprecated API")).toBe(
        "removeDeprecatedApi",
      );
    });

    test("handles 'Full update' type generic summaries by keeping them", () => {
      // Can't improve truly generic input, but don't mangle it
      expect(generateChangeId("Full update")).toBe("fullUpdate");
    });

    test("handles consecutive stop words", () => {
      expect(
        generateChangeId("Add support for the new feature in the system"),
      ).toBe("addSupportNewFeatureSystem");
    });
  });

  describe("real-world bad examples from models", () => {
    test("verbose Claude-style summary", () => {
      const id = generateChangeId(
        "Implement comprehensive error handling with retry logic and exponential backoff",
      );
      expect(id.length).toBeLessThanOrEqual(30);
      // 'implement' → 'add', 'comprehensive' stripped
      expect(id).toMatch(/^add/);
      expect(id).toContain("Error");
    });

    test("generic model summary", () => {
      expect(generateChangeId("Update the codebase")).toBe("updateCodebase");
    });

    test("overly detailed summary", () => {
      const id = generateChangeId(
        "Add new comprehensive functionality for user authentication with OAuth2 and JWT token support",
      );
      expect(id.length).toBeLessThanOrEqual(30);
      expect(id).toMatch(/^add/);
    });

    test("'implement new' pattern", () => {
      const id = generateChangeId("Implement new caching layer");
      expect(id).toBe("addNewCachingLayer");
    });
  });
});
