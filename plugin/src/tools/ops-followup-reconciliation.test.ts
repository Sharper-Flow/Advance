/**
 * Host reconciliation tests for ops follow-up link resolutions.
 *
 * Covers pure derivation (AC1-AC4) and localized host-level integration
 * (C1-C5): same-project / cross-project routing, Temporal-only child reads,
 * fail-closed unreachable proofs, repeated reconciliation, and prior-resolution
 * authority invalidation.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  Change,
  OpsFollowupLink,
  OpsFollowupProfile,
  Store,
} from "../types";
import type { TargetStoreScope } from "./target-project";
import {
  isRequiredOpsFollowupLink,
  overlayOpsResolutionsForRead,
  reconcileOpsFollowupLinks,
  reconcileOpsFollowupResolution,
  resolveRequiredOpsLinks,
} from "./ops-followup-reconciliation";

const timestamp = "2026-06-20T04:00:00.000Z";
const verifiedAt = "2026-06-20T04:06:00.000Z";

function makeChildProfile(
  overrides?: Partial<OpsFollowupProfile>,
): OpsFollowupProfile {
  return {
    kind: "migration",
    source: {
      source_change_id: "parent-1",
      source_kind: "required_follow_up",
    },
    relationship: "blocks",
    status: "running",
    created_at: timestamp,
    evidence: [],
    runs: [],
    ...overrides,
  };
}

function makeLink(overrides?: Partial<OpsFollowupLink>): OpsFollowupLink {
  return {
    id: "ofl-1",
    changeId: "child-1",
    relationship: "blocks",
    status: "running",
    required_handoff: true,
    linked_at: timestamp,
    ...overrides,
  };
}

function makeParent(
  overrides?: Partial<Change> & { links?: OpsFollowupLink[] },
): Change {
  return {
    id: "parent-1",
    title: "Parent change",
    status: "active",
    created_at: timestamp,
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
      planning: { status: "done" },
      execution: { status: "done" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    },
    ops_followup_links: overrides?.links ?? [],
    ...overrides,
  } as Change;
}

function makeChild(changeId: string, profile: OpsFollowupProfile): Change {
  return {
    id: changeId,
    title: "Child change",
    status: "active",
    created_at: timestamp,
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: {
      proposal: { status: "done" },
      discovery: { status: "done" },
      design: { status: "done" },
      planning: { status: "done" },
      execution: { status: "done" },
      acceptance: { status: "pending" },
      release: { status: "pending" },
    },
    ops_followup: profile,
  } as Change;
}

function makeStore(input: {
  parent: Change;
  children?: Record<string, Change>;
}): Store {
  const changesDir = "/tmp/project/.adv/changes";
  mkdirSync(join(changesDir, input.parent.id), { recursive: true });
  writeFileSync(
    join(changesDir, input.parent.id, "change.json"),
    JSON.stringify(input.parent),
  );
  return {
    paths: { root: "/tmp/project", changes: changesDir },
    productContext: { productProjectId: "project-id" },
    changes: {
      get: vi.fn(async (changeId: string) => {
        if (changeId === input.parent.id) {
          return { success: true, data: input.parent };
        }
        return { success: true, data: input.children?.[changeId] ?? null };
      }),
      refresh: vi.fn(async () => {}),
    },
  } as unknown as Store;
}

function makeDeps(overrides?: Record<string, unknown>) {
  return {
    withTargetPathStore: vi.fn(async () => {
      throw new Error("withTargetPathStore not configured");
    }),
    getProjectId: vi.fn(async () => "project-id"),
    fireSignalAndRefresh: vi.fn(async () => {}),
    now: () => verifiedAt,
    ...overrides,
  };
}

function completeProfile(): OpsFollowupProfile {
  return makeChildProfile({
    status: "complete",
    updated_at: "2026-06-20T04:05:00.000Z",
    completion_signal: "deploy finished",
    runs: [
      {
        id: "run-1",
        title: "Deploy run",
        status: "complete",
        created_at: timestamp,
        updated_at: "2026-06-20T04:04:00.000Z",
        plan: {
          env: "prod",
          action: "deploy",
          bounds: ["low-risk"],
          evidence_policy: "manual",
          rollback_or_cleanup_plan: "rollback to previous version",
        },
        steps: [],
        evidence: [
          {
            id: "ore-1",
            recorded_at: "2026-06-20T04:04:00.000Z",
            step_kind: "execute",
            env: "prod",
            run_id: "run-1",
            status: "complete",
            summary: "Deployment completed",
            artifact: { kind: "pointer", uri: "s3://ops-bucket/deploy.log" },
            next_status: "complete",
            completion_signal: "deploy finished",
            health_verification: "smoke passed",
            rollback_or_cleanup_disposition: "no rollback needed",
          },
        ],
      },
    ],
  });
}

function incompleteProfile(
  status: Exclude<OpsFollowupProfile["status"], "complete">,
): OpsFollowupProfile {
  return makeChildProfile({
    status,
    updated_at: "2026-06-20T04:05:00.000Z",
    evidence: [
      {
        id: "oee-2",
        recorded_at: "2026-06-20T04:04:00.000Z",
        env: "prod",
        action: "deploy",
        status: "started",
        summary: "Deployment in progress",
        artifact: { kind: "pointer", uri: "s3://ops-bucket/deploy.log" },
      },
    ],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deriveOpsFollowupResolution", () => {
  test("complete child proof produces child_profile complete resolution (AC1)", () => {
    const childProfile = completeProfile();
    const link = makeLink();

    const resolution = reconcileOpsFollowupResolution({
      link,
      childProfile,
      now: verifiedAt,
    });

    expect(resolution).toMatchObject({
      source: "child_profile",
      status: "complete",
      resolution_reason: "verified",
      child_updated_at: childProfile.updated_at,
      verified_at: verifiedAt,
      completion_signal: "deploy finished",
      health_verification: "smoke passed",
      rollback_or_cleanup_disposition: "no rollback needed",
      evidence_summary: "Deployment completed",
    });
  });

  test("incomplete child status produces child_profile incomplete resolution (AC2)", () => {
    const childProfile = incompleteProfile("running");
    const link = makeLink();

    const resolution = reconcileOpsFollowupResolution({
      link,
      childProfile,
      now: verifiedAt,
    });

    expect(resolution).toMatchObject({
      source: "child_profile",
      status: "running",
      resolution_reason: "verified",
    });
    expect(resolution?.completion_signal).toBeUndefined();
    expect(resolution?.health_verification).toBeUndefined();
    expect(resolution?.rollback_or_cleanup_disposition).toBeUndefined();
  });

  test("complete status with missing proof fields omits only those fields (AC3)", () => {
    const childProfile = makeChildProfile({
      status: "complete",
      updated_at: "2026-06-20T04:05:00.000Z",
      completion_signal: "deploy finished",
      evidence: [],
    });
    const link = makeLink();

    const resolution = reconcileOpsFollowupResolution({
      link,
      childProfile,
      now: verifiedAt,
    });

    expect(resolution?.status).toBe("complete");
    expect(resolution?.completion_signal).toBe("deploy finished");
    expect(resolution?.health_verification).toBeUndefined();
    expect(resolution?.rollback_or_cleanup_disposition).toBeUndefined();
  });

  test("returns null for non-required links", () => {
    const link = makeLink({
      relationship: "follows_release",
      required_handoff: false,
    });
    const resolution = reconcileOpsFollowupResolution({
      link,
      childProfile: completeProfile(),
      now: verifiedAt,
    });
    expect(resolution).toBeNull();
  });
});

describe("isRequiredOpsFollowupLink", () => {
  test.each([
    { relationship: "blocks", required_handoff: false, expected: true },
    { relationship: "follows_release", required_handoff: true, expected: true },
    { relationship: "monitors", required_handoff: true, expected: true },
    { relationship: "cleanup_after", required_handoff: true, expected: true },
    {
      relationship: "follows_release",
      required_handoff: false,
      expected: false,
    },
    { relationship: "monitors", required_handoff: false, expected: false },
    { relationship: "cleanup_after", required_handoff: false, expected: false },
  ] as const)(
    "relationship=$relationship, required_handoff=$required_handoff => $expected",
    ({ relationship, required_handoff, expected }) => {
      const link = makeLink({ relationship, required_handoff });
      expect(isRequiredOpsFollowupLink(link)).toBe(expected);
    },
  );
});

describe("reconcileOpsFollowupLinks", () => {
  test("reconciles a frozen required parent link from a complete child profile and persists (C1)", async () => {
    const childProfile = completeProfile();
    const parent = makeParent({
      links: [makeLink({ relationship: "blocks", required_handoff: false })],
    });
    const store = makeStore({
      parent,
      children: { "child-1": makeChild("child-1", childProfile) },
    });
    const deps = makeDeps();

    const result = await reconcileOpsFollowupLinks({ parent, store, deps });

    expect(result.reconciled).toHaveLength(1);
    expect(result.reconciled[0]).toMatchObject({
      linkId: "ofl-1",
      resolution: {
        source: "child_profile",
        status: "complete",
      },
    });
    expect(result.skipped).toEqual([]);
    expect(store.changes.get).toHaveBeenLastCalledWith("parent-1");
  });

  test("reconciles a required handoff follows_release link (C2)", async () => {
    const childProfile = completeProfile();
    const parent = makeParent({
      links: [
        makeLink({
          relationship: "follows_release",
          required_handoff: true,
        }),
      ],
    });
    const store = makeStore({
      parent,
      children: { "child-1": makeChild("child-1", childProfile) },
    });
    const deps = makeDeps();

    const result = await reconcileOpsFollowupLinks({ parent, store, deps });

    expect(result.reconciled[0]?.resolution.source).toBe("child_profile");
  });

  test("skips non-required handoff links (C3)", async () => {
    const parent = makeParent({
      links: [
        makeLink({
          relationship: "follows_release",
          required_handoff: false,
        }),
      ],
    });
    const store = makeStore({ parent });
    const deps = makeDeps();

    const result = await reconcileOpsFollowupLinks({ parent, store, deps });

    expect(result.skipped).toEqual(["ofl-1"]);
    expect(result.reconciled).toEqual([]);
    expect(deps.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("persists unreachable child_missing resolution when child is missing (C4)", async () => {
    const parent = makeParent({
      links: [makeLink({ relationship: "blocks", required_handoff: false })],
    });
    const store = makeStore({ parent });
    const deps = makeDeps();

    const result = await reconcileOpsFollowupLinks({ parent, store, deps });

    expect(result.reconciled[0]?.resolution.source).toBe("unreachable");
    expect(result.reconciled[0]?.resolution.resolution_reason).toBe(
      "child_missing",
    );
  });

  test("persists unreachable profile_missing resolution when child has no profile (C4)", async () => {
    const parent = makeParent({
      links: [makeLink({ relationship: "blocks", required_handoff: false })],
    });
    const store = makeStore({ parent });
    const child = store.changes.get as ReturnType<typeof vi.fn>;
    child.mockResolvedValueOnce({
      success: true,
      data: {
        id: "child-1",
        title: "Child change",
        status: "active",
        created_at: timestamp,
      } as Change,
    });
    const deps = makeDeps();

    const result = await reconcileOpsFollowupLinks({ parent, store, deps });

    expect(result.reconciled[0]?.resolution.resolution_reason).toBe(
      "profile_missing",
    );
  });

  test("persists target_identity_mismatch for same-project link with wrong project id (C4)", async () => {
    const parent = makeParent({
      links: [
        makeLink({
          relationship: "blocks",
          required_handoff: false,
          target_project_id: "e".repeat(40),
        }),
      ],
    });
    const store = makeStore({ parent });
    const deps = makeDeps({
      getProjectId: vi.fn(async () => "actual-project-id"),
    });

    const result = await reconcileOpsFollowupLinks({ parent, store, deps });

    expect(result.reconciled[0]?.resolution.resolution_reason).toBe(
      "target_identity_mismatch",
    );
  });

  test("reconciles cross-project link through target_path store (C5)", async () => {
    const childProfile = completeProfile();
    const targetStore = makeStore({
      parent: makeParent(),
      children: {
        "child-target": makeChild("child-target", childProfile),
      },
    });
    const parent = makeParent({
      links: [
        makeLink({
          id: "ofl-target",
          changeId: "child-target",
          relationship: "blocks",
          required_handoff: false,
          target_path: "/tmp/target-project",
          target_project_id: "a".repeat(40),
        }),
      ],
    });
    const store = makeStore({ parent });
    const withTargetPathStore = vi.fn(async (_input, fn) => {
      return await fn({
        context: { projectId: "a".repeat(40) },
        store: targetStore,
      } as unknown as TargetStoreScope);
    });
    const deps = makeDeps({ withTargetPathStore });

    const result = await reconcileOpsFollowupLinks({ parent, store, deps });

    expect(result.reconciled[0]?.resolution.source).toBe("child_profile");
    expect(result.reconciled[0]?.resolution.status).toBe("complete");
    expect(targetStore.changes.get).toHaveBeenCalledWith("child-target");
  });

  test("persists target_identity_mismatch for cross-project link with wrong project id (C5)", async () => {
    const targetStore = makeStore({ parent: makeParent() });
    const parent = makeParent({
      links: [
        makeLink({
          id: "ofl-target",
          changeId: "child-target",
          relationship: "blocks",
          required_handoff: false,
          target_path: "/tmp/target-project",
          target_project_id: "e".repeat(40),
        }),
      ],
    });
    const store = makeStore({ parent });
    const withTargetPathStore = vi.fn(async (_input, fn) => {
      return await fn({
        context: { projectId: "b".repeat(40) },
        store: targetStore,
      } as unknown as TargetStoreScope);
    });
    const deps = makeDeps({ withTargetPathStore });

    const result = await reconcileOpsFollowupLinks({ parent, store, deps });

    expect(result.reconciled[0]?.resolution.resolution_reason).toBe(
      "target_identity_mismatch",
    );
  });

  test("repeated reconciliation updates resolution when child state changes (C1)", async () => {
    const complete = completeProfile();
    const running = incompleteProfile("running");

    const parentFirst = makeParent({
      links: [makeLink({ relationship: "blocks", required_handoff: false })],
    });
    const storeFirst = makeStore({
      parent: parentFirst,
      children: { "child-1": makeChild("child-1", complete) },
    });
    const depsFirst = makeDeps();

    const first = await reconcileOpsFollowupLinks({
      parent: parentFirst,
      store: storeFirst,
      deps: depsFirst,
    });
    expect(first.reconciled[0]?.resolution.status).toBe("complete");

    const parentSecond = makeParent({
      links: [
        makeLink({
          relationship: "blocks",
          required_handoff: false,
          resolution: first.reconciled[0]?.resolution,
        }),
      ],
    });
    const storeSecond = makeStore({
      parent: parentSecond,
      children: { "child-1": makeChild("child-1", running) },
    });
    const depsSecond = makeDeps();

    const second = await reconcileOpsFollowupLinks({
      parent: parentSecond,
      store: storeSecond,
      deps: depsSecond,
    });
    expect(second.reconciled[0]?.resolution.status).toBe("running");
  });

  test("prior complete resolution has no authority when current child is incomplete (C2)", async () => {
    const staleResolution = reconcileOpsFollowupResolution({
      link: makeLink(),
      childProfile: completeProfile(),
      now: verifiedAt,
    });
    expect(staleResolution).not.toBeNull();

    const parent = makeParent({
      links: [
        makeLink({
          relationship: "blocks",
          required_handoff: false,
          resolution: staleResolution ?? undefined,
        }),
      ],
    });
    const store = makeStore({
      parent,
      children: {
        "child-1": makeChild("child-1", incompleteProfile("failed")),
      },
    });
    const deps = makeDeps();

    const result = await reconcileOpsFollowupLinks({ parent, store, deps });

    expect(result.reconciled[0]?.resolution.status).toBe("failed");
    expect(result.reconciled[0]?.resolution.source).toBe("child_profile");
  });

  test("does not signal when resolution is unchanged", async () => {
    const childProfile = completeProfile();
    const existingResolution = reconcileOpsFollowupResolution({
      link: makeLink(),
      childProfile,
      now: verifiedAt,
    });
    const parent = makeParent({
      links: [
        makeLink({
          relationship: "blocks",
          required_handoff: false,
          resolution: existingResolution ?? undefined,
        }),
      ],
    });
    const store = makeStore({
      parent,
      children: { "child-1": makeChild("child-1", childProfile) },
    });
    const deps = makeDeps();

    const result = await reconcileOpsFollowupLinks({ parent, store, deps });

    expect(result.reconciled[0]?.resolution.status).toBe("complete");
    expect(deps.fireSignalAndRefresh).not.toHaveBeenCalled();
  });

  test("re-reads parent after persisting", async () => {
    const parent = makeParent({
      links: [makeLink({ relationship: "blocks", required_handoff: false })],
    });
    const refreshedParent = makeParent({ id: "parent-1" });
    const store = makeStore({ parent });
    const getMock = store.changes.get as ReturnType<typeof vi.fn>;
    getMock.mockImplementation(async (changeId: string) => {
      if (changeId === "parent-1")
        return { success: true, data: refreshedParent };
      return { success: true, data: null };
    });
    const deps = makeDeps();

    const result = await reconcileOpsFollowupLinks({ parent, store, deps });

    expect(result.parent).toBe(refreshedParent);
    expect(store.changes.get).toHaveBeenLastCalledWith("parent-1");
  });
});

describe("resolveRequiredOpsLinks", () => {
  test("derives complete resolution from fresh child profile (AC1)", async () => {
    const childProfile = completeProfile();
    const parent = makeParent({
      links: [makeLink({ relationship: "blocks", required_handoff: false })],
    });
    const store = makeStore({
      parent,
      children: { "child-1": makeChild("child-1", childProfile) },
    });
    const deps = makeDeps();

    const result = await resolveRequiredOpsLinks({ parent, store, deps });

    expect(result.skipped).toEqual([]);
    expect(result.resolutionByLinkId.size).toBe(1);
    expect(result.resolutionByLinkId.get("ofl-1")).toMatchObject({
      source: "child_profile",
      status: "complete",
      resolution_reason: "verified",
      completion_signal: "deploy finished",
      health_verification: "smoke passed",
      rollback_or_cleanup_disposition: "no rollback needed",
    });
  });

  test("returns fail-closed unreachable resolution when child is missing (AC2)", async () => {
    const parent = makeParent({
      links: [makeLink({ relationship: "blocks", required_handoff: false })],
    });
    const store = makeStore({ parent });
    const deps = makeDeps();

    const result = await resolveRequiredOpsLinks({ parent, store, deps });

    expect(result.resolutionByLinkId.get("ofl-1")).toMatchObject({
      source: "unreachable",
      resolution_reason: "child_missing",
      status: "running",
    });
  });

  test("returns stale-complete/current-unreachable as not_started unverified (AC2)", async () => {
    const parent = makeParent({
      links: [
        makeLink({
          relationship: "blocks",
          required_handoff: false,
          status: "complete",
        }),
      ],
    });
    const store = makeStore({ parent });
    const deps = makeDeps();

    const result = await resolveRequiredOpsLinks({ parent, store, deps });

    expect(result.resolutionByLinkId.get("ofl-1")).toMatchObject({
      source: "unreachable",
      resolution_reason: "child_missing",
      status: "not_started",
    });
  });

  test("fails closed when a same-project target identity cannot be resolved", async () => {
    const parent = makeParent({
      links: [
        makeLink({
          relationship: "blocks",
          required_handoff: false,
          target_project_id: "expected-project-id",
        }),
      ],
    });
    const store = makeStore({
      parent,
      children: { "child-1": makeChild("child-1", completeProfile()) },
    });
    const deps = makeDeps({ getProjectId: vi.fn(async () => undefined) });

    const result = await resolveRequiredOpsLinks({ parent, store, deps });

    expect(result.resolutionByLinkId.get("ofl-1")).toMatchObject({
      source: "unreachable",
      resolution_reason: "target_identity_mismatch",
    });
    expect(store.changes.get).not.toHaveBeenCalledWith("child-1");
  });

  test("derives cross-project resolution through target_path store (AC4)", async () => {
    const childProfile = completeProfile();
    const targetStore = makeStore({
      parent: makeParent(),
      children: {
        "child-target": makeChild("child-target", childProfile),
      },
    });
    const parent = makeParent({
      links: [
        makeLink({
          id: "ofl-target",
          changeId: "child-target",
          relationship: "blocks",
          required_handoff: false,
          target_path: "/tmp/target-project",
          target_project_id: "target-project-id",
        }),
      ],
    });
    const store = makeStore({ parent });
    const withTargetPathStore = vi.fn(async (_input, fn) => {
      return await fn({
        context: { projectId: "target-project-id" },
        store: targetStore,
      } as unknown as TargetStoreScope);
    });
    const deps = makeDeps({ withTargetPathStore });

    const result = await resolveRequiredOpsLinks({ parent, store, deps });

    expect(result.resolutionByLinkId.get("ofl-target")).toMatchObject({
      source: "child_profile",
      status: "complete",
    });
  });

  test("sends zero signals and saves zero state (AC3)", async () => {
    const childProfile = completeProfile();
    const parent = makeParent({
      links: [makeLink({ relationship: "blocks", required_handoff: false })],
    });
    const store = makeStore({
      parent,
      children: { "child-1": makeChild("child-1", childProfile) },
    });
    const deps = makeDeps();

    await resolveRequiredOpsLinks({ parent, store, deps });

    expect(deps.fireSignalAndRefresh).not.toHaveBeenCalled();
    // No Temporal signal, no parent mutation, and no disk write happened.
    expect(parent.ops_followup_links![0].resolution).toBeUndefined();
  });
});

describe("overlayOpsResolutionsForRead", () => {
  test("returns non-aliasing parent and links with applied resolutions (C2)", () => {
    const staleResolution = reconcileOpsFollowupResolution({
      link: makeLink(),
      childProfile: completeProfile(),
      now: verifiedAt,
    })!;
    const parent = makeParent({
      links: [
        makeLink({
          relationship: "blocks",
          required_handoff: false,
          resolution: staleResolution,
        }),
      ],
    });
    const originalLink = parent.ops_followup_links![0];
    const freshResolution = reconcileOpsFollowupResolution({
      link: makeLink(),
      childProfile: incompleteProfile("running"),
      now: verifiedAt,
    })!;
    const resolutionByLinkId = new Map([["ofl-1", freshResolution]]);

    const overlaid = overlayOpsResolutionsForRead(parent, resolutionByLinkId);

    expect(overlaid).not.toBe(parent);
    expect(overlaid.ops_followup_links).not.toBe(parent.ops_followup_links);
    expect(overlaid.ops_followup_links![0]).not.toBe(originalLink);
    expect(overlaid.ops_followup_links![0].resolution).toEqual(freshResolution);
    expect(overlaid.ops_followup_links![0].resolution).not.toBe(
      staleResolution,
    );
    expect(originalLink.resolution).toEqual(staleResolution);
    expect(parent.ops_followup_links![0]).toBe(originalLink);
  });

  test("overlayOpsResolutionsForRead clones replacement resolutions and does not alias the source Map", () => {
    const mapResolution = reconcileOpsFollowupResolution({
      link: makeLink(),
      childProfile: completeProfile(),
      now: verifiedAt,
    })!;
    const parent = makeParent({
      links: [
        makeLink({
          relationship: "blocks",
          required_handoff: false,
        }),
      ],
    });
    const resolutionByLinkId = new Map([["ofl-1", mapResolution]]);

    const overlaid = overlayOpsResolutionsForRead(parent, resolutionByLinkId);

    expect(overlaid).not.toBe(parent);
    expect(overlaid.ops_followup_links![0].resolution).toEqual(mapResolution);
    expect(overlaid.ops_followup_links![0].resolution).not.toBe(mapResolution);

    const originalMapStatus = mapResolution.status;
    (overlaid.ops_followup_links![0].resolution as { status: string }).status =
      "not_started";
    expect(mapResolution.status).toBe(originalMapStatus);

    expect(parent.ops_followup_links![0].resolution).toBeUndefined();
  });

  test("leaves non-targeted links unchanged", () => {
    const parent = makeParent({
      links: [
        makeLink({ id: "ofl-1" }),
        makeLink({
          id: "ofl-2",
          relationship: "follows_release",
          required_handoff: false,
        }),
      ],
    });
    const resolutionByLinkId = new Map<
      string,
      ReturnType<typeof reconcileOpsFollowupResolution>
    >();
    resolutionByLinkId.set(
      "ofl-1",
      reconcileOpsFollowupResolution({
        link: makeLink({ id: "ofl-1" }),
        childProfile: completeProfile(),
        now: verifiedAt,
      })!,
    );

    const overlaid = overlayOpsResolutionsForRead(parent, resolutionByLinkId);

    expect(overlaid.ops_followup_links![0].resolution).toBeDefined();
    expect(overlaid.ops_followup_links![1].resolution).toBeUndefined();
  });
});

// cross-mode parity smoke: reconcile and dry-run overlay produce the same resolution shape for the same inputs.
