import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");
const SPEC_PATH = ".adv/specs/advance-workflow/spec.json";

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

interface SpecScenario {
  id: string;
  title: string;
  given?: string[];
  when?: string;
  then?: string[];
}

interface SpecRequirement {
  id: string;
  title: string;
  body: string;
  priority: string;
  tags?: string[];
  scenarios?: SpecScenario[];
}

interface SpecJson {
  requirements: SpecRequirement[];
}

// rq-sessionReadinessBarrier01 — session readiness barrier gates tool exposure
// and per-mutation execution, complementing rq-isolSessionTaskQueue05.
describe("rq-sessionReadinessBarrier01 spec assets", () => {
  const spec = JSON.parse(readRepoFile(SPEC_PATH)) as SpecJson;

  const requirement = spec.requirements.find(
    (r) => r.id === "rq-sessionReadinessBarrier01",
  );

  test("requirement exists as a MUST with expected tags", () => {
    expect(requirement).toBeDefined();
    expect(requirement!.priority).toBe("must");
    expect(requirement!.title).toBe(
      "Session readiness barrier gates tool exposure and mutation execution",
    );

    const tags = new Set(requirement!.tags ?? []);
    for (const expected of [
      "execution",
      "readiness",
      "session-queue",
      "tool-exposure",
      "fail-closed",
    ]) {
      expect(tags.has(expected)).toBe(true);
    }
  });

  test("requirement declares all six ordered scenarios", () => {
    const scenarios = requirement!.scenarios ?? [];
    expect(scenarios.length).toBe(6);

    const expectedIds = [
      "rq-sessionReadinessBarrier01.1",
      "rq-sessionReadinessBarrier01.2",
      "rq-sessionReadinessBarrier01.3",
      "rq-sessionReadinessBarrier01.4",
      "rq-sessionReadinessBarrier01.5",
      "rq-sessionReadinessBarrier01.6",
    ];
    expect(scenarios.map((s) => s.id)).toEqual(expectedIds);
  });

  test("scenario 1 fails closed on unproven/orphan prior-session queue", () => {
    const s = requirement!.scenarios!.find(
      (sc) => sc.id === "rq-sessionReadinessBarrier01.1",
    )!;
    expect(s.title.toLowerCase()).toContain("unproven");
    const text = [
      s.title,
      ...(s.given ?? []),
      s.when ?? "",
      ...(s.then ?? []),
    ].join(" ");
    expect(text).toContain("ADV_SESSION_NOT_READY");
    expect(text.toLowerCase()).toContain("without");
    expect(text.toLowerCase()).toContain("signal");
  });

  test("scenario 2 isolates fresh own-queue mutation from unrelated orphan", () => {
    const s = requirement!.scenarios!.find(
      (sc) => sc.id === "rq-sessionReadinessBarrier01.2",
    )!;
    const text = [
      s.title,
      ...(s.given ?? []),
      s.when ?? "",
      ...(s.then ?? []),
    ].join(" ");
    expect(text.toLowerCase()).toContain("unrelated");
    expect(text.toLowerCase()).toContain("orphan");
    expect(text).toContain("advance-{P}-{sessB}");
  });

  test("scenario 3 truth table requires bounded Query and advisory DescribeTaskQueue", () => {
    const s = requirement!.scenarios!.find(
      (sc) => sc.id === "rq-sessionReadinessBarrier01.3",
    )!;
    const text = [
      s.title,
      ...(s.given ?? []),
      s.when ?? "",
      ...(s.then ?? []),
    ].join(" ");
    expect(text.toLowerCase()).toContain("query");
    expect(text).toContain("DescribeTaskQueue");
    expect(text.toLowerCase()).toContain("advisory");
  });

  test("scenario 4 re-closes barrier after mid-session worker death", () => {
    const s = requirement!.scenarios!.find(
      (sc) => sc.id === "rq-sessionReadinessBarrier01.4",
    )!;
    const text = [
      s.title,
      ...(s.given ?? []),
      s.when ?? "",
      ...(s.then ?? []),
    ].join(" ");
    expect(text).toContain("ADV_SESSION_NOT_READY");
    expect(text.toLowerCase()).toContain("worker death");
    expect(text.toLowerCase()).toContain("ttl");
  });

  test("scenario 5 declares bypass env flag", () => {
    const s = requirement!.scenarios!.find(
      (sc) => sc.id === "rq-sessionReadinessBarrier01.5",
    )!;
    const text = [
      s.title,
      ...(s.given ?? []),
      s.when ?? "",
      ...(s.then ?? []),
    ].join(" ");
    expect(text).toContain("ADV_SESSION_READINESS_BYPASS=1");
    expect(text.toLowerCase()).toContain("default");
  });

  test("scenario 6 does not weaken rq-isolSessionTaskQueue05.3", () => {
    const s = requirement!.scenarios!.find(
      (sc) => sc.id === "rq-sessionReadinessBarrier01.6",
    )!;
    const body = requirement!.body;
    const text = [
      s.title,
      ...(s.given ?? []),
      s.when ?? "",
      ...(s.then ?? []),
    ].join(" ");

    // The barrier lives post-init; startup does not block on readiness probe.
    expect(text.toLowerCase()).toContain("startup");
    expect(text.toLowerCase()).toContain("without blocking");
    expect(text.toLowerCase()).toContain("tool exposure");

    // The requirement body explicitly preserves rq-isolSessionTaskQueue05.
    expect(body).toContain("rq-isolSessionTaskQueue05");

    // Confirm rq-isolSessionTaskQueue05.3 still exists unchanged.
    const isol = spec.requirements.find(
      (r) => r.id === "rq-isolSessionTaskQueue05",
    );
    expect(isol).toBeDefined();
    const s53 = isol!.scenarios!.find(
      (sc) => sc.id === "rq-isolSessionTaskQueue05.3",
    )!;
    expect(s53.title).toBe(
      "Startup remains non-blocking on visibility API failure",
    );
    expect(s53.then!).toContain(
      "Worker startup completes without waiting for the adoption scan",
    );
  });
});
