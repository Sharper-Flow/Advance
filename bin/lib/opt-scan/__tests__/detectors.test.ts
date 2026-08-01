/**
 * Integration tests for the four V1 opt-scan detectors.
 *
 * Each detector has a paired POSITIVE and NEGATIVE fixture under
 * `fixtures/`. POSITIVE fixtures MUST emit exactly one static candidate with
 * file:line trigger evidence and family-specific supporting evidence.
 * NEGATIVE fixtures MUST emit zero candidates.
 */
import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";

import { runOptScan } from "../scan";
import {
  OPTIMIZATION_DETECTORS,
  findOptimizationDetector,
} from "../registry";
import { validateOptimizationCandidate } from "../schema";

const HERE = dirname(fileURLToPath(import.meta.url));

function fixturePath(name: string): string {
  return join(HERE, "fixtures", name);
}

const FIXTURES = {
  repeated_boundary_work: {
    positive: fixturePath("repeated-boundary-work-positive"),
    negative: fixturePath("repeated-boundary-work-negative"),
  },
  avoidable_collection_work: {
    positive: fixturePath("avoidable-collection-work-positive"),
    negative: fixturePath("avoidable-collection-work-negative"),
  },
  worker_startup_pressure: {
    positive: fixturePath("worker-startup-pressure-positive"),
    negative: fixturePath("worker-startup-pressure-negative"),
  },
  cache_opportunity: {
    positive: fixturePath("cache-opportunity-positive"),
    negative: fixturePath("cache-opportunity-negative"),
  },
} as const;

