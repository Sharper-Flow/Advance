import { describe, expect, test } from "vitest";
import { ADV_TOOL_NAMES, getToolSurface } from "./tool-registry";
import { gateTools } from "./tools/gate";
import { epicTools } from "./tools/epic";
import { backlogTools } from "./tools/backlog";

/**
 * Tombstone guard for the tools removed by consolidateAdvToolSurface2
 * (latent task tk-abace490e402, reader-consolidation task tk-f022bfadbd81;
 * contract AC2/AC4 / DDC7).
 *
 * `adv_gate_criteria`, `adv_epic_update_scope`, and `adv_epic_merge` were
 * unreachable: absent from ADV_TOOL_NAMES and the runtime registry, yet still
 * defined on their `*Tools` groups and therefore visible on the
 * warrant-visible surface (`getToolSurface`). `adv_backlog_state` was a
 * registered public reader whose TTL-freshness and O(1) Visibility
 * annotation behavior moved into the retained `adv_roadmap`. All removals
 * are complete and non-backward-compatible — no wrappers, aliases, or
 * compatibility exports.
 *
 * This table-driven guard rejects reintroduction of a definition, export,
 * canonical-name entry, or warrant-surface entry. Historical archive bundles
 * and release notes under `.adv/archive/` remain permitted evidence, not
 * active references. The sibling removal (`adv_project_wisdom_list`) lands
 * in its own task and extends the table when its definition is deleted.
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
