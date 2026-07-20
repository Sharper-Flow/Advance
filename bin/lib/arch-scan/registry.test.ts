import { describe, expect, test } from "bun:test";

import {
  CAPABILITY_RELATIONSHIPS,
  type CapabilityRelationship,
} from "./registry";

describe("arch-scan capability registry", () => {
  test("registers exactly five capability relationships", () => {
    expect(CAPABILITY_RELATIONSHIPS).toHaveLength(5);
  });

  test("all entry ids are unique and match the documented catalog", () => {
    const ids = CAPABILITY_RELATIONSHIPS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      "env-var-injection-vs-sdk-import",
      "config-vs-dependency-presence",
      "report-only-header-with-deferred-todo",
      "manifest-reference-vs-runtime-registration",
      "scaffold-vs-test-green-path",
    ]);
  });

  test("every entry satisfies CapabilityRelationship at compile time", () => {
    // Compile-time assertion: the registry is assignable to the typed array.
    const _check: readonly CapabilityRelationship[] = CAPABILITY_RELATIONSHIPS;
    expect(_check).toBe(CAPABILITY_RELATIONSHIPS);
  });

  test("detection_phase is always 1 or 3", () => {
    for (const entry of CAPABILITY_RELATIONSHIPS) {
      expect([1, 3]).toContain(entry.detection_phase);
    }
  });

  test("severity_hint and confidence stay within allowed literal unions", () => {
    const validSeverities = ["blocker", "major", "minor", "nit"];
    const validConfidences = ["high", "medium", "low"];
    for (const entry of CAPABILITY_RELATIONSHIPS) {
      expect(validSeverities).toContain(entry.severity_hint);
      expect(validConfidences).toContain(entry.confidence);
    }
  });

  test("every trigger/counterpart/exception pattern is a RegExp instance", () => {
    for (const entry of CAPABILITY_RELATIONSHIPS) {
      expect(entry.trigger.pattern).toBeInstanceOf(RegExp);
      for (const counterpart of entry.acceptable_counterparts) {
        expect(counterpart.pattern).toBeInstanceOf(RegExp);
      }
      for (const signal of entry.exception_signals) {
        expect(signal.pattern).toBeInstanceOf(RegExp);
      }
    }
  });

  test("trigger file_globs are non-empty strings for every entry", () => {
    for (const entry of CAPABILITY_RELATIONSHIPS) {
      expect(entry.trigger.file_globs.length).toBeGreaterThan(0);
      expect(
        entry.trigger.file_globs.every((g) => typeof g === "string" && g.length > 0),
      ).toBe(true);
    }
  });

  test("each entry declares at least one acceptable counterpart", () => {
    for (const entry of CAPABILITY_RELATIONSHIPS) {
      expect(entry.acceptable_counterparts.length).toBeGreaterThan(0);
    }
  });

  test("regex patterns avoid catastrophic backtracking shapes", () => {
    // Heuristic screen for classic ReDoS shapes: nested quantifiers `(x+)+`
    // or consecutive quantifiers like `**` / `++` / `*+` / `+*`.
    const suspicious = /\((?:[^()+]*[+*])\)[+*]|(?:[+*]\s*){2,}/;
    const allPatterns: Array<{ source: string; owner: string }> = [];
    for (const entry of CAPABILITY_RELATIONSHIPS) {
      allPatterns.push({
        source: entry.trigger.pattern.source,
        owner: `${entry.id}.trigger`,
      });
      entry.acceptable_counterparts.forEach((counterpart, index) => {
        allPatterns.push({
          source: counterpart.pattern.source,
          owner: `${entry.id}.acceptable_counterparts[${index}]`,
        });
      });
      entry.exception_signals.forEach((signal, index) => {
        allPatterns.push({
          source: signal.pattern.source,
          owner: `${entry.id}.exception_signals[${index}]`,
        });
      });
    }
    for (const { source, owner } of allPatterns) {
      expect({ owner, suspicious: suspicious.test(source) }).toEqual({
        owner,
        suspicious: false,
      });
    }
  });

  test("env-var rule carries Rev #8 autoinstrumentation counterparts", () => {
    const envRule = CAPABILITY_RELATIONSHIPS.find(
      (entry) => entry.id === "env-var-injection-vs-sdk-import",
    );
    expect(envRule).toBeDefined();
    expect(envRule?.acceptable_counterparts).toHaveLength(3);
    const descriptions = envRule?.acceptable_counterparts.map((c) => c.description) ?? [];
    expect(descriptions.some((d) => /SDK/i.test(d))).toBe(true);
    expect(descriptions.some((d) => /autoinstrumentation/i.test(d))).toBe(true);
    expect(descriptions.some((d) => /external agent|sidecar/i.test(d))).toBe(true);
  });

  test("config-vs-dependency-presence declares five tool→dep counterparts", () => {
    const cfg = CAPABILITY_RELATIONSHIPS.find(
      (entry) => entry.id === "config-vs-dependency-presence",
    );
    expect(cfg).toBeDefined();
    expect(cfg?.acceptable_counterparts).toHaveLength(5);
    expect(cfg?.exception_signals).toHaveLength(1);
    expect(cfg?.exception_signals[0].file_globs).toContain("**/pnpm-workspace.yaml");
  });

  test("CSP Report-Only rule is medium confidence with two exception signals (Rev #9)", () => {
    const csp = CAPABILITY_RELATIONSHIPS.find(
      (entry) => entry.id === "report-only-header-with-deferred-todo",
    );
    expect(csp?.confidence).toBe("medium");
    expect(csp?.exception_signals).toHaveLength(2);
    const sources = csp?.exception_signals.map((s) => s.pattern.source) ?? [];
    expect(sources.some((s) => /TODO|FIXME/.test(s))).toBe(true);
    expect(sources.some((s) => /20\\d\{2\}/.test(s))).toBe(true);
  });

  test("manifest and scaffold rules declare entry-level intent_required (DONT9/DONT10)", () => {
    const manifest = CAPABILITY_RELATIONSHIPS.find(
      (entry) => entry.id === "manifest-reference-vs-runtime-registration",
    );
    expect(manifest?.intent_required).toBeDefined();
    expect((manifest?.intent_required?.length ?? 0) > 0).toBe(true);

    const scaffold = CAPABILITY_RELATIONSHIPS.find(
      (entry) => entry.id === "scaffold-vs-test-green-path",
    );
    expect(scaffold?.intent_required).toBeDefined();
    expect((scaffold?.intent_required?.length ?? 0) > 0).toBe(true);
  });
});