describe("opt-scan V1 detectors", () => {
  test("registry ships exactly the four documented detector families", () => {
    const ids = OPTIMIZATION_DETECTORS.map((d) => d.id).sort();
    expect(ids).toEqual([
      "avoidable_collection_work",
      "cache_opportunity",
      "repeated_boundary_work",
      "worker_startup_pressure",
    ]);
  });

  test("all detectors are Phase 1 static advisory detectors", () => {
    for (const detector of OPTIMIZATION_DETECTORS) {
      expect(detector.detection_phase).toBe(1);
      expect(detector.signal_class).toBe("static");
    }
  });

  describe("repeated_boundary_work", () => {
    const id = "repeated_boundary_work";

    test("registry entry is static, Phase 1, minor, medium", () => {
      const entry = findOptimizationDetector(id);
      expect(entry).toBeDefined();
      expect(entry!.signal_class).toBe("static");
      expect(entry!.detection_phase).toBe(1);
      expect(entry!.severity_hint).toBe("minor");
      expect(entry!.confidence).toBe("medium");
    });

    test("POSITIVE fixture emits a candidate with trigger + loop scope evidence", async () => {
      const result = await runOptScan({
        repoRoot: FIXTURES[id].positive,
        detectorId: id,
        phase: 1,
      });

      expect(result.coverage).toHaveLength(1);
      expect(result.coverage[0].state).toBe("run");
      expect(result.candidates).toHaveLength(1);

      const candidate = result.candidates[0];
      const validation = validateOptimizationCandidate(candidate);
      expect(validation.ok).toBe(true);
      expect(validation.issues).toEqual([]);

      expect(candidate.detector_id).toBe(id);
      expect(candidate.signal_class).toBe("static");
      expect(candidate.severity).toBe("minor");
      expect(candidate.confidence).toBe("medium");
      expect(candidate.detection_method).toBe("regex");
      expect(candidate.false_positive_caveat.length).toBeGreaterThan(0);
      expect(candidate.verification_needed.length).toBeGreaterThan(0);

      const trigger = candidate.evidence.find((e) => e.role === "trigger");
      expect(trigger).toBeDefined();
      expect(trigger!.file).toBe("src/api.ts");
      expect(typeof trigger!.line).toBe("number");
      expect(trigger!.line).toBeGreaterThan(0);

      const scope = candidate.evidence.find((e) => e.role === "scope");
      expect(scope).toBeDefined();
      expect(scope!.file).toBe("src/api.ts");
    });

    test("NEGATIVE fixture emits zero candidates", async () => {
      const result = await runOptScan({
        repoRoot: FIXTURES[id].negative,
        detectorId: id,
        phase: 1,
      });

      expect(result.candidates).toHaveLength(0);
      expect(result.coverage).toHaveLength(1);
      expect(result.coverage[0].state).toBe("run");
    });
  });

  describe("avoidable_collection_work", () => {
    const id = "avoidable_collection_work";

    test("POSITIVE fixture emits a candidate for chained transformations", async () => {
      const result = await runOptScan({
        repoRoot: FIXTURES[id].positive,
        detectorId: id,
        phase: 1,
      });

      expect(result.candidates).toHaveLength(1);
      const candidate = result.candidates[0];
      expect(candidate.detector_id).toBe(id);
      expect(candidate.signal_class).toBe("static");
      expect(candidate.expected_cost_shape.family).toBe(id);
      expect(candidate.expected_cost_shape.pattern).toBe("collection");

      const trigger = candidate.evidence.find((e) => e.role === "trigger");
      expect(trigger).toBeDefined();
      expect(trigger!.file).toBe("src/summarize.ts");
    });

    test("NEGATIVE fixture emits zero candidates", async () => {
      const result = await runOptScan({
        repoRoot: FIXTURES[id].negative,
        detectorId: id,
        phase: 1,
      });

      expect(result.candidates).toHaveLength(0);
    });
  });

  describe("worker_startup_pressure", () => {
    const id = "worker_startup_pressure";

    test("POSITIVE fixture emits a candidate for top-level sync I/O in worker file", async () => {
      const result = await runOptScan({
        repoRoot: FIXTURES[id].positive,
        detectorId: id,
        phase: 1,
      });

      expect(result.candidates).toHaveLength(1);
      const candidate = result.candidates[0];
      expect(candidate.detector_id).toBe(id);
      expect(candidate.signal_class).toBe("static");
      expect(candidate.severity).toBe("major");
      expect(candidate.expected_cost_shape.pattern).toBe("startup");

      const trigger = candidate.evidence.find((e) => e.role === "trigger");
      expect(trigger).toBeDefined();
      expect(trigger!.file).toBe("src/worker.ts");
    });

    test("NEGATIVE fixture emits zero candidates", async () => {
      const result = await runOptScan({
        repoRoot: FIXTURES[id].negative,
        detectorId: id,
        phase: 1,
      });

      expect(result.candidates).toHaveLength(0);
    });

    test("startup file detection uses the file basename, not the parent directory path", async () => {
      const result = await runOptScan({
        repoRoot: join(HERE, "fixtures"),
        detectorId: id,
        phase: 1,
      });

      expect(result.candidates).toHaveLength(1);
      const trigger = result.candidates[0].evidence.find(
        (e) => e.role === "trigger",
      );
      expect(trigger).toBeDefined();
      expect(trigger!.file).toBe("worker-startup-pressure-positive/src/worker.ts");
    });

    test("rejects sync I/O inside function and class bodies in a worker file", async () => {
      const tmp = mkdtempSync(join(tmpdir(), "opt-scan-worker-body-"));
      try {
        mkdirSync(join(tmp, "src"), { recursive: true });
        writeFileSync(
          join(tmp, "src", "worker.ts"),
          `import { readFileSync } from "fs";
export function loadConfig() {
  return JSON.parse(readFileSync("./config.json", "utf8"));
}
export class Worker {
  loadConfig() {
    return JSON.parse(readFileSync("./config.json", "utf8"));
  }
}
`,
        );

        const result = await runOptScan({
          repoRoot: tmp,
          detectorId: id,
          phase: 1,
        });

        expect(result.candidates).toHaveLength(0);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe("cache_opportunity", () => {
    const id = "cache_opportunity";

    test("registry entry is low-confidence static cache detector", () => {
      const entry = findOptimizationDetector(id);
      expect(entry).toBeDefined();
      expect(entry!.signal_class).toBe("static");
      expect(entry!.confidence).toBe("low");
    });

    test("POSITIVE fixture emits a candidate with identity, ownership, and invalidation evidence", async () => {
      const result = await runOptScan({
        repoRoot: FIXTURES[id].positive,
        detectorId: id,
        phase: 1,
      });

      expect(result.candidates).toHaveLength(1);
      const candidate = result.candidates[0];
      expect(candidate.detector_id).toBe(id);
      expect(candidate.signal_class).toBe("static");
      expect(candidate.confidence).toBe("low");
      expect(candidate.expected_cost_shape.pattern).toBe("cache_miss");

      expect(
        candidate.evidence.some((e) => e.role === "trigger"),
      ).toBe(true);
      expect(
        candidate.evidence.some((e) => e.role === "scope"),
      ).toBe(true);
      expect(
        candidate.evidence.some((e) => e.role === "ownership"),
      ).toBe(true);
      expect(
        candidate.evidence.some((e) => e.role === "invalidation"),
      ).toBe(true);
    });

    test("NEGATIVE fixture rejects unclear cache case", async () => {
      const result = await runOptScan({
        repoRoot: FIXTURES[id].negative,
        detectorId: id,
        phase: 1,
      });

      expect(result.candidates).toHaveLength(0);
    });

    test("rejects a cache with identity and ownership but no invalidation policy", async () => {
      const result = await runOptScan({
        repoRoot: fixturePath("cache-opportunity-no-invalidation"),
        detectorId: id,
        phase: 1,
      });

      expect(result.candidates).toHaveLength(0);
    });

    test("rejects metadata and standalone TTL text as cache invalidation evidence", async () => {
      const tmp = mkdtempSync(join(tmpdir(), "opt-scan-cache-version-"));
      try {
        mkdirSync(join(tmp, "src"), { recursive: true });
        writeFileSync(
          join(tmp, "src", "calculator.ts"),
          `export class Calculator {
  private cache = new Map<string, number>();
  private version = 1;
  private ttl = 60_000;

  compute(input: number): number {
    const key = String(input);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const result = input * input;
    this.cache.set(key, result);
    return result;
  }
}
`,
        );

        const result = await runOptScan({
          repoRoot: tmp,
          detectorId: id,
          phase: 1,
        });

        expect(result.candidates).toHaveLength(0);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  test("skips test artifact files and directories during collection", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "opt-scan-test-artifacts-"));
    try {
      mkdirSync(join(tmp, "src"), { recursive: true });
      mkdirSync(join(tmp, "src", "__tests__"), { recursive: true });
      writeFileSync(
        join(tmp, "src", "worker.ts"),
        `import { readFileSync } from "fs";\nconst config = JSON.parse(readFileSync("./config.json", "utf8"));\nexport function startWorker(): void { console.log(config); }\n`,
      );
      writeFileSync(
        join(tmp, "src", "foo.test.ts"),
        `import { readFileSync } from "fs";\nconst config = JSON.parse(readFileSync("./config.json", "utf8"));\nexport function testStartup(): void { console.log(config); }\n`,
      );
      writeFileSync(
        join(tmp, "src", "__tests__", "x.ts"),
        `import { readFileSync } from "fs";\nconst config = JSON.parse(readFileSync("./config.json", "utf8"));\nexport function helper(): void { console.log(config); }\n`,
      );

      const result = await runOptScan({
        repoRoot: tmp,
        detectorId: "worker_startup_pressure",
        phase: 1,
      });

      expect(result.candidates).toHaveLength(1);
      const trigger = result.candidates[0].evidence.find(
        (e) => e.role === "trigger",
      );
      expect(trigger?.file).toBe("src/worker.ts");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
