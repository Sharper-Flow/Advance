/**
 * Archive Mesh Integration Tests
 *
 * Tests for getTrustedRepos, createMeshIssuesForArchive
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { getTrustedRepos, createMeshIssuesForArchive } from "./archive-mesh";
import type { Change, RelatedRepo, CrossProjectLink } from "../types";

// Mock mesh-issues module
vi.mock("../integrations/mesh-issues", () => ({
  createMeshIssue: vi.fn(),
}));

import { createMeshIssue } from "../integrations/mesh-issues";

const mockCreateMeshIssue = vi.mocked(createMeshIssue);

describe("getTrustedRepos", () => {
  test("returns empty array when no related repos", () => {
    expect(getTrustedRepos(undefined)).toEqual([]);
    expect(getTrustedRepos([])).toEqual([]);
  });

  test("filters to repos with trusted=true and gh_repo set", () => {
    const repos: RelatedRepo[] = [
      {
        id: "backend",
        path: "/backend",
        trusted: true,
        gh_repo: "org/backend",
      },
      { id: "api", path: "/api", trusted: false, gh_repo: "org/api" },
      { id: "frontend", path: "/frontend", trusted: true },
      { id: "db", path: "/db" },
    ];

    const result = getTrustedRepos(repos);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("backend");
  });
});

describe("createMeshIssuesForArchive", () => {
  beforeEach(() => {
    mockCreateMeshIssue.mockReset();
  });

  test("returns empty results when no cross_project_links", async () => {
    const change = {
      id: "ch-test",
      title: "Test",
      status: "active",
      created_at: new Date().toISOString(),
      tasks: [],
      deltas: {},
    } as Change;

    const result = await createMeshIssuesForArchive(change, [
      {
        id: "backend",
        path: "/backend",
        trusted: true,
        gh_repo: "org/backend",
      },
    ]);

    expect(result.issueUrls).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test("creates mesh issues for links targeting trusted repos", async () => {
    mockCreateMeshIssue.mockResolvedValue({
      issueNumber: 42,
      htmlUrl: "https://github.com/org/backend/issues/42",
      exitCode: 0,
      stderr: "",
    });

    const link: CrossProjectLink = {
      relationship: "contributes_to",
      target_path: "/path/to/backend",
      changeId: "ch-target",
      linked_at: new Date().toISOString(),
    };

    const change = {
      id: "ch-test",
      title: "Add mesh support",
      status: "active",
      created_at: new Date().toISOString(),
      tasks: [
        {
          id: "tk-1",
          title: "Task 1",
          status: "done",
          priority: 0,
          created_at: new Date().toISOString(),
        },
      ],
      deltas: { "advance-workflow": [] },
      cross_project_links: [link],
    } as unknown as Change;

    const trustedRepos: RelatedRepo[] = [
      {
        id: "backend",
        path: "/path/to/backend",
        trusted: true,
        gh_repo: "org/backend",
      },
    ];

    const result = await createMeshIssuesForArchive(change, trustedRepos);

    expect(result.issueUrls).toHaveLength(1);
    expect(result.issueUrls[0]).toBe(
      "https://github.com/org/backend/issues/42",
    );
    expect(mockCreateMeshIssue).toHaveBeenCalledTimes(1);
    expect(mockCreateMeshIssue.mock.calls[0][1].capability).toBe(
      "advance-workflow",
    );
  });

  test("uses deterministic fallback capability when deltas are empty", async () => {
    mockCreateMeshIssue.mockResolvedValue({
      issueNumber: 43,
      htmlUrl: "https://github.com/org/backend/issues/43",
      exitCode: 0,
      stderr: "",
    });

    const change = {
      id: "ch-no-deltas",
      title: "No deltas",
      status: "active",
      created_at: new Date().toISOString(),
      tasks: [],
      deltas: {},
      cross_project_links: [
        {
          relationship: "contributes_to",
          target_path: "/backend",
          changeId: "ch-target",
          linked_at: new Date().toISOString(),
        },
      ],
    } as unknown as Change;

    await createMeshIssuesForArchive(change, [
      {
        id: "backend",
        path: "/backend",
        trusted: true,
        gh_repo: "org/backend",
      },
    ]);

    expect(mockCreateMeshIssue.mock.calls[0][1].capability).toBe("agent-mesh");
  });

  test("skips links that don't match any trusted repo", async () => {
    const link: CrossProjectLink = {
      relationship: "contributes_to",
      target_path: "/path/to/unknown",
      changeId: "ch-skip-target",
      linked_at: new Date().toISOString(),
    };

    const change = {
      id: "ch-skip",
      title: "Skip test",
      status: "active",
      created_at: new Date().toISOString(),
      tasks: [],
      deltas: {},
      cross_project_links: [link],
    } as unknown as Change;

    const trustedRepos: RelatedRepo[] = [
      {
        id: "backend",
        path: "/backend",
        trusted: true,
        gh_repo: "org/backend",
      },
    ];

    const result = await createMeshIssuesForArchive(change, trustedRepos);

    expect(result.issueUrls).toHaveLength(0);
    expect(mockCreateMeshIssue).not.toHaveBeenCalled();
  });

  test("records error when mesh issue creation fails", async () => {
    mockCreateMeshIssue.mockResolvedValue({
      exitCode: 1,
      stderr: "error: repo not found",
    });

    const link: CrossProjectLink = {
      relationship: "contributes_to",
      target_path: "/backend",
      changeId: "ch-err-target",
      linked_at: new Date().toISOString(),
    };

    const change = {
      id: "ch-err",
      title: "Error test",
      status: "active",
      created_at: new Date().toISOString(),
      tasks: [],
      deltas: { "advance-workflow": [] },
      cross_project_links: [link],
    } as unknown as Change;

    const trustedRepos: RelatedRepo[] = [
      {
        id: "backend",
        path: "/backend",
        trusted: true,
        gh_repo: "org/backend",
      },
    ];

    const result = await createMeshIssuesForArchive(change, trustedRepos);

    expect(result.issueUrls).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("repo not found");
  });

  test("silently ignores ghNotFound", async () => {
    mockCreateMeshIssue.mockResolvedValue({
      exitCode: -1,
      stderr: "spawn gh ENOENT",
      ghNotFound: true,
    });

    const link: CrossProjectLink = {
      relationship: "contributes_to",
      target_path: "/backend",
      changeId: "ch-nogh-target",
      linked_at: new Date().toISOString(),
    };

    const change = {
      id: "ch-nogh",
      title: "No GH test",
      status: "active",
      created_at: new Date().toISOString(),
      tasks: [],
      deltas: {},
      cross_project_links: [link],
    } as unknown as Change;

    const trustedRepos: RelatedRepo[] = [
      {
        id: "backend",
        path: "/backend",
        trusted: true,
        gh_repo: "org/backend",
      },
    ];

    const result = await createMeshIssuesForArchive(change, trustedRepos);

    expect(result.issueUrls).toHaveLength(0);
    // ghNotFound should not produce an error
    expect(result.errors).toHaveLength(0);
  });

  test("records error when mesh issue creation reports a parse failure (QUAL-005/AC4)", async () => {
    // gh exits 0 but its stdout could not be parsed: this must NOT be treated
    // as a silent success-without-URL. The consumer must surface an error.
    mockCreateMeshIssue.mockResolvedValue({
      exitCode: 0,
      stderr: "",
      parseFailed: true,
    });

    const link: CrossProjectLink = {
      relationship: "contributes_to",
      target_path: "/backend",
      changeId: "ch-parsefail-target",
      linked_at: new Date().toISOString(),
    };

    const change = {
      id: "ch-parsefail",
      title: "Parse fail test",
      status: "active",
      created_at: new Date().toISOString(),
      tasks: [],
      deltas: { "advance-workflow": [] },
      cross_project_links: [link],
    } as unknown as Change;

    const trustedRepos: RelatedRepo[] = [
      {
        id: "backend",
        path: "/backend",
        trusted: true,
        gh_repo: "org/backend",
      },
    ];

    const result = await createMeshIssuesForArchive(change, trustedRepos);

    expect(result.issueUrls).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/parse/i);
  });
});
