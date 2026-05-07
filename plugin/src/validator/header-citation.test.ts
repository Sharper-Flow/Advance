/**
 * Validator header-citation drift test (R4.0).
 *
 * Ensures validator doc-comment headers do not contain PSW-era phrasing.
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const VALIDATOR_DIR = __dirname;
const PSW_PHRASES = [
  "state authority lives in ProjectWorkflowState",
  "ProjectWorkflowState.worktree_registry",
];

async function readValidatorHeader(path: string): Promise<string> {
  const content = await readFile(path, "utf-8");
  const headerEnd = content.indexOf("*/");
  if (headerEnd === -1) return "";
  return content.slice(0, headerEnd + 2);
}

describe("validator header citations (R4)", () => {
  it("file-overlap.ts header has no PSW-era phrasing", async () => {
    const header = await readValidatorHeader(
      join(VALIDATOR_DIR, "file-overlap.ts"),
    );
    for (const phrase of PSW_PHRASES) {
      expect(header).not.toContain(phrase);
    }
  });

  it("merge-order.ts header has no PSW-era phrasing", async () => {
    const header = await readValidatorHeader(
      join(VALIDATOR_DIR, "merge-order.ts"),
    );
    for (const phrase of PSW_PHRASES) {
      expect(header).not.toContain(phrase);
    }
  });
});
