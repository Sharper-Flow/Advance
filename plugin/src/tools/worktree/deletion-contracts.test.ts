import { describe, expect, it } from "vitest";

import {
  WorktreeDeletionPlanSchema,
  WorktreeDeletionResultSchema,
  decodeWorktreeDeletionToken,
  encodeWorktreeDeletionToken,
  hashWorktreeDeletionFacts,
  validateWorktreeDeletionToken,
  type WorktreeDeletionFacts,
} from "./deletion-contracts";

const facts: WorktreeDeletionFacts = {
  repository: "/repo with spaces",
  worktree: "/tmp/worktree with spaces",
  branch: "release/v1",
  head: "0123456789abcdef0123456789abcdef01234567",
  detached: false,
  bare: false,
  locked: false,
  prunable: false,
  dirty: false,
};

describe("worktree deletion contracts", () => {
  it("round-trips a deterministic wdp1 token and canonical facts hash", () => {
    const token = encodeWorktreeDeletionToken({
      facts,
      expiresAt: 1_800_000_000_000,
    });

    expect(token).toMatch(/^wdp1\.[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
    expect(
      encodeWorktreeDeletionToken({ facts, expiresAt: 1_800_000_000_000 }),
    ).toBe(token);
    expect(hashWorktreeDeletionFacts(facts)).toBe(
      hashWorktreeDeletionFacts({ ...facts }),
    );
    expect(decodeWorktreeDeletionToken(token)).toEqual({
      version: "wdp1",
      facts,
      expiresAt: 1_800_000_000_000,
    });
  });

  it("rejects malformed, expired, and changed-fact tokens", () => {
    const token = encodeWorktreeDeletionToken({
      facts,
      expiresAt: 1_800_000_000_000,
    });

    expect(() =>
      decodeWorktreeDeletionToken("wdp1.not-json.not-a-hash"),
    ).toThrow();
    expect(
      validateWorktreeDeletionToken(token, { now: 1_800_000_000_001 }),
    ).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(
      validateWorktreeDeletionToken(token, {
        now: 1_700_000_000_000,
        facts: { ...facts, head: "fedcba9876543210fedcba9876543210fedcba98" },
      }),
    ).toEqual({ ok: false, reason: "facts_changed" });
  });

  it("structurally validates plan and result payloads", () => {
    const plan = {
      version: "wdp1" as const,
      repository: facts.repository,
      facts,
      expiresAt: 1_800_000_000_000,
      token: encodeWorktreeDeletionToken({
        facts,
        expiresAt: 1_800_000_000_000,
      }),
    };

    expect(WorktreeDeletionPlanSchema.parse(plan)).toEqual(plan);
    expect(() =>
      WorktreeDeletionPlanSchema.parse({ ...plan, expiresAt: "later" }),
    ).toThrow();
    expect(() =>
      WorktreeDeletionPlanSchema.parse({
        ...plan,
        repository: "/a-different-repository",
      }),
    ).toThrow(/repository must match/);
    expect(() =>
      WorktreeDeletionPlanSchema.parse({
        ...plan,
        expiresAt: plan.expiresAt + 1,
      }),
    ).toThrow(/token must bind/);
    expect(
      WorktreeDeletionResultSchema.parse({
        ok: false,
        status: "drifted",
        reason: "facts_changed",
      }),
    ).toMatchObject({ status: "drifted" });
  });
});
