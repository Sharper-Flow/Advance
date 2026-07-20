import { describe, expect, test } from "vitest";
import { ADV_TOOL_NAMES, getToolSurface } from "./tool-registry";
import { gateTools } from "./tools/gate";
import { epicTools } from "./tools/epic";
import { backlogTools } from "./tools/backlog";
import { wisdomTools } from "./tools/wisdom";

/**
 * Tombstone guard for the tools removed by consolidateAdvToolSurface2
 * (latent task tk-abace490e402, reader-consolidation tasks tk-f022bfadbd81
 * and tk-11d902254d63; contract AC2/AC3/AC4 / DDC7).
 *
 * `adv_gate_criteria`, `adv_epic_update_scope`, and `adv_epic_merge` were
 * unreachable: absent from ADV_TOOL_NAMES and the runtime registry, yet still
 * defined on their `*Tools` groups and therefore visible on the
 * warrant-visible surface (`getToolSurface`). `adv_backlog_state` was a
 * registered public reader whose coordination behavior was later folded into
 * `/adv-triage` portfolio balance. An additional public reader tool was
 * subsequently retired by reshapeTriagePortfolioBalance; its literal name is
 * intentionally omitted per AC4 literal-no-reference policy, and
 * reintroduction is guarded by the count invariant in
 * tool-registry.inventory.test.ts.
 * `adv_project_wisdom_list` was a registered public reader whose project-only
 * listing and bounded limit moved into the retained `adv_wisdom_list`. All
 * removals are complete and non-backward-compatible — no wrappers, aliases,
 * or compatibility exports.
 *
 * This table-driven guard rejects reintroduction of a definition, export,
 * canonical-name entry, or warrant-surface entry. Historical archive bundles
 * and release notes under `.adv/archive/` remain permitted evidence, not
 * active references.
 */
const REMOVED_TOOLS = [
  { name: "adv_gate_criteria", group: gateTools, groupName: "gateTools" },
  { name: "adv_epic_update_scope", group: epicTools, groupName: "epicTools" },
  { name: "adv_epic_merge", group: epicTools, groupName: "epicTools" },
  {
    name: "adv_backlog_state",
    group: backlogTools,
    groupName: "backlogTools",
  },
  {
    name: "adv_project_wisdom_list",
    group: wisdomTools,
    groupName: "wisdomTools",
  },
] as const;

describe("removed tool tombstones", () => {
  test.each(REMOVED_TOOLS)(
    "$name has no definition on $groupName",
    ({ name, group }) => {
      expect(group).not.toHaveProperty(name);
    },
  );

  test.each(REMOVED_TOOLS)(
    "$name is absent from ADV_TOOL_NAMES",
    ({ name }) => {
      expect(ADV_TOOL_NAMES).not.toContain(name);
    },
  );

  test.each(REMOVED_TOOLS)(
    "$name is absent from the warrant-visible tool surface",
    ({ name }) => {
      expect(getToolSurface().has(name)).toBe(false);
    },
  );
});
