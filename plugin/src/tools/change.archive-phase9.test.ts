/**
 * adv_change_archive Phase 9 integration contract tests.
 *
 * Source-level guard because the tool body is intentionally integration-heavy:
 * runtime behavior is covered by git-finalize helper tests plus gate tests.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, test } from "vitest";

const SOURCE = readFileSync(join(__dirname, "change.ts"), "utf8");

describe("adv_change_archive Phase 9 integration contract", () => {
  test("imports the shared Phase 9 finalization helper", () => {
    expect(SOURCE).toContain("finalizeRelease");
    expect(SOURCE).toContain("./archive-helpers/git-finalize");
  });

  test("exposes a phase9 skip option for slash-command-owned finalization", () => {
    expect(SOURCE).toContain("phase9");
    expect(SOURCE).toContain('z.enum(["run", "skip"])');
    expect(SOURCE).toContain("slash-command path");
  });

  test("runs finalization after a successful non-dry-run archive and returns the outcome", () => {
    const archiveToolStart = SOURCE.indexOf("adv_change_archive");
    const archiveToolBody = SOURCE.slice(archiveToolStart);

    expect(archiveToolBody).toContain("await finalizeRelease");
    expect(archiveToolBody).toContain("archiveMode");
    expect(archiveToolBody).toContain("autoPush");
    expect(archiveToolBody).toContain("finalization");
  });

  test("preserves bundle-first ordering before Phase 9 merge/push", () => {
    const archiveCall = SOURCE.indexOf("archiveResult = await archiveChange");
    const finalizationCall = SOURCE.indexOf("await finalizeRelease");

    expect(archiveCall).toBeGreaterThan(-1);
    expect(finalizationCall).toBeGreaterThan(archiveCall);
  });
});
