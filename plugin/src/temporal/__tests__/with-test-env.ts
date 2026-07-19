import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TestWorkflowEnvironment } from "@temporalio/testing";

/**
 * Shared harness for Temporal test environments.
 *
 * `TestWorkflowEnvironment.createLocal()` / `createTimeSkipping()` spawns a
 * `/tmp/temporal-test-server-sdk-typescript-*` child process. Without a
 * `teardown` call that child leaks — a single afternoon of dev runs left 565+
 * zombie processes on the host that motivated
 * `fixTemporalWorkerBundleFailure` Phase 1.4.
 *
 * This helper wraps the env lifecycle in a `try/finally` block so every
 * call site drains the server regardless of whether the test body throws.
 *
 * Error-propagation caveat: this module propagates any error thrown across
 * the `teardown()` call boundary, but the SDK's own
 * `TestWorkflowEnvironment.teardown()` catches, logs (`console.error`), and
 * swallows its internal connection-close / server-shutdown failures (verified
 * in @temporalio/testing v1.17.x `lib/testing-workflow-environment.js`). A
 * broken SDK-internal shutdown therefore surfaces only as SDK log output, not
 * a test failure — the `try/finally` here is the only teardown guarantee we
 * control. Known upstream caveats: temporalio/sdk-typescript#1443 (startup
 * failure skips shutdown), #1394 (ephemeral-server kill hangs), #2068
 * (native-resource teardown races).
 */
export interface TestEnvironmentLike {
  teardown: () => Promise<void>;
}

/**
 * A worker-like object whose lifecycle the harness can own. Only objects the
 * caller explicitly hands to `context.registerWorker(...)` qualify — the
 * harness never infers workers from inside `fn` (no undisclosed-worker
 * inference). `shutdown()` must be idempotent; the harness may invoke it
 * after the worker's own settlement path (e.g. an awaited `runUntil`) has
 * already returned.
 */
export interface SettleableWorker {
  shutdown: () => Promise<void>;
}

export interface TemporalTestContext {
  signal: AbortSignal;
  /**
   * Disclose a worker to the harness so its `shutdown()` is awaited before
   * env teardown. The contract: registered workers are settled first; env
   * teardown runs only after every registered worker has finished shutting
   * down. If `fn` throws and a registered worker's `shutdown()` then also
   * throws, the callback error remains the primary failure and the
   * shutdown error is attached as secondary evidence (see `TEARDOWN_ERROR`).
   */
  registerWorker: (worker: SettleableWorker) => void;
}

export interface WithTestWorkflowEnvironmentOptions {
  signal?: AbortSignal;
}

/**
 * Secondary teardown-error marker attached to the primary callback error when
 * both the test callback and environment teardown fail. Keeps the original
 * failure actionable while preserving teardown evidence for debugging.
 */
