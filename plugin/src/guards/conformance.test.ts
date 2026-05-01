/**
 * Conformance Guard Tests
 *
 * Tests the two conformance enforcement functions:
 * - enforceConformanceToolPolicy: blocks adv_conformance during execution gate
 * - enforceConformancePathPolicy: blocks read/glob/grep/lgrep on locked
 *   sibling-repo conformance paths
 */

import { describe, test, expect } from "vitest";
import {
  enforceConformanceToolPolicy,
  enforceConformancePathPolicy,
} from "./conformance";
import type {
  ConformanceCallerContext,
  ConformancePathContext,
} from "./conformance";

describe("enforceConformanceToolPolicy", () => {
  test("allows adv_conformance when gate is not execution", () => {
    const ctx: ConformanceCallerContext = { gate: "acceptance" };
    // Should not throw
    enforceConformanceToolPolicy("adv_conformance", ctx);
  });

  test("blocks adv_conformance when gate is execution", () => {
    const ctx: ConformanceCallerContext = { gate: "execution" };
    expect(() =>
      enforceConformanceToolPolicy("adv_conformance", ctx),
    ).toThrow(/execution gate/i);
  });

  test("allows non-conformance tools regardless of gate", () => {
    const ctx: ConformanceCallerContext = { gate: "execution" };
    // These should not throw
    enforceConformanceToolPolicy("adv_task_update", ctx);
    enforceConformanceToolPolicy("bash", ctx);
    enforceConformanceToolPolicy("read", ctx);
  });

  test("allows adv_conformance when gate is unknown/null", () => {
    const ctx: ConformanceCallerContext = { gate: null };
    enforceConformanceToolPolicy("adv_conformance", ctx);
  });
});

describe("enforceConformancePathPolicy", () => {
  const lockedRoot = "/home/user/dev/advance-conformance-abc123";

  test("allows read of unlocked path", () => {
    const ctx: ConformancePathContext = {
      lockedPaths: [],
    };
    enforceConformancePathPolicy("read", { filePath: "/home/user/dev/myrepo/src/index.ts" }, ctx);
  });

  test("blocks read of locked sibling-repo path", () => {
    const ctx: ConformancePathContext = {
      lockedPaths: [lockedRoot],
    };
    expect(() =>
      enforceConformancePathPolicy(
        "read",
        { filePath: `${lockedRoot}/specs/advance-workflow/rq-confLock01.test.ts` },
        ctx,
      ),
    ).toThrow(/conformance.*locked/i);
  });

  test("blocks glob on locked path prefix", () => {
    const ctx: ConformancePathContext = {
      lockedPaths: [lockedRoot],
    };
    expect(() =>
      enforceConformancePathPolicy(
        "glob",
        { pattern: "**/*.ts", path: lockedRoot },
        ctx,
      ),
    ).toThrow(/conformance.*locked/i);
  });

  test("blocks grep on locked path", () => {
    const ctx: ConformancePathContext = {
      lockedPaths: [lockedRoot],
    };
    expect(() =>
      enforceConformancePathPolicy(
        "grep",
        { pattern: "rq-confLock01", path: lockedRoot },
        ctx,
      ),
    ).toThrow(/conformance.*locked/i);
  });

  test("allows read of in-repo path even when sibling is locked", () => {
    const ctx: ConformancePathContext = {
      lockedPaths: [lockedRoot],
    };
    // In-repo path, not the sibling
    enforceConformancePathPolicy(
      "read",
      { filePath: "/home/user/dev/myrepo/src/index.ts" },
      ctx,
    );
  });

  test("allows non-read tools regardless of locked paths", () => {
    const ctx: ConformancePathContext = {
      lockedPaths: [lockedRoot],
    };
    // bash, edit, write, etc. are not path-gated by this policy
    enforceConformancePathPolicy("bash", { command: "echo hello" }, ctx);
    enforceConformancePathPolicy("edit", { filePath: lockedRoot + "/foo.ts" }, ctx);
  });

  test("blocks lgrep_search_semantic on locked path", () => {
    const ctx: ConformancePathContext = {
      lockedPaths: [lockedRoot],
    };
    expect(() =>
      enforceConformancePathPolicy(
        "lgrep_search_semantic",
        { query: "conformance", path: lockedRoot },
        ctx,
      ),
    ).toThrow(/conformance.*locked/i);
  });

  test("blocks lgrep_search_text on locked path", () => {
    const ctx: ConformancePathContext = {
      lockedPaths: [lockedRoot],
    };
    expect(() =>
      enforceConformancePathPolicy(
        "lgrep_search_text",
        { query: "rq-confLock01", path: lockedRoot },
        ctx,
      ),
    ).toThrow(/conformance.*locked/i);
  });
});
