/**
 * T15 / AC8: invariant test asserting no artifact-content disk writes from
 * the temporal store production write path.
 *
 * Verifies by inspecting source code (structural test) that the temporal
 * store's `create()` and `updateArtifacts()` implementations do NOT pass
 * artifact content positional args to `legacy.changes.*`. The artifact
 * content flows exclusively through Temporal signals → state.documents.
 *
 * Note: A pure spy-based runtime test was considered but rejected:
 *   - The temporal store's create() still forwards `summary` and `capability`
 *     to legacy.changes.create, so spying on legacy.changes.create wouldn't
 *     prove zero artifact-content writes — it would just prove the call
 *     happened. We need to assert the SHAPE of the forwarded args.
 *   - Source-code-level inspection is more durable than spy assertions
 *     because it catches regressions where a future change re-introduces
 *     positional artifact args without breaking spy assertions.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const storeTemporalChangesPath = join(__dirname, "changes.ts");
const storeTemporalSource = readFileSync(storeTemporalChangesPath, "utf-8");

describe("AC8 invariant — no artifact-content disk writes from temporal store", () => {
  it("create() passes no artifacts to legacy.changes.create (post-T20)", () => {
    // After T20 atomically removes the positional API, the temporal store's
    // create() forwards only summary + options to legacy.changes.create with
    // NO `artifacts` field in the options-object. Content flows via signals.
    const createCallMatch = storeTemporalSource.match(
      /await legacy\.changes\.create\(\s*summary,\s*\{([^}]*)\}/,
    );
    expect(
      createCallMatch,
      "could not locate legacy.changes.create call in temporal store",
    ).not.toBeNull();
    if (!createCallMatch) return;
    const optionsBody = createCallMatch[1];

    // No `artifacts:` field in the options object — content flows via signals
    expect(optionsBody).not.toMatch(/\bartifacts\s*:/);
  });

  it("updateArtifacts() does NOT call legacy.changes.updateArtifacts at all", () => {
    // updateArtifacts in the temporal store should fire content + metadata
    // signals only; the legacy.changes.updateArtifacts path is disk-bound
    // and forbidden per AC8.
    const updateArtifactsBlock = storeTemporalSource
      .split("updateArtifacts: async")[1]
      ?.split(/^\s{4}\},/m)[0];
    expect(
      updateArtifactsBlock,
      "could not locate updateArtifacts impl block in temporal store",
    ).toBeDefined();
    if (!updateArtifactsBlock) return;

    expect(updateArtifactsBlock).not.toContain(
      "legacy.changes.updateArtifacts(",
    );
  });

  it("does not import updateChangeArtifacts from storage/json", () => {
    // Sanity check: the temporal store should not directly use the
    // disk-write helper either.
    expect(storeTemporalSource).not.toMatch(/updateChangeArtifacts/);
  });
});
