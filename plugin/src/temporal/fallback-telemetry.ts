export interface FallbackCounts {
  changes: number;
  tasks: number;
  wisdom: number;
  gates: number;
}

const fallbackCounts: FallbackCounts = {
  changes: 0,
  tasks: 0,
  wisdom: 0,
  gates: 0,
};

export function incrementFallbackCount(domain: keyof FallbackCounts): void {
  fallbackCounts[domain] += 1;
}

export function getTemporalFallbackTelemetry(): FallbackCounts {
  return { ...fallbackCounts };
}

export function resetTemporalFallbackTelemetry(): void {
  fallbackCounts.changes = 0;
  fallbackCounts.tasks = 0;
  fallbackCounts.wisdom = 0;
  fallbackCounts.gates = 0;
}
