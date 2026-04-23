import { performance } from "node:perf_hooks";

export interface LatencyStats {
  count: number;
  min_ms: number;
  p50_ms: number;
  p95_ms: number;
  max_ms: number;
  avg_ms: number;
}

export interface LatencyMeasurement {
  label: string;
  samples_ms?: number[];
  stats: LatencyStats;
}

export interface LatencyReportInput {
  title: string;
  metadata: Record<string, string | number | boolean | null>;
  operations: LatencyMeasurement[];
}

export function discardWarmup(values: number[], warmupCount: number): number[] {
  if (warmupCount <= 0) return [...values];
  return values.slice(Math.min(values.length, warmupCount));
}

export function computeLatencyStats(values: number[]): LatencyStats {
  if (values.length === 0) {
    return {
      count: 0,
      min_ms: 0,
      p50_ms: 0,
      p95_ms: 0,
      max_ms: 0,
      avg_ms: 0,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const pick = (pct: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * pct))] ?? 0;
  const avg = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;

  return {
    count: sorted.length,
    min_ms: sorted[0] ?? 0,
    p50_ms: pick(0.5),
    p95_ms: pick(0.95),
    max_ms: sorted[sorted.length - 1] ?? 0,
    avg_ms: avg,
  };
}

export async function runTimedSamples(
  label: string,
  op: () => Promise<void>,
  iterations = 10,
  warmupCount = 2,
): Promise<LatencyMeasurement> {
  const samples: number[] = [];

  for (let i = 0; i < iterations; i += 1) {
    const startedAt = performance.now();
    await op();
    samples.push(performance.now() - startedAt);
  }

  const trimmed = discardWarmup(samples, warmupCount);
  return {
    label,
    samples_ms: trimmed,
    stats: computeLatencyStats(trimmed),
  };
}

function formatValue(value: string | number | boolean | null): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return value ?? "null";
}

function fmt(ms: number): string {
  return ms.toFixed(1);
}

export function renderLatencyReport(input: LatencyReportInput): string {
  const metaLines = Object.entries(input.metadata)
    .map(([key, value]) => `- ${key}: ${formatValue(value)}`)
    .join("\n");
  const rows = input.operations
    .map(
      (op) =>
        `| ${op.label} | ${op.stats.count} | ${fmt(op.stats.min_ms)} | ${fmt(op.stats.p50_ms)} | ${fmt(op.stats.p95_ms)} | ${fmt(op.stats.max_ms)} | ${fmt(op.stats.avg_ms)} |`,
    )
    .join("\n");

  return [
    `# ${input.title}`,
    "",
    "## Metadata",
    metaLines,
    "",
    "## Operations",
    "| Operation | Samples | min | p50 | p95 | max | avg |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    rows,
    "",
  ].join("\n");
}
