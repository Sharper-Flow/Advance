/**
 * status-execution
 *
 * Request-local bounded health execution primitive.
 *
 * Owns the complete lifecycle for a single `adv_status view:"health"` call:
 *   - 8,000 ms response deadline
 *   - 7,500 ms execution cutoff
 *   - 500 ms composition reserve
 *   - max 4 concurrent read-only providers
 *   - static source ordering
 *   - dependency-aware immediate degradation
 *   - abortable vs bounded-non-cancellable providers
 *   - six typed outcomes: ok, stale, timeout, error, unavailable, not_admitted
 *
 * All time, timers, and signals are injected so tests can run deterministically
 * with fake schedulers.
 */

export type HealthProviderCancellability =
  | "abortable"
  | "bounded_non_cancellable";

export type HealthProviderOutcome =
  | { kind: "ok"; value: unknown; elapsedMs: number; evidence?: string }
  | { kind: "stale"; value: unknown; elapsedMs: number; evidence?: string }
  | { kind: "timeout"; elapsedMs: number; evidence: string }
  | { kind: "error"; elapsedMs: number; evidence: string }
  | { kind: "unavailable"; elapsedMs: number; evidence: string }
  | { kind: "not_admitted"; elapsedMs: number; evidence: string };

export interface Clock {
  now(): number;
}

export interface TimerService {
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export interface HealthProviderContext {
  clock: Clock;
  timer: TimerService;
  signal: AbortSignal;
  startTime: number;
  cutoffTime: number;
  deadlineTime: number;
}

export interface HealthProviderDescriptor {
  source: string;
  dependencies: ReadonlyArray<string>;
  cap: number;
  cancellability: HealthProviderCancellability;
  run: (ctx: HealthProviderContext) => Promise<HealthProviderOutcome>;
}

export interface HealthExecutionPlanConfig {
  responseDeadlineMs: number;
  executionCutoffMs: number;
  compositionReserveMs: number;
  maxConcurrency: number;
  providers: ReadonlyArray<HealthProviderDescriptor>;
  clock: Clock;
  timer: TimerService;
  requestSignal?: AbortSignal;
  /** Absolute request timestamps let status loading and providers share one budget. */
  requestStartTime?: number;
  cutoffTime?: number;
  deadlineTime?: number;
}

export interface HealthExecutionMeta {
  responseDeadlineMs: number;
  executionCutoffMs: number;
  compositionReserveMs: number;
  maxConcurrency: number;
  complete: boolean;
  degraded: boolean;
  elapsedMs: number;
}

export interface HealthExecutionResult {
  outcomes: Record<string, HealthProviderOutcome>;
  meta: HealthExecutionMeta;
}

function timeoutOutcome(
  evidence: string,
  elapsedMs: number,
): HealthProviderOutcome {
  return { kind: "timeout", elapsedMs, evidence };
}

function errorOutcome(err: unknown, elapsedMs: number): HealthProviderOutcome {
  const evidence = err instanceof Error ? err.message : String(err);
  return { kind: "error", elapsedMs, evidence };
}

function notAdmittedOutcome(
  evidence: string,
  elapsedMs: number,
): HealthProviderOutcome {
  return { kind: "not_admitted", elapsedMs, evidence };
}

function normalizeOutcome(
  raw: unknown,
  elapsedMs: number,
): HealthProviderOutcome {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const kind = r.kind;
    if (kind === "ok" || kind === "stale") {
      return {
        kind,
        value: r.value,
        elapsedMs,
        evidence: typeof r.evidence === "string" ? r.evidence : undefined,
      };
    }
    if (
      kind === "timeout" ||
      kind === "error" ||
      kind === "unavailable" ||
      kind === "not_admitted"
    ) {
      return {
        kind,
        elapsedMs,
        evidence: typeof r.evidence === "string" ? r.evidence : "unknown",
      };
    }
  }
  return { kind: "ok", value: raw, elapsedMs };
}

function composeRequestSignal(
  requestSignal: AbortSignal | undefined,
  perProvider: AbortController,
): AbortSignal {
  if (!requestSignal || requestSignal.aborted) {
    if (requestSignal?.aborted) {
      perProvider.abort();
    }
    return perProvider.signal;
  }

  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([requestSignal, perProvider.signal]);
  }

  const onRequestAbort = () => perProvider.abort();
  requestSignal.addEventListener("abort", onRequestAbort, { once: true });
  perProvider.signal.addEventListener(
    "abort",
    () => requestSignal.removeEventListener("abort", onRequestAbort),
    { once: true },
  );
  return perProvider.signal;
}

