/**
 * Mesh Issues Integration Tests
 *
 * Tests for buildMeshPayload, createMeshIssue, listMeshIssues, getGhIssue.
 * Uses mocked execGh to avoid real GH CLI calls.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock gh-cli module
const mockExecGh = vi.fn();
vi.mock("./gh-cli", () => ({
  execGh: (...args: unknown[]) => mockExecGh(...args),
}));

import {
  buildMeshPayload,
  createMeshIssue,
  listMeshIssues,
  getGhIssue,
  parseMeshFrontmatter,
  MAX_BODY_SIZE,
} from "./mesh-issues";

import type { MeshPayload as _MeshPayload } from "./mesh-issues";

describe("buildMeshPayload", () => {
  test("builds payload with YAML frontmatter and markdown body", () => {
    const payload = buildMeshPayload({
      changeId: "ch-abc123",
      capability: "advance-workflow",
      relationship: "contributes_to",
      sourceProject: "/home/user/project-a",
      body: "## Summary\nThis change adds mesh support.",
    });

    expect(payload).toContain("adv_change_id: ch-abc123");
    expect(payload).toContain("adv_capability: advance-workflow");
    expect(payload).toContain("adv_relationship: contributes_to");
    expect(payload).toContain("adv_source_project: /home/user/project-a");
    expect(payload).toContain("## Summary");
    expect(payload).toContain("This change adds mesh support.");
  });

  test("includes adv_created_at timestamp", () => {
    const payload = buildMeshPayload({
      changeId: "ch-test",
      capability: "advance-delivery",
      relationship: "depends_on",
      sourceProject: "/project",
      body: "test",
    });

    expect(payload).toMatch(/adv_created_at: \d{4}-\d{2}-\d{2}T/);
  });

  test("wraps frontmatter in --- delimiters", () => {
    const payload = buildMeshPayload({
      changeId: "ch-x",
      capability: "cap",
      relationship: "rel",
      sourceProject: "/proj",
      body: "body",
    });

    const parts = payload.split("---");
    // --- frontmatter --- body
    expect(parts.length).toBeGreaterThanOrEqual(3);
  });

  test("truncates body at MAX_BODY_SIZE and appends truncation notice", () => {
    const longBody = "x".repeat(MAX_BODY_SIZE + 1000);
    const payload = buildMeshPayload({
      changeId: "ch-long",
      capability: "cap",
      relationship: "rel",
      sourceProject: "/proj",
      body: longBody,
    });

    // Body should be truncated but frontmatter + notice added
    expect(payload.length).toBeLessThan(MAX_BODY_SIZE + 2000);
    expect(payload).toContain("truncated");
  });
});

describe("createMeshIssue", () => {
  beforeEach(() => {
    mockExecGh.mockReset();
  });

  test("creates issue with adv-mesh and adv-{relationship} labels", async () => {
    mockExecGh.mockResolvedValue({
      stdout: JSON.stringify({
        number: 42,
        html_url: "https://github.com/org/repo/issues/42",
      }),
      stderr: "",
      exitCode: 0,
    });

    const result = await createMeshIssue("org/repo", {
      title: "Mesh: Add support",
      body: "Body content",
      relationship: "contributes_to",
      changeId: "ch-123",
      capability: "advance-workflow",
      sourceProject: "/project",
    });

    expect(result.issueNumber).toBe(42);
    expect(result.htmlUrl).toBe("https://github.com/org/repo/issues/42");

    // Verify gh issue create was called with labels
    const callArgs = mockExecGh.mock.calls[0][0] as string[];
    expect(callArgs).toContain("issue");
    expect(callArgs).toContain("create");
    expect(callArgs).toContain("--label");
    // Should have adv-mesh label
    const labelIdx = callArgs.indexOf("--label");
    if (labelIdx !== -1) {
      expect(callArgs[labelIdx + 1]).toContain("adv-mesh");
    }
  });

  test("returns error info when gh fails", async () => {
    mockExecGh.mockResolvedValue({
      stdout: "",
      stderr: "error: repo not found",
      exitCode: 1,
    });

    const result = await createMeshIssue("org/nonexistent", {
      title: "Test",
      body: "body",
      relationship: "contributes_to",
      changeId: "ch-err",
      capability: "cap",
      sourceProject: "/proj",
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("repo not found");
  });

  test("returns ghNotFound when gh is not available", async () => {
    mockExecGh.mockResolvedValue({
      stdout: "",
      stderr: "spawn gh ENOENT",
      exitCode: -1,
      ghNotFound: true,
    });

    const result = await createMeshIssue("org/repo", {
      title: "Test",
      body: "body",
      relationship: "contributes_to",
      changeId: "ch-nope",
      capability: "cap",
      sourceProject: "/proj",
    });

    expect(result.ghNotFound).toBe(true);
  });
});

describe("listMeshIssues", () => {
  beforeEach(() => {
    mockExecGh.mockReset();
  });

  test("lists issues with adv-mesh label", async () => {
    mockExecGh.mockResolvedValue({
      stdout: JSON.stringify([
        {
          number: 1,
          title: "Mesh issue 1",
          labels: [{ name: "adv-mesh" }],
          body: "---\nadv_change_id: ch-1\n---\nContent",
        },
        {
          number: 2,
          title: "Mesh issue 2",
          labels: [{ name: "adv-mesh" }, { name: "adv-contributes_to" }],
          body: "---\nadv_change_id: ch-2\n---\nContent 2",
        },
      ]),
      stderr: "",
      exitCode: 0,
    });

    const result = await listMeshIssues("org/repo");
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0].number).toBe(1);
    expect(result.issues[1].number).toBe(2);
  });

  test("returns empty array when no issues found", async () => {
    mockExecGh.mockResolvedValue({
      stdout: "[]",
      stderr: "",
      exitCode: 0,
    });

    const result = await listMeshIssues("org/repo");
    expect(result.issues).toHaveLength(0);
  });

  test("accepts additional labels filter", async () => {
    mockExecGh.mockResolvedValue({
      stdout: "[]",
      stderr: "",
      exitCode: 0,
    });

    await listMeshIssues("org/repo", ["adv-contributes_to"]);

    const callArgs = mockExecGh.mock.calls[0][0] as string[];
    expect(callArgs).toContain("--label");
  });
});

describe("getGhIssue", () => {
  beforeEach(() => {
    mockExecGh.mockReset();
  });

  test("fetches single issue by number", async () => {
    mockExecGh.mockResolvedValue({
      stdout: JSON.stringify({
        number: 42,
        title: "Test issue",
        body: "---\nadv_change_id: ch-test\n---\nBody",
        labels: [{ name: "adv-mesh" }],
      }),
      stderr: "",
      exitCode: 0,
    });

    const result = await getGhIssue("org/repo", 42);
    expect(result.number).toBe(42);
    expect(result.title).toBe("Test issue");
  });
});

describe("parseMeshFrontmatter", () => {
  test("parses YAML frontmatter from issue body", () => {
    const body = `---
adv_change_id: ch-abc123
adv_capability: advance-workflow
adv_relationship: contributes_to
adv_source_project: /home/user/project
adv_created_at: 2026-01-15T10:30:00Z
---
## Summary
This is the body.`;

    const parsed = parseMeshFrontmatter(body);
    expect(parsed.adv_change_id).toBe("ch-abc123");
    expect(parsed.adv_capability).toBe("advance-workflow");
    expect(parsed.adv_relationship).toBe("contributes_to");
    expect(parsed.adv_source_project).toBe("/home/user/project");
  });

  test("returns empty object when no frontmatter", () => {
    const body = "Just a regular issue body without frontmatter.";
    const parsed = parseMeshFrontmatter(body);
    expect(parsed).toEqual({});
  });

  test("handles malformed frontmatter gracefully", () => {
    const body = `---
not: valid: yaml: syntax
---
Body`;
    const parsed = parseMeshFrontmatter(body);
    // Should not throw, returns whatever it can parse
    expect(parsed).toBeDefined();
  });
});
