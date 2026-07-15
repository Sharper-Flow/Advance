/**
 * Tool Role Policy Tests
 * (consolidateAdvToolSurface2 — SC2/SC3/AC5/AC6/AC7, C6, DONT3, DDC8)
 *
 * Validates the code-owned, exhaustive tool-role policy in
 * `plugin/src/tool-role-policy.ts`:
 *
 *   1. Every retained canonical ADV tool (ADV_TOOL_NAMES) has exactly one
 *      role classification: orchestrator | operator-only | dual. Dual entries
 *      keep the action-level read/mutate distinction from
 *      docs/tool-ownership.md instead of flattening it.
 *   2. Every shipped agent manifest's ADV tool allowlist is EXACTLY the
 *      policy's intended allowed set — tests reject a role-irrelevant or
 *      unregistered ADV tool entry (AC6).
 *   3. Role scoping never crosses destructive, privacy, approval, or
 *      cross-project trust boundaries for fallback convenience (C6):
 *      operator-only tools are grantable only to the ADV orchestrator agent;
 *      every other agent denies every non-allowed retained tool, either by an
 *      explicit `adv_*: false` default-deny wildcard (wildcard-first,
 *      specific-allow-after — OpenCode legacy tools convert to permission
 *      rules with last-match-wins semantics) or by full explicit enumeration
 *      (the orchestrator grants the entire retained surface).
 *   4. docs/tool-ownership.md stays the documented view: the code policy and
 *      the doc's operator-only / dual (incl. action-qualified) rows agree.
 */

import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { ADV_TOOL_NAMES } from "./tool-registry";
import {
  AGENT_TOOL_POLICY,
  DUAL_TOOL_NAMES,
  OPERATOR_ONLY_TOOL_NAMES,
  TOOL_ROLE_POLICY,
} from "./tool-role-policy";

const REPO_ROOT = resolve(__dirname, "../..");
const AGENTS_DIR = join(REPO_ROOT, ".opencode/agents");
const MATRIX_DOC = join(REPO_ROOT, "docs/tool-ownership.md");

const ROLE_CLASSES = ["orchestrator", "operator-only", "dual"] as const;

const ADV_WILDCARD = "adv_*";

/** Parse the frontmatter tools block of an agent manifest into adv_* grant entries. */
function parseAdvToolEntries(manifestContent: string): Map<string, boolean> {
  const fmMatch = manifestContent.match(/^---\n([\s\S]*?)\n---\n/);
  expect(fmMatch, "manifest must have a YAML frontmatter block").toBeTruthy();
  const frontmatter = fmMatch![1];
  const toolsMatch = frontmatter.match(/^tools:\n((?:(?:^[ \t].*|^$)\n?)*)/m);
  const toolsBlock = toolsMatch?.[1] ?? "";
  const entries = new Map<string, boolean>();
  for (const match of toolsBlock.matchAll(
    /^\s+(adv_[A-Za-z0-9_*]+):\s*(true|false)\s*$/gm,
  )) {
    entries.set(match[1], match[2] === "true");
  }
  return entries;
}

