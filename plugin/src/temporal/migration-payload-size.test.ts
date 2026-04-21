import { describe, expect, it, vi } from "vitest";

vi.mock("./migration", () => ({
  migrateProjectState: vi.fn(async () => ({})),
  reImportChangeState: vi.fn(async () => ({})),
}));

vi.mock("../storage/agenda", () => ({
  loadAgenda: vi.fn(async () => ({ items: [] })),
}));

vi.mock("../storage/project-wisdom", () => ({
  listProjectWisdom: vi.fn(async () => []),
}));

vi.mock("../storage/json", () => ({
  loadAllChanges: vi.fn(async () => new Map()),
}));

import { runMigrationSweep } from "./migrate-runner";

describe("migration workflow-start payload size guard", () => {
  // gRPC default max message size is 4 MiB; Temporal returns RESOURCE_EXHAUSTED
  // when workflow-start args exceed that. Keeping the payload to projectPaths
  // strings only keeps the start message trivially small regardless of the
  // amount of state a project actually holds on disk.
  const GRPC_MAX_MESSAGE_BYTES = 4 * 1024 * 1024;

  it("serialized workflow-start payload for 18 realistic project paths stays well below the gRPC 4MiB ceiling", async () => {
    const start = vi.fn(async () => ({
      query: vi.fn(),
      executeUpdate: vi.fn(),
    }));
    const getHandle = vi.fn();

    const projectPaths = Array.from(
      { length: 18 },
      (_, i) =>
        `/home/jrede/.local/share/opencode/plugins/advance/project-${i.toString(16).padStart(40, "0")}`,
    );

    await runMigrationSweep({ workflow: { start, getHandle } } as any, {
      controlProjectId: projectPaths[0]
        .split("/")
        .pop()!
        .replace("project-", ""),
      runId: "size-guard",
      projectPaths,
    });

    const call = start.mock.calls.at(-1);
    expect(call).toBeDefined();
    const startInput = call![1] as { args: [unknown] };
    const payloadBytes = Buffer.byteLength(
      JSON.stringify(startInput.args[0]),
      "utf8",
    );

    expect(payloadBytes).toBeLessThan(GRPC_MAX_MESSAGE_BYTES / 100);
  });
});
