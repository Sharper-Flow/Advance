import { afterEach, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  cleanupTempDir,
  createTempDir,
  SAMPLE_CHANGE,
} from "../__tests__/setup";
import { classifySummaryCandidates } from "./change-projection-reader";

describe("classifySummaryCandidates", () => {
  let baseDir: string | undefined;

  afterEach(async () => {
    if (baseDir) {
      await cleanupTempDir(baseDir);
      baseDir = undefined;
    }
  });

  async function writeCanonical(
    changesDir: string,
    id: string,
    change: Record<string, unknown>,
  ): Promise<void> {
    await mkdir(join(changesDir, id), { recursive: true });
    await writeFile(
      join(changesDir, id, "change.json"),
      JSON.stringify(change),
      "utf-8",
    );
  }

  it("separates valid, missing, schema-invalid, and terminal canonical records", async () => {
    baseDir = await createTempDir("classify-summary-candidates-");
    const changesDir = join(baseDir, "changes");
    await mkdir(changesDir, { recursive: true });

    await writeCanonical(changesDir, "valid-change", {
      ...SAMPLE_CHANGE,
      id: "valid-change",
      status: "draft",
    });
    await writeCanonical(changesDir, "invalid-change", {
      ...SAMPLE_CHANGE,
      id: "invalid-change",
      status: "draft",
      subagent_reports: [
        {
          schema_version: "1.0",
          change_id: "invalid-change",
          scope: { kind: "change", scope_key: "researcher:test" },
          attempt: 1,
          agent: "adv-researcher",
          topic: "schema boundary",
          sources: [
            {
              label: "fixture",
              locator: "https://example.invalid/fixture",
              summary: "fixture source",
            },
          ],
          architecture_assessment: "x".repeat(12_001),
          validation: {
            status: "caution",
            blockers: [],
            notes: "fixture",
          },
          architecture_judgement: {
            applicability: "not_applicable",
            confidence: "medium",
            reason: "fixture",
            recommendation: "fixture",
          },
          recommendation: "fixture",
          follow_ups: [],
          workdir_used: "/tmp/fixture",
        },
      ],
    });
    await writeCanonical(changesDir, "archived-change", {
      ...SAMPLE_CHANGE,
      id: "archived-change",
      status: "archived",
    });

    const result = await classifySummaryCandidates(changesDir, [
      "valid-change",
      "missing-change",
      "invalid-change",
      "archived-change",
    ]);

    expect(result).toEqual({
      valid: ["valid-change"],
      excluded: [
        { id: "missing-change", reason: "canonical_missing" },
        {
          id: "invalid-change",
          reason: "canonical_error",
          detail: "schema_error",
        },
        { id: "archived-change", reason: "canonical_terminal" },
      ],
    });
  });
});
