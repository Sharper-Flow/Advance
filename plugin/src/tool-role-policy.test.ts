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
  blockableFromSubAgentSession,
  DUAL_TOOL_NAMES,
  OPERATOR_ONLY_TOOL_NAMES,
  SPAWNABLE_SUBAGENT_ROSTER,
  subAgentUnionAllowlist,
  TOOL_ROLE_POLICY,
} from "./tool-role-policy";
import { generateManifestContent } from "../scripts/generate-agent-manifests";

const REPO_ROOT = resolve(__dirname, "../..");
const AGENTS_DIR = join(REPO_ROOT, ".opencode/agents");
const MATRIX_DOC = join(REPO_ROOT, "docs/tool-ownership.md");

const ROLE_CLASSES = ["orchestrator", "operator-only", "dual"] as const;

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
    const status = TOOL_ROLE_POLICY["adv_status"];
    expect(status.class).toBe("dual");
    expect(status.operatorActions).toContain("forceRefresh");
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
    for (const tool of DUAL_TOOL_NAMES) {
      const found = lines.some(
        (line) => line.includes(tool) && line.includes("dual"),
      );
      expect(found, `${tool} must have a dual matrix row`).toBe(true);
    }
  });

  test("retired Epic and backlog reads carry no role-classified row", () => {
    // dc461d3a retired these four from the host registry; they survive only as
    // Tier-4 MCP reads bridged by plugin/src/mcp-server/tier4-tool-map.ts.
    //
    // Scoped to rows that assign a role class, because such a row asserts the
    // name is a live host tool. Rows without a role class stay legal, which is
    // what lets the removed-tools table and the replacement-path cells go on
    // naming retired tools — the same freedom adv_roadmap and
    // adv_backlog_state already rely on.
    const retiredHostTools = [
      "`adv_epic_list`",
      "`adv_epic_show`",
      "`adv_backlog_list`",
      "`adv_backlog_show`",
    ];
    const staleRows = lines.filter(
      (line) =>
        ROLE_CLASSES.some((role) => line.includes(role)) &&
        retiredHostTools.some((tool) => line.includes(tool)),
    );
    expect(
      staleRows,
      "these are tools.adv.* Tier-4 reads, not role-classified host tools",
    ).toEqual([]);
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

  test("facade tools are granted to every agent except adv-ci-waiter (addProviderToolSearch AC5)", () => {
    // The compressed tool surface relies on every normal agent (and the
    // orchestrator) being able to discover and dispatch ADV tools through
    // the three Advance-owned facade tools. adv-ci-waiter is the only
    // exception: it is a bash-only CI poller with no ADV responsibility,
    // so it keeps an empty allowlist with the deny wildcard.
    const FACADE_TOOLS = ["adv_tool_catalog", "adv_tool_invoke"] as const;
    const EXPECTED_FACADE_HOLDER = new Set<string>(FACADE_TOOLS);
    for (const policy of AGENT_TOOL_POLICY) {
      if (policy.agent === "adv-ci-waiter") {
        for (const tool of FACADE_TOOLS) {
          expect(
            policy.allowed.includes(tool),
            `adv-ci-waiter must NOT carry facade tool ${tool} (no ADV surface)`,
          ).toBe(false);
        }
        continue;
      }
      const allowed = new Set(policy.allowed);
      for (const tool of FACADE_TOOLS) {
        expect(
          allowed.has(tool),
          `${policy.agent} must grant facade tool ${tool} so its rendered tool surface includes the compressed ADV dispatch surface`,
        ).toBe(true);
      }
    }
    // Sanity: the expected facade set is exactly the three Advance-owned
    // facade tools (no more, no less). Updates here require a corresponding
    // AC / design update.
    expect(EXPECTED_FACADE_HOLDER.size).toBe(2);
  });

  test("committed manifests equal generated output for every agent (AC2/AC3)", () => {
    for (const policy of AGENT_TOOL_POLICY) {
      const path = join(AGENTS_DIR, `${policy.agent}.md`);
      const committed = readFileSync(path, "utf8");
      const generated = generateManifestContent(committed, policy.agent);
      expect(generated).toBe(committed);
    }
  });

  test("operator-only tools are invoke-only — not in any manifest, protected by approval gates (C6)", () => {
    // After slimMutationToolSurface, operator-only tools are routed through
    // adv_tool_invoke exclusively. No agent manifest exposes them directly.
    // Their destructive surface is protected by the tools' own
    // approvedByUser + approvalEvidence required arguments, not by manifest
    // grantability. adv_tool_invoke dispatches through the canonical
    // ToolDefinition.execute which re-runs validation, authorization,
    // approval, and recovery enforcement.
    for (const policy of AGENT_TOOL_POLICY) {
      const crossed = policy.allowed.filter((tool) =>
        OPERATOR_ONLY_TOOL_NAMES.includes(tool),
      );
      expect(
        crossed,
        `${policy.agent} must not expose operator-only tools in its manifest — they are invoke-only, protected by approval gates`,
      ).toEqual([]);
    }
  });
});

