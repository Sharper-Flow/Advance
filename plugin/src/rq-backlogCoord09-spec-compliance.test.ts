import { readFileSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");
const SPEC_PATH = join(REPO_ROOT, ".adv/specs/backlog-coordination/spec.json");

interface Requirement {
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
}

interface Spec {
  purpose: string;
  requirements: Requirement[];
}

describe("rq-backlogCoord09 spec compliance", () => {
  const spec: Spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));

  test("rq-backlogCoord06 is deleted", () => {
    const ids = spec.requirements.map((r) => r.id);
    expect(ids).not.toContain("rq-backlogCoord06");
  });

  test("capability purpose no longer references Value or ranking", () => {
    expect(spec.purpose).not.toMatch(/Value \(V\)|canonical for ranking/i);
    expect(spec.purpose).toMatch(/bug priority labels/i);
  });

  test("rq-backlogCoord09 title references bug priority assignment", () => {
    const req = spec.requirements.find((r) => r.id === "rq-backlogCoord09");
    expect(req).toBeDefined();
    expect(req?.title).toMatch(/bug priority assignment/i);
    expect(req?.title).not.toMatch(/scoring/i);
  });

  test("rq-backlogCoord09 body requires cleanup before bug priority assignment", () => {
    const req = spec.requirements.find((r) => r.id === "rq-backlogCoord09");
    expect(req?.body).toMatch(/before new issue creation/i);
    expect(req?.body).toMatch(/before.*bug priority assignment/i);
    expect(req?.body).not.toMatch(/feature Value/i);
  });

  test("rq-backlogCoord09 body forbids user confirmation of priority", () => {
    const req = spec.requirements.find((r) => r.id === "rq-backlogCoord09");
    expect(req?.body).toMatch(
      /MUST NOT ask the user to confirm or choose a priority/i,
    );
    expect(req?.body).toMatch(/agent assigns priority autonomously/i);
  });

  test("rq-backlogCoord09.1 references bug priority assignment", () => {
    const req = spec.requirements.find((r) => r.id === "rq-backlogCoord09");
    const scenario = req?.scenarios?.find(
      (s) => s.id === "rq-backlogCoord09.1",
    );
    expect(scenario).toBeDefined();
    expect(scenario?.title).toMatch(/bug priority assignment/i);
    expect(scenario?.then.join(" ")).not.toMatch(/feature Value/i);
    expect(scenario?.then.join(" ")).toMatch(/bug priority assignment/i);
  });

  test("rq-backlogCoord09.4 describes bounded-autonomous priority", () => {
    const req = spec.requirements.find((r) => r.id === "rq-backlogCoord09");
    const scenario = req?.scenarios?.find(
      (s) => s.id === "rq-backlogCoord09.4",
    );
    expect(scenario).toBeDefined();
    expect(scenario?.title).toMatch(/bounded-autonomous/i);
    expect(scenario?.then.join(" ")).toMatch(
      /at most 2 context-gathering questions/i,
    );
    expect(scenario?.then.join(" ")).toMatch(/priority defaults to medium/i);
    expect(scenario?.then.join(" ")).toMatch(/context_insufficient/i);
    expect(scenario?.then.join(" ")).toMatch(
      /never asked to confirm or choose the priority/i,
    );
  });
});
