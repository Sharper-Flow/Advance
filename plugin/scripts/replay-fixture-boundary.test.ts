import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { getReplayFixtureNamespace } from "./replay-fixture-boundary";

const generatorPath = fileURLToPath(
  new URL("./gen-replay-fixture.ts", import.meta.url),
);

describe("replay fixture Temporal boundary", () => {
  test("requires an explicitly isolated namespace", () => {
    expect(() => getReplayFixtureNamespace({})).toThrow(
      /REPLAY_FIXTURE_NAMESPACE/,
    );
  });

  test("rejects the live default namespace even when explicitly configured", () => {
    expect(() =>
      getReplayFixtureNamespace({ REPLAY_FIXTURE_NAMESPACE: "default" }),
    ).toThrow(/live Temporal namespace/);
  });

  test("accepts a valid isolated namespace", () => {
    expect(
      getReplayFixtureNamespace({
        REPLAY_FIXTURE_NAMESPACE: "adv-replay-fixtures",
      }),
    ).toBe("adv-replay-fixtures");
  });

  test("wires the generator through the boundary before Temporal setup", async () => {
    const source = await readFile(generatorPath, "utf8");

    expect(source).toContain("const namespace = getReplayFixtureNamespace();");
    expect(source).toContain("namespace,\n  });");
    expect(source).not.toContain('const NAMESPACE = "default"');
  });
});
