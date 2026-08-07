/**
 * Bun tests for the ADV CLI liveness validator in scripts/deploy-local.sh
 *
 * Run with: bun test bin/deploy-local-cli-check.test.ts
 *
 * Regression context (rq-advCliLocalInstall01):
 * `verify_adv_cli_live_json` rejected a stale disk-only payload by grepping the
 * WHOLE `adv status --json` document for `"schema_version": 1`. On 2026-07-28
 * the CLI began emitting `resume_projection_state.schema_version: 1`
 * unconditionally on the healthy live path, so the negative grep matched on
 * every successful read and the check became incapable of passing.
 *
 * These tests drive the REAL shell function rather than restating its logic. A
 * guard that reimplemented the assertion would have agreed with the broken
 * implementation and caught nothing.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const REPO_ROOT = join(import.meta.dir, "..");
const DEPLOY_SCRIPT = join(REPO_ROOT, "scripts", "deploy-local.sh");
const FUNCTION_NAME = "verify_adv_cli_live_json";

/**
 * Extract the validator from deploy-local.sh so it can be exercised in
 * isolation.
 *
 * The script runs a full deployment at top level with no `main` guard, so it
 * cannot simply be sourced. Extraction keeps these tests bound to the shipped
 * implementation: if the function is renamed or restructured, this throws
 * loudly instead of silently testing a stale copy.
 */
function extractFunction(): string {
  const source = readFileSync(DEPLOY_SCRIPT, "utf8");
  const startMarker = `${FUNCTION_NAME}() {`;
  const start = source.indexOf(startMarker);
  if (start === -1) {
    throw new Error(
      `${FUNCTION_NAME} not found in scripts/deploy-local.sh — the validator was renamed or removed; update this guard rather than deleting it.`,
    );
  }
  // The function body is closed by a brace at column 0.
  const end = source.indexOf("\n}\n", start);
  if (end === -1) {
    throw new Error(`Could not find closing brace for ${FUNCTION_NAME}`);
  }
  return source.slice(start, end + 3);
}

/** A CLI stub that prints the given payload and exits 0. */
function writeCliStub(dir: string, payload: string): string {
  const stubPath = join(dir, "adv");
  writeFileSync(
    stubPath,
    `#!/usr/bin/env bash\ncat <<'ADV_STUB_EOF'\n${payload}\nADV_STUB_EOF\n`,
    "utf8",
  );
  chmodSync(stubPath, 0o755);
  return stubPath;
}

/**
 * Run the extracted validator against a stubbed CLI payload.
 * Returns the function's exit status and any diagnostic it surfaced.
 */
