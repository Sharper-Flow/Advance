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
  fn: (env: TEnv) => Promise<TResult>,
): Promise<TResult> {
  const env = await createTestWorkflowEnvironment(createEnv);
  try {
    return await fn(env);
  } finally {
    await env.teardown();
  }
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
  fn: (env: TestWorkflowEnvironment) => Promise<TResult>,
): Promise<TResult> {
  return withTestWorkflowEnvironment(
    createTimeSkippingTestWorkflowEnvironment,
    fn,
  );
}
