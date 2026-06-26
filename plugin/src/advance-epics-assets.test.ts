/**
 * Advance Epics contract asset tests
 *
 * Verifies that command, agent, and documentation contracts reflect the
 * Advance Epics capability: optional Epic membership, advisory order, compact
 * context loading, and the avoidance of project-management workflow clones.
 *
 * Citations: SC1, SC2, AC7, AC9, DONT1, DONT2, DONT3, DONT5, DONT7.
 */

import { describe, expect, test } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { ADV_TOOL_NAMES } from "./tool-registry";
import { epicTools } from "./tools/epic";

const REPO_ROOT = resolve(__dirname, "../..");

function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

const EPIC_TOOLS = ADV_TOOL_NAMES.filter((name) =>
  name.startsWith("adv_epic_"),
);

describe("Advance Epics spec documentation", () => {
  test("docs/specs/advance-epics.md mirrors the capability spec", () => {
    const doc = readRepoFile("docs/specs/advance-epics.md");

    for (const reqId of [
      "rq-epicEntity01",
      "rq-epicEntries01",
      "rq-epicCreateCommand01",
      "rq-epicPromotion01",
      "rq-epicOrderAdvisory01",
      "rq-epicNextWork01",
      "rq-epicOptionalMembership01",
      "rq-epicMembershipRepair01",
      "rq-epicProductScope01",
      "rq-epicNoJiraClone01",
      "rq-epicTemporalConstraints01",
    ]) {
      expect(doc).toContain(reqId);
    }
  });

  test(".adv/specs/advance-epics/spec.json exists and is valid JSON", () => {
    const specPath = join(REPO_ROOT, ".adv/specs/advance-epics/spec.json");
    expect(existsSync(specPath)).toBe(true);
    const spec = JSON.parse(readRepoFile(".adv/specs/advance-epics/spec.json"));
    expect(spec.name).toBe("advance-epics");
    expect(
      spec.requirements.some(
        (r: { id: string }) => r.id === "rq-epicMembershipRepair01",
      ),
    ).toBe(true);
    expect(
      spec.requirements.some(
        (r: { id: string }) => r.id === "rq-epicCreateCommand01",
      ),
    ).toBe(true);
  });
});

describe("/adv-epic command contract", () => {
  const commandPath = join(REPO_ROOT, ".opencode/command/adv-epic.md");

  test("command file exists and declares no change-id gate", () => {
    expect(existsSync(commandPath)).toBe(true);
    const content = readRepoFile(".opencode/command/adv-epic.md");
    const frontmatter = content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";

    expect(frontmatter).toContain("name: adv-epic");
    expect(frontmatter).toContain(
      "description: Gather Epic goals before typed creation",
    );
    expect(frontmatter).toContain("requiresChangeId: false");
    expect(content).toMatch(/\*\*Gate:\*\*\s*None|Gate:\s*None/i);
  });

  test("requires an ultimate goal before creating an Epic", () => {
    const content = readRepoFile(".opencode/command/adv-epic.md");

    expect(content).toContain("Ultimate Goal");
    expect(content).toMatch(/ultimate goal[\s\S]{0,300}adv_epic_create/i);
    expect(content).toMatch(/final confirmation[\s\S]{0,300}adv_epic_create/i);
  });

  test("requires evidence-backed neutral overlap handling", () => {
    const content = readRepoFile(".opencode/command/adv-epic.md");

    expect(content).toContain("adv_epic_list");
    expect(content).toContain("adv_epic_show");
    expect(content).toContain("adv_change_list");
    expect(content).toContain("adv_backlog_state");
    expect(content).toMatch(/neutral/i);
    expect(content).toMatch(/update\/clarify existing/i);
    expect(content).toMatch(/create new/i);
  });

  test("keeps initial entries optional and mutations typed", () => {
    const content = readRepoFile(".opencode/command/adv-epic.md");

    expect(content).toMatch(/initial (?:roadmap )?entries are optional/i);
    expect(content).toContain("adv_epic_add_shell");
    expect(content).toContain("adv_epic_link_change");
    expect(content).toMatch(/typed Epic tools|typed tools/i);
    expect(content).not.toMatch(/bin\/adv epic create/i);
  });
});

