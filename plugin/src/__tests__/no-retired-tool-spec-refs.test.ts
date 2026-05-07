/**
 * No retired-tool references in live specs (R2.0 + R3.0).
 *
 * Walks .adv/specs/.../spec.json and docs/specs/.../*.md and fails if any
 * non-comment field contains retired-tool tokens.
 */
import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const RETIRED_TOOL_TOKENS = [
  "adv_workflow_repair",
  "adv_orphan_sweep",
  "adv_archive_sweep_orphans",
  "adv_migrate_cleanup",
  "adv_change_diagnose",
  "adv_change_import",
  "adv_task_evidence",
  "adv_task_run_status",
  "adv_task_tdd",
];

async function* walkJsonFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name === "spec.json") {
      yield join(entry.parentPath ?? dir, entry.name);
    }
  }
}

async function* walkMarkdownFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      yield join(entry.parentPath ?? dir, entry.name);
    }
  }
}

describe("no retired-tool references in live specs (R2)", () => {
  it("spec JSON has no retired-tool tokens", async () => {
    const specsDir = join(__dirname, "../../../.adv/specs");
    const violations: { file: string; token: string; line: string }[] = [];

    for await (const file of walkJsonFiles(specsDir)) {
      const content = await readFile(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const token of RETIRED_TOOL_TOKENS) {
          if (line.includes(token)) {
            violations.push({
              file,
              token,
              line: `${i + 1}: ${line.trim()}`,
            });
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

describe("no retired-tool references in generated docs (R3)", () => {
  it("docs/specs markdown has no retired-tool tokens", async () => {
    const docsDir = join(__dirname, "../../../docs/specs");
    const violations: { file: string; token: string; line: string }[] = [];

    try {
      for await (const file of walkMarkdownFiles(docsDir)) {
        const content = await readFile(file, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          for (const token of RETIRED_TOOL_TOKENS) {
            if (line.includes(token)) {
              violations.push({
                file,
                token,
                line: `${i + 1}: ${line.trim()}`,
              });
            }
          }
        }
      }
    } catch {
      // docs/specs may not exist
    }

    expect(violations).toEqual([]);
  });
});
