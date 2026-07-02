import { describe, expect, test } from "vitest";
import {
  buildApprovalConsequenceContext,
  type ApprovalConsequenceCategory,
  type ApprovalConsequenceContextInput,
} from "./approval-consequence-context";

const allCategories: ApprovalConsequenceCategory[] = [
  "delivered_value",
  "enabling_only_dependency",
  "ops_readiness",
  "migration_data_impact",
  "frontend_preview_impact",
  "collision_release_risk",
  "open_follow_ups",
  "next_action",
];

const buildInput = (
  overrides: Partial<ApprovalConsequenceContextInput["categories"]>,
): ApprovalConsequenceContextInput => ({
  categories: {
    delivered_value: {
      status: "pass",
      evidence: "Feature X shipped and verified.",
    },
    enabling_only_dependency: {
      status: "warning",
      evidence: "Depends on follow-up change Y to expose public API.",
    },
    ops_readiness: {
      status: "pass",
      evidence: "Runbooks and monitors in place.",
    },
    migration_data_impact: {
      status: "blocked",
      evidence: "Backfill script still running; do not merge until done.",
    },
    frontend_preview_impact: {
      status: "pending",
      evidence: "Design review scheduled.",
    },
    collision_release_risk: {
      status: "n/a",
      evidence: "No overlapping release train this week.",
    },
    open_follow_ups: {
      status: "warning",
      evidence: "Two minor clean-up tasks tracked as separate changes.",
    },
    next_action: {
      status: "pending",
      evidence: "Wait for backfill completion.",
    },
    ...overrides,
  },
});

describe("buildApprovalConsequenceContext", () => {
  test("renders the 8 categories in the approved stable order", () => {
    const output = buildApprovalConsequenceContext(buildInput({}));

    const positions = allCategories.map((cat) => output.indexOf(cat));
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  test("renders each status value from the finite vocabulary", () => {
    const statuses: ApprovalConsequenceContextInput["categories"]["delivered_value"]["status"][] =
      ["pass", "warning", "blocked", "pending", "n/a"];

    for (const status of statuses) {
      const output = buildApprovalConsequenceContext(
        buildInput({
          delivered_value: { status, evidence: `Status ${status} example.` },
        }),
      );
      expect(output).toContain(`delivered_value`);
      expect(output).toContain(status);
    }
  });

  test("includes source/evidence pointer when provided", () => {
    const output = buildApprovalConsequenceContext(
      buildInput({
        delivered_value: {
          status: "pass",
          evidence: "Unit tests pass.",
          source: "src/foo.test.ts",
        },
      }),
    );

    expect(output).toContain("src/foo.test.ts");
    expect(output).toContain("Unit tests pass.");
  });

  test("renders brief N/A rationale rows", () => {
    const output = buildApprovalConsequenceContext(
      buildInput({
        collision_release_risk: {
          status: "n/a",
          evidence: "No release scheduled; no collision risk.",
        },
      }),
    );

    expect(output).toContain("collision_release_risk");
    expect(output).toContain("n/a");
    expect(output).toContain("No release scheduled; no collision risk.");
  });

  test("rejects empty evidence instead of silently rendering n/a", () => {
    expect(() =>
      buildApprovalConsequenceContext(
        buildInput({
          delivered_value: { status: "pass", evidence: "" },
        }),
      ),
    ).toThrow(/evidence/);
  });

  test("rejects missing required evidence for non-n/a statuses", () => {
    expect(() =>
      buildApprovalConsequenceContext(
        buildInput({
          migration_data_impact: { status: "blocked", evidence: "   " },
        }),
      ),
    ).toThrow(/evidence/);
  });

  test("truncates long evidence to keep output bounded", () => {
    const longEvidence = "word ".repeat(2_000);
    const output = buildApprovalConsequenceContext(
      buildInput({
        delivered_value: { status: "pass", evidence: longEvidence },
      }),
    );

    expect(output.length).toBeLessThan(longEvidence.length);
    expect(output).toContain("...");
  });

  test("truncates the whole block when it exceeds the byte budget", () => {
    const output = buildApprovalConsequenceContext({
      ...buildInput({}),
      maxBytes: 200,
    });

    expect(output).toContain("[...truncated");
    expect(output.length).toBeLessThanOrEqual(200);
  });

  test("enforces byte budget for multibyte content", () => {
    const output = buildApprovalConsequenceContext({
      ...buildInput({
        delivered_value: {
          status: "pass",
          evidence: "✅".repeat(300),
        },
      }),
      maxBytes: 240,
    });

    expect(new TextEncoder().encode(output).length).toBeLessThanOrEqual(240);
    expect(output).toContain("[...truncated");
  });

  test("enforces byte budget even when the budget is shorter than the truncation marker", () => {
    const output = buildApprovalConsequenceContext({
      ...buildInput({}),
      maxBytes: 20,
    });

    expect(new TextEncoder().encode(output).length).toBeLessThanOrEqual(20);
  });

  test("does not include raw dump phrasing in the rendered output", () => {
    const output = buildApprovalConsequenceContext(buildInput({}));

    expect(output.toLowerCase()).not.toContain("raw log");
    expect(output.toLowerCase()).not.toContain("full scanner report");
    expect(output.toLowerCase()).not.toContain("diff:");
  });
});
