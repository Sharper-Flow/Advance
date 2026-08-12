// CI Invariant: Top-level spec requirement IDs must not contain dots.
//
// Spec convention:
//   - Top-level requirement IDs: `rq-{capability}{NN}` (no dots)
//   - Scenarios under a requirement: `rq-{parent}.{M}` (dot, nested)
//
// A dotted top-level ID is malformed — it conflates the parent-requirement
// namespace with a scenario namespace, breaks delta targeting
// (which expects an unambiguous top-level requirement ID), and produces
// doubly-dotted scenario IDs (`rq-parent.N.M`) that diverge from the
// canonical scenario shape.
//
// This invariant was added alongside the one-time forced cleanup of the
// legacy malformed entry `rq-toolPlaceholderPolicy01.6` in `advance-meta`
// (replaceRecoveryToolSprawl / design D8). It permanently guards against
// reintroducing the same shape.

import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(__dirname, "../../..");
const SPECS_DIR = join(REPO_ROOT, ".adv", "specs");

interface Requirement {
  id: string;
  scenarios?: { id: string }[];
}

interface SpecJson {
  name: string;
  version: string;
  requirements: Requirement[];
}

function loadAllSpecs(): { capability: string; spec: SpecJson }[] {
  const out: { capability: string; spec: SpecJson }[] = [];
  for (const entry of readdirSync(SPECS_DIR)) {
    const specPath = join(SPECS_DIR, entry, "spec.json");
    if (!statSync(specPath).isFile()) continue;
    const raw = readFileSync(specPath, "utf8");
    out.push({ capability: entry, spec: JSON.parse(raw) });
  }
  return out;
}

describe("spec id shape invariant", () => {
  test("no top-level requirement ID contains a dot", () => {
    const offenders: string[] = [];
    for (const { capability, spec } of loadAllSpecs()) {
      for (const r of spec.requirements ?? []) {
        if (r.id.includes(".")) {
          offenders.push(`${capability}:${r.id}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("legacy malformed entry rq-toolPlaceholderPolicy01.6 is removed from advance-meta top-level", () => {
    const meta = loadAllSpecs().find((s) => s.capability === "advance-meta");
    expect(meta, "advance-meta spec must exist").toBeDefined();
    const topLevelIds = (meta!.spec.requirements ?? []).map((r) => r.id);
    expect(topLevelIds).not.toContain("rq-toolPlaceholderPolicy01.6");
  });

  test("proper nested scenario rq-toolPlaceholderPolicy01.6 remains under its parent in advance-workflow", () => {
    const wf = loadAllSpecs().find((s) => s.capability === "advance-workflow");
    expect(wf, "advance-workflow spec must exist").toBeDefined();
    const parent = (wf!.spec.requirements ?? []).find(
      (r) => r.id === "rq-toolPlaceholderPolicy01",
    );
    expect(
      parent,
      "parent requirement rq-toolPlaceholderPolicy01 must exist",
    ).toBeDefined();
    const scenarioIds = (parent!.scenarios ?? []).map((s) => s.id);
    expect(scenarioIds).toContain("rq-toolPlaceholderPolicy01.6");
  });
});
