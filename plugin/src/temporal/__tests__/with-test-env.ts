import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
 * Teardown errors propagate (they must not be silently swallowed) so operators
 * notice a broken teardown path instead of silently leaking procs again.
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
