/**
 * Mesh Scan Tool Tests
 *
 * Tests for performMeshScan, getMeshInboxCount, and TTL cache behavior.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
// All functions under test are imported dynamically inside each test
// to allow per-test mock configuration.
import type { Store } from "../storage/store-types";

// Mock dependencies
vi.mock("../integrations/mesh-issues", () => ({
  listMeshIssues: vi.fn(),
  parseMeshFrontmatter: vi.fn(),
}));

vi.mock("../archive/archive-mesh", () => ({
  getTrustedRepos: vi.fn(),
}));

import { listMeshIssues } from "../integrations/mesh-issues";
import { parseMeshFrontmatter } from "../integrations/mesh-issues";
import { getTrustedRepos } from "../archive/archive-mesh";

const mockListMeshIssues = vi.mocked(listMeshIssues);
const mockParseFrontmatter = vi.mocked(parseMeshFrontmatter);
const mockGetTrustedRepos = vi.mocked(getTrustedRepos);

// Need to invalidate cache between tests
// We'll import the module fresh for each test
describe("Mesh Scan", () => {
  beforeEach(() => {
    vi.resetModules();
    mockListMeshIssues.mockReset();
    mockParseFrontmatter.mockReset();
    mockGetTrustedRepos.mockReset();
    mockParseFrontmatter.mockImplementation((body: string) => {
      const match = body.match(/adv_change_id: (\S+)/);
      return match ? { adv_change_id: match[1] } : {};
    });
  });

  test("returns empty items when no trusted repos", async () => {
    mockGetTrustedRepos.mockReturnValue([]);

    const { performMeshScan: scan } = await import("./mesh-scan");
    const store = { config: {} } as unknown as Store;
    const result = await scan(store);

    expect(result.items).toEqual([]);
    expect(result.reposScanned).toBe(0);
  });

  test("scans trusted repos and returns mesh items", async () => {
    mockGetTrustedRepos.mockReturnValue([
      {
        id: "backend",
        path: "/backend",
        trusted: true,
        gh_repo: "org/backend",
      },
    ]);
    mockListMeshIssues.mockResolvedValue({
      issues: [
        {
          number: 1,
          title: "Mesh issue 1",
          body: "---\nadv_change_id: ch-123\n---\nContent",
          labels: [{ name: "adv-mesh" }],
          html_url: "https://github.com/org/backend/issues/1",
        },
      ],
      exitCode: 0,
      stderr: "",
    });

    const { performMeshScan: scan } = await import("./mesh-scan");
    const store = { config: {} } as unknown as Store;
    const result = await scan(store);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].repo).toBe("org/backend");
    expect(result.items[0].issueNumber).toBe(1);
    expect(result.items[0].frontmatter.adv_change_id).toBe("ch-123");
    expect(result.fromCache).toBe(false);
  });

  test("returns cached results on second call", async () => {
    mockGetTrustedRepos.mockReturnValue([
      {
        id: "backend",
        path: "/backend",
        trusted: true,
        gh_repo: "org/backend",
      },
    ]);
    mockListMeshIssues.mockResolvedValue({
      issues: [],
      exitCode: 0,
      stderr: "",
    });

    const { performMeshScan: scan } = await import("./mesh-scan");
    const store = { config: {} } as unknown as Store;

    // First call
    await scan(store);
    // Second call should return cached
    const result = await scan(store);

    expect(result.fromCache).toBe(true);
    expect(mockListMeshIssues).toHaveBeenCalledTimes(1); // Only called once
  });

  test("forceRefresh bypasses cache", async () => {
    mockGetTrustedRepos.mockReturnValue([
      {
        id: "backend",
        path: "/backend",
        trusted: true,
        gh_repo: "org/backend",
      },
    ]);
    mockListMeshIssues.mockResolvedValue({
      issues: [],
      exitCode: 0,
      stderr: "",
    });

    const { performMeshScan: scan } = await import("./mesh-scan");
    const store = { config: {} } as unknown as Store;

    // First call
    await scan(store);
    // Force refresh
    const result = await scan(store, true);

    expect(result.fromCache).toBe(false);
    expect(mockListMeshIssues).toHaveBeenCalledTimes(2); // Called twice
  });

  test("records errors from failed scans", async () => {
    mockGetTrustedRepos.mockReturnValue([
      {
        id: "backend",
        path: "/backend",
        trusted: true,
        gh_repo: "org/backend",
      },
    ]);
    mockListMeshIssues.mockResolvedValue({
      issues: [],
      exitCode: 1,
      stderr: "error: rate limited",
    });

    const { performMeshScan: scan } = await import("./mesh-scan");
    const store = { config: {} } as unknown as Store;
    const result = await scan(store);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("rate limited");
  });

  test("getMeshInboxCount returns 0 when no cache", async () => {
    const { getMeshInboxCount: count } = await import("./mesh-scan");
    expect(count()).toBe(0);
  });
});
