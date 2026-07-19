import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
  ADV_TOOL_METADATA,
  ADV_TOOL_NAMES,
  collectPublicToolEntries,
  createDegradedToolMap,
  createToolMap,
  getToolSurface,
} from "./tool-registry";
import { hasExplicitAdvToolTitle } from "./utils/tool-title";
import { createLegacyStore } from "./storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
} from "./__tests__/setup";

/**
 * Public tool inventory + parity guards — consolidateAdvToolSurface2
 * (task tk-9b61859aa2ba; contract SC1/SC2/AC5/C5; design DDC1/DDC2/DDC3) and
 * addAdvanceMetadata (SC4/AC1/AC2/AC5/AC6/C1/C2/C5).
 *
 * The registry owns one typed inventory of retained public `*Tools` groups.
 * Canonical names (ADV_TOOL_NAMES), the warrant-visible argument surface
 * (getToolSurface), and canonical descriptive metadata (ADV_TOOL_METADATA)
 * are all derived from that inventory; createToolMap stays explicit. These
 * tests pin the structural equalities:
 *
 * - DDC1: derived names === runtime createToolMap keys === degraded-map keys
 *   === warrant-surface names.
 * - DDC2: duplicate public names across inventory groups are rejected before
 *   any Set/Map construction can collapse them.
 * - DDC3: for every retained tool, warrant-surface argument keys equal the
 *   registered (bound) argument keys.
 * - AC5: every retained callable has a title entry; deterministic tests fail
 *   on divergence.
 * - SC1: baseline/final counts are recorded and asserted.
 * - SC4/AC1/AC2: metadata keys and definition records are exact and closed;
 *   missing description or args rejects inventory construction.
 * - C1/C2/C5: metadata owns only realm/group/lifecycle/risk/recovery facts
 *   and does not copy authority from TOOL_ROLE_POLICY or AGENT_TOOL_POLICY.
 */

const sorted = (names: Iterable<string>): string[] =>
  [...names].sort((a, b) => a.localeCompare(b));

/**
 * Registered tools that the pre-consolidation warrant surface omitted
 * because getToolSurface iterated a hand-maintained group list missing
 * backlogShellTools, storeConsolidateTools, and storeCleanupTools. The typed
 * inventory must cover them so warrant visibility matches registration.
 */
const BACKLOG_SHELL_AND_STORE_TOOLS = [
  "adv_backlog_add",
  "adv_backlog_list",
  "adv_backlog_show",
  "adv_backlog_promote",
  "adv_backlog_archive",
  "adv_store_consolidate",
  "adv_store_cleanup",
] as const;

/**
 * Public tools whose removal is contracted to sibling tasks of this change
 * (AC2/AC3). The latent definitions (adv_gate_criteria,
 * adv_epic_update_scope, adv_epic_merge) were never registered and therefore
 * never counted in the canonical list.
 */
const CONTRACTED_PUBLIC_REMOVALS = [
  "adv_backlog_state",
  "adv_project_wisdom_list",
] as const;

/**
 * Public tools whose addition is contracted to LATER changes after the
 * consolidation baseline landed (fixWedgedWorkflowRecovery added
 * adv_change_workflow_terminate; strengthenAgentEvidence added
 * adv_verification_evidence_disposition; addLightweightChangeProfile added
 * adv_lightweight_profile_evaluate). Exact accounting keeps the
 * canonical count pinned at every intermediate state: the count may grow
 * only via this recorded addition set, by exactly the number landed.
 */
const CONTRACTED_PUBLIC_ADDITIONS = [
  "adv_delta_modify",
  "adv_change_workflow_terminate",
  "adv_verification_evidence_disposition",
  "adv_lightweight_profile_evaluate",
  "adv_tool_catalog",
  "adv_tool_describe",
] as const;

const VALID_RISKS = ["low", "medium", "high", "operator"] as const;

const VALID_LIFECYCLE_GATES = [
  "proposal",
  "discovery",
  "design",
  "planning",
  "execution",
  "acceptance",
  "release",
] as const;

const VALID_GROUPS = [
  "bulk",
  "diagnostics",
  "lifecycle",
  "metadata",
  "read",
  "repair",
  "write",
] as const;

const VALID_REALMS = [
  "archive",
  "backlog",
  "change",
  "conformance",
  "contract",
  "design",
  "epic",
  "followup",
  "gate",
  "lightweight",
  "ops",
  "project",
  "reflection",
  "report",
  "session",
  "snapshot",
  "spec",
  "status",
  "store",
  "task",
  "temporal",
  "test",
  "tool",
  "verification",
  "wisdom",
  "worktree",
] as const;

