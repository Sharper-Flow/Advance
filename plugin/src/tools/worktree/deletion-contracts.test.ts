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

  it("binds the integration proof kind and evidence into the plan token", () => {
    const integration = {
      kind: "patch_equivalent" as const,
      branch: "release/v1",
      defaultBranch: "trunk",
      head: facts.head,
      evidence: "git cherry -v trunk release/v1 (all patches equivalent)",
    };
    const expiresAt = 1_800_000_000_000;
    const token = encodeWorktreeDeletionToken({
      facts,
      expiresAt,
      integration,
    });
    const plan = {
      version: "wdp1" as const,
      repository: facts.repository,
      facts,
      expiresAt,
      token,
      integration,
    };

    expect(WorktreeDeletionPlanSchema.parse(plan)).toEqual(plan);
    expect(() =>
      WorktreeDeletionPlanSchema.parse({
        ...plan,
        integration: { ...integration, kind: "merged_to_default" },
      }),
    ).toThrow(/token must bind/);
    expect(
      validateWorktreeDeletionToken(token, {
        integration: { ...integration, evidence: "changed" },
      }),
    ).toEqual({ ok: false, reason: "facts_changed" });
  });

  it("binds archive-owned recovery identity, paths, hashes, and mode", () => {
    const integration = {
      kind: "pr_merged" as const,
      branch: "change/example",
      defaultBranch: "trunk",
      head: facts.head,
      evidence: "merged PR #42",
      prNumber: 42,
      prHeadOid: "fedcba9876543210fedcba9876543210fedcba98",
      mergeCommitOid: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      headRepository: "owner/repo",
      baseRepository: "owner/repo",
    };
    const archiveRecovery = {
      changeId: "example",
      repository: facts.repository,
      branch: "change/example",
      worktree: facts.worktree,
      localHead: facts.head,
      prNumber: 42,
      prRepository: "owner/repo",
      prHeadOid: integration.prHeadOid,
      mergeCommitOid: integration.mergeCommitOid,
      defaultBranch: "trunk",
      defaultBranchSha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      ancestry: "pr_head_ancestor_of_local_head" as const,
      bundleId: "example",
      canonicalBundlePath: "/repo/.adv/archive/example",
      changedPaths: [
        { path: ".adv/archive/example/docs/specs/a.md", status: "M" as const },
      ],
      canonicalFiles: [
        {
          path: ".adv/archive/example/docs/specs/a.md",
          sha256:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
      ],
      canonicalIdentity: "bundle:example:manifest-1",
      allowedRoot: ".adv/archive/example",
      clean: true,
      locked: false,
      cwd: "/repo",
      cwdInsideWorktree: false,
      inUse: false,
      terminal: {
        changeId: "example",
        status: "archived" as const,
        evidence: "durable terminal status: archived",
      },
    };
    const expiresAt = 1_800_000_000_000;
    const token = encodeWorktreeDeletionToken({
      facts,
      expiresAt,
      integration,
      terminal: archiveRecovery.terminal,
      removalMode: "archive_owned_projection",
      archiveRecovery,
    });
    const plan = {
      version: "wdp1" as const,
      repository: facts.repository,
      facts,
      expiresAt,
      token,
      integration,
      terminal: archiveRecovery.terminal,
      removalMode: "archive_owned_projection" as const,
      archiveRecovery,
    };

    expect(WorktreeDeletionPlanSchema.parse(plan)).toEqual(plan);
    expect(() =>
      WorktreeDeletionPlanSchema.parse({
        ...plan,
        removalMode: "normal",
      }),
    ).toThrow(/token must bind/);
    const forcedToken = encodeWorktreeDeletionToken({
      facts,
      force: true,
      expiresAt,
      integration,
      terminal: archiveRecovery.terminal,
      removalMode: "archive_owned_projection",
      archiveRecovery,
    });
    expect(() =>
      WorktreeDeletionPlanSchema.parse({
        ...plan,
        force: true,
        token: forcedToken,
      }),
    ).toThrow(/never permits forced removal/);
  });
});
