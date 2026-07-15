import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPEC_JSON = join(REPO_ROOT, ".adv/specs/advance-delivery/spec.json");
const SPEC_DOC = join(REPO_ROOT, "docs/specs/advance-delivery.md");
const STORE_CLEANUP_TS = join(REPO_ROOT, "plugin/src/tools/store-cleanup.ts");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function requirement(id: string): {
  id: string;
  priority: string;
  body: string;
  scenarios: Array<{ id: string; when: string; then: string[] }>;
} {
  const spec = JSON.parse(read(SPEC_JSON));
  const req = spec.requirements.find((r: { id: string }) => r.id === id);
  expect(req, `${id} must exist`).toBeTruthy();
  return req;
}

// AC10: store cleanup/consolidation coupling and indefinite maintenance
// status are specified and documented.
describe("store cleanup/consolidation coupling assets (AC10)", () => {
  test("rq-storeCleanupCoupling01 specifies mutual serialization, lock refusal, and evidence preservation", () => {
    const req = requirement("rq-storeCleanupCoupling01");
    expect(req.priority).toBe("must");
    expect(req.body).toContain("adv_store_cleanup");
    expect(req.body).toContain("adv_store_consolidate");
    expect(req.body).toContain("worker.lock");
    expect(req.body).toMatch(/mutually serialized/i);
    expect(req.body).toContain("agenda_row");
  });

  test("rq-storeCleanupCoupling01 specifies manifest-before-delete ordering and indefinite operator-only retention", () => {
    const req = requirement("rq-storeCleanupCoupling01");
    expect(req.body).toMatch(/manifest-before-delete/i);
    expect(req.body).toMatch(/indefinitely/i);
    expect(req.body).toMatch(/operator-only/i);
  });

  test("scenarios cover lock refusal, evidence preservation, manifest ordering, bounded review, and retention", () => {
    const req = requirement("rq-storeCleanupCoupling01");
    const ids = req.scenarios.map((s) => s.id);
    for (const suffix of [".1", ".2", ".3", ".4", ".5"]) {
      expect(ids).toContain(`rq-storeCleanupCoupling01${suffix}`);
    }
    const allThen = req.scenarios.flatMap((s) => s.then).join("\n");
    expect(allThen).toContain("retain");
    expect(allThen).toMatch(/manifest/i);
    expect(allThen).toContain("has_more");
    expect(allThen).toContain("plan_hash");
  });

  test("docs mirror and runtime header cite the coupling requirement", () => {
    const doc = read(SPEC_DOC);
    expect(doc).toContain("rq-storeCleanupCoupling01");
    expect(doc).toMatch(/operator-only/i);
    expect(doc).toMatch(/manifest-before-delete/i);

    const source = read(STORE_CLEANUP_TS);
    expect(source).toContain("rq-storeCleanupCoupling01");
  });
});