describe("ADV_INSTRUCTIONS.md Epic contract", () => {
  const instructions = readRepoFile("ADV_INSTRUCTIONS.md");

  test("declares Epics as the ADV initiative planning surface", () => {
    expect(instructions).toMatch(/ADV initiative planning/i);
    expect(instructions).toMatch(/ADV Epics/i);
  });

  test("states Epic membership is optional", () => {
    expect(instructions).toMatch(
      /Epics are \*\*optional\*\*|Epic membership is optional/i,
    );
  });

  test("states Epic order is advisory", () => {
    expect(instructions).toMatch(
      /Epic order is advisory|Use Epic order as advisory/i,
    );
  });

  test("forbids Jira-like project-management workflows", () => {
    expect(instructions).toMatch(/Do not add Jira-like/i);
    expect(instructions).toMatch(/assignments, estimates.*sprints/i);
  });

  test("forbids mandatory Epic membership and project-level shared workflow revival", () => {
    expect(instructions).toMatch(
      /Do not make every ADV change belong to an Epic/i,
    );
    expect(instructions).toMatch(
      /Do not revive a project-level shared workflow pattern/i,
    );
  });

  test("documents adv_epic_show for context loading", () => {
    expect(instructions).toContain("adv_epic_show epic_id:");
  });

  test("documents audited retrofit, move, and repair tools", () => {
    expect(instructions).toContain("adv_epic_link_change");
    expect(instructions).toContain("adv_epic_move_change");
    expect(instructions).toContain("adv_epic_repair_membership");
    expect(instructions).toMatch(/projection_pending|projection_stale/i);
    expect(instructions).toMatch(/target_unreachable/i);
  });

  test("documents Epic target_path support for cross-project membership", () => {
    expect(instructions).toMatch(
      /adv_epic_link_change.*adv_epic_unlink_change.*adv_epic_move_change.*adv_epic_repair_membership/,
    );
    expect(instructions).toMatch(/Product Epics[\s\S]{0,600}target_path/i);
    expect(instructions).toMatch(
      /adv_epic_link_change[\s\S]{0,300}target_path/i,
    );
  });
});

describe("ADV agent Epic tool allowlist and context loading", () => {
  const agent = readRepoFile(".opencode/agents/adv.md");

  test("allows every adv_epic_* tool", () => {
    for (const tool of EPIC_TOOLS) {
      expect(agent).toContain(`${tool}: true`);
    }
  });

  test("instructs orchestrator to load Epic context", () => {
    expect(agent).toContain("epic_membership");
    expect(agent).toContain("adv_epic_show epic_id:");
    expect(agent).toMatch(/Epic context/i);
  });

  test("reinforces optional membership, advisory order, and avoidances", () => {
    expect(agent).toMatch(/Epic membership is optional/i);
    expect(agent).toMatch(/advisory/i);
    expect(agent).toMatch(/Do not add Jira-like/i);
  });

  test("does not describe Epics as current-repo-only in v1", () => {
    expect(agent).not.toMatch(/Epics stay scoped to the current repo in v1/i);
    expect(agent).not.toMatch(/current-repo-only/i);
  });

  test("documents product-scoped cross-project Epic membership workflow", () => {
    expect(agent).toMatch(/Product Epics[\s\S]{0,700}target_path/i);
    expect(agent).toMatch(
      /create(?: or use)?[\s\S]{0,200}target-project ADV change[\s\S]{0,200}adv_epic_link_change[\s\S]{0,200}target_path/i,
    );
  });
});

describe("Epic tool descriptions describe target_path membership accurately", () => {
  test.each([
    ["adv_epic_link_change", epicTools.adv_epic_link_change.description],
    ["adv_epic_unlink_change", epicTools.adv_epic_unlink_change.description],
    ["adv_epic_move_change", epicTools.adv_epic_move_change.description],
  ])("%s is not described as same-project-only", (_tool, description) => {
    expect(description).not.toMatch(/same-project/i);
    expect(description).toMatch(/target_path|target-project|cross-project/i);
  });

  test("adv_epic_repair_membership documents target routing", () => {
    expect(epicTools.adv_epic_repair_membership.description).toMatch(
      /target-path|target_path|cross-project/i,
    );
  });
});

