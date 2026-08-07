import { describe, expect, test, vi } from "vitest";
import { join } from "node:path";

import {
  cleanupTempDir,
  createTempDir,
  parseToolOutput,
} from "../__tests__/setup";
import type { Change, Store } from "../types";

const mocks = vi.hoisted(() => ({
  coordinateChangeMutation: vi.fn(),
  appendClarifyNeededForCreatedChange: vi.fn(),
}));

vi.mock("./change-mutation-coordinator", () => ({
  coordinateChangeMutation: mocks.coordinateChangeMutation,
}));

vi.mock("./change/create-clarify", async () => {
  const actual = await vi.importActual<
    typeof import("./change/create-clarify")
  >("./change/create-clarify");
  return {
    ...actual,
    appendClarifyNeededForCreatedChange:
      mocks.appendClarifyNeededForCreatedChange,
  };
});

import { changeTools } from "./change";

function change(id: string): Change {
  return {
    id,
    title: "Add response authority",
    status: "draft",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "test",
    tasks: [],
    deltas: {},
    wisdom: [],
  } as Change;
}

function storeFor(root: string, created: Change): Store {
  return {
    paths: {
      root,
      changes: join(root, "changes"),
      archive: join(root, "archive"),
    },
    config: null,
    changes: {
      // Mirrors ChangeCreateStorageResult post-KD2: only the change.json
      // projection path survives; narrative artifacts live in the projection.
      create: vi.fn(async () => ({
        changeId: created.id,
        path: join(root, "changes", created.id, "change.json"),
      })),
      get: vi.fn(async () => ({ success: true, data: created })),
      listSummary: vi.fn(async () => ({ changes: [] })),
      list: vi.fn(async () => ({ changes: [] })),
      save: vi.fn(async () => {}),
    },
  } as unknown as Store;
}

function expectNoMarkdownArtifactPaths(output: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(output)) {
    expect(
      key.endsWith("Path") &&
        typeof value === "string" &&
        value.endsWith(".md"),
      `${key} must not advertise a markdown artifact path`,
    ).toBe(false);
  }
}

describe("change artifact response authority", () => {
  test("adv_change_update names the durable documents projection instead of returning artifact paths", async () => {
    const root = await createTempDir("adv-change-artifact-response-");
    try {
      mocks.coordinateChangeMutation.mockResolvedValueOnce({
        kind: "verified",
        value: {},
        revision: 1,
        audit: {},
      });

      const parsed = parseToolOutput(
        await changeTools.adv_change_update.execute(
          { changeId: "updateAuthority", proposal: "Updated proposal" },
          storeFor(root, change("updateAuthority")),
        ),
      );

      expectNoMarkdownArtifactPaths(parsed);
      expect(parsed).toMatchObject({
        success: true,
        changeId: "updateAuthority",
        artifactAuthority: "change.documents",
      });
    } finally {
      await cleanupTempDir(root);
    }
  });

  test("adv_change_create names the durable documents projection instead of returning artifact paths", async () => {
    const root = await createTempDir("adv-change-artifact-response-");
    try {
      const created = change("createAuthority");
      const parsed = parseToolOutput(
        await changeTools.adv_change_create.execute(
          { summary: "Add response authority", proposal: "Initial proposal" },
          storeFor(root, created),
        ),
      );

      expectNoMarkdownArtifactPaths(parsed);
      expect(parsed).toMatchObject({
        changeId: "createAuthority",
        artifactAuthority: "change.documents",
      });
    } finally {
      await cleanupTempDir(root);
    }
  });
});
