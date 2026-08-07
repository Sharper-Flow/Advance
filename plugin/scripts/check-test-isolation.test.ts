import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { runLint } from "./check-test-isolation";

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