function parseMode(manifestContent: string): string | undefined {
  const fmMatch = manifestContent.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) return undefined;
  const modeMatch = fmMatch[1].match(/^mode:\s*(\S+)\s*$/m);
  return modeMatch?.[1];
}

describe("tool role policy — runtime blockable set derivation (AC5)", () => {
  const EXPECTED_UNION_FLOOR = Object.freeze([
    // Tier 1 — always top-level for every spawnable sub-agent
    // (tierToolsReduceUpfrontSurface). All other ADV tools are invoke-only
    // (Tier 3), routed through adv_tool_invoke.
    "adv_change_archive",
    "adv_change_close",
    "adv_change_create",
    "adv_change_list",
    "adv_change_show",
    "adv_change_update",
    "adv_gate_complete",
    "adv_gate_status",
    "adv_run_test",
    "adv_subagent_report_submit",
    "adv_task_add",
    "adv_task_checkpoint",
    "adv_task_list",
    "adv_task_update",
    "adv_tool_catalog",
    "adv_tool_invoke",
  ]);

  test("subAgentUnionAllowlist returns the expected union floor", () => {
    expect(sorted(subAgentUnionAllowlist())).toEqual(
      sorted([...EXPECTED_UNION_FLOOR]),
    );
  });

  test("blockable set excludes every union-floor tool", () => {
    const blockable = new Set(blockableFromSubAgentSession());
    for (const tool of EXPECTED_UNION_FLOOR) {
      expect(blockable.has(tool)).toBe(false);
    }
  });

  test("blockable set includes operator-only tools and orchestration/authority mutations", () => {
    const blockable = new Set(blockableFromSubAgentSession());
    for (const tool of OPERATOR_ONLY_TOOL_NAMES) {
      expect(blockable.has(tool)).toBe(true);
    }
    expect(blockable.has("adv_change_create")).toBe(false);
    for (const tool of ADV_TOOL_NAMES.filter((name) =>
      name.startsWith("adv_epic_"),
    )) {
      expect(blockable.has(tool)).toBe(true);
    }
    expect(blockable.has("adv_worktree_create")).toBe(true);
    expect(blockable.has("adv_worktree_delete")).toBe(true);
  });

  test("roster-derived helpers are deterministic and frozen", () => {
    const first = subAgentUnionAllowlist();
    const second = subAgentUnionAllowlist();
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(blockableFromSubAgentSession())).toBe(true);
    expect(Object.isFrozen(SPAWNABLE_SUBAGENT_ROSTER)).toBe(true);
  });
});

describe("tool role policy — spawnable roster parity", () => {
  test("every .opencode/agents/*.md with mode: subagent is in the roster, and vice versa", () => {
    const manifestAgents = readdirSync(AGENTS_DIR)
      .filter((name) => name.endsWith(".md"))
      .map((name) => name.replace(/\.md$/, ""));

    const subAgentsFromManifests = manifestAgents
      .filter((agent) => parseMode(readManifest(agent)) === "subagent")
      .sort();

    expect(subAgentsFromManifests).toEqual(sorted(SPAWNABLE_SUBAGENT_ROSTER));
  });

  test("every roster agent has a row in AGENT_TOOL_POLICY", () => {
    const policyAgents = new Set(AGENT_TOOL_POLICY.map((p) => p.agent));
    for (const agent of SPAWNABLE_SUBAGENT_ROSTER) {
      expect(policyAgents.has(agent)).toBe(true);
    }
  });
});
