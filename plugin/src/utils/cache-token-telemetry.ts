export interface CacheTokenSample {
  input_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

export interface CacheTokenTelemetry {
  sample_count: number;
  total_input_tokens: number;
  total_cache_read_tokens: number;
  total_cache_write_tokens: number;
  samples: CacheTokenSample[];
}

/** Bounded, numeric-only samples prevent prompt/argument retention. */
export const CACHE_TOKEN_SAMPLE_LIMIT = 100;

let telemetry: CacheTokenTelemetry = emptyTelemetry();

function emptyTelemetry(): CacheTokenTelemetry {
  return {
    sample_count: 0,
    total_input_tokens: 0,
    total_cache_read_tokens: 0,
    total_cache_write_tokens: 0,
    samples: [],
  };
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Capture the normalized numeric token fields emitted for one generation step.
 * This is deliberately fail-open: unexpected event payloads return false and
 * cannot affect the host event hook or tool execution.
 */
export function recordStepFinishTokens(part: unknown): boolean {
  try {
    if (!part || typeof part !== "object") return false;
    const candidate = part as {
      type?: unknown;
      tokens?: { input?: unknown; cache?: { read?: unknown; write?: unknown } };
    };
    if (candidate.type !== "step-finish") return false;

    const input = candidate.tokens?.input;
    const cacheRead = candidate.tokens?.cache?.read;
    const cacheWrite = candidate.tokens?.cache?.write;
    if (
      !isNonNegativeFiniteNumber(input) ||
      !isNonNegativeFiniteNumber(cacheRead) ||
      !isNonNegativeFiniteNumber(cacheWrite)
    ) {
      return false;
    }

    const sample: CacheTokenSample = {
      input_tokens: input,
      cache_read_tokens: cacheRead,
      cache_write_tokens: cacheWrite,
    };
    telemetry.sample_count++;
    telemetry.total_input_tokens += sample.input_tokens;
    telemetry.total_cache_read_tokens += sample.cache_read_tokens;
    telemetry.total_cache_write_tokens += sample.cache_write_tokens;
    telemetry.samples.push(sample);
    if (telemetry.samples.length > CACHE_TOKEN_SAMPLE_LIMIT) {
      telemetry.samples.splice(
        0,
        telemetry.samples.length - CACHE_TOKEN_SAMPLE_LIMIT,
      );
    }
    return true;
  } catch {
    return false;
  }
}

/** Return a defensive, numeric-only snapshot for health rendering. */
export function getCacheTokenTelemetry(): CacheTokenTelemetry {
  return {
    ...telemetry,
    samples: telemetry.samples.map((sample) => ({ ...sample })),
  };
}

/** Test and plugin-init reset. No telemetry persists across sessions. */
export function resetCacheTokenTelemetry(): void {
  telemetry = emptyTelemetry();
}
