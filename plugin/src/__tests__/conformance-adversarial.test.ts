/**
 * Adversarial Conformance Fixture
 *
 * Cross-cutting verification that the conformance enforcement boundary
 * blocks all known exfiltration vectors. Tests guard functions directly
 * (no runtime wiring needed — that's covered by C2 integration).
 *
 * Vectors tested:
 *   1. Direct adv_conformance tool call during execution gate
 *   2. read/glob/grep/lgrep on locked sibling-repo path
 *   3. bash git clone targeting locked sibling-repo URL
 *   4. bash curl/wget targeting locked sibling-repo path
 *   5. Unlocked paths pass through freely
 */

import { describe, test, expect } from "vitest";
import {
  enforceConformanceToolPolicy,
  enforceConformancePathPolicy,
} from "../guards/conformance";
import { enforceConformanceBashPolicy } from "../guards/bash";
import type {
  ConformanceCallerContext,
  ConformancePathContext,
} from "../guards/conformance";
import type { ConformanceBashContext } from "../guards/bash";

const LOCKED_SIBLING = "/home/user/dev/advance-conformance-abc123";

// =============================================================================
// Vector 1: Direct adv_conformance during execution gate
// =============================================================================

describe("adversarial: adv_conformance blocked during execution", () => {
  test("execution gate blocks adv_conformance", () => {
    const ctx: ConformanceCallerContext = { gate: "execution" };
    expect(() =>
      enforceConformanceToolPolicy("adv_conformance", ctx),
    ).toThrow(/execution gate/);
  });

  test("acceptance gate allows adv_conformance", () => {
    const ctx: ConformanceCallerContext = { gate: "acceptance" };
    expect(() =>
      enforceConformanceToolPolicy("adv_conformance", ctx),
    ).not.toThrow();
  });

  test("release gate allows adv_conformance", () => {
    const ctx: ConformanceCallerContext = { gate: "release" };
    expect(() =>
      enforceConformanceToolPolicy("adv_conformance", ctx),
    ).not.toThrow();
  });
});

// =============================================================================
// Vector 2: Read/glob/grep/lgrep on locked sibling-repo path
// =============================================================================

describe("adversarial: path-gated tools blocked on locked conformance dir", () => {
  const lockedCtx: ConformancePathContext = {
    lockedPaths: [LOCKED_SIBLING],
  };

  test("read tool blocked", () => {
    expect(() =>
      enforceConformancePathPolicy(
        "read",
        { filePath: `${LOCKED_SIBLING}/specs/rq-confLock01.test.ts` },
        lockedCtx,
      ),
    ).toThrow(/conformance.*locked/i);
  });

  test("glob tool blocked", () => {
    expect(() =>
      enforceConformancePathPolicy(
        "glob",
        { pattern: "**/*.ts", path: LOCKED_SIBLING },
        lockedCtx,
      ),
    ).toThrow(/conformance.*locked/i);
  });

  test("grep tool blocked", () => {
    expect(() =>
      enforceConformancePathPolicy(
        "grep",
        { pattern: "rq-conf", path: LOCKED_SIBLING },
        lockedCtx,
      ),
    ).toThrow(/conformance.*locked/i);
  });

  test("lgrep_search_semantic blocked", () => {
    expect(() =>
      enforceConformancePathPolicy(
        "lgrep_search_semantic",
        { query: "conformance test", path: LOCKED_SIBLING },
        lockedCtx,
      ),
    ).toThrow(/conformance.*locked/i);
  });

  test("lgrep_search_text blocked", () => {
    expect(() =>
      enforceConformancePathPolicy(
        "lgrep_search_text",
        { query: "rq-confLock01", path: LOCKED_SIBLING },
        lockedCtx,
      ),
    ).toThrow(/conformance.*locked/i);
  });

  test("lgrep_get_file_outline blocked", () => {
    expect(() =>
      enforceConformancePathPolicy(
        "lgrep_get_file_outline",
        { path: `${LOCKED_SIBLING}/tests/conformance.test.ts` },
        lockedCtx,
      ),
    ).toThrow(/conformance.*locked/i);
  });

  test("in-repo path allowed even when sibling locked", () => {
    expect(() =>
      enforceConformancePathPolicy(
        "read",
        { filePath: "/home/user/dev/myrepo/src/index.ts" },
        lockedCtx,
      ),
    ).not.toThrow();
  });

  test("empty lockedPaths allows everything", () => {
    const emptyCtx: ConformancePathContext = { lockedPaths: [] };
    expect(() =>
      enforceConformancePathPolicy(
        "read",
        { filePath: `${LOCKED_SIBLING}/specs/test.ts` },
        emptyCtx,
      ),
    ).not.toThrow();
  });
});

// =============================================================================
// Vector 3: bash git clone targeting locked sibling-repo URL
// =============================================================================

describe("adversarial: bash guard blocks conformance repo access", () => {
  const bashCtx: ConformanceBashContext = {
    lockedSiblingRoots: [LOCKED_SIBLING],
  };

  test("git clone blocked when targeting locked sibling dir name", () => {
    const result = enforceConformanceBashPolicy(
      `git clone https://github.com/org/advance-conformance-abc123.git`,
      bashCtx,
    );
    expect(result.action).toBe("block");
    expect(result.message).toMatch(/conformance/i);
  });

  test("git clone blocked when targeting locked sibling absolute path", () => {
    const result = enforceConformanceBashPolicy(
      `git clone file://${LOCKED_SIBLING}`,
      bashCtx,
    );
    expect(result.action).toBe("block");
  });

  test("curl to locked sibling path blocked", () => {
    const result = enforceConformanceBashPolicy(
      `curl ${LOCKED_SIBLING}/artifact.json`,
      bashCtx,
    );
    expect(result.action).toBe("block");
  });

  test("wget of locked sibling dir blocked", () => {
    const result = enforceConformanceBashPolicy(
      `wget -r ${LOCKED_SIBLING}/`,
      bashCtx,
    );
    expect(result.action).toBe("block");
  });

  test("unrelated git clone allowed", () => {
    const result = enforceConformanceBashPolicy(
      `git clone https://github.com/org/myrepo.git`,
      bashCtx,
    );
    expect(result.action).toBe("allow");
  });

  test("unrelated curl allowed", () => {
    const result = enforceConformanceBashPolicy(
      `curl https://api.example.com/data`,
      bashCtx,
    );
    expect(result.action).toBe("allow");
  });

  test("empty lockedSiblingRoots allows everything", () => {
    const emptyCtx: ConformanceBashContext = { lockedSiblingRoots: [] };
    const result = enforceConformanceBashPolicy(
      `git clone file://${LOCKED_SIBLING}`,
      emptyCtx,
    );
    expect(result.action).toBe("allow");
  });
});
