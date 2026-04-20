/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the cutover decision is made.
 * This module only computes benchmark math and budget comparison; the real
 * workload loop lives in the validation orchestrator.
 */

export interface Percentiles {
  p50: number;
  p95: number;
  p99: number;
}

export interface LatencyRatioInput {
  taskUpdate: { legacyP95: number; temporalP95: number };
  changeGet: { legacyP95: number; temporalP95: number };
  gateComplete: { legacyP95: number; temporalP95: number };
}

export interface LatencyBudgetResult {
  pass: boolean;
  ratios: {
    taskUpdate: number;
    changeGet: number;
    gateComplete: number;
  };
  failedOps: Array<keyof LatencyRatioInput>;
}

export function discardWarmup(
  samples: number[],
  warmupCount: number,
): number[] {
  return samples.slice(Math.max(0, warmupCount));
}

export function computePercentiles(samples: number[]): Percentiles {
  if (samples.length === 0) {
    return { p50: 0, p95: 0, p99: 0 };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (pct: number): number => {
    const idx = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1),
    );
    return sorted[idx] ?? 0;
  };

  return {
    p50: pick(50),
    p95: pick(95),
    p99: pick(99),
  };
}

export function compareLatencyBudgets(
  input: LatencyRatioInput,
): LatencyBudgetResult {
  const ratios = {
    taskUpdate: ratio(input.taskUpdate.temporalP95, input.taskUpdate.legacyP95),
    changeGet: ratio(input.changeGet.temporalP95, input.changeGet.legacyP95),
    gateComplete: ratio(
      input.gateComplete.temporalP95,
      input.gateComplete.legacyP95,
    ),
  };

  const failedOps = (
    Object.entries(ratios) as Array<[keyof LatencyRatioInput, number]>
  )
    .filter(([, value]) => value > 2)
    .map(([key]) => key);

  return {
    pass: failedOps.length === 0,
    ratios,
    failedOps,
  };
}

function ratio(temporal: number, legacy: number): number {
  if (legacy <= 0) {
    return temporal > 0 ? Number.POSITIVE_INFINITY : 1;
  }
  return temporal / legacy;
}
