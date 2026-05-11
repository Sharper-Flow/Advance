import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(__dirname, "../../..");

interface Requirement {
  id: string;
}

interface SpecJson {
  name: string;
  requirements: Requirement[];
}

describe("domain-context spec assets", () => {
  test("domain-context capability declares required advisory artifacts", () => {
    const specPath = join(REPO_ROOT, ".adv/specs/domain-context/spec.json");
    const spec = JSON.parse(readFileSync(specPath, "utf8")) as SpecJson;

    expect(spec.name).toBe("domain-context");
    expect(spec.requirements.map((req) => req.id)).toEqual(
      expect.arrayContaining(["rq-domainContext01", "rq-domainContextADR01"]),
    );
    expect(spec.requirements).toHaveLength(2);
  });
});