function runCheckDetailed(payload: string): {
  exitCode: number;
  diagnostic: string;
} {
  const dir = mkdtempSync(join(tmpdir(), "adv-cli-check-"));
  try {
    const stubPath = writeCliStub(dir, payload);
    const harness = join(dir, "harness.sh");
    writeFileSync(
      harness,
      [
        "#!/usr/bin/env bash",
        "set -uo pipefail",
        `REPO_ROOT=${JSON.stringify(REPO_ROOT)}`,
        `ADV_CLI_TARGET=${JSON.stringify(stubPath)}`,
        extractFunction(),
        // Call in a conditional context. The function restores `set -e`
        // internally, so a bare invocation would abort this harness at the call
        // site and the diagnostic below would never print.
        `if ${FUNCTION_NAME}; then rc=0; else rc=$?; fi`,
        // The function surfaces observed values to its caller so the deploy
        // failure branch never has to re-invoke the CLI to describe them.
        'printf "DIAGNOSTIC:%s\\n" "${ADV_CLI_LIVE_JSON_DIAGNOSTIC:-}"',
        "exit $rc",
      ].join("\n"),
      "utf8",
    );
    chmodSync(harness, 0o755);

    const proc = Bun.spawnSync(["bash", harness]);
    const stdout = proc.stdout.toString();
    const match = stdout.match(/DIAGNOSTIC:(.*)/);
    return {
      exitCode: proc.exitCode ?? 1,
      diagnostic: match ? match[1].trim() : "",
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runCheck(payload: string): number {
  return runCheckDetailed(payload).exitCode;
}

/** Healthy live payload — the shape that broke the original check. */
const HEALTHY_LIVE_PAYLOAD = JSON.stringify(
  {
    source: "disk",
    live: true,
    stale: false,
    generated_at: "2026-08-05T00:00:00.000Z",
    project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
    counts: { active: 3, archived: 196, closed: 0 },
    changes: [],
    // The field that defeated the document-wide grep. Emitted unconditionally
    // on success by design (bin/adv:162, DONT5), so it must not be treated as
    // evidence of a disk-only response.
    resume_projection_state: {
      schema_version: 1,
      generated_at: "2026-08-05T00:00:00.000Z",
      completeness: "complete",
    },
  },
  null,
  2,
);

/**
 * Fail-closed live error payload. rq-advCliLocalInstall01 accepts
 * accepts a disk source on success or fail-closed error metadata, so this must
 * PASS. Asserting `live: true` would wrongly reject it.
 */
const LIVE_ERROR_PAYLOAD = JSON.stringify(
  {
    source: "disk",
    live: false,
    stale: false,
    generated_at: "2026-08-05T00:00:00.000Z",
    project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
    counts: { active: 0, archived: 0, closed: 0 },
    changes: [],
    error: "Disk projection read failed",
    remediation: "Check the worker and retry",
  },
  null,
  2,
);

/** Stale disk-only payload — carries a TOP-LEVEL schema_version. Must FAIL. */
const DISK_ONLY_PAYLOAD = JSON.stringify(
  {
    schema_version: 1,
    generated_at: "2026-08-05T00:00:00.000Z",
    project_id: "bdf259aa162ae192af5b18899ccdc653b085528d",
    changes: [],
  },
  null,
  2,
);

describe("verify_adv_cli_live_json", () => {
  test("accepts a healthy live payload containing a nested resume_projection_state.schema_version", () => {
    // The regression. Before the fix this failed, because the document-wide
    // grep matched the nested projection version and concluded the response
    // was a stale disk-only read.
    expect(runCheck(HEALTHY_LIVE_PAYLOAD)).toBe(0);
  });

  test("accepts fail-closed live error metadata", () => {
    // rq-advCliLocalInstall01 names this a passing shape. Guards against
    // "fixing" the check by requiring live: true, which would swap a false
    // positive for a false negative.
    expect(runCheck(LIVE_ERROR_PAYLOAD)).toBe(0);
  });

  test("rejects a stale disk-only payload with a top-level schema_version", () => {
    // Detection the law requires must survive the fix — this guards against
    // over-correcting by dropping the disk-only check entirely.
    expect(runCheck(DISK_ONLY_PAYLOAD)).not.toBe(0);
  });

  test("rejects a payload whose source is not disk", () => {
    expect(
      runCheck(JSON.stringify({ source: "remote", live: false }, null, 2)),
    ).not.toBe(0);
  });

  test("fails closed on unparseable output", () => {
    expect(runCheck("not json at all")).not.toBe(0);
  });

  describe("failure diagnostics", () => {
    // Diagnosing the original false positive required reading the shell source
    // and hand-running the CLI, because the failure printed a fixed expectation
    // string and never said what it actually saw. Report observed values so the
    // next divergence is legible in one run.

    test("reports the observed source when it is not disk", () => {
      const { exitCode, diagnostic } = runCheckDetailed(
        JSON.stringify({ source: "remote", live: false }),
      );
      expect(exitCode).not.toBe(0);
      expect(diagnostic).toContain("source");
       expect(diagnostic).toContain("remote");
    });

    test("reports the observed top-level schema_version on a disk-only payload", () => {
      const { exitCode, diagnostic } = runCheckDetailed(DISK_ONLY_PAYLOAD);
      expect(exitCode).not.toBe(0);
      expect(diagnostic).toContain("schema_version");
      expect(diagnostic).toContain("1");
    });

    test("reports unparseable output distinctly rather than as a field mismatch", () => {
      const { exitCode, diagnostic } = runCheckDetailed("not json at all");
      expect(exitCode).not.toBe(0);
      expect(diagnostic).toMatch(/pars|invalid|malformed/i);
    });

    test("stays bounded — never echoes the whole payload", () => {
      // The live payload is ~17KB; a diagnostic that dumps it is unreadable.
      const { diagnostic } = runCheckDetailed(DISK_ONLY_PAYLOAD);
      expect(diagnostic.length).toBeLessThan(200);
    });

    test("surfaces no diagnostic on success", () => {
      const { exitCode, diagnostic } = runCheckDetailed(HEALTHY_LIVE_PAYLOAD);
      expect(exitCode).toBe(0);
      expect(diagnostic).toBe("");
    });
  });
});
