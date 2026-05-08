/**
 * Clarify-Readiness Validator Tests
 *
 * Tests for programmatic ambiguity detection that triggers /adv-clarify
 * recommendations without consuming agent context window.
 */

import { describe, test, expect } from "vitest";
import {
  ClarifyReadinessCodes,
  checkSubjectiveLanguage,
  checkMissingSuccessCriteria,
  checkMissingScenarios,
  checkUnclearScope,
  checkAssumptionHeavy,
  checkMissingErrorHandling,
  runClarifyReadinessChecks,
} from "./clarify-readiness";
import type { Change } from "../types";

// =============================================================================
// Test Helpers
// =============================================================================

function makeChange(overrides: Partial<Change> = {}): Change {
  return {
    $schema: "https://example.com/change.schema.json",
    id: "testChange",
    title: overrides.title ?? "Add rate limiting",
    status: "draft",
    created_at: "2026-01-01T00:00:00Z",
    tasks: overrides.tasks ?? [],
    deltas: overrides.deltas ?? {},
    ...overrides,
  } as Change;
}

// =============================================================================
// checkSubjectiveLanguage
// =============================================================================

describe("checkSubjectiveLanguage", () => {
  test("flags subjective terms in change title", () => {
    const change = makeChange({ title: "Make the API fast and simple" });
    const issues = checkSubjectiveLanguage(change);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].code).toBe(
      ClarifyReadinessCodes.CLARIFY_SUBJECTIVE_LANGUAGE,
    );
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].details?.questionCategory).toBe("clarification");
  });

  test("flags 'user-friendly' in title", () => {
    const change = makeChange({ title: "Create user-friendly dashboard" });
    const issues = checkSubjectiveLanguage(change);
    expect(issues.length).toBeGreaterThan(0);
  });

  test("flags 'robust' in title", () => {
    const change = makeChange({ title: "Build robust error handling" });
    const issues = checkSubjectiveLanguage(change);
    expect(issues.length).toBeGreaterThan(0);
  });

  test("does not flag concrete titles", () => {
    const change = makeChange({
      title: "Add rate limiting to /api/users endpoint",
    });
    const issues = checkSubjectiveLanguage(change);
    expect(issues).toEqual([]);
  });

  test("does not flag action-verb titles without subjective terms", () => {
    const change = makeChange({
      title: "Fix auth token refresh on 401 response",
    });
    const issues = checkSubjectiveLanguage(change);
    expect(issues).toEqual([]);
  });
});

// =============================================================================
// checkMissingSuccessCriteria
// =============================================================================

describe("checkMissingSuccessCriteria", () => {
  test("flags when proposal has no success criteria section", () => {
    const proposalText = `# My Change\n\n## Intent\n\nDo something.\n\n## Scope\n\n- file.ts`;
    const issues = checkMissingSuccessCriteria(makeChange(), proposalText);
    expect(issues.length).toBe(1);
    expect(issues[0].code).toBe(
      ClarifyReadinessCodes.CLARIFY_MISSING_SUCCESS_CRITERIA,
    );
    expect(issues[0].details?.questionCategory).toBe("evidence");
  });

  test("flags when success criteria are all placeholder", () => {
    const proposalText = `# My Change\n\n## Success Criteria\n\n- [ ] Criterion 1\n- [ ] Criterion 2`;
    const issues = checkMissingSuccessCriteria(makeChange(), proposalText);
    expect(issues.length).toBe(1);
  });

  test("does not flag when success criteria have concrete content", () => {
    const proposalText = `# My Change\n\n## Success Criteria\n\n- [ ] API responds within 200ms at p95\n- [ ] Rate limiter rejects after 100 req/min`;
    const issues = checkMissingSuccessCriteria(makeChange(), proposalText);
    expect(issues).toEqual([]);
  });

  test("does not flag empty proposal (handled by other checks)", () => {
    const issues = checkMissingSuccessCriteria(makeChange(), "");
    // Empty proposal means no section found — should flag
    expect(issues.length).toBe(1);
  });
});

// =============================================================================
// checkMissingScenarios
// =============================================================================

