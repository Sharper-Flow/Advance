import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  isTemporalEnvAllowlisted,
  runLint,
  runTemporalEnvLint,
} from "./check-test-isolation";

describe("check-test-isolation lint script", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "adv-isolation-lint-"));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("passes when test file uses adv_change_create with createTempDir isolation", async () => {
    const srcDir = join(tempDir, "pass-case", "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "good.test.ts"),
      `
import { createTempDir } from "./setup";
import { changeTools } from "./tools";

test("creates change", async () => {
  const dir = await createTempDir();
  const result = await changeTools.adv_change_create.execute({});
});
`,
    );

    const violations = await runLint(join(tempDir, "pass-case"));
    expect(violations).toEqual([]);
  });

  test("fails when test file calls adv_change_create without temp dir isolation", async () => {
    const srcDir = join(tempDir, "fail-case", "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "bad.test.ts"),
      `
import { changeTools } from "./tools";

test("creates change without isolation", async () => {
  const result = await changeTools.adv_change_create.execute({});
});
`,
    );

    const violations = await runLint(join(tempDir, "fail-case"));
    expect(violations).toContain("bad.test.ts");
    expect(violations.length).toBe(1);
  });

  test("allows allowlisted files (assets and target-project)", async () => {
    const srcDir = join(tempDir, "allowlist-case", "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "routing-assets.test.ts"),
      `
test("manifest contains tool name", () => {
  expect(content).toContain("adv_change_create");
});
`,
    );
    await writeFile(
      join(srcDir, "target-project.test.ts"),
      `
test("target project uses changeCreate", () => {
  const result = changeCreate({});
});
`,
    );

    const violations = await runLint(join(tempDir, "allowlist-case"));
    expect(violations).toEqual([]);
  });

  test("fails when test file calls changeCreate without temp dir isolation", async () => {
    const srcDir = join(tempDir, "changecreate-case", "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "bad2.test.ts"),
      `
test("uses changeCreate", () => {
  const result = changeCreate({});
});
`,
    );

    const violations = await runLint(join(tempDir, "changecreate-case"));
    expect(violations).toContain("bad2.test.ts");
    expect(violations.length).toBe(1);
  });

  test("ignores string literal occurrences in expect().toContain()", async () => {
    const srcDir = join(tempDir, "string-case", "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "string-only.test.ts"),
      `
import { createTempDir } from "./setup";

test("checks banner", () => {
  const dir = await createTempDir();
  expect(output).toContain("adv_change_create");
});
`,
    );

    const violations = await runLint(join(tempDir, "string-case"));
    expect(violations).toEqual([]);
  });
});

describe("temporal test-env constructor guard (reapLeakedTestServers AC1/DONT1)", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "adv-temporal-env-lint-"));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("flags raw TestWorkflowEnvironment.createTimeSkipping in a .test.ts", async () => {
    const srcDir = join(tempDir, "raw-skipping", "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "uses-raw.test.ts"),
      `
import { TestWorkflowEnvironment } from "@temporalio/testing";

test("uses raw constructor", async () => {
  const env = await TestWorkflowEnvironment.createTimeSkipping();
});
`,
    );

    const violations = await runTemporalEnvLint(join(tempDir, "raw-skipping"));
    expect(violations).toContain("uses-raw.test.ts");
    expect(violations.length).toBe(1);
  });

  test("flags raw TestWorkflowEnvironment.createLocal in an .itest.ts", async () => {
    const srcDir = join(tempDir, "raw-local", "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "uses-raw-local.itest.ts"),
      `
import { TestWorkflowEnvironment } from "@temporalio/testing";

test("uses raw local constructor", async () => {
  const env = await TestWorkflowEnvironment.createLocal();
});
`,
    );

    const violations = await runTemporalEnvLint(join(tempDir, "raw-local"));
    expect(violations).toContain("uses-raw-local.itest.ts");
    expect(violations.length).toBe(1);
  });

  test("flags a bare constructor reference passed as a callback (no call parens)", async () => {
    const srcDir = join(tempDir, "bare-ref", "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "bare-ref.test.ts"),
      `
import { TestWorkflowEnvironment } from "@temporalio/testing";

test("passes constructor by reference", async () => {
  await withTestWorkflowEnvironment(TestWorkflowEnvironment.createTimeSkipping, fn);
});
`,
    );

    const violations = await runTemporalEnvLint(join(tempDir, "bare-ref"));
    expect(violations).toContain("bare-ref.test.ts");
  });

  test("passes when construction routes through the helper wrappers", async () => {
    const srcDir = join(tempDir, "helper-routed", "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "helper-routed.test.ts"),
      `
import {
  createTimeSkippingTestWorkflowEnvironment,
  withTimeSkippingTestWorkflowEnvironment,
} from "./with-test-env";

test("routes through helper", async () => {
  await withTimeSkippingTestWorkflowEnvironment(async (env) => env);
  const env = await createTimeSkippingTestWorkflowEnvironment();
  await env.teardown();
});
`,
    );

    const violations = await runTemporalEnvLint(join(tempDir, "helper-routed"));
    expect(violations).toEqual([]);
  });

  test("passes for the allow-listed helper module that owns the raw constructors", async () => {
    const srcDir = join(
      tempDir,
      "helper-module",
      "src",
      "temporal",
      "__tests__",
    );
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "with-test-env.ts"),
      `
import { TestWorkflowEnvironment } from "@temporalio/testing";

export function createTimeSkippingTestWorkflowEnvironment() {
  return createTestWorkflowEnvironment(() =>
    TestWorkflowEnvironment.createTimeSkipping(),
  );
}
`,
    );

    const violations = await runTemporalEnvLint(join(tempDir, "helper-module"));
    expect(violations).toEqual([]);
  });

  test("ignores occurrences inside comments and string literals", async () => {
    const srcDir = join(tempDir, "comment-only", "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "comment-only.test.ts"),
      `
// TestWorkflowEnvironment.createTimeSkipping() must stay in the helper.
const doc = "use TestWorkflowEnvironment.createLocal via the wrapper";
/* Also: TestWorkflowEnvironment.createTimeSkipping */

test("documents the rule", () => {
  expect(doc).toContain("wrapper");
});
`,
    );

    const violations = await runTemporalEnvLint(join(tempDir, "comment-only"));
    expect(violations).toEqual([]);
  });

  test("allow-list matches the helper path with POSIX separators", () => {
    expect(
      isTemporalEnvAllowlisted("temporal/__tests__/with-test-env.ts"),
    ).toBe(true);
  });

  test("allow-list matches the helper path with Windows separators", () => {
    expect(
      isTemporalEnvAllowlisted("temporal\\__tests__\\with-test-env.ts"),
    ).toBe(true);
  });

  test("allow-list is exact: look-alike paths are not allow-listed", () => {
    expect(
      isTemporalEnvAllowlisted("temporal/__tests__/with-test-env.evil.ts"),
    ).toBe(false);
    expect(
      isTemporalEnvAllowlisted("nested/temporal/__tests__/with-test-env.ts"),
    ).toBe(false);
    expect(isTemporalEnvAllowlisted("temporal/__tests__/other.ts")).toBe(false);
    expect(isTemporalEnvAllowlisted("with-test-env.ts")).toBe(false);
  });

  test("fails clearly when the source directory does not exist", async () => {
    await expect(
      runTemporalEnvLint(join(tempDir, "missing-src-dir")),
    ).rejects.toThrow(/Source directory not found/);
  });
});
