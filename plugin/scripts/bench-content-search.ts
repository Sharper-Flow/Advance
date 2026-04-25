#!/usr/bin/env -S node --enable-source-maps
/**
 * Content-search benchmark (P2.3).
 *
 * Decision input for: should ADV adopt MiniSearch, or is a plain linear
 * scan good enough for change titles + wisdom entries at 552-change scale?
 *
 * Acceptance bar (per design.md § KD-3):
 *   - <500ms one-time index build
 *   - <50ms p99 per query
 *
 * Run:
 *   pnpm exec tsx scripts/bench-content-search.ts
 *
 * Output: per-strategy p50/p95/p99 + index-build time.
 */

import { performance } from "node:perf_hooks";

interface BenchChange {
  id: string;
  title: string;
  body: string; // ~1KB simulated proposal.md content
}

function generateChanges(n: number): BenchChange[] {
  const tokens = [
    "auth",
    "payments",
    "billing",
    "metrics",
    "dashboard",
    "API",
    "search",
    "config",
    "migration",
    "temporal",
    "schema",
    "validation",
    "retry",
    "timeout",
    "worker",
    "activity",
    "workflow",
    "cancellation",
    "approval",
    "telemetry",
    "audit",
    "specs",
    "wisdom",
    "agenda",
    "task",
    "change",
    "gate",
    "design",
    "discovery",
    "planning",
    "execution",
    "acceptance",
    "release",
  ];
  const changes: BenchChange[] = [];
  for (let i = 0; i < n; i++) {
    const titleWords = Array.from(
      { length: 3 + (i % 4) },
      (_, k) => tokens[(i + k * 7) % tokens.length],
    );
    const title = `Refactor ${titleWords.join(" ")} ${i}`;
    // ~1KB body — realistic proposal.md size
    const bodyWords = Array.from(
      { length: 150 },
      (_, k) => tokens[(i * 13 + k) % tokens.length],
    );
    const body = `# ${title}\n\n${bodyWords.join(" ")}\n\n`;
    changes.push({ id: `chg-${i}`, title, body });
  }
  return changes;
}

interface QuerySample {
  needle: string;
  expectedMin: number; // sanity bound
}

function generateQueries(n: number): QuerySample[] {
  const needles = [
    "auth",
    "Refactor",
    "workflow",
    "TEMPORAL",
    "missing-token",
    "specs validation",
    "API config",
    "task gate",
    "release execution",
    "design discovery",
  ];
  const samples: QuerySample[] = [];
  for (let i = 0; i < n; i++) {
    samples.push({
      needle: needles[i % needles.length],
      expectedMin: 0,
    });
  }
  return samples;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[idx];
}

function summarize(label: string, durations: number[], indexMs?: number) {
  durations.sort((a, b) => a - b);
  const p50 = percentile(durations, 0.5);
  const p95 = percentile(durations, 0.95);
  const p99 = percentile(durations, 0.99);
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const idx = indexMs !== undefined ? `  index=${indexMs.toFixed(2)}ms` : "";
  console.log(
    `${label.padEnd(40)}  p50=${p50.toFixed(2)}ms  p95=${p95.toFixed(
      2,
    )}ms  p99=${p99.toFixed(2)}ms  avg=${avg.toFixed(2)}ms${idx}`,
  );
}

// =============================================================================
// Strategy A: naive linear scan (case-sensitive)
// =============================================================================

function buildStrategyA(_changes: BenchChange[]) {
  // No index — direct scan
  return _changes;
}

function searchStrategyA(data: BenchChange[], needle: string): BenchChange[] {
  return data.filter(
    (c) => c.title.includes(needle) || c.body.includes(needle),
  );
}

// =============================================================================
// Strategy B: lower-cased cache + linear scan
// =============================================================================

interface IndexedChange extends BenchChange {
  titleLower: string;
  bodyLower: string;
}

function buildStrategyB(changes: BenchChange[]): IndexedChange[] {
  return changes.map((c) => ({
    ...c,
    titleLower: c.title.toLowerCase(),
    bodyLower: c.body.toLowerCase(),
  }));
}

function searchStrategyB(data: IndexedChange[], needle: string): BenchChange[] {
  const lower = needle.toLowerCase();
  return data.filter(
    (c) => c.titleLower.includes(lower) || c.bodyLower.includes(lower),
  );
}

// =============================================================================
// Strategy C: MiniSearch (lazy-loaded so the dep isn't required if unused)
// =============================================================================

async function buildStrategyC(changes: BenchChange[]): Promise<unknown> {
  let MiniSearchClass;
  try {
    const mod = await import("minisearch");
    MiniSearchClass = mod.default ?? mod;
  } catch {
    return null;
  }
  const ms = new (MiniSearchClass as new (opts: unknown) => {
    addAll: (docs: unknown[]) => void;
    search: (q: string) => unknown[];
  })({
    fields: ["title", "body"],
    storeFields: ["id", "title"],
    idField: "id",
  });
  ms.addAll(changes);
  return ms;
}

function searchStrategyC(index: unknown, needle: string): unknown[] {
  if (!index) return [];
  return (
    index as {
      search: (q: string) => unknown[];
    }
  ).search(needle);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const N = 552;
  const Q = 1000; // query iterations
  const changes = generateChanges(N);
  const queries = generateQueries(Q);

  console.log(`\n# Content Search Benchmark (P2.3)`);
  console.log(`#   changes: ${N}`);
  console.log(`#   queries: ${Q}`);
  console.log(`#   target:  index <500ms, p99 query <50ms\n`);

  // Strategy A: naive linear (case-sensitive)
  const aIdxStart = performance.now();
  const aIdx = buildStrategyA(changes);
  const aIndexMs = performance.now() - aIdxStart;
  const aDurations: number[] = [];
  for (const q of queries) {
    const t = performance.now();
    searchStrategyA(aIdx, q.needle);
    aDurations.push(performance.now() - t);
  }
  summarize("A: naive linear (case-sensitive)", aDurations, aIndexMs);

  // Strategy B: lower-cased cache + linear (case-insensitive)
  const bIdxStart = performance.now();
  const bIdx = buildStrategyB(changes);
  const bIndexMs = performance.now() - bIdxStart;
  const bDurations: number[] = [];
  for (const q of queries) {
    const t = performance.now();
    searchStrategyB(bIdx, q.needle);
    bDurations.push(performance.now() - t);
  }
  summarize("B: lower-cased linear (CI)", bDurations, bIndexMs);

  // Strategy C: MiniSearch
  const cIdxStart = performance.now();
  const cIdx = await buildStrategyC(changes);
  const cIndexMs = performance.now() - cIdxStart;
  if (cIdx === null) {
    console.log(
      `C: MiniSearch                               <unavailable — dep not installed>`,
    );
  } else {
    const cDurations: number[] = [];
    for (const q of queries) {
      const t = performance.now();
      searchStrategyC(cIdx, q.needle);
      cDurations.push(performance.now() - t);
    }
    summarize("C: MiniSearch", cDurations, cIndexMs);
  }

  console.log(`\n# Decision rule:`);
  console.log(
    `#   If A or B p99 < 50ms AND index < 500ms → ship that, skip MiniSearch dep`,
  );
  console.log(`#   Otherwise → adopt MiniSearch (Strategy C)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
