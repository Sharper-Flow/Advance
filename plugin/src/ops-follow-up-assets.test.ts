/**
 * Asset tests for ops-follow-up traceability spec law.
 *
 * Verifies that the rq-opsFollow* requirements exist in the canonical spec
 * files with the expected scenario coverage. These IDs are also external
 * citations for the spec-citation-invariant test.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

interface SpecJson {
  name: string;
  version: string;
  requirements: Array<{
    id: string;
    title: string;
    body: string;
    priority: string;
    tags: string[];
    scenarios?: Array<{ id: string; title: string }>;
  }>;
}

function loadSpec(capability: string): SpecJson {
  const path = join(REPO_ROOT, ".adv/specs", capability, "spec.json");
  return JSON.parse(readFileSync(path, "utf8")) as SpecJson;
}

function findReq(spec: SpecJson, id: string) {
  return spec.requirements.find((r) => r.id === id);
}

describe("ops-follow-up traceability spec law", () => {
  test("rq-opsFollowTrace01 exists in advance-workflow with 3 scenarios", () => {
    const spec = loadSpec("advance-workflow");
    const req = findReq(spec, "rq-opsFollowTrace01");
    expect(req, "rq-opsFollowTrace01 must exist").toBeDefined();
    expect(req!.priority).toBe("must");
    expect(req!.tags).toContain("ops-follow-up");
    expect(req!.scenarios).toHaveLength(3);
    expect(req!.scenarios!.map((s) => s.id)).toEqual([
      "rq-opsFollowTrace01.1",
      "rq-opsFollowTrace01.2",
      "rq-opsFollowTrace01.3",
    ]);
  });

  test("rq-opsFollowEvidence01 exists in advance-workflow with 3 scenarios", () => {
    const spec = loadSpec("advance-workflow");
    const req = findReq(spec, "rq-opsFollowEvidence01");
    expect(req, "rq-opsFollowEvidence01 must exist").toBeDefined();
    expect(req!.priority).toBe("must");
    expect(req!.body).toMatch(/not_started/);
    expect(req!.body).toMatch(/complete/);
    expect(req!.scenarios).toHaveLength(3);
  });

  test("rq-opsFollowRelease01 exists in advance-workflow with 3 scenarios", () => {
    const spec = loadSpec("advance-workflow");
    const req = findReq(spec, "rq-opsFollowRelease01");
    expect(req, "rq-opsFollowRelease01 must exist").toBeDefined();
    expect(req!.priority).toBe("must");
    expect(req!.body).toMatch(/blocks/);
    expect(req!.body).toMatch(/follows_release/);
    expect(req!.scenarios).toHaveLength(3);
  });

  test("rq-opsFollowPromotion01 exists in subagent-reports with 3 scenarios", () => {
    const spec = loadSpec("subagent-reports");
    const req = findReq(spec, "rq-opsFollowPromotion01");
    expect(req, "rq-opsFollowPromotion01 must exist").toBeDefined();
    expect(req!.priority).toBe("must");
    expect(req!.body).toMatch(/required_follow_ups/);
    expect(req!.body).toMatch(/source_contract_id/);
    expect(req!.scenarios).toHaveLength(3);
  });

  test("rq-opsFollowWip01 exists in backlog-coordination with 3 scenarios", () => {
    const spec = loadSpec("backlog-coordination");
    const req = findReq(spec, "rq-opsFollowWip01");
    expect(req, "rq-opsFollowWip01 must exist").toBeDefined();
    expect(req!.priority).toBe("must");
    expect(req!.body).toMatch(/adv_wip_state/);
    expect(req!.body).toMatch(/ops_followup_links/);
    expect(req!.scenarios).toHaveLength(3);
  });
});

describe("ops-follow-up spec versions bumped", () => {
  test("advance-workflow version is at least 1.19.0", () => {
    const spec = loadSpec("advance-workflow");
    expect(spec.version).toBe("1.21.0");
  });

  test("subagent-reports version is at least 1.3.0", () => {
    const spec = loadSpec("subagent-reports");
    expect(spec.version).toBe("1.4.0");
  });

  test("backlog-coordination version is at least 1.3.0", () => {
    const spec = loadSpec("backlog-coordination");
    expect(spec.version).toBe("1.3.0");
  });
});
