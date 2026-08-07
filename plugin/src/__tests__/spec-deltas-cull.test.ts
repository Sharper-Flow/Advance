/**
 * Spec delta verification (R5.0).
 *
 * Asserts each of the seven claimed spec deltas from cullDeadCodeFixArchive
 * has the correct rewritten body and does not contain retired language.
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function loadSpecJson(capability: string): Promise<unknown> {
  const path = join(__dirname, "../../../.adv/specs", capability, "spec.json");
  const content = await readFile(path, "utf-8");
  return JSON.parse(content);
}

function getRequirement(spec: any, id: string): any | undefined {
  return spec.requirements?.find((r: any) => r.id === id);
}

function getScenario(requirement: any, id: string): any | undefined {
  return requirement.scenarios?.find((s: any) => s.id === id);
}

describe("spec deltas cullDeadCodeFixArchive (R5)", () => {
  it("advance-meta/rq-archivePurge01 does not mention change_summaries or source_versions", async () => {
    const spec = await loadSpecJson("advance-meta");
    const req = getRequirement(spec, "rq-archivePurge01");
    expect(req).toBeDefined();
    const body = JSON.stringify(req);
    expect(body).not.toContain("change_summaries");
    expect(body).not.toContain("source_versions");
  });

  it("advance-meta/rq-changeSummariesCap01 is retired (does not exist)", async () => {
    const spec = await loadSpecJson("advance-meta");
    const req = getRequirement(spec, "rq-changeSummariesCap01");
    expect(req).toBeUndefined();
  });

  it("advance-meta/rq-worktreeRegistry01 references disk projection worktree state", async () => {
    const spec = await loadSpecJson("advance-meta");
    const req = getRequirement(spec, "rq-worktreeRegistry01");
    expect(req).toBeDefined();
    const body = JSON.stringify(req);
    expect(body).toContain("durable change projections");
    expect(body).toContain("worktreeCreatedMutation");
    expect(body).toContain("AdvWorktreeBranches");
    expect(body).toContain("AdvWorktreePaths");
    expect(body).not.toContain("ProjectWorkflowState.worktree_registry");
  });

  it("advance-meta/rq-multiSessionCoordination01 references disk projection locks", async () => {
    const spec = await loadSpecJson("advance-meta");
    const req = getRequirement(spec, "rq-multiSessionCoordination01");
    expect(req).toBeDefined();
    const body = JSON.stringify(req);
    expect(body).toContain("commitChangeProjection");
    expect(body).toContain("per-change lock");
    expect(body).toContain("stale_revision");
  });

  it("advance-meta/rq-temporalConcurrentLoad01 is retired", async () => {
    const spec = await loadSpecJson("advance-meta");
    const req = getRequirement(spec, "rq-temporalConcurrentLoad01");
    expect(req).toBeUndefined();
  });

  it("advance-workflow/rq-searchAttrHealth01.2 is retired", async () => {
    const spec = await loadSpecJson("advance-workflow");
    const req = getRequirement(spec, "rq-searchAttrHealth01");
    expect(req).toBeUndefined();
  });

  it("advance-meta/rq-worktreeReuse01.1 then clause does not reference project-workflow recovery", async () => {
    const spec = await loadSpecJson("advance-meta");
    const req = getRequirement(spec, "rq-worktreeReuse01");
    expect(req).toBeDefined();
    const scenario = getScenario(req, "rq-worktreeReuse01.1");
    expect(scenario).toBeDefined();
    const then = JSON.stringify(scenario.then);
    expect(then).not.toContain("project-workflow recovery");
  });
});
