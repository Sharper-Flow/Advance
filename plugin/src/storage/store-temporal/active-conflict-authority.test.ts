import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../../__tests__/setup";
import { createDefaultGates, type Change } from "../../types";
import { createDiskStore } from "../store-disk";
import { createTemporalStoreBackend } from "./index";

const PROJECT_ID = "0".repeat(40);
let tempDir: string | undefined;

function activeChange(id: string, status: Change["status"] = "draft"): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `Active ${id}`,
    status,
    created_at: "2026-05-07T00:00:00.000Z",
    tasks: [],
    deltas: { [`cap-${id}`]: [] },
    gates: createDefaultGates(),
    reentry_history: [],
    wisdom: [],
  };
}

async function makeStore() {
  const legacy = await createDiskStore(tempDir!);
  return {
    legacy,
    store: createTemporalStoreBackend({
      legacy,
      temporal: {} as never,
      projectId: PROJECT_ID,
    }),
  };
}

afterEach(async () => {
  if (tempDir) await cleanupTempDir(tempDir);
  tempDir = undefined;
});

describe("disk-backed active conflict authority", () => {
  it("enumerates active durable projections without Temporal", async () => {
    tempDir = await createTempDir();
    const { legacy, store } = await makeStore();
    await legacy.changes.save(activeChange("active-a"));
    await legacy.changes.save(activeChange("active-b"));

    const result = await store.changes.listConflictAuthority!();
    expect(result.completeness).toBe("complete");
    expect(result.canConcludeClean).toBe(true);
    expect(result.active.map((change) => change.id)).toEqual([
      "active-a",
      "active-b",
    ]);
    expect(result.candidateCount).toBe(2);
    expect(result.omittedCount).toBe(0);
  });

  it("reports a missing projection as incomplete instead of querying a workflow", async () => {
    tempDir = await createTempDir();
    const { legacy, store } = await makeStore();
    await legacy.changes.save(activeChange("present"));
    // A directory is an active candidate, but without change.json it cannot
    // establish durable authority.
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(`${legacy.paths.changes}/missing`, { recursive: true }),
    );

    const result = await store.changes.listConflictAuthority!();
    expect(result.completeness).toBe("incomplete");
    expect(result.canConcludeClean).toBe(false);
    expect(result.omittedCount).toBe(1);
    expect(result.warnings.join(" ")).toContain("missing");
  });

  it("treats a terminal projection as a durable shadow", async () => {
    tempDir = await createTempDir();
    const { legacy, store } = await makeStore();
    await legacy.changes.save(activeChange("closed", "archived"));

    const result = await store.changes.listConflictAuthority!();
    expect(result.completeness).toBe("complete");
    expect(result.canConcludeClean).toBe(true);
    expect(result.active).toEqual([]);
    expect(result.shadowCount).toBe(1);
  });

  it("omits a schema-invalid projection while preserving healthy peers", async () => {
    tempDir = await createTempDir();
    const { legacy, store } = await makeStore();
    await legacy.changes.save(activeChange("healthy"));
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(`${legacy.paths.changes}/corrupt`, { recursive: true });
    await writeFile(
      `${legacy.paths.changes}/corrupt/change.json`,
      JSON.stringify({ ...activeChange("corrupt"), status: "invalid" }),
    );

    const result = await store.changes.listConflictAuthority!();
    expect(result.completeness).toBe("incomplete");
    expect(result.active.map((change) => change.id)).toEqual(["healthy"]);
    expect(result.omittedCount).toBe(1);
    expect(result.warnings.join(" ")).toContain("schema-invalid");
  });
});
