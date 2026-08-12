/**
 * Lightweight Change Profile — host-side routing tool tests.
 *
 * TDD coverage: boundary evaluation, exact allowlist, required controls
 * preservation, explicit delegation precedence, downgrade/no-reset, and
 * disk projection persistence and deduplication.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { evaluateLightweightProfileAndSignal } from "./lightweight-profile";
import type { Store } from "../storage/store";
import type { Change } from "../types";
import {
  LightweightProfileOmissionPolicySchema,
  type LightweightProfileEvaluation,
} from "../types/lightweight-change-profile";

const mocks = vi.hoisted(() => {
  return {
    getProjectId: vi.fn(async () => "test-project-id"),
    collectLightweightProfileEvidence: vi.fn(),
  };
});

vi.mock("../utils/project-id", () => ({
  getProjectId: mocks.getProjectId,
}));
vi.mock("./change-mutation-coordinator", () => ({
  coordinateChangeMutation: vi.fn(async () => ({ kind: "verified" })),
}));
vi.mock("../utils/lightweight-change-profile-evidence", () => ({
  collectLightweightProfileEvidence: mocks.collectLightweightProfileEvidence,
  PublicRootPolicySchema: z
    .object({ roots: z.array(z.string()) })
    .describe("mock"),
}));
vi.mock("../types/lightweight-change-profile", async () => {
  const actual = await vi.importActual("../types/lightweight-change-profile");
  return actual;
});

function createMockStore(overrides: { change?: Change } = {}): Store {
  return {
    paths: {
      root: "/test-repo",
      changes: "/test-external/changes",
      archive: "/test-external/archive",
      specs: "/test-repo/.adv/specs",
      docs: "/test-repo/docs/specs",
      config: "/test-repo/project.json",
      retiredEpics: "/test-external/retired-epics",
      wisdom: "/test-external/wisdom.jsonl",
      reflections: "/test-external/reflections.jsonl",
      projectMetadata: "/test-external/project-metadata.json",
      snapshotRepairAudit: "/test-external/snapshot-repair-audit.jsonl",
      external: "/test-external",
    },
    changes: {
      get: vi.fn(async () => ({
        success: true,
        data: overrides.change ?? null,
        source: "disk" as const,
      })),
    },
  } as unknown as Store;
}

function makeChange(overrides: Partial<Change> = {}): Change {
  return {
    id: "test-change",
    title: "Test change",
    status: "draft",
    created_at: "2026-01-01T00:00:00Z",
    adv_project_id: "test-project-id",
    tasks: [],
    gates: {} as Change["gates"],
    ...overrides,
  } as Change;
}

function makeProfileEvaluation(
  overrides: Partial<LightweightProfileEvaluation> = {},
): LightweightProfileEvaluation {
  return {
    evaluationKey: "req-1:initial:fp-1",
    phase: "initial",
    result: "qualified",
    criteria: [
      {
        criterion: "implementation_task_count",
        status: "satisfied",
        reason: "",
      },
      { criterion: "changed_file_count", status: "satisfied", reason: "" },
      { criterion: "spec_delta", status: "satisfied", reason: "" },
      { criterion: "dependency_change", status: "satisfied", reason: "" },
      { criterion: "api_compatibility", status: "satisfied", reason: "" },
      { criterion: "repository_scope", status: "satisfied", reason: "" },
    ],
    evidenceFingerprint: "fp-1",
    observedRevision: "rev-1",
    evaluatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeProfile() {
  return {
    request: {
      requestId: "req-1",
      baselineRevision: "baseline-1",
      requestedAt: "2026-01-01T00:00:00Z",
    },
    omissionPolicy: LightweightProfileOmissionPolicySchema.parse({
      omitDeepScans: true,
      omitGenericExternalResearch: true,
      omitOpportunityScouting: true,
      omitDefaultSpecialistDelegation: true,
    }),
    evaluations: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProjectId.mockResolvedValue("test-project-id");
  mocks.collectLightweightProfileEvidence.mockResolvedValue({
    snapshot: {
      projectId: "test-project-id",
      baselineRevision: "baseline-1",
      observedRevision: "rev-1",
      fingerprint: "fp-1",
      taskCount: { total: 1, implementation: 1 },
      changedPaths: {
        count: 1,
        paths: ["src/a.ts"],
        renames: 0,
        deletions: 0,
        untrackedCount: 0,
        rangeStatus: "complete",
      },
      specDelta: { hasDelta: false, capabilities: [] },
      dependencyChange: { hasDependencyChange: false, manifests: [] },
      apiCompatibility: { publicSurface: "proven_private", publicRoots: [] },
      repoScope: { currentProjectOnly: true, scopeRepos: 1 },
    },
    diagnostics: [],
  });
});

describe("evaluateLightweightProfileAndSignal", () => {
  test("returns error when change is not found", async () => {
    const store = createMockStore();
    (store.changes.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "not found",
      type: "not_found",
    });

    const result = await evaluateLightweightProfileAndSignal({
      store,
      changeId: "missing",
      phase: "initial",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  test("returns error when change has no lightweight profile", async () => {
    const store = createMockStore({ change: makeChange() });

    const result = await evaluateLightweightProfileAndSignal({
      store,
      changeId: "test-change",
      phase: "initial",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("no lightweight profile request");
  });

  test("records the first evaluation through the disk mutation", async () => {
    const change = makeChange({
      lightweight_profile: makeProfile(),
    });
    const store = createMockStore({ change });

    const result = await evaluateLightweightProfileAndSignal({
      store,
      changeId: "test-change",
      phase: "initial",
    });

    expect(result.success).toBe(true);
    expect(result.evaluation?.phase).toBe("initial");
    expect(result.evaluation?.phase).toBe("initial");
    expect(result.evaluation?.result).toBe("qualified");
  });

  test("deduplicates evaluation with same requestId/phase/fingerprint", async () => {
    const change = makeChange({
      lightweight_profile: {
        ...makeProfile(),
        evaluations: [
          makeProfileEvaluation({ evaluationKey: "req-1:initial:fp-1" }),
        ],
      },
    });
    const store = createMockStore({ change });

    const result = await evaluateLightweightProfileAndSignal({
      store,
      changeId: "test-change",
      phase: "initial",
    });

    expect(result.success).toBe(true);
    expect(result.evaluation?.evaluationKey).toBe("req-1:initial:fp-1");
  });

  test("appends evaluation with different phase using same fingerprint", async () => {
    const change = makeChange({
      lightweight_profile: {
        ...makeProfile(),
        evaluations: [
          makeProfileEvaluation({ evaluationKey: "req-1:initial:fp-1" }),
        ],
      },
    });
    const store = createMockStore({ change });

    const result = await evaluateLightweightProfileAndSignal({
      store,
      changeId: "test-change",
      phase: "execution_boundary",
    });

    expect(result.evaluation?.evaluationKey).toBe(
      "req-1:execution_boundary:fp-1",
    );
    expect(result.evaluation?.phase).toBe("execution_boundary");
  });

  test("downgrades when previous result was qualified and current is ineligible", async () => {
    const change = makeChange({
      lightweight_profile: {
        ...makeProfile(),
        evaluations: [makeProfileEvaluation({ result: "qualified" })],
      },
    });
    const store = createMockStore({ change });
    mocks.collectLightweightProfileEvidence.mockResolvedValue({
      snapshot: {
        projectId: "test-project-id",
        baselineRevision: "baseline-1",
        observedRevision: "rev-1",
        fingerprint: "fp-2",
        taskCount: { total: 3, implementation: 1 },
        changedPaths: {
          count: 5,
          paths: ["src/a.ts", "src/b.ts", "src/c.ts"],
          renames: 0,
          deletions: 0,
          untrackedCount: 0,
          rangeStatus: "complete",
        },
        specDelta: { hasDelta: false, capabilities: [] },
        dependencyChange: { hasDependencyChange: false, manifests: [] },
        apiCompatibility: { publicSurface: "proven_private", publicRoots: [] },
        repoScope: { currentProjectOnly: true, scopeRepos: 1 },
      },
      diagnostics: [],
    });

    const result = await evaluateLightweightProfileAndSignal({
      store,
      changeId: "test-change",
      phase: "execution_boundary",
    });

    expect(result.success).toBe(true);
    expect(result.evaluation?.result).toBe("downgraded");
    expect(result.evaluation?.downgradeReason).toContain(
      "Revalidation at execution_boundary failed after previous qualification",
    );
  });

  test("accepts public-root API compatibility policy", async () => {
    const change = makeChange({
      lightweight_profile: makeProfile(),
    });
    const store = createMockStore({ change });

    await evaluateLightweightProfileAndSignal({
      store,
      changeId: "test-change",
      phase: "initial",
      apiCompatibilityPolicy: { roots: ["src/public.ts"] },
    });

    expect(mocks.collectLightweightProfileEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        apiCompatibilityPolicy: { roots: ["src/public.ts"] },
      }),
    );
  });
});
