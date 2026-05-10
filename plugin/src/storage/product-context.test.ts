import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadProjectConfig: vi.fn(),
  getProjectId: vi.fn(),
}));

vi.mock("./json", () => ({
  loadProjectConfig: mocks.loadProjectConfig,
}));

vi.mock("../utils/project-id", () => ({
  getProjectId: mocks.getProjectId,
}));

import { ProjectConfigSchema } from "../types/project";
import { ProductContextError, resolveProductContext } from "./product-context";

const ROOT = "/repo/web";
const PRIMARY = "/repo/backend";
const WEB_ID = "w".repeat(40);
const BACKEND_ID = "b".repeat(40);

describe("ProjectConfigSchema product linking", () => {
  test("parses optional product metadata and related repo product fields", () => {
    const parsed = ProjectConfigSchema.parse({
      name: "pokeedge-web",
      product: {
        id: "pokeedge",
        role: "secondary",
        repo_id: "web",
        primary_repo_id: "backend",
      },
      related_repos: [
        {
          id: "backend",
          path: PRIMARY,
          repo_project_id: BACKEND_ID,
          product_role: "primary",
        },
      ],
    });

    expect(parsed.product).toMatchObject({
      id: "pokeedge",
      role: "secondary",
      repo_id: "web",
      primary_repo_id: "backend",
      missing_primary_policy: "block",
    });
    expect(parsed.related_repos?.[0]).toMatchObject({
      repo_project_id: BACKEND_ID,
      product_role: "primary",
    });
  });
});

describe("resolveProductContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProjectId.mockImplementation(async (path: string) => {
      if (path === ROOT) return WEB_ID;
      if (path === PRIMARY) return BACKEND_ID;
      return null;
    });
  });

  test("returns single_repo context when no product config exists", async () => {
    mocks.loadProjectConfig.mockResolvedValue({ name: "solo" });

    const context = await resolveProductContext(ROOT);

    expect(context).toMatchObject({
      mode: "single_repo",
      currentRepoId: "solo",
      repoProjectId: WEB_ID,
      productProjectId: WEB_ID,
    });
  });

  test("resolves primary product context", async () => {
    mocks.loadProjectConfig.mockResolvedValue({
      name: "pokeedge",
      product: {
        id: "pokeedge",
        role: "primary",
        repo_id: "backend",
        primary_repo_id: "backend",
      },
    });

    const context = await resolveProductContext(PRIMARY);

    expect(context).toMatchObject({
      mode: "primary",
      currentRepoId: "backend",
      primaryRepoId: "backend",
      repoProjectId: BACKEND_ID,
      productProjectId: BACKEND_ID,
    });
  });

  test("resolves secondary product context through related_repos", async () => {
    mocks.loadProjectConfig.mockResolvedValue({
      name: "pokeedge-web",
      product: {
        id: "pokeedge",
        role: "secondary",
        repo_id: "web",
        primary_repo_id: "backend",
      },
      related_repos: [
        { id: "backend", path: PRIMARY, product_role: "primary" },
      ],
    });

    const context = await resolveProductContext(ROOT);

    expect(context).toMatchObject({
      mode: "secondary",
      currentRepoId: "web",
      primaryRepoId: "backend",
      repoProjectId: WEB_ID,
      productProjectId: BACKEND_ID,
      primaryRoot: PRIMARY,
    });
  });

  test("blocks by default when secondary primary cannot be resolved", async () => {
    mocks.getProjectId.mockImplementation(async (path: string) =>
      path === ROOT ? WEB_ID : null,
    );
    mocks.loadProjectConfig.mockResolvedValue({
      name: "pokeedge-web",
      product: {
        id: "pokeedge",
        role: "secondary",
        repo_id: "web",
        primary_repo_id: "backend",
      },
      related_repos: [
        { id: "backend", path: PRIMARY, product_role: "primary" },
      ],
    });

    await expect(resolveProductContext(ROOT)).rejects.toThrow(
      ProductContextError,
    );
  });

  test("isolated policy falls back to repo-local state with warning", async () => {
    mocks.getProjectId.mockImplementation(async (path: string) =>
      path === ROOT ? WEB_ID : null,
    );
    mocks.loadProjectConfig.mockResolvedValue({
      name: "pokeedge-web",
      product: {
        id: "pokeedge",
        role: "secondary",
        repo_id: "web",
        primary_repo_id: "backend",
        missing_primary_policy: "isolated",
      },
      related_repos: [
        { id: "backend", path: PRIMARY, product_role: "primary" },
      ],
    });

    const context = await resolveProductContext(ROOT);

    expect(context).toMatchObject({
      mode: "secondary",
      productProjectId: WEB_ID,
      degraded: true,
      warning: expect.stringContaining("isolated"),
    });
  });

  test("read_only policy reports degraded product state with warning", async () => {
    mocks.getProjectId.mockImplementation(async (path: string) =>
      path === ROOT ? WEB_ID : null,
    );
    mocks.loadProjectConfig.mockResolvedValue({
      name: "pokeedge-web",
      product: {
        id: "pokeedge",
        role: "secondary",
        repo_id: "web",
        primary_repo_id: "backend",
        missing_primary_policy: "read_only",
      },
      related_repos: [
        { id: "backend", path: PRIMARY, product_role: "primary" },
      ],
    });

    const context = await resolveProductContext(ROOT);

    expect(context).toMatchObject({
      mode: "secondary",
      productProjectId: WEB_ID,
      degraded: true,
      readOnly: true,
      warning: expect.stringContaining("read_only"),
    });
  });

  test("rejects duplicate related repo IDs", async () => {
    mocks.loadProjectConfig.mockResolvedValue({
      name: "pokeedge-web",
      product: {
        id: "pokeedge",
        role: "secondary",
        repo_id: "web",
        primary_repo_id: "backend",
      },
      related_repos: [
        { id: "backend", path: PRIMARY },
        { id: "backend", path: "/repo/backend-copy" },
      ],
    });

    await expect(resolveProductContext(ROOT)).rejects.toThrow(/Duplicate/);
  });

  test("rejects product primary_repo_id that is not current or related", async () => {
    mocks.loadProjectConfig.mockResolvedValue({
      name: "pokeedge-web",
      product: {
        id: "pokeedge",
        role: "secondary",
        repo_id: "web",
        primary_repo_id: "missing",
      },
      related_repos: [{ id: "backend", path: PRIMARY }],
    });

    await expect(resolveProductContext(ROOT)).rejects.toThrow(
      /primary_repo_id/,
    );
  });

  test("rejects secondary primary repo without primary product role", async () => {
    mocks.loadProjectConfig.mockResolvedValue({
      name: "pokeedge-web",
      product: {
        id: "pokeedge",
        role: "secondary",
        repo_id: "web",
        primary_repo_id: "backend",
      },
      related_repos: [
        { id: "backend", path: PRIMARY, product_role: "secondary" },
      ],
    });

    await expect(resolveProductContext(ROOT)).rejects.toThrow(/primary role/);
  });
});