describe("checkMissingScenarios", () => {
  test("flags deltas that add requirements with zero scenarios", () => {
    const change = makeChange({
      deltas: {
        "my-capability": [
          {
            id: "dl-test1",
            operation: "add" as const,
            requirement: {
              id: "rq-test1",
              title: "Support rate limiting",
              priority: "must",
              scenarios: [],
            },
          },
        ],
      },
    });
    const issues = checkMissingScenarios(change);
    expect(issues.length).toBe(1);
    expect(issues[0].code).toBe(
      ClarifyReadinessCodes.CLARIFY_MISSING_SCENARIOS,
    );
    expect(issues[0].details?.questionCategory).toBe("implications");
  });

  test("does not flag deltas with scenarios", () => {
    const change = makeChange({
      deltas: {
        "my-capability": [
          {
            id: "dl-test2",
            operation: "add" as const,
            requirement: {
              id: "rq-test2",
              title: "Support rate limiting",
              priority: "must",
              scenarios: [
                {
                  id: "rq-test2.1",
                  given: "user sends 101st request",
                  when: "rate limit is 100/min",
                  then: "return 429", // NOSONAR(typescript:S7739): BDD scenario field, not a thenable
                },
              ],
            },
          },
        ],
      },
    });
    const issues = checkMissingScenarios(change);
    expect(issues).toEqual([]);
  });

  test("does not flag non-add deltas", () => {
    const change = makeChange({
      deltas: {
        "my-capability": [
          {
            id: "dl-test3",
            operation: "remove" as const,
            target_id: "rq-old",
            reason: "No longer needed",
          },
        ],
      },
    });
    const issues = checkMissingScenarios(change);
    expect(issues).toEqual([]);
  });

  test("does not flag when no deltas exist", () => {
    const change = makeChange({ deltas: {} });
    const issues = checkMissingScenarios(change);
    expect(issues).toEqual([]);
  });
});

// =============================================================================
// checkUnclearScope
// =============================================================================

describe("checkUnclearScope", () => {
  test("flags when proposal has no scope section", () => {
    const proposalText = `# My Change\n\n## Intent\n\nDo something.`;
    const issues = checkUnclearScope(makeChange(), proposalText);
    expect(issues.length).toBe(1);
    expect(issues[0].code).toBe(ClarifyReadinessCodes.CLARIFY_UNCLEAR_SCOPE);
    expect(issues[0].details?.questionCategory).toBe("clarification");
  });

  test("flags when scope contains only placeholder text", () => {
    const proposalText = `# My Change\n\n## Scope\n\n- (unknown — proposal.md not found)`;
    const issues = checkUnclearScope(makeChange(), proposalText);
    expect(issues.length).toBe(1);
  });

  test("flags when scope section is empty", () => {
    const proposalText = `# My Change\n\n## Scope\n\n## Success Criteria`;
    const issues = checkUnclearScope(makeChange(), proposalText);
    expect(issues.length).toBe(1);
  });

  test("does not flag when scope has concrete file references", () => {
    const proposalText = `# My Change\n\n## Scope\n\n- plugin/src/validator/clarify-readiness.ts\n- plugin/src/types.ts`;
    const issues = checkUnclearScope(makeChange(), proposalText);
    expect(issues).toEqual([]);
  });

  test("does not flag concrete scope with blank lines between entries", () => {
    const proposalText = `# My Change\n\n## Scope\n\n- plugin/src/validator/clarify-readiness.ts\n\n- plugin/src/types.ts\n\n## Success Criteria\n\n- [ ] Done`;
    const issues = checkUnclearScope(makeChange(), proposalText);
    expect(issues).toEqual([]);
  });
});

// =============================================================================
// checkAssumptionHeavy
// =============================================================================

describe("checkAssumptionHeavy", () => {
  test("flags when proposal mentions auth without specifying model", () => {
    const proposalText = `# My Change\n\n## Intent\n\nAdd authentication to the API.\n\n## Scope\n\n- src/auth.ts`;
    const issues = checkAssumptionHeavy(makeChange(), proposalText);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].code).toBe(ClarifyReadinessCodes.CLARIFY_ASSUMPTION_HEAVY);
    expect(issues[0].details?.questionCategory).toBe("assumptions");
  });

  test("flags when proposal mentions permissions without details", () => {
    const proposalText = `# My Change\n\n## Intent\n\nAdd permissions to the dashboard.`;
    const issues = checkAssumptionHeavy(makeChange(), proposalText);
    expect(issues.length).toBeGreaterThan(0);
  });

  test("does not flag bare role in non-auth contexts", () => {
    const proposalText = `# My Change\n\n## Intent\n\nKeep the same role in the project workflow.`;
    const issues = checkAssumptionHeavy(makeChange(), proposalText);
    expect(issues).toEqual([]);
  });

  test("still flags role-based access control", () => {
    const proposalText = `# My Change\n\n## Intent\n\nAdd role-based access control to the dashboard.`;
    const issues = checkAssumptionHeavy(makeChange(), proposalText);
    expect(issues.length).toBeGreaterThan(0);
  });

  test("does not flag weak auth-adjacent words alone", () => {
    const proposalText = `# My Change\n\n## Intent\n\nClarify credentials and privileges in the operator role documentation.`;
    const issues = checkAssumptionHeavy(makeChange(), proposalText);
    expect(issues).toEqual([]);
  });

  test("does not flag when auth model is specified", () => {
    const proposalText = `# My Change\n\n## Intent\n\nAdd JWT-based authentication using RS256 tokens with 15-minute expiry.`;
    const issues = checkAssumptionHeavy(makeChange(), proposalText);
    expect(issues).toEqual([]);
  });

  test("does not flag proposals without auth/permission references", () => {
    const proposalText = `# My Change\n\n## Intent\n\nAdd rate limiting to the API using a sliding window counter.`;
    const issues = checkAssumptionHeavy(makeChange(), proposalText);
    expect(issues).toEqual([]);
  });
});

