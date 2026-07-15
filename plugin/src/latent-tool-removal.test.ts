import { describe, expect, test } from "vitest";
import { ADV_TOOL_NAMES, getToolSurface } from "./tool-registry";
import { gateTools } from "./tools/gate";
import { epicTools } from "./tools/epic";

/**
 * Tombstone guard for the latent tools removed by consolidateAdvToolSurface2
 * (task tk-abace490e402, contract AC4 / DDC7).
 *
 * `adv_gate_criteria`, `adv_epic_update_scope`, and `adv_epic_merge` were
 * unreachable: absent from ADV_TOOL_NAMES and the runtime registry, yet still
 * defined on their `*Tools` groups and therefore visible on the
 * warrant-visible surface (`getToolSurface`). The removal is complete and
 * non-backward-compatible — no wrappers, aliases, or compatibility exports.
 *
 * This table-driven guard rejects reintroduction of a definition, export,
 * canonical-name entry, or warrant-surface entry. Historical archive bundles
 * and release notes under `.adv/archive/` remain permitted evidence, not
 * active references. Sibling removals (`adv_backlog_state`,
 * `adv_project_wisdom_list`) land in their own tasks and extend the table
 * when their definitions are deleted.
 */
const REMOVED_LATENT_TOOLS = [
  { name: "adv_gate_criteria", group: gateTools, groupName: "gateTools" },
  { name: "adv_epic_update_scope", group: epicTools, groupName: "epicTools" },
  { name: "adv_epic_merge", group: epicTools, groupName: "epicTools" },
] as const;

describe("latent tool removal tombstones", () => {
  test.each(REMOVED_LATENT_TOOLS)(
    "$name has no definition on $groupName",
    ({ name, group }) => {
      expect(group).not.toHaveProperty(name);
    },
  );

  test.each(REMOVED_LATENT_TOOLS)(
    "$name is absent from ADV_TOOL_NAMES",
    ({ name }) => {
      expect(ADV_TOOL_NAMES).not.toContain(name);
    },
  );

  test.each(REMOVED_LATENT_TOOLS)(
    "$name is absent from the warrant-visible tool surface",
    ({ name }) => {
      expect(getToolSurface().has(name)).toBe(false);
    },
  );
});