export const TEARDOWN_ERROR: unique symbol = Symbol.for(
  "advance:teardownError",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any;

function getStableTemporalTestCwd(): string {
  return join(tmpdir(), "advance-temporal-test-cwd");
}

export async function createTestWorkflowEnvironment<TEnv>(
  createEnv: () => Promise<TEnv>,
): Promise<TEnv> {
  const originalCwd = process.cwd();
  const stableCwd = getStableTemporalTestCwd();
  await mkdir(stableCwd, { recursive: true });

  try {
    process.chdir(stableCwd);
    return await createEnv();
  } finally {
    process.chdir(originalCwd);
  }
}

/**
 * Create a test environment, run the provided function with it, and always
 * tear down.
 *
 * - On success: returns `fn`'s result after awaiting `teardown`.
 * - On `fn` throw: `teardown` still runs; `fn`'s error propagates.
 * - On `teardown` throw (fn succeeded): the teardown error propagates. The
 *   value `fn` returned is discarded because the caller can't rely on a
 *   silently-failed teardown.
 * - On both `fn` and `teardown` throwing: one of the two propagates (whichever
 *   the runtime sees first via finally semantics). Either is an actionable
 *   signal; silent success is NOT acceptable and is the whole reason this
 *   helper exists.
 *
 * Note: the SDK's own `TestWorkflowEnvironment.teardown()` logs and swallows
 * its internal close/shutdown failures (see module docstring). The
 * propagation semantics above apply to errors that cross the `teardown()`
 * call boundary itself — custom envs and wrapper-level failures.
 */
export async function withTestWorkflowEnvironment<
  TEnv extends TestEnvironmentLike,
  TResult,
>(
  createEnv: () => Promise<TEnv>,
  fn: (env: TEnv, context?: TemporalTestContext) => Promise<TResult>,
  options: WithTestWorkflowEnvironmentOptions = {},
): Promise<TResult> {
  const env = await createTestWorkflowEnvironment(createEnv);
  const controller = new AbortController();
  // Workers the caller explicitly disclosed to the harness. The harness
  // awaits `shutdown()` on each one before env teardown so callback/worker
  // settlement is structurally owned, not inferred from `fn`'s shape.
  const ownedWorkers: SettleableWorker[] = [];
  const context: TemporalTestContext = {
    signal: options.signal ?? controller.signal,
    registerWorker: (worker: SettleableWorker) => {
      ownedWorkers.push(worker);
    },
  };

  let callbackThrew = false;
  let callbackError: unknown;
  let callbackResult: TResult | undefined;

  // Run `fn`; capture any throw but keep cleanup on the path either way.
  try {
    callbackResult = await fn(env, context);
  } catch (err) {
    callbackThrew = true;
    callbackError = err;
  }

  // Lifecycle order is fixed: settle every owned worker first (so callback
  // abort/timeout can complete its shutdown path), THEN tear the env down.
  // The first worker-shutdown error is captured as secondary evidence so
  // the primary callback error is never hidden.
  let workerShutdownError: unknown;
  for (const worker of ownedWorkers) {
    try {
      await worker.shutdown();
    } catch (err) {
      if (workerShutdownError === undefined) {
        workerShutdownError = err;
      }
    }
  }

  let teardownError: unknown;
  try {
    await env.teardown();
  } catch (err) {
    teardownError = err;
  }

  // Single secondary-error slot: worker-shutdown evidence wins over
  // env-teardown evidence (it surfaces earlier in the lifecycle chain).
  // If both fail, the earlier (worker-shutdown) one is attached to the
  // callback error so the primary failure stays actionable while the
  // secondary is still inspectable.
  const secondaryError =
    workerShutdownError !== undefined ? workerShutdownError : teardownError;

  // Throws happen here, AFTER cleanup, so no `finally`-mask risk: cleanup
  // is complete and these throws represent the helper's terminal verdict,
  // not an interruption of in-flight teardown.
  if (callbackThrew) {
    if (secondaryError !== undefined && callbackError instanceof Error) {
      (callbackError as Error & { [TEARDOWN_ERROR]?: unknown })[
        TEARDOWN_ERROR
      ] = secondaryError;
    }
    throw callbackError;
  }

  if (secondaryError !== undefined) {
    throw secondaryError;
  }

  return callbackResult as TResult;
}

/**
 * Named constructor: create a time-skipping test environment from the stable
 * non-worktree cwd.
 *
 * Raw `TestWorkflowEnvironment.create*` calls must stay inside this module so
 * every construction path is auditable in one place. Call sites use these
 * wrappers (or `withTimeSkippingTestWorkflowEnvironment` for full lifecycle).
 */
export function createTimeSkippingTestWorkflowEnvironment(): Promise<TestWorkflowEnvironment> {
  return createTestWorkflowEnvironment(() =>
    TestWorkflowEnvironment.createTimeSkipping(),
  );
}

/**
 * Named constructor: create a full local (non-time-skipping) test environment
 * from the stable non-worktree cwd.
 */
export function createLocalTestWorkflowEnvironment(): Promise<TestWorkflowEnvironment> {
  return createTestWorkflowEnvironment(() =>
    TestWorkflowEnvironment.createLocal(),
  );
}

/**
 * Create a time-skipping test environment, run `fn` with it, and always tear
 * down. Equivalent to
 * `withTestWorkflowEnvironment(() => TestWorkflowEnvironment.createTimeSkipping(), fn)`
 * with construction owned by this module.
 */
export function withTimeSkippingTestWorkflowEnvironment<TResult>(
  fn: (
    env: TestWorkflowEnvironment,
    context?: TemporalTestContext,
  ) => Promise<TResult>,
  options?: WithTestWorkflowEnvironmentOptions,
): Promise<TResult> {
  return withTestWorkflowEnvironment(
    createTimeSkippingTestWorkflowEnvironment,
    fn,
    options,
  );
}