// =============================================================================
// checkMissingErrorHandling
// =============================================================================

describe("checkMissingErrorHandling", () => {
  test("flags when proposal describes behavior but no error handling", () => {
    const proposalText = `# My Change\n\n## Intent\n\nAdd a payment processing endpoint that charges credit cards.\n\n## Scope\n\n- src/payments.ts`;
    const issues = checkMissingErrorHandling(makeChange(), proposalText);
    expect(issues.length).toBe(1);
    expect(issues[0].code).toBe(
      ClarifyReadinessCodes.CLARIFY_MISSING_ERROR_HANDLING,
    );
    expect(issues[0].details?.questionCategory).toBe("implications");
  });

  test("does not flag when error handling is mentioned", () => {
    const proposalText = `# My Change\n\n## Intent\n\nAdd payment processing. On failure, retry 3 times with exponential backoff. On permanent failure, return 502 and log to Sentry.`;
    const issues = checkMissingErrorHandling(makeChange(), proposalText);
    expect(issues).toEqual([]);
  });

  test("does not flag when rollback is mentioned", () => {
    const proposalText = `# My Change\n\n## Intent\n\nAdd payment processing. If the charge fails, rollback the order status to pending.`;
    const issues = checkMissingErrorHandling(makeChange(), proposalText);
    expect(issues).toEqual([]);
  });

  test("does not flag trivial changes (docs, config)", () => {
    const proposalText = `# My Change\n\n## Intent\n\nUpdate README with new API docs.`;
    const issues = checkMissingErrorHandling(makeChange(), proposalText);
    expect(issues).toEqual([]);
  });

  test("still flags non-trivial behavior changes that also mention config", () => {
    const proposalText = `# My Change\n\n## Intent\n\nAdd a payment processing endpoint and update config parsing.\n\n## Scope\n\n- src/payments.ts\n- src/config.ts`;
    const issues = checkMissingErrorHandling(makeChange(), proposalText);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe(
      ClarifyReadinessCodes.CLARIFY_MISSING_ERROR_HANDLING,
    );
  });
});

// =============================================================================
// runClarifyReadinessChecks (integration)
// =============================================================================

describe("runClarifyReadinessChecks", () => {
  test("returns passed=true for clean change with no ambiguity", () => {
    const change = makeChange({
      title: "Add rate limiting to /api/users endpoint",
      deltas: {
        "rate-limiting": [
          {
            id: "dl-clean",
            operation: "add" as const,
            requirement: {
              id: "rq-clean",
              title: "Rate limit API",
              priority: "must",
              scenarios: [
                {
                  id: "rq-clean.1",
                  given: "user sends 101st request",
                  when: "limit is 100/min",
                  then: "return 429", // NOSONAR(typescript:S7739): BDD scenario field, not a thenable
                },
              ],
            },
          },
        ],
      },
    });
    const proposalText = `# Add Rate Limiting\n\n## Intent\n\nLimit API requests to 100/min per user.\n\n## Scope\n\n- src/middleware/rate-limiter.ts\n- src/routes/api.ts\n\n## Success Criteria\n\n- [ ] API returns 429 after 100 requests per minute\n- [ ] Rate limit headers included in response\n\n## Error Handling\n\nOn rate limit exceeded, return 429 with Retry-After header.`;
    const result = runClarifyReadinessChecks(change, proposalText);
    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
  });

  test("returns findings for ambiguous change", () => {
    const change = makeChange({
      title: "Make the system fast and robust",
      deltas: {
        perf: [
          {
            id: "dl-ambig",
            operation: "add" as const,
            requirement: {
              id: "rq-ambig",
              title: "System should be fast",
              priority: "must",
              scenarios: [],
            },
          },
        ],
      },
    });
    const proposalText = `# Make System Fast\n\n## Intent\n\nImprove performance.`;
    const result = runClarifyReadinessChecks(change, proposalText);
    expect(result.passed).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
    // Should have at least: subjective language, missing success criteria, missing scenarios, unclear scope
    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain(ClarifyReadinessCodes.CLARIFY_SUBJECTIVE_LANGUAGE);
    expect(codes).toContain(
      ClarifyReadinessCodes.CLARIFY_MISSING_SUCCESS_CRITERIA,
    );
    expect(codes).toContain(ClarifyReadinessCodes.CLARIFY_MISSING_SCENARIOS);
    expect(codes).toContain(ClarifyReadinessCodes.CLARIFY_UNCLEAR_SCOPE);
  });

  test("checksPerformed lists all 6 check functions", () => {
    const result = runClarifyReadinessChecks(makeChange(), "");
    expect(result.checksPerformed).toHaveLength(6);
  });

  test("checkedAt is a valid ISO timestamp", () => {
    const result = runClarifyReadinessChecks(makeChange(), "");
    expect(() => new Date(result.checkedAt)).not.toThrow();
    expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt);
  });
});
