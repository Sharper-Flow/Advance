/**
 * rq-wisdomAutoSurfacing01.11 / AC9 — Advisory-Only Invariant Test
 *
 * Static-assertion test guarding the architectural invariant that
 * `_relevantWisdom` and `_episodeRecallHint` enrichment fields are
 * advisory-only — never read by gate-completion code paths, never used to
 * override specs/contracts, and never used to replace task evidence.
 *
 * AC9 is enforced by architecture today: the enrichment fields are only
 * attached to the tool output of `adv_task_show` and never enter signal
 * payloads, workflow state, or gate handlers. This test catches a future
 * regression where a refactor accidentally bleeds enrichment into
 * authoritative state.
 */

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PLUGIN_SRC = join(__dirname, "..");
const ENRICHMENT_FIELDS = ["_relevantWisdom", "_episodeRecallHint"];

/**
 * Files that own gate state transitions and must never read enrichment.
 * If a new gate handler is added, append it here.
 */
const GATE_HANDLER_FILES = ["tools/gate.ts"];

describe("rq-wisdomAutoSurfacing01.11 — AC9 advisory-only invariant", () => {
  for (const file of GATE_HANDLER_FILES) {
    test(`${file} never reads enrichment fields`, () => {
      const content = readFileSync(join(PLUGIN_SRC, file), "utf8");
      for (const field of ENRICHMENT_FIELDS) {
        // Allow comments/docstrings containing the field name (educational
        // references). Forbid raw identifier reads in actual code.
        // Strip comments and string literals for the check.
        const stripped = content
          .replace(/\/\/.*$/gm, "")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/`[^`]*`/g, "")
          .replace(/"[^"]*"/g, '""')
          .replace(/'[^']*'/g, "''");
        expect(stripped).not.toContain(field);
      }
    });
  }

  test("enrichment fields are not in gate signal payload schemas", () => {
    // The signal payload schemas are the contract surface; enrichment
    // fields must never appear in any TaskUpdatedSignalPayload,
    // TaskBlockedSignalPayload, or GateCompletedSignalPayload shape.
    const signalsFile = readFileSync(
      join(__dirname, "..", "types", "signals.ts"),
      "utf8",
    );
    // Strip comments before checking
    const stripped = signalsFile
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    for (const field of ENRICHMENT_FIELDS) {
      expect(stripped).not.toContain(field);
    }
  });
});