describe("public tool inventory — DDC1 name-set parity", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("runtime createToolMap keys exactly equal derived inventory names", async () => {
    const store = await createLegacyStore(tempDir);
    await store.init();
    try {
      const map = createToolMap(store, tempDir, store.paths.agenda);
      expect(sorted(Object.keys(map))).toEqual(sorted(ADV_TOOL_NAMES));
    } finally {
      store.close();
    }
  });

  test("degraded createDegradedToolMap keys exactly equal derived inventory names", () => {
    const degraded = createDegradedToolMap(new Error("init failure"), "/tmp/x");
    expect(sorted(Object.keys(degraded))).toEqual(sorted(ADV_TOOL_NAMES));
  });

  test("warrant-surface names exactly equal derived inventory names", () => {
    expect(sorted(getToolSurface().keys())).toEqual(sorted(ADV_TOOL_NAMES));
  });

  test("derived canonical names contain no duplicates", () => {
    expect(new Set(ADV_TOOL_NAMES).size).toBe(ADV_TOOL_NAMES.length);
  });
});

describe("public tool inventory — DDC2 duplicate rejection", () => {
  test("collectPublicToolEntries rejects a duplicate name across groups before Set/Map collapse", () => {
    expect(() =>
      collectPublicToolEntries([
        { adv_alpha: { description: "Alpha", args: {} } },
        { adv_beta: { description: "Beta", args: { changeId: {} } } },
        { adv_alpha: { description: "Alpha dup", args: {} } },
      ]),
    ).toThrow(/[Dd]uplicate public tool name.*adv_alpha/);
  });

  test("collectPublicToolEntries rejects a duplicate within one group", () => {
    const colliding = { adv_alpha: { description: "Alpha", args: {} } };
    expect(() => collectPublicToolEntries([colliding, colliding])).toThrow(
      /[Dd]uplicate public tool name.*adv_alpha/,
    );
  });

  test("collectPublicToolEntries accepts disjoint groups and preserves declared args", () => {
    const entries = collectPublicToolEntries([
      {
        adv_alpha: { description: "Alpha", args: { changeId: {}, dryRun: {} } },
      },
      { adv_beta: { description: "Beta", args: {} } },
    ]);
    expect(entries.map((e) => e.name)).toEqual(["adv_alpha", "adv_beta"]);
    expect(entries[0]?.args).toEqual({ changeId: {}, dryRun: {} });
    expect(entries[1]?.args).toEqual({});
  });
});

describe("public tool inventory — DDC3 argument parity", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("warrant-surface argument keys equal registered (bound) argument keys for every tool", async () => {
    const store = await createLegacyStore(tempDir);
    await store.init();
    try {
      const map = createToolMap(store, tempDir, store.paths.agenda) as Record<
        string,
        { args: Record<string, unknown> }
      >;
      const surface = getToolSurface();
      for (const name of ADV_TOOL_NAMES) {
        const bound = sorted(Object.keys(map[name]?.args ?? {}));
        const warranted = sorted(surface.get(name) ?? new Set<string>());
        expect(warranted, `warrant-surface args for ${name}`).toEqual(bound);
      }
    } finally {
      store.close();
    }
  });
});

describe("public tool inventory — backlog-shell/store coverage", () => {
  test.each(BACKLOG_SHELL_AND_STORE_TOOLS)(
    "%s is on the canonical list and the warrant surface",
    (name) => {
      expect(ADV_TOOL_NAMES).toContain(name);
      expect(getToolSurface().has(name)).toBe(true);
    },
  );
});

describe("public tool inventory — title parity (AC5)", () => {
  test("every derived inventory name has an explicit display title", () => {
    for (const name of ADV_TOOL_NAMES) {
      expect(hasExplicitAdvToolTitle(name), `explicit title for ${name}`).toBe(
        true,
      );
    }
  });
});

describe("public tool inventory — SC1 baseline/final counts", () => {
  test("final canonical count equals recorded baseline minus landed contracted removals", async () => {
    const mod = (await import("./tool-registry")) as unknown as Record<
      string,
      unknown
    >;
    const baseline = mod.ADV_PUBLIC_TOOL_BASELINE_COUNT;
    // Source baseline recorded at implementation start (2026-07-15): the 80
    // registered public ADV tools prior to this change's contracted removals.
    expect(baseline, "recorded SC1 source baseline").toBe(80);

    const landedRemovals = CONTRACTED_PUBLIC_REMOVALS.filter(
      (name) => !ADV_TOOL_NAMES.includes(name),
    ).length;
    const landedAdditions = CONTRACTED_PUBLIC_ADDITIONS.filter((name) =>
      ADV_TOOL_NAMES.includes(name),
    ).length;
    // Exact accounting at every intermediate state: the count may drop only
    // via the contracted removal set and grow only via the contracted
    // addition set, each by exactly the number landed. At consolidation
    // completion both removals landed (78 = 80 - 2);
    // fixWedgedWorkflowRecovery then added the pinned termination tool
    // (79 = 80 - 2 + 1); strengthenAgentEvidence then added the
    // verification-evidence disposition tool (80 = 80 - 2 + 2);
    // addLightweightChangeProfile then added the lightweight profile evaluate
    // tool (81 = 80 - 2 + 3); addAdvanceMetadata then added the bounded tool
    // catalog and describe tools (83 = 80 - 2 + 5); restoreDesignerFollowUp
    // adds the typed modify writer (84 = 80 - 2 + 6).
    expect(ADV_TOOL_NAMES.length).toBe(
      (baseline as number) - landedRemovals + landedAdditions,
    );
    expect(ADV_TOOL_NAMES.length).toBeLessThanOrEqual(
      (baseline as number) + CONTRACTED_PUBLIC_ADDITIONS.length,
    );
  });
});

