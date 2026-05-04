import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const inspectScript = resolve(
  __dirname,
  "../../scripts/maintenance/inspect.mjs",
);

describe("scripts/maintenance/inspect.mjs", () => {
  test("reports archived release-gate eligible changes", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "adv-maintenance-"));
    const archiveDir = join(
      projectRoot,
      ".adv",
      "archive",
      "2026-05-04-shipFeature",
    );
    await mkdir(archiveDir, { recursive: true });
    await writeFile(
      join(archiveDir, "change.json"),
      JSON.stringify(
        {
          id: "shipFeature",
          title: "Ship feature",
          status: "archived",
          created_at: "2026-05-04T00:00:00.000Z",
          tasks: [],
          deltas: {},
          gates: {
            release: {
              status: "done",
              completed_at: "2026-05-04T01:00:00.000Z",
              completed_by: "agent",
            },
          },
        },
        null,
        2,
      ),
    );

    const { stdout } = await execFileAsync(process.execPath, [
      inspectScript,
      "--project-root",
      projectRoot,
    ]);
    const parsed = JSON.parse(stdout);

    expect(parsed.schema_version).toBe(1);
    expect(parsed.project_root).toBe(projectRoot);
    expect(parsed.eligible_archives).toEqual([
      expect.objectContaining({
        change_id: "shipFeature",
        release_gate: "done",
        eligible: true,
      }),
    ]);
    expect(parsed.verification_summary.eligible_count).toBe(1);
  });
});