function readManifest(agent: string): string {
  return readFileSync(join(AGENTS_DIR, `${agent}.md`), "utf8");
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

describe("tool role policy — exhaustive classification (AC5/AC7, DDC8)", () => {
  test("policy covers exactly the retained canonical ADV tool names", () => {
    expect(sorted(Object.keys(TOOL_ROLE_POLICY))).toEqual(
      sorted(ADV_TOOL_NAMES),
    );
  });

  test("every entry has a valid class and non-empty rationale", () => {
    for (const [tool, entry] of Object.entries(TOOL_ROLE_POLICY)) {
      expect(ROLE_CLASSES, `${tool} must use a known role class`).toContain(
        entry.class,
      );
      expect(
        entry.rationale.trim().length,
        `${tool} must carry a rationale`,
      ).toBeGreaterThan(0);
    }
  });

  test("dual entries model action-level distinctions; non-dual entries do not", () => {
    for (const [tool, entry] of Object.entries(TOOL_ROLE_POLICY)) {
      if (entry.class === "dual") {
        expect(
          entry.agentActions?.length ?? 0,
          `${tool} dual entry must name the agent-reachable action surface`,
        ).toBeGreaterThan(0);
        expect(
          entry.operatorActions,
          `${tool} dual entry must name the operator-owned action surface`,
        ).toBeDefined();
      } else {
        expect(
          entry.agentActions,
          `${tool} ${entry.class} entry must not flatten dual actions`,
        ).toBeUndefined();
        expect(
          entry.operatorActions,
          `${tool} ${entry.class} entry must not flatten dual actions`,
        ).toBeUndefined();
      }
    }
  });

  test("derived operator-only and dual name sets match the policy", () => {
    const operatorOnly = Object.entries(TOOL_ROLE_POLICY)
      .filter(([, entry]) => entry.class === "operator-only")
      .map(([tool]) => tool);
    const dual = Object.entries(TOOL_ROLE_POLICY)
      .filter(([, entry]) => entry.class === "dual")
      .map(([tool]) => tool);
    expect(sorted(OPERATOR_ONLY_TOOL_NAMES)).toEqual(sorted(operatorOnly));
    expect(sorted(DUAL_TOOL_NAMES)).toEqual(sorted(dual));
  });

  test("action-level dual distinctions are preserved, not flattened (DDC8)", () => {
    const snapshotHealth = TOOL_ROLE_POLICY["adv_snapshot_health"];
    expect(snapshotHealth.class).toBe("dual");
    expect(snapshotHealth.agentActions).toContain("scan");
    expect(snapshotHealth.agentActions).toContain("audit_history");
    expect(snapshotHealth.operatorActions).toContain("repair");

    const conformance = TOOL_ROLE_POLICY["adv_conformance"];
    expect(conformance.class).toBe("dual");
    expect(conformance.agentActions).toContain("status");
    expect(conformance.agentActions).toContain("run");
    expect(conformance.operatorActions).toContain("override");

    const status = TOOL_ROLE_POLICY["adv_status"];
    expect(status.class).toBe("dual");
    expect(status.operatorActions).toContain("forceRefresh");

    const projectMetadata = TOOL_ROLE_POLICY["adv_project_metadata"];
    expect(projectMetadata.class).toBe("dual");
    expect(projectMetadata.agentActions).toContain("read");
    expect(projectMetadata.agentActions).toContain("list");
    expect(projectMetadata.operatorActions).toContain("write");
  });
});

describe("tool role policy — ownership matrix parity (docs/tool-ownership.md)", () => {
  const matrixContent = readFileSync(MATRIX_DOC, "utf8");
  const lines = matrixContent.split("\n");

  test("every policy operator-only tool has an operator-only matrix row", () => {
    for (const tool of OPERATOR_ONLY_TOOL_NAMES) {
      const found = lines.some(
        (line) => line.includes(tool) && line.includes("operator-only"),
      );
      expect(found, `${tool} must have an operator-only matrix row`).toBe(true);
    }
  });

  test("every policy dual tool has the documented matrix representation", () => {
    // docs/tool-ownership.md is the documented view: six dual tools carry
    // dual rows; adv_snapshot_health and adv_conformance carry action-qualified
    // operator-only rows (#repair / #override) because only those actions are
    // operator-owned — the code policy models both as dual with explicit
    // agentActions/operatorActions so the distinction is never flattened.
    const documentedAsDual = DUAL_TOOL_NAMES.filter(
      (tool) => tool !== "adv_snapshot_health" && tool !== "adv_conformance",
    );
    for (const tool of documentedAsDual) {
      const found = lines.some(
        (line) => line.includes(tool) && line.includes("dual"),
      );
      expect(found, `${tool} must have a dual matrix row`).toBe(true);
    }
  });

  test("action-qualified operator-only rows exist for dual tools with operator actions", () => {
    // docs/tool-ownership.md lists adv_snapshot_health (#repair) and
    // adv_conformance (#override) in the operator-only table; the code policy
    // models them as dual with operatorActions. Both views must agree.
    for (const [tool, qualifier] of [
      ["adv_snapshot_health", "#repair"],
      ["adv_conformance", "#override"],
    ] as const) {
      const entry = TOOL_ROLE_POLICY[tool];
      expect(entry.class).toBe("dual");
      const found = lines.some(
        (line) =>
          line.includes(tool) &&
          line.includes("operator-only") &&
          line.includes(qualifier),
      );
      expect(
        found,
        `${tool} must keep its action-qualified (${qualifier}) operator-only matrix row`,
      ).toBe(true);
    }
  });
});

describe("tool role policy — agent manifest exactness (SC3/AC6, C6)", () => {
  const manifestAgents = readdirSync(AGENTS_DIR)
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.replace(/\.md$/, ""))
    .sort();

  test("policy covers every shipped agent manifest exactly", () => {
    expect(sorted(AGENT_TOOL_POLICY.map((policy) => policy.agent))).toEqual(
      manifestAgents,
    );
  });

  test("policy sets reference only retained canonical ADV tools and never mix grant/deny", () => {
    const retained = new Set(ADV_TOOL_NAMES);
    for (const policy of AGENT_TOOL_POLICY) {
      for (const tool of policy.allowed) {
        expect(
          retained.has(tool),
          `${policy.agent} allowed names unregistered tool ${tool}`,
        ).toBe(true);
      }
      for (const tool of policy.explicitBlocked) {
        expect(
          retained.has(tool),
          `${policy.agent} explicitBlocked names unregistered tool ${tool}`,
        ).toBe(true);
      }
      const overlap = policy.allowed.filter((tool) =>
        policy.explicitBlocked.includes(tool),
      );
      expect(
        overlap,
        `${policy.agent} must not grant and block the same tools`,
      ).toEqual([]);
    }
  });

  for (const policy of AGENT_TOOL_POLICY) {
    describe(`${policy.agent}.md`, () => {
      const entries = parseAdvToolEntries(readManifest(policy.agent));

      test("granted ADV tools exactly equal the intended allowed set", () => {
        const granted = [...entries.entries()]
          .filter(([key, value]) => key !== ADV_WILDCARD && value)
          .map(([key]) => key);
        expect(sorted(granted)).toEqual(sorted(policy.allowed));
      });

      test("no wildcard grant (`adv_*: true`) exists", () => {
        expect(entries.get(ADV_WILDCARD)).not.toBe(true);
      });

      test(`default-deny wildcard presence matches policy (denyWildcard=${policy.denyWildcard})`, () => {
        if (policy.denyWildcard) {
          expect(entries.get(ADV_WILDCARD)).toBe(false);
        } else {
          expect(entries.has(ADV_WILDCARD)).toBe(false);
        }
      });

      test("default-deny wildcard precedes every explicit ADV allow", () => {
        // OpenCode resolves legacy `tools:` permissions in document order and
        // the last matching rule wins. A wildcard deny after a specific allow
        // would silently revoke that required allow while the unordered map
        // assertions above would still pass.
        if (!policy.denyWildcard) return;

        const wildcardIndex = readManifest(policy.agent).indexOf(
          `${ADV_WILDCARD}: false`,
        );
        expect(
          wildcardIndex,
          `${policy.agent} default deny must exist`,
        ).toBeGreaterThanOrEqual(0);
        for (const tool of policy.allowed) {
          const allowIndex = readManifest(policy.agent).indexOf(
            `${tool}: true`,
          );
          expect(
            allowIndex,
            `${policy.agent} allow for ${tool} must follow adv_*: false`,
          ).toBeGreaterThan(wildcardIndex);
        }
      });

      test("policy-pinned explicit denials remain explicit", () => {
        for (const tool of policy.explicitBlocked) {
          expect(
            entries.get(tool),
            `${policy.agent} must keep explicit denial for ${tool}`,
          ).toBe(false);
        }
      });

      test("manifest names no unregistered or removed ADV tools", () => {
        const retained = new Set(ADV_TOOL_NAMES);
        const offenders = [...entries.keys()].filter(
          (key) => key !== ADV_WILDCARD && !retained.has(key),
        );
        expect(offenders).toEqual([]);
      });

      test("every retained ADV tool is granted or denied — nothing unspecified", () => {
        const uncovered = ADV_TOOL_NAMES.filter((tool) => {
          if (policy.allowed.includes(tool)) return false;
          if (policy.denyWildcard) return false;
          return !policy.explicitBlocked.includes(tool);
        });
        expect(
          uncovered,
          `${policy.agent} leaves ADV tools unspecified (default-allow hole): ${uncovered.join(", ")}`,
        ).toEqual([]);
      });
    });
  }

  test("operator-only tools are grantable only to the ADV orchestrator agent (C6)", () => {
    for (const policy of AGENT_TOOL_POLICY) {
      const crossed = policy.allowed.filter((tool) =>
        OPERATOR_ONLY_TOOL_NAMES.includes(tool),
      );
      if (policy.agent === "adv") {
        expect(
          sorted(crossed),
          "orchestrator keeps the operator-instruction path for every operator-only tool",
        ).toEqual(sorted(OPERATOR_ONLY_TOOL_NAMES));
      } else {
        expect(
          crossed,
          `${policy.agent} must not be granted operator-only tools across destructive/privacy/approval/target_path boundaries`,
        ).toEqual([]);
      }
    }
  });
});
