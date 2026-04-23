export interface StorageBenchmarkRow {
  candidate: string;
  operation: string;
  p50_ms: number;
  p95_ms: number;
  notes?: string;
}

export interface StorageTradeoff {
  candidate: string;
  strengths: string[];
  risks: string[];
}

export interface StorageComparisonInput {
  title: string;
  metadata: Record<string, string | number | boolean | null>;
  benchmarks: StorageBenchmarkRow[];
  tradeoffs: StorageTradeoff[];
}

function fmt(value: string | number | boolean | null): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return value ?? "null";
}

function ms(value: number): string {
  return value.toFixed(1);
}

export function renderStorageComparisonReport(
  input: StorageComparisonInput,
): string {
  const metadata = Object.entries(input.metadata)
    .map(([key, value]) => `- ${key}: ${fmt(value)}`)
    .join("\n");
  const benchmarkRows = input.benchmarks
    .map(
      (row) =>
        `| ${row.candidate} | ${row.operation} | ${ms(row.p50_ms)} | ${ms(row.p95_ms)} | ${row.notes ?? ""} |`,
    )
    .join("\n");
  const tradeoffBlocks = input.tradeoffs
    .map(
      (tradeoff) =>
        `### ${tradeoff.candidate}\n- Strengths: ${tradeoff.strengths.join("; ")}\n- Risks: ${tradeoff.risks.join("; ")}`,
    )
    .join("\n\n");

  return [
    `# ${input.title}`,
    "",
    "## Metadata",
    metadata,
    "",
    "## Benchmarks",
    "| Candidate | Operation | p50 | p95 | Notes |",
    "| --- | --- | ---: | ---: | --- |",
    benchmarkRows,
    "",
    "## Tradeoffs",
    tradeoffBlocks,
    "",
  ].join("\n");
}
