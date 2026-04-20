/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the cutover decision is made.
 * This module only computes memory-budget math; the real sampling loop lives in
 * the validation orchestrator.
 */

export interface MemoryBudgetResult {
  pass: boolean;
  peakRssBytes: number;
  budgetBytes: number;
  excessBytes: number;
}

export function computePeakRss(samples: number[]): number {
  return samples.length === 0 ? 0 : Math.max(...samples);
}

export function computeSteadyStateBaseline(samples: number[]): number {
  return samples[0] ?? 0;
}

export function compareMemoryBudget(input: {
  peakRssBytes: number;
  budgetBytes: number;
}): MemoryBudgetResult {
  const excessBytes = Math.max(0, input.peakRssBytes - input.budgetBytes);
  return {
    pass: excessBytes === 0,
    peakRssBytes: input.peakRssBytes,
    budgetBytes: input.budgetBytes,
    excessBytes,
  };
}
