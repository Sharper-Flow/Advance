/**
 * Asset tests for the worktree-warp-mode spec law.
 *
 * Enforces structural properties of `.adv/specs/worktree-warp-mode/spec.json`
 * and the grep gate from rq-warpModeContract04 (raw fetch to /session/:id
 * is disallowed in workspace-warp.ts and tools/worktree/index.ts).
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../../..");
const SPEC_PATH = join(REPO_ROOT, ".adv/specs/worktree-warp-mode/spec.json");

interface SpecRequirement {
  id: string;
  title: string;
  body: string;
  priority: string;
  tags: string[];
  scenarios: Array<{
    id: string;
    title: string;
    given: string[];
    when: string;
    then: string[];
  }>;
}

interface SpecJson {
  $schema?: string;
  name: string;
  title: string;
  purpose: string;
  version: string;
  updated_at: string;
  requirements: SpecRequirement[];
}

function loadSpec(): SpecJson {
  return JSON.parse(readFileSync(SPEC_PATH, "utf8")) as SpecJson;
}

describe("worktree-warp-mode spec law (fixWarpSessionLookup T6)", () => {
  test("spec.json exists and is valid JSON", () => {
    expect(() => loadSpec()).not.toThrow();
  });

  test("spec.json declares the worktree-warp-mode capability", () => {
    const spec = loadSpec();
    expect(spec.name).toBe("worktree-warp-mode");
    expect(spec.title).toContain("Worktree Warp Mode");
    expect(spec.purpose).toContain("downgrade_reason");
    expect(spec.purpose).toContain("x-opencode-directory");
  });

  test("spec.json contains the six rq-warpModeContract requirements", () => {
    const spec = loadSpec();
    const ids = spec.requirements.map((r) => r.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "rq-warpModeContract01",
        "rq-warpModeContract02",
        "rq-warpModeContract03",
        "rq-warpModeContract04",
        "rq-warpModeContract05",
        "rq-warpModeContract06",
      ]),
    );
    expect(ids).toHaveLength(6);
  });

  test("every requirement has title, body, priority, tags, scenarios", () => {
    const spec = loadSpec();
    for (const req of spec.requirements) {
      expect(req.title).toBeTruthy();
      expect(req.body).toBeTruthy();
      expect(req.priority).toMatch(/^(must|should|could)$/);
      expect(Array.isArray(req.tags)).toBe(true);
      expect(Array.isArray(req.scenarios)).toBe(true);
      expect(req.scenarios.length).toBeGreaterThan(0);
    }
  });

  test("rq-warpModeContract01 covers all five preconditions for mode:warp selection", () => {
    const spec = loadSpec();
    const rq = spec.requirements.find((r) => r.id === "rq-warpModeContract01");
    expect(rq).toBeDefined();
    expect(rq?.body).toContain("mode:warp");
    expect(rq?.body).toContain("OPENCODE_EXPERIMENTAL_WORKSPACES");
    expect(rq?.body).toContain("serverUrl");
    expect(rq?.body).toContain("sessionID");
    expect(rq?.body).toContain("SDK client");
  });

  test("rq-warpModeContract02 declares SESSION_ALREADY_WARPED is a block, not a downgrade", () => {
    const spec = loadSpec();
    const rq = spec.requirements.find((r) => r.id === "rq-warpModeContract02");
    expect(rq).toBeDefined();
    expect(rq?.body).toContain("SESSION_ALREADY_WARPED");
    expect(rq?.body).toContain("MUST NOT downgrade");
  });

  test("rq-warpModeContract03 enumerates every downgrade_reason kind", () => {
    const spec = loadSpec();
    const rq = spec.requirements.find((r) => r.id === "rq-warpModeContract03");
    expect(rq).toBeDefined();
    const kinds = [
      "missing_server",
      "missing_session",
      "missing_client",
      "flag_disabled",
      "lookup_failed",
      "endpoint_unreachable",
      "warp_failed",
    ];
    for (const kind of kinds) {
      expect(rq?.body).toContain(kind);
    }
  });

  test("rq-warpModeContract04 declares the SDK-routed lookup requirement and grep gate", () => {
    const spec = loadSpec();
    const rq = spec.requirements.find((r) => r.id === "rq-warpModeContract04");
    expect(rq).toBeDefined();
    expect(rq?.body).toContain("client.session.get");
    expect(rq?.body).toContain("Raw fetch to /session/:id is disallowed");
    expect(rq?.body).toContain("SessionLookupResult");
  });

  test("rq-warpModeContract05 declares the x-opencode-directory header contract", () => {
    const spec = loadSpec();
    const rq = spec.requirements.find((r) => r.id === "rq-warpModeContract05");
    expect(rq).toBeDefined();
    expect(rq?.body).toContain("x-opencode-directory");
    expect(rq?.body).toContain("encodeURIComponent");
    for (const fn of [
      "workspaceAndWarpAvailable",
      "createAdvWorkspace",
      "warpSession",
      "deleteAdvWorkspace",
      "findWorkspaceByDirectory",
    ]) {
      expect(rq?.body).toContain(fn);
    }
  });

  test("rq-warpModeContract06 declares the client-threading contract from plugin input", () => {
    const spec = loadSpec();
    const rq = spec.requirements.find((r) => r.id === "rq-warpModeContract06");
    expect(rq).toBeDefined();
    expect(rq?.body).toContain("PluginInput.client");
    expect(rq?.body).toContain("createToolMap");
  });

  test("rq-warpModeContract04 grep gate: zero raw-fetch calls to /session/:id", () => {
    // Enforce the structural rule by inspecting the live source files.
    // A `fetch(` call whose argument expression contains the literal
    // substring `/session/` indicates a regression to raw-fetch session
    // lookup. We slide a window from each `fetch(` through balanced
    // parentheses so template literals (`${url}/session/${id}`), string
    // concatenation, and `new URL("/session/" + id, ...)` are all caught.
    // Calls that route through helpers (e.g. `fetch(workspaceUrl(deps))`)
    // are unaffected because the literal `/session/` is not in their arg
    // expression.
    const pluginRoot = resolve(__dirname, "../..");
    const filesToCheck = [
      join(pluginRoot, "src/utils/workspace-warp.ts"),
      join(pluginRoot, "src/tools/worktree/index.ts"),
    ];

    const offenders: string[] = [];
    for (const path of filesToCheck) {
      const content = readFileSync(path, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        // Find each `fetch(` occurrence that is NOT preceded by an
        // identifier character (so `prefetch(` / `myFetch(` don't match)
        // and NOT a member expression like `client.session.fetch(` (that
        // pattern is for SDK clients, not raw HTTP fetch).
        const fetchRegex = /(?<![A-Za-z0-9_$.])fetch\s*\(/g;
        let match: RegExpExecArray | null;
        while ((match = fetchRegex.exec(line)) !== null) {
          const argStart = match.index + match[0].length;
          // Walk the rest of the line tracking paren depth; capture
          // characters until the matching close paren or EOL. Multi-line
          // calls are conservatively scanned to EOL — sufficient for the
          // single-line raw-fetch patterns this gate protects against.
          let depth = 1;
          let i = argStart;
          while (i < line.length && depth > 0) {
            const ch = line[i];
            if (ch === "(") depth++;
            else if (ch === ")") depth--;
            i++;
          }
          const argExpr = line.slice(argStart, i);
          if (argExpr.includes("/session/")) {
            offenders.push(`${path}:${idx + 1}: ${line.trim()}`);
            break; // one offense per line is enough
          }
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