describe("Sub-agent context packets include Epic guidance", () => {
  const agentsDir = join(REPO_ROOT, ".opencode/agents");
  const agentFiles = readdirSync(agentsDir)
    .filter((f) => f.startsWith("adv-") && f.endsWith(".md"))
    .sort();

  const typedWorkers = [
    "adv-engineer.md",
    "adv-reviewer.md",
    "adv-researcher.md",
    "adv-designer.md",
  ];

  test.each(typedWorkers)(
    "%s mentions Epic context when packet includes epic_membership",
    (file) => {
      const content = readFileSync(join(agentsDir, file), "utf8");
      expect(content).toContain("epic_membership");
      expect(content).toMatch(/Epic context|supplementary initiative context/i);
    },
  );

  test("no agent file forces every change into an Epic", () => {
    for (const file of agentFiles) {
      const content = readFileSync(join(agentsDir, file), "utf8");
      // Reject phrasing that would make Epic membership mandatory.
      expect(content).not.toMatch(/every change MUST belong to an Epic/i);
    }
  });
});

describe("Command docs wire Epic context into workflow", () => {
  const commands: Array<{ file: string; required: string[] }> = [
    { file: "adv-proposal.md", required: ["adv_epic_promote_shell", "shell"] },
    {
      file: "adv-discover.md",
      required: ["epic_membership", "adv_epic_show epic_id:"],
    },
    {
      file: "adv-design.md",
      required: ["epic_membership", "adv_epic_show epic_id:"],
    },
    {
      file: "adv-prep.md",
      required: ["epic_membership", "adv_epic_show epic_id:", "advisory"],
    },
    { file: "adv-apply.md", required: ["epic_membership", "EPIC CONTEXT"] },
    { file: "adv-review.md", required: ["epic_membership", "EPIC CONTEXT"] },
    { file: "adv-harden.md", required: ["epic_membership", "EPIC CONTEXT"] },
  ];

  test.each(commands)(
    "$file includes Epic context references",
    ({ file, required }) => {
      const content = readRepoFile(`.opencode/command/${file}`);
      for (const token of required) {
        expect(content).toContain(token);
      }
    },
  );
});

describe("Epic avoidances are documented and not contradicted", () => {
  const specDoc = readRepoFile("docs/specs/advance-epics.md");

  test("spec doc forbids project-management field clones", () => {
    expect(specDoc).toMatch(/assignee, estimate, sprint, or board/i);
    expect(specDoc).toMatch(/not recognized as required Epic structure/i);
  });

  test("spec doc states membership is optional", () => {
    expect(specDoc).toMatch(/Epic membership MUST be optional/i);
  });

  test("spec doc states order is advisory", () => {
    expect(specDoc).toMatch(
      /order MUST affect display and next-work recommendations only/i,
    );
  });

  test("spec doc states retrofit membership is audited and repairable", () => {
    expect(specDoc).toContain("rq-epicMembershipRepair01");
    expect(specDoc).toMatch(/MUST require audit evidence/i);
    expect(specDoc).toMatch(/fast_follow_of.*not created or changed/i);
    expect(specDoc).toMatch(/target_unreachable/i);
  });
});

describe("Advance Epics ADR", () => {
  test("records the per-Epic workflow decision", () => {
    const adr = readRepoFile("docs/adr/0004-per-epic-workflow.md");
    expect(adr).toMatch(/Per-Epic Workflow/i);
    expect(adr).toMatch(/project-level shared workflow/i);
    expect(adr).toMatch(/epic_membership/i);
    expect(adr).toMatch(/AdvEpicId/i);
  });

  test("does not contradict product-scoped cross-project Epic support", () => {
    const adr = readRepoFile("docs/adr/0004-per-epic-workflow.md");
    expect(adr).not.toMatch(
      /Cross-repo Epic membership is out of scope for v1/i,
    );
    expect(adr).not.toMatch(/future cross-repo Epic design/i);
  });
});
