/**
 * Schema-error propagation tests (issue #258 Defect 1).
 *
 * Verifies that when a `change.json` on disk fails schema validation, the
 * store-layer swallow sites do NOT mask the schema error behind a generic
 * "Failed to query Workflow" Temporal error. Schema errors are not
 * recoverable through a Temporal round-trip; surfacing them verbatim
 * (with the Zod issue detail) is the contract.
 *
 * RED phase (pre-edit): assertions fail because the schema error is
 * swallowed and the generic Temporal error propagates instead.
 * GREEN phase (post-edit): assertions pass because every swallow site
 * re-throws on `isSchemaError(result)` before falling through.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createTempDir, cleanupTempDir } from "../../__tests__/setup";
import { createDefaultGates, type Change } from "../../types";
import { createDiskStore } from "../store-disk";
import { createTemporalStoreBackend } from "./index";

/**
 * Minimal change.json that PASSES ChangeSchema but embeds a
 * `verification_evidence_dispositions` entry whose nested object fails
 * `VerificationEvidenceDispositionSchema.strict()` due to `bogus_field`.
 *
 * ChangeSchema itself uses `.passthrough()`, so top-level extras are allowed;
 * the nested strict() schema is what surfaces the schema_error.
 */
function schemaInvalidChangeJson(id: string): string {
  const change = {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `Schema-invalid ${id}`,
    status: "draft",
    created_at: "2026-01-01T00:00:00.000Z",
    tasks: [],
    deltas: {},
    gates: Object.fromEntries(
      Object.entries(createDefaultGates()).map(([gate, value]) => [
        gate,
        { ...value, status: "done" as const },
      ]),
    ),
    reentry_history: [],
    wisdom: [],
    verification_evidence_dispositions: [
      {
        taskId: "tk-test",
        concernKey: "verification",
        disposition: "fixed",
        evidence: "test",
        dispositionedAt: "2026-01-01T00:00:00.000Z",
        // Strict-schema violation: unknown field on
        // VerificationEvidenceDispositionSchema (.strict()).
        bogus_field: 1,
      },
    ],
  };
  return JSON.stringify(change, null, 2);
}

/** Same shape as above but without the strict-schema violation. */
function schemaValidChangeJson(id: string): string {
  const change: Change = {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `Schema-valid ${id}`,
    // status:archived so loadDiskTerminalProjection serves the change
    // directly from disk (rq-terminalProjectionTruth01) without needing
    // a working Temporal mock for the round-trip case.
    status: "archived",
    created_at: "2026-01-01T00:00:00.000Z",
    tasks: [],
    deltas: {},
    gates: Object.fromEntries(
      Object.entries(createDefaultGates()).map(([gate, value]) => [
        gate,
        { ...value, status: "done" as const },
      ]),
    ) as Change["gates"],
    reentry_history: [],
    wisdom: [],
  };
  return JSON.stringify(change, null, 2);
}

/**
 * Mock Temporal client whose workflow query always throws a generic
 * "Failed to query Workflow" error (the masked error classifyTemporalReadFailure
 * cannot attribute to poisoned/missing). Used to force the fallback path
 * through loadDiskTerminalProjection.
 */
function createGenericFailureTemporal() {
  const handle = {
    query: async () => {
      throw new Error("Failed to query Workflow");
    },
    describe: async () => ({ searchAttributes: {} }),
  };
  return {
    client: {
      workflow: {
        getHandle: () => handle,
        start: async () => {
          throw new Error("Temporal start should not be called");
        },
      },
    },
  };
}

describe("schema-error propagation (issue #258 Defect 1)", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  async function seedSchemaInvalidChange(
    root: string,
    id: string,
  ): Promise<string> {
    const legacy = await createDiskStore(root);
    const changeDir = join(legacy.paths.changes, id);
    await mkdir(changeDir, { recursive: true });
    await writeFile(
      join(changeDir, "change.json"),
      schemaInvalidChangeJson(id),
    );
    return legacy;
  }

  it("store.changes.get surfaces schema_error (not 'Failed to query Workflow')", async () => {
    tempDir = await createTempDir();
    const legacy = await seedSchemaInvalidChange(
      tempDir,
      "schemaInvalidChange",
    );
    const store = createTemporalStoreBackend({
      legacy,
      temporal: createGenericFailureTemporal(),
      projectId: "0000ec0100000000000000000000000000000000",
    });

    await expect(store.changes.get("schemaInvalidChange")).rejects.toThrow(
      /Schema validation failed/,
    );
  });

  it("store.changes.get schema_error does NOT surface as 'Failed to query Workflow'", async () => {
    tempDir = await createTempDir();
    const legacy = await seedSchemaInvalidChange(
      tempDir,
      "schemaInvalidChange",
    );
    const store = createTemporalStoreBackend({
      legacy,
      temporal: createGenericFailureTemporal(),
      projectId: "0000ec0100000000000000000000000000000000",
    });

    await expect(store.changes.get("schemaInvalidChange")).rejects.not.toThrow(
      /Failed to query Workflow/,
    );
  });

  it("store.gates.get surfaces schema_error", async () => {
    tempDir = await createTempDir();
    const legacy = await seedSchemaInvalidChange(tempDir, "schemaInvalidGates");
    const store = createTemporalStoreBackend({
      legacy,
      temporal: createGenericFailureTemporal(),
      projectId: "0000ec0100000000000000000000000000000000",
    });

    await expect(store.gates.get("schemaInvalidGates")).rejects.toThrow(
      /Schema validation failed/,
    );
  });

  it("round-trip: after fixing change.json, store.changes.get succeeds", async () => {
    tempDir = await createTempDir();
    const legacy = await seedSchemaInvalidChange(tempDir, "schemaRoundtrip");
    const changeDir = join(legacy.paths.changes, "schemaRoundtrip");

    const store = createTemporalStoreBackend({
      legacy,
      temporal: createGenericFailureTemporal(),
      projectId: "0000ec0100000000000000000000000000000000",
    });

    // Pre-fix: schema_error propagates.
    await expect(store.changes.get("schemaRoundtrip")).rejects.toThrow(
      /Schema validation failed/,
    );

    // Fix the change.json (remove bogus_field by overwriting with valid shape).
    await writeFile(
      join(changeDir, "change.json"),
      schemaValidChangeJson("schemaRoundtrip"),
    );

    // Post-fix: should succeed (no schema_error, no Temporal query failure).
    // The Temporal mock still throws "Failed to query Workflow", but the
    // generic-failure-without-poisoned-evidence path returns the disk
    // projection directly as a fallback, without reseeding.
    const result = await store.changes.get("schemaRoundtrip");
    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("schemaRoundtrip");
  });
});
