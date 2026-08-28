import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import { main } from "./dead-code-provenance-refresh";
import { provenanceRefreshExitCode } from "./lib/slop-scan/baseline-provenance";

describe("dead-code:provenance:refresh CLI", () => {
  test("rejects every option instead of widening its scope", async () => {
    expect(await main(["--write-baseline"])).toBe(2);
    expect(await main(["--config", "other.json"])).toBe(2);
  });

  test("maps current, refused, and blocked results to 0, 1, and 2", () => {
    expect(
      provenanceRefreshExitCode({ status: "current", diagnostics: [] }),
    ).toBe(0);
    expect(
      provenanceRefreshExitCode({ status: "refreshed", diagnostics: [] }),
    ).toBe(0);
    expect(
      provenanceRefreshExitCode({
        status: "refused",
        diagnostics: ["different set"],
      }),
    ).toBe(1);
    expect(
      provenanceRefreshExitCode({
        status: "blocked",
        diagnostics: ["invalid output"],
      }),
    ).toBe(2);
  });

  test("writes current status success to stdout", () => {
    const source = readFileSync(
      join(import.meta.dir, "dead-code-provenance-refresh.ts"),
      "utf8",
    );
    expect(source).toContain(
      'result.status === "current" || result.status === "refreshed"',
    );
    expect(source).toContain("process.stdout.write(");
  });
});