describe("public tool inventory — definition record completeness", () => {
  test("collectPublicToolEntries rejects a tool missing description", () => {
    expect(() =>
      collectPublicToolEntries([
        { adv_alpha: { args: { changeId: z.string() } } as any },
      ]),
    ).toThrow(/description/);
  });

  test("collectPublicToolEntries rejects a tool missing args", () => {
    expect(() =>
      collectPublicToolEntries([
        { adv_alpha: { description: "Alpha tool" } as any },
      ]),
    ).toThrow(/args/);
  });

  test("collectPublicToolEntries rejects empty description", () => {
    expect(() =>
      collectPublicToolEntries([
        { adv_alpha: { description: "", args: { changeId: z.string() } } },
      ]),
    ).toThrow(/description/);
  });

  test("collectPublicToolEntries preserves description and original Zod args", () => {
    const args = { changeId: z.string() };
    const entries = collectPublicToolEntries([
      { adv_alpha: { description: "Alpha tool", args } },
      { adv_beta: { description: "Beta tool", args: {} } },
    ]);
    expect(entries).toEqual([
      { name: "adv_alpha", description: "Alpha tool", args },
      { name: "adv_beta", description: "Beta tool", args: {} },
    ]);
  });
});

describe("public tool inventory — ADV_TOOL_METADATA parity", () => {
  test("metadata keys exactly equal derived inventory names", () => {
    expect(sorted(Object.keys(ADV_TOOL_METADATA))).toEqual(
      sorted(ADV_TOOL_NAMES),
    );
  });

  test("every metadata entry carries required descriptive facts", () => {
    for (const name of ADV_TOOL_NAMES) {
      const meta = ADV_TOOL_METADATA[name];
      expect(meta, `metadata exists for ${name}`).toBeDefined();
      expect(VALID_REALMS, `realm for ${name}`).toContain(meta.realm);
      expect(VALID_GROUPS, `group for ${name}`).toContain(meta.group);
      expect(meta.lifecycle.length, `lifecycle for ${name}`).toBeGreaterThan(0);
      for (const gate of meta.lifecycle) {
        expect(VALID_LIFECYCLE_GATES, `lifecycle gate for ${name}`).toContain(
          gate,
        );
      }
      expect(VALID_RISKS, `risk for ${name}`).toContain(meta.risk);
      expect(typeof meta.recoveryOnly, `recoveryOnly for ${name}`).toBe(
        "boolean",
      );
    }
  });

  test("metadata does not copy authority facts from TOOL_ROLE_POLICY", () => {
    for (const name of ADV_TOOL_NAMES) {
      const meta = ADV_TOOL_METADATA[name];
      expect(meta, `metadata for ${name}`).toBeDefined();
      expect(meta).not.toHaveProperty("class");
      expect(meta).not.toHaveProperty("agentActions");
      expect(meta).not.toHaveProperty("operatorActions");
      expect(meta).not.toHaveProperty("rationale");
    }
  });

  test("metadata does not copy manifest grants from AGENT_TOOL_POLICY", () => {
    for (const name of ADV_TOOL_NAMES) {
      const meta = ADV_TOOL_METADATA[name];
      expect(meta, `metadata for ${name}`).toBeDefined();
      expect(meta).not.toHaveProperty("allowed");
      expect(meta).not.toHaveProperty("explicitBlocked");
      expect(meta).not.toHaveProperty("denyWildcard");
    }
  });

  test("operator-risk metadata is limited to recovery-only repair tools", () => {
    const operatorRisk = ADV_TOOL_NAMES.filter(
      (name) => ADV_TOOL_METADATA[name].risk === "operator",
    );
    for (const name of operatorRisk) {
      expect(ADV_TOOL_METADATA[name].recoveryOnly, `${name} recoveryOnly`).toBe(
        true,
      );
      expect(ADV_TOOL_METADATA[name].group, `${name} group`).toBe("repair");
    }
  });
});
