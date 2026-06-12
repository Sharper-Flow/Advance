import { describe, expect, test } from "bun:test";

import { createDetectorRegistry, selectApplicableDetectors } from "./registry";

describe("slop-scan detector registry", () => {
  test("keeps supported detectors registered even when tools are unavailable", () => {
    const registry = createDetectorRegistry();

    expect(registry.map((detector) => detector.id)).toEqual([
      "eslint",
      "knip",
      "radon",
      "vulture",
      "gocyclo",
      "go-deadcode",
      "ast-grep",
      "jscpd",
      "external-ci-semgrep",
    ]);
  });

  test("selects detectors for detected languages and polyglot coverage", () => {
    const selected = selectApplicableDetectors(createDetectorRegistry(), [
      "typescript",
      "python",
    ]);

    expect(selected.map((detector) => detector.id)).toEqual([
      "eslint",
      "knip",
      "radon",
      "vulture",
      "ast-grep",
      "jscpd",
      "external-ci-semgrep",
    ]);
  });
});