export async function executeHealthPlan(
  config: HealthExecutionPlanConfig,
): Promise<HealthExecutionResult> {
  const startTime = config.requestStartTime ?? config.clock.now();
  const cutoffTime = config.cutoffTime ?? startTime + config.executionCutoffMs;
  const deadlineTime =
    config.deadlineTime ?? startTime + config.responseDeadlineMs;

  const outcomes: Record<string, HealthProviderOutcome> = {};
  const running = new Set<string>();
  const pending = [...config.providers];
  const capTimers = new Map<string, number>();
  const abortControllers = new Map<string, AbortController>();

  let doneResolver: (() => void) | undefined;
  const done = new Promise<void>((resolve) => {
    doneResolver = resolve;
  });

  let cutoffTimer: number | undefined;
  let deadlineTimer: number | undefined;

  function finish(): void {
    if (cutoffTimer !== undefined) {
      config.timer.clearTimeout(cutoffTimer);
      cutoffTimer = undefined;
    }
    if (deadlineTimer !== undefined) {
      config.timer.clearTimeout(deadlineTimer);
      deadlineTimer = undefined;
    }
    for (const timer of capTimers.values()) {
      config.timer.clearTimeout(timer);
    }
    capTimers.clear();
    abortControllers.clear();
    if (doneResolver) {
      doneResolver();
      doneResolver = undefined;
    }
  }

  function setOutcome(source: string, outcome: HealthProviderOutcome): void {
    if (outcomes[source] !== undefined) return;
    outcomes[source] = outcome;
    running.delete(source);
    const timer = capTimers.get(source);
    if (timer !== undefined) {
      config.timer.clearTimeout(timer);
      capTimers.delete(source);
    }
  }

  function startProvider(provider: HealthProviderDescriptor): void {
    running.add(provider.source);
    const providerStart = config.clock.now();

    const controller = new AbortController();
    abortControllers.set(provider.source, controller);

    const ctx: HealthProviderContext = {
      clock: config.clock,
      timer: config.timer,
      signal: composeRequestSignal(config.requestSignal, controller),
      startTime,
      cutoffTime,
      deadlineTime,
    };

    const capTimer = config.timer.setTimeout(() => {
      if (provider.cancellability === "abortable") {
        controller.abort();
      }
      setOutcome(
        provider.source,
        timeoutOutcome("cap", Math.max(0, config.clock.now() - providerStart)),
      );
      config.timer.setTimeout(() => scheduleNext(), 0);
    }, provider.cap);
    capTimers.set(provider.source, capTimer);

    provider
      .run(ctx)
      .then((raw) => {
        if (outcomes[provider.source] !== undefined) return;
        const elapsed = Math.max(0, config.clock.now() - providerStart);
        setOutcome(provider.source, normalizeOutcome(raw, elapsed));
      })
      .catch((err) => {
        if (outcomes[provider.source] !== undefined) return;
        const elapsed = Math.max(0, config.clock.now() - providerStart);
        setOutcome(provider.source, errorOutcome(err, elapsed));
      })
      .finally(() => {
        abortControllers.delete(provider.source);
        config.timer.setTimeout(() => scheduleNext(), 0);
      });
  }

  function scheduleNext(): void {
    const now = config.clock.now();

    if (now >= cutoffTime) {
      // Cutoff reached: nothing new starts, running work degrades to timeout,
      // pending work is not admitted.
      while (pending.length > 0) {
        const p = pending.shift()!;
        setOutcome(
          p.source,
          notAdmittedOutcome("execution cutoff", now - startTime),
        );
      }
      for (const source of [...running]) {
        const controller = abortControllers.get(source);
        if (controller) {
          // Bounded non-cancellable providers are detached, not aborted.
          const provider = config.providers.find((p) => p.source === source);
          if (provider?.cancellability === "abortable") {
            controller.abort();
          }
        }
        setOutcome(source, timeoutOutcome("execution cutoff", now - startTime));
      }
      finish();
      return;
    }

    while (running.size < config.maxConcurrency && pending.length > 0) {
      const readyIndex = pending.findIndex((p) =>
        p.dependencies.every((dep) => outcomes[dep] !== undefined),
      );
      if (readyIndex === -1) break;

      const provider = pending.splice(readyIndex, 1)[0];

      const badDependency = provider.dependencies.find((dep) => {
        const depOutcome = outcomes[dep]!;
        return depOutcome.kind !== "ok" && depOutcome.kind !== "stale";
      });

      if (badDependency) {
        setOutcome(
          provider.source,
          notAdmittedOutcome(
            `dependency ${badDependency} not usable`,
            now - startTime,
          ),
        );
        continue;
      }

      startProvider(provider);
    }

    if (pending.length === 0 && running.size === 0) {
      finish();
    }
  }

  cutoffTimer = config.timer.setTimeout(
    () => {
      scheduleNext();
    },
    Math.max(0, cutoffTime - config.clock.now()),
  );

  deadlineTimer = config.timer.setTimeout(
    () => {
      // Final guard: force finish at the absolute response deadline.
      for (const p of [...pending]) {
        setOutcome(
          p.source,
          notAdmittedOutcome(
            "response deadline",
            config.clock.now() - startTime,
          ),
        );
        const idx = pending.indexOf(p);
        if (idx >= 0) pending.splice(idx, 1);
      }
      for (const source of [...running]) {
        setOutcome(
          source,
          timeoutOutcome("response deadline", config.clock.now() - startTime),
        );
      }
      finish();
    },
    Math.max(0, deadlineTime - config.clock.now()),
  );

  // Begin execution synchronously.
  scheduleNext();

  await done;

  // Reduce in static descriptor order.
  const orderedOutcomes: Record<string, HealthProviderOutcome> = {};
  for (const provider of config.providers) {
    orderedOutcomes[provider.source] =
      outcomes[provider.source] ??
      notAdmittedOutcome("not processed", config.clock.now() - startTime);
  }

  const elapsed = config.clock.now() - startTime;
  const complete = config.providers.every((p) => {
    const o = orderedOutcomes[p.source];
    return o.kind === "ok" || o.kind === "stale";
  });

  return {
    outcomes: orderedOutcomes,
    meta: {
      responseDeadlineMs: config.responseDeadlineMs,
      executionCutoffMs: config.executionCutoffMs,
      compositionReserveMs: config.compositionReserveMs,
      maxConcurrency: config.maxConcurrency,
      complete,
      degraded: !complete,
      elapsedMs: elapsed,
    },
  };
}
