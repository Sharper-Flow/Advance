/**
 * Asset tests for narrative requirements that are preserved as enforced contracts.
 *
 * These requirements are "narrative" — they describe agent behavior rather than
 * structural constraints validated by code. They were preserved during the spec
 * consolidation (`consolidateadvspeclayer`) instead of dropped because their
 * wording is referenced by command files and shapes user-facing behavior.
 *
 * Each test asserts the requirement ID exists in its expected capability and
 * carries body text containing the agreed anchor phrase. If the requirement
 * disappears or its body drifts away from the anchor wording, this test fails.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(__dirname, "../../..");

interface SpecJson {
  name: string;
  version: string;
  requirements: Array<{
    id: string;
    title: string;
    body: string;
    priority: string;
    scenarios?: Array<{
      id: string;
      title: string;
      given: string[];
      when: string;
      then: string[];
    }>;
  }>;
}

function loadSpec(capability: string): SpecJson {
  const path = join(REPO_ROOT, ".adv/specs", capability, "spec.json");
  return JSON.parse(readFileSync(path, "utf8")) as SpecJson;
}

describe("preserved narrative rules — wording presence", () => {
  test("rq-largeScopeValidity01 exists in advance-workflow with size-trust anchor", () => {
    const spec = loadSpec("advance-workflow");
    const req = spec.requirements.find(
      (r) => r.id === "rq-largeScopeValidity01",
    );
    expect(
      req,
      "rq-largeScopeValidity01 must exist in advance-workflow",
    ).toBeDefined();
    expect(req!.priority).toBe("must");
    // Anchor wording: agents must trust the prep gate; size alone is not grounds for split
    expect(req!.body.toLowerCase()).toMatch(/size|split|prep gate/);
  });

  test("rq-crossProjectCoordination01 exists with advisory dependency anchors", () => {
    const spec = loadSpec("advance-workflow");
    const req = spec.requirements.find(
      (r) => r.id === "rq-crossProjectCoordination01",
    );
    expect(
      req,
      "rq-crossProjectCoordination01 must exist in advance-workflow",
    ).toBeDefined();
    expect(req!.priority).toBe("must");
    expect(req!.body).toContain("target_path");
    expect(req!.body.toLowerCase()).toContain("advisory");
    expect(req!.body.toLowerCase()).toContain("drilldown");
    expect(req!.scenarios?.length).toBeGreaterThanOrEqual(4);
  });

  test("rq-dueDiligence01 exists in advance-meta with research anchor", () => {
    const spec = loadSpec("advance-meta");
    const req = spec.requirements.find((r) => r.id === "rq-dueDiligence01");
    expect(req, "rq-dueDiligence01 must exist in advance-meta").toBeDefined();
    expect(req!.priority).toBe("must");
    // Anchor wording: research / due diligence routing
    expect(req!.body.toLowerCase()).toMatch(/research|diligence|evidence/);
  });
});
