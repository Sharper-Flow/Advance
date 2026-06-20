/**
 * Skill-Backed Command Assets Tests
 *
 * Verifies that shared-skill commands (adv-harden, adv-slop-scan) ship the
 * expected skill files, and folded commands (adv-discover, adv-prep,
 * adv-apply, adv-review) embed their methodology inline after the Cut 4
 * presentation-layer simplification.
 *
 * Modeled on adv-tron-assets.test.ts — the canonical command+skill pattern.
 */

import { describe, expect, test } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const DEPLOY_SCRIPT_PATH = join(REPO_ROOT, "scripts/deploy-local.sh");
const TOKEN_BUDGETS_PATH = join(REPO_ROOT, ".opencode/token-budgets.json");
const COMMAND_DIR = join(REPO_ROOT, ".opencode/command");

const FORBIDDEN_RUNTIME_CHECKLIST_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
}> = [
  {
    name: "Advance checklist source path",
    pattern: /(?:\.\.\/\.\.\/)?docs\/checklists\/[a-z0-9-]+\.md/i,
  },
  {
    name: "runtime checklist follow directive",
    pattern: /CHECKLIST[^\n]*Follow[^\n]*checklist/i,
  },
  {
    name: "canonical checklist source directive",
    pattern: /Canonical source[s]?[^\n]*checklist/i,
  },
  {
    name: "Advance install tree methodology path",
    pattern: /~\/\.local\/share\/Advance/i,
  },
];

const SHARED_SKILL_COMMANDS = [
  {
    command: "adv-harden",
    skillDir: "adv-slop-detection",
    commandPath: join(REPO_ROOT, ".opencode/command/adv-harden.md"),
    skillPath: join(REPO_ROOT, "skills/adv-slop-detection/SKILL.md"),
  },
  {
    command: "adv-slop-scan",
    skillDir: "adv-slop-detection",
    commandPath: join(REPO_ROOT, ".opencode/command/adv-slop-scan.md"),
    skillPath: join(REPO_ROOT, "skills/adv-slop-detection/SKILL.md"),
  },
];

const EMBEDDED_METHODOLOGY_COMMANDS = [
  {
    command: "adv-discover",
    commandPath: join(REPO_ROOT, ".opencode/command/adv-discover.md"),
    marker: "### Discover Methodology",
  },
  {
    command: "adv-prep",
    commandPath: join(REPO_ROOT, ".opencode/command/adv-prep.md"),
    marker: "### Prep Methodology",
  },
  {
    command: "adv-apply",
    commandPath: join(REPO_ROOT, ".opencode/command/adv-apply.md"),
    marker: "### Apply Methodology",
  },
  {
    command: "adv-review",
    commandPath: join(REPO_ROOT, ".opencode/command/adv-review.md"),
    marker: "### Review Methodology",
  },
];

describe("skill-backed command assets", () => {
  for (const { command, skillDir, skillPath } of SHARED_SKILL_COMMANDS) {
    test(`${command} has a bundled skill at skills/${skillDir}/SKILL.md`, () => {
      expect(existsSync(skillPath)).toBe(true);
    });

    test(`${command} skill has YAML frontmatter with name, description, and keywords`, () => {
      const content = readFileSync(skillPath, "utf8");
      const frontmatter = content.split("---")[1] ?? "";

      expect(frontmatter).toMatch(/^name:\s+/m);
      expect(frontmatter).toMatch(/^description:\s+/m);
      expect(frontmatter).toMatch(/^keywords:\s+/m);
    });
  }

  test("adv-slop-detection skill documents false-positive control guidance", () => {
    const content = readFileSync(
      join(REPO_ROOT, "skills/adv-slop-detection/SKILL.md"),
      "utf8",
    );

    expect(content).toContain("## False-Positive Control");
    expect(content).toContain("Context Boundary");
    expect(content).toContain(
      "context packets are orientation only, not finding locations",
    );
    expect(content).toContain("Source Evidence Requirement");
    expect(content).toContain("Every finding must cite a target source file");
    expect(content).toContain(
      "Low-confidence findings are non-blocking by default",
    );
    expect(content).toContain(
      "AST-backed structural findings default to `confidence: high`",
    );
    expect(content).toContain(
      "Regex-only defensive-overkill findings default to `confidence: medium`",
    );
    expect(content).toContain(
      "Degraded fallback findings default to `confidence: low`",
    );
  });

  for (const { command, commandPath } of SHARED_SKILL_COMMANDS) {
    test(`${command} command loads its backing skill`, () => {
      const content = readFileSync(commandPath, "utf8");

      expect(content).toMatch(/skill\("/);
    });

    test(`${command} command documents inline fallback if skill is unavailable`, () => {
      const content = readFileSync(commandPath, "utf8");

      expect(content).toMatch(
        /skill is unavailable|fallback|embedded protocol/i,
      );
    });
  }

  for (const {
    command,
    commandPath,
    marker,
  } of EMBEDDED_METHODOLOGY_COMMANDS) {
    test(`${command} embeds its methodology inline`, () => {
      const content = readFileSync(commandPath, "utf8");

      expect(content).toContain(marker);
      expect(content).toMatch(/Methodology/i);
      expect(content).not.toMatch(
        /skill\("adv-(discover|prep|apply|review)-methodology"\)/,
      );
    });

    test(`${command} no longer loads a removed paired methodology skill`, () => {
      const content = readFileSync(commandPath, "utf8");

      expect(content).not.toMatch(
        /skill\("adv-(discover|prep|apply|review)-methodology"\)/,
      );
    });
  }

  test("runtime adv commands do not point agents at Advance checklist files", () => {
    const commandFiles = readdirSync(COMMAND_DIR)
      .filter((file) => /^adv-.*\.md$/.test(file))
      .sort();
    const violations: string[] = [];

    for (const file of commandFiles) {
      const content = readFileSync(join(COMMAND_DIR, file), "utf8");
      for (const { name, pattern } of FORBIDDEN_RUNTIME_CHECKLIST_PATTERNS) {
        const match = content.match(pattern);
        if (match) {
          violations.push(`${file}: ${name}: ${match[0]}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("deploy-local.sh glob covers adv-* skill directories", () => {
    const content = readFileSync(DEPLOY_SCRIPT_PATH, "utf8");

    expect(content).toContain('for skill_dir in "$REPO_SKILLS"/adv-*/; do');
  });
});

describe("command-vs-skill policy docs", () => {
  const ADV_INSTRUCTIONS_PATH = join(REPO_ROOT, "ADV_INSTRUCTIONS.md");
  const README_PATH = join(REPO_ROOT, "README.md");

  test("ADV_INSTRUCTIONS.md contains Command vs Skill Boundaries section", () => {
    const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

    expect(content).toContain("## Command vs Skill Boundaries");
    expect(content).toContain("adv-tron");
    expect(content).toContain("Skills × MUST NOT mutate ADV state");
    expect(content).toContain("inline fallback is required");
  });

  test("cross-cutting skill-backed commands remain documented in command/docs surface", () => {
    const instructions = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

    expect(instructions).toContain("adv-slop-detection");
    expect(instructions).toContain("adv-tron");
  });

  test("README.md mentions command + skill architecture", () => {
    const content = readFileSync(README_PATH, "utf8");

    expect(content).toContain("Command + skill architecture");
  });
});

describe("canonical policy sections in ADV_INSTRUCTIONS.md", () => {
  const ADV_INSTRUCTIONS_PATH = join(REPO_ROOT, "ADV_INSTRUCTIONS.md");

  test("contains Structured Sub-Agent Prompt Protocol section", () => {
    const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

    expect(content).toContain("### Structured Sub-Agent Prompt Protocol");
    expect(content).toContain("ROLE:");
    expect(content).toContain("OUTPUT_SCHEMA:");
    expect(content).toContain("BUDGET:");
    expect(content).toContain("STOP_WHEN:");
  });

  test("contains Orchestration Token-Budget Policy section", () => {
    const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

    expect(content).toContain("### Orchestration Token-Budget Policy");
    expect(content).toContain("When to spawn");
    expect(content).toContain("Max parallel workers");
  });

  test("contains Phase Summary Pattern section", () => {
    const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

    expect(content).toContain("### Phase Summary Pattern");
    expect(content).toContain("adv_change_update");
    expect(content).toContain("compact summaries");
  });

  test("Context Freshness uses two-tier model", () => {
    const content = readFileSync(ADV_INSTRUCTIONS_PATH, "utf8");

    expect(content).toContain("Phase start (once):");
    expect(content).toContain("Per task:");
    expect(content).toContain("adv_task_show");
    expect(content).toMatch(/Do NOT call.*adv_change_show.*before every task/i);
  });
});

describe("ambiguity taxonomy spec assets", () => {
  test("adv-proposal spec includes taxonomy requirements", () => {
    const spec = JSON.parse(
      readFileSync(
        join(REPO_ROOT, ".adv/specs/adv-proposal/spec.json"),
        "utf8",
      ),
    ) as { version: string; requirements: Array<{ id: string }> };

    expect(spec.version).toBe("1.3.0");
    expect(spec.requirements.map((rq) => rq.id)).toEqual(
      expect.arrayContaining([
        "rq-prop-tax1",
        "rq-prop-tax2",
        "rq-prop-tax3",
        "rq-stageProposalUserOutcomes01",
      ]),
    );
  });

  test("adv-discover spec includes taxonomy requirements", () => {
    const spec = JSON.parse(
      readFileSync(
        join(REPO_ROOT, ".adv/specs/adv-discover/spec.json"),
        "utf8",
      ),
    ) as { version: string; requirements: Array<{ id: string }> };

    expect(spec.version).toBe("1.4.0");
    expect(spec.requirements.map((rq) => rq.id)).toEqual(
      expect.arrayContaining([
        "rq-disc-tax1",
        "rq-disc-tax2",
        "rq-disc-tax3",
        "rq-discOpportunityScout01",
        "rq-discOpportunityScout02",
        "rq-stageDiscoveryFirmCriteria01",
        "rq-stageDiscoveryImplFreeGuard01",
        "rq-disc13",
        "rq-disc14",
        "rq-disc15",
      ]),
    );
  });

  test("stage-boundary specs include criteria ownership requirements", () => {
    const prepSpec = JSON.parse(
      readFileSync(join(REPO_ROOT, ".adv/specs/adv-prep/spec.json"), "utf8"),
    ) as { version: string; requirements: Array<{ id: string }> };
    const workflowSpec = JSON.parse(
      readFileSync(
        join(REPO_ROOT, ".adv/specs/advance-workflow/spec.json"),
        "utf8",
      ),
    ) as { version: string; requirements: Array<{ id: string }> };

    expect(prepSpec.version).toBe("1.3.0");
    expect(prepSpec.requirements.map((rq) => rq.id)).toEqual(
      expect.arrayContaining(["rq-stagePrepNoCriteriaFirming01"]),
    );
    expect(workflowSpec.version).toBe("1.19.0");
    expect(workflowSpec.requirements.map((rq) => rq.id)).toEqual(
      expect.arrayContaining([
        "rq-stageDesignCriteriaBoundary01",
        "rq-stageCriteriaEnforcementRetarget01",
        "rq-artifactPathTruth01",
      ]),
    );
  });

  test("ambiguity taxonomy command/checklist surfaces remain wired", () => {
    const proposal = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-proposal.md"),
      "utf8",
    );
    const discover = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-discover.md"),
      "utf8",
    );
    const clarify = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-clarify.md"),
      "utf8",
    );
    const proposalChecklist = readFileSync(
      join(REPO_ROOT, "docs/checklists/proposal-checklist.md"),
      "utf8",
    );
    const discoverChecklist = readFileSync(
      join(REPO_ROOT, "docs/checklists/discover-checklist.md"),
      "utf8",
    );

    expect(proposal).toContain("Phase 2.6: Run B/F/S Ambiguity Scan");
    expect(proposal).toContain("User Outcomes");
    expect(proposal).toContain("does NOT require testable success criteria");
    expect(discover).toContain("## Phase 2.5: Trigger Evaluation");
    expect(discover).toContain("AMBIGUITY ANALYSIS");
    expect(discover).toContain("## Success Criteria");
    expect(discover).toContain("advisory implementation-free guard");
    const design = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-design.md"),
      "utf8",
    );
    const prep = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-prep.md"),
      "utf8",
    );
    expect(design).toContain("## Design-Derived Criteria");
    expect(design).toContain(
      "MUST NOT invent new user-facing acceptance criteria",
    );
    expect(design).toContain("adv_change_reenter");
    expect(prep).toContain("does not firm criteria");
    expect(prep).toContain("rq-stagePrepNoCriteriaFirming01");
    expect(clarify).toContain("## Findings-Driven Mode");
    expect(proposalChecklist).toContain("## Ambiguity Scan (B/F/S)");
    expect(discoverChecklist).toContain("## Ambiguity Analysis Protocol");
  });

  test("structural contract traceability specs and docs are wired", () => {
    const workflowSpec = JSON.parse(
      readFileSync(
        join(REPO_ROOT, ".adv/specs/advance-workflow/spec.json"),
        "utf8",
      ),
    ) as { requirements: Array<{ id: string }> };
    const deliverySpec = JSON.parse(
      readFileSync(
        join(REPO_ROOT, ".adv/specs/advance-delivery/spec.json"),
        "utf8",
      ),
    ) as { requirements: Array<{ id: string }> };
    const workflowDoc = readFileSync(
      join(REPO_ROOT, "docs/specs/advance-workflow.md"),
      "utf8",
    );
    const deliveryDoc = readFileSync(
      join(REPO_ROOT, "docs/specs/advance-delivery.md"),
      "utf8",
    );

    expect(workflowSpec.requirements.map((rq) => rq.id)).toContain(
      "rq-contractTrace01",
    );
    expect(deliverySpec.requirements.map((rq) => rq.id)).toContain(
      "rq-contractArchiveProof01",
    );
    expect(workflowDoc).toContain("Structural Change-Contract Traceability");
    expect(deliveryDoc).toContain("Archive Contract Proof Gate");
  });
});

describe("thin-command shape enforcement", () => {
  const THIN_COMMANDS = [
    {
      command: "adv-review",
      path: join(REPO_ROOT, ".opencode/command/adv-review.md"),
      requiredPhases: [
        "Phase 0",
        "Phase 1",
        "Phase 2",
        "Phase 3",
        "REVIEW_FINDINGS",
      ],
      skillRef: null,
      // methodology that should NOT be inlined (lives in skill/checklist)
      forbiddenInline: [
        "Sub-Agent 1:",
        "Sub-Agent 2:",
        "Sub-Agent 3:",
        "Sub-Agent 4:",
        "Sub-Agent 5:",
      ],
    },
    {
      command: "adv-harden",
      path: join(REPO_ROOT, ".opencode/command/adv-harden.md"),
      requiredPhases: ["Phase 0", "Phase 1", "Phase 2", "Phase 3"],
      skillRef: "adv-slop-detection",
      forbiddenInline: [
        "Sub-Agent 1:",
        "Sub-Agent 2:",
        "Sub-Agent 3:",
        "Sub-Agent 4:",
        "Sub-Agent 5:",
        "Sub-Agent 6:",
      ],
    },
    {
      command: "adv-slop-scan",
      path: join(REPO_ROOT, ".opencode/command/adv-slop-scan.md"),
      requiredPhases: ["Phase 0", "Phase 1", "Phase 2"],
      skillRef: "adv-slop-detection",
      forbiddenInline: ["Scanner | Category | Focus"],
    },
    {
      command: "adv-proposal",
      path: join(REPO_ROOT, ".opencode/command/adv-proposal.md"),
      requiredPhases: ["Phase 1", "Phase 2", "Command Boundary"],
      skillRef: null, // command-only, no backing skill
      forbiddenInline: ["INVEST Criteria", "Smell Detection"],
    },
    {
      command: "adv-prep",
      path: join(REPO_ROOT, ".opencode/command/adv-prep.md"),
      requiredPhases: ["Phase 0", "Phase 1", "Phase 2", "Command Boundary"],
      skillRef: null,
      forbiddenInline: [
        "| **I**ndependent |",
        "| Subjective |",
        "| Retrofit chains |",
        "| 3-5 line change",
      ],
    },
    {
      command: "adv-apply",
      path: join(REPO_ROOT, ".opencode/command/adv-apply.md"),
      requiredPhases: ["Phase 0", "Phase 1", "Phase 2", "Phase 3"],
      skillRef: null,
      forbiddenInline: [
        '| "Let\'s skip/defer this" |',
        '| "This might need manual work" |',
        "| 3+ files, breaking API",
      ],
    },
  ];

  for (const { command, path: cmdPath, requiredPhases } of THIN_COMMANDS) {
    test(`${command} retains phase skeleton headings`, () => {
      const content = readFileSync(cmdPath, "utf8");

      for (const phase of requiredPhases) {
        expect(content).toContain(phase);
      }
    });
  }

  for (const { command, path: cmdPath, skillRef } of THIN_COMMANDS) {
    if (skillRef) {
      test(`${command} references its backing skill (${skillRef})`, () => {
        const content = readFileSync(cmdPath, "utf8");

        expect(content).toContain(skillRef);
      });
    }
  }

  test("proposal-checklist.md exists for extracted INVEST/smell methodology", () => {
    const checklistPath = join(
      REPO_ROOT,
      "docs/checklists/proposal-checklist.md",
    );

    expect(existsSync(checklistPath)).toBe(true);
  });

  test("prep-checklist uses planning gate terminology", () => {
    const content = readFileSync(
      join(REPO_ROOT, "docs/checklists/prep-checklist.md"),
      "utf8",
    );

    expect(content).toContain("adv_gate_complete gateId: planning");
    expect(content).not.toContain("adv_gate_complete gateId: prep");
  });

  test("adv-prep checks gate prerequisites before planning work", () => {
    const content = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-prep.md"),
      "utf8",
    );

    expect(content).toContain("adv_gate_status");
    expect(content).toMatch(
      /Stop if discovery or design gates are incomplete/i,
    );
  });

  test("adv-discover mints typed contract items from approved agreement", () => {
    const content = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-discover.md"),
      "utf8",
    );

    expect(content).toContain("adv_contract_mint");
    expect(content).toContain("contractSetSignal");
    expect(content).toContain("ChangeContract");
    expect(content).toContain("SC1..n");
    expect(content).toContain("AC1..n");
    expect(content).toContain("DONT1..n");
    expect(content).toContain("OOS1..n");
    expect(content).toMatch(/acceptanceCriteria.*projection/i);
    expect(content).toContain("DISCOVERY_CONTRACT_MISSING");
    const mintIdx = content.indexOf("adv_contract_mint");
    const gateIdx = content.indexOf(
      "adv_gate_complete changeId: {change-id} gateId: discovery",
    );
    expect(mintIdx).toBeGreaterThanOrEqual(0);
    expect(gateIdx).toBeGreaterThan(mintIdx);
  });

  test("adv-review preflights contract proof before acceptance checkpoint", () => {
    const review = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-review.md"),
      "utf8",
    );

    expect(review).toContain("Pre-Acceptance Contract Preflight");
    expect(review).toContain("change.contract");
    expect(review).toContain("contract.reviewMatrix");
    expect(review).toContain("fresh OpenCode session");
    const preflightIdx = review.indexOf("Pre-Acceptance Contract Preflight");
    const checkpointIdx = review.indexOf("Inline Approval prompt");
    expect(preflightIdx).toBeGreaterThanOrEqual(0);
    expect(checkpointIdx).toBeGreaterThan(preflightIdx);
  });

  test("acceptance preview URL contract is wired across discovery, review, and specs", () => {
    const workflowSpec = JSON.parse(
      readFileSync(
        join(REPO_ROOT, ".adv/specs/advance-workflow/spec.json"),
        "utf8",
      ),
    ) as { requirements: Array<{ id: string; title?: string }> };
    const workflowDoc = readFileSync(
      join(REPO_ROOT, "docs/specs/advance-workflow.md"),
      "utf8",
    );
    const discover = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-discover.md"),
      "utf8",
    );
    const review = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-review.md"),
      "utf8",
    );

    expect(workflowSpec.requirements.map((rq) => rq.id)).toContain(
      "rq-acceptancePreviewUrl01",
    );
    expect(workflowDoc).toContain("Front-End Acceptance Preview URL");

    expect(discover).toContain("visual_surface");
    expect(discover).toContain("true|false|unknown");
    expect(discover).toContain("preview applicability");

    expect(review).toContain("Preview URL");
    expect(review).toContain("reachability evidence");
    expect(review).toContain("contract.reviewMatrix");
    expect(review).toContain("`live` | `visual_surface: true`");
    expect(review).toContain("Preview URL: not_applicable");
    expect(review).toContain("Preview URL: blocked");
    expect(review).toContain("Do not fabricate URLs");
    expect(review).toContain("bare unverified URL");
    expect(review).toContain("Sanitize URLs");
    expect(review).toContain("Do not perform arbitrary HTTP probing");
    expect(review).toContain("visual-surface drift");

    const previewIdx = review.indexOf("Preview URL");
    const checkpointIdx = review.indexOf("Inline Approval prompt");
    expect(previewIdx).toBeGreaterThanOrEqual(0);
    expect(checkpointIdx).toBeGreaterThan(previewIdx);
  });

  test("prep checklist requires reload checkpoint for new MCP tools", () => {
    const checklist = readFileSync(
      join(REPO_ROOT, "docs/checklists/prep-checklist.md"),
      "utf8",
    );

    expect(checklist).toContain("Tool Registration Bootstrap");
    expect(checklist).toContain("new MCP tools");
    expect(checklist).toContain("fresh OpenCode session");
    expect(checklist).toContain("self-application/reload checkpoint");
  });

  test("adv-prep requires contract refs when synthesizing tasks", () => {
    const command = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-prep.md"),
      "utf8",
    );
    const checklist = readFileSync(
      join(REPO_ROOT, "docs/checklists/prep-checklist.md"),
      "utf8",
    );

    expect(command).toContain("contract_refs");
    expect(command).toContain("implements");
    expect(command).toContain("verifies");
    expect(command).toContain("respects");
    expect(command).toContain("not_applicable_reason");
    expect(checklist).toContain("Contract Traceability");
    expect(checklist).toContain("contract_refs");
  });

  test("review, harden, and archive preserve contract proof flow", () => {
    const review = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-review.md"),
      "utf8",
    );
    const harden = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-harden.md"),
      "utf8",
    );
    const archive = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-archive.md"),
      "utf8",
    );

    expect(review).toContain("adv_contract_review_matrix_set");
    expect(review).toContain("contractReviewMatrixSetSignal");
    expect(review).toContain("contract.reviewMatrix");
    expect(review).toContain("required contract item");
    expect(harden).toContain("Contract Proof Audit");
    expect(harden).toContain("contract.reviewMatrix");
    expect(archive).toContain("Contract Proof Gate");
    expect(archive).toContain("CONTRACT_TRACEABILITY.md");
    expect(archive).toMatch(/fail.*violated.*unknown/s);
  });

  test("gate artifact contracts document workflow-enforced artifacts", () => {
    const gatesDoc = readFileSync(join(REPO_ROOT, "docs/adv-gates.md"), "utf8");
    const prep = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-prep.md"),
      "utf8",
    );
    const review = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-review.md"),
      "utf8",
    );

    expect(gatesDoc).toContain(
      "workflow validates proposal.md, agreement.md, design.md, and generated acceptance.md",
    );
    expect(gatesDoc).toContain("User Outcomes");
    expect(gatesDoc).toContain("Design-Derived Criteria");
    expect(gatesDoc).toContain("Prep maps criteria/design into tasks");
    expect(gatesDoc).toContain("readiness_blockers");
    expect(prep).toContain("Artifact Excerpts");
    expect(prep).toContain("problem-statement.md excerpt");
    expect(review).toContain("generated acceptance.md projection");
    expect(review).toContain("workflow-visible `executive-summary.md`");
    expect(review).toContain("No-late-homework rule");
    expect(review).toContain("Do not manually edit acceptance.md");
    expect(review).toContain("readinessBlockers");
  });

  test("harden and slop-scan retain shared adv-slop-detection skill reference", () => {
    const hardenContent = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-harden.md"),
      "utf8",
    );
    const slopScanContent = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-slop-scan.md"),
      "utf8",
    );

    expect(hardenContent).toContain("adv-slop-detection");
    expect(slopScanContent).toContain("adv-slop-detection");
  });

  test("adv-apply uses two-tier context freshness (adv_task_show per task, not adv_change_show)", () => {
    const content = readFileSync(
      join(REPO_ROOT, ".opencode/command/adv-apply.md"),
      "utf8",
    );

    // Should NOT have the old pattern of calling adv_change_show before each task
    expect(content).not.toMatch(/Before EACH task[\s\S]*?adv_change_show/);
    // Should reference adv_task_show for per-task context refresh
    expect(content).toContain("adv_task_show");
  });
});

describe("command voice prose-load policy", () => {
  const COMMAND_VOICE_PATH = join(REPO_ROOT, "docs/command-voice-standard.md");

  test("caveman-full composes with prose-load templates", () => {
    const content = readFileSync(COMMAND_VOICE_PATH, "utf8");

    expect(content).toContain("### Caveman-full composition");
    expect(content).toContain("wording-density layer");
    expect(content).toContain("enforcement class still controls");
    expect(content).toContain("Exact contract tokens stay unchanged");
  });
});

describe("advisory line ceiling baselines", () => {
  // Baselines reflect current state. Updated after compression passes.
  // Advisory only: tests always pass but warn when files exceed baseline by >10%.
  const tokenBudgets = JSON.parse(readFileSync(TOKEN_BUDGETS_PATH, "utf8")) as {
    advInstructionsLineBaseline: number;
    commandLineBaselines: Record<string, number>;
  };
  const COMMAND_BASELINES = tokenBudgets.commandLineBaselines;

  test("advisory: command files within baseline tolerance (warn-only)", () => {
    const commandDir = join(REPO_ROOT, ".opencode/command");
    const warnings: string[] = [];

    for (const [file, baseline] of Object.entries(COMMAND_BASELINES)) {
      const filePath = join(commandDir, file);
      if (!existsSync(filePath)) continue;
      const content = readFileSync(filePath, "utf8");
      const lines = content.split("\n").length;
      const threshold = Math.ceil(baseline * 1.1);

      if (lines > threshold) {
        warnings.push(
          `⚠ ${file}: ${lines} lines (baseline: ${baseline}, threshold: ${threshold})`,
        );
      }
    }

    if (warnings.length > 0) {
      console.warn(
        `\n[ADV:TOKEN_BUDGET] ${warnings.length} command file(s) exceed baseline by >10%:\n${warnings.join("\n")}`,
      );
    }

    // Advisory: always passes
    expect(true).toBe(true);
  });

  test("advisory: total command file line count (warn-only)", () => {
    const commandDir = join(REPO_ROOT, ".opencode/command");
    let totalLines = 0;
    const totalBaseline = Object.values(COMMAND_BASELINES).reduce(
      (a, b) => a + b,
      0,
    );

    for (const file of Object.keys(COMMAND_BASELINES)) {
      const filePath = join(commandDir, file);
      if (!existsSync(filePath)) continue;
      const content = readFileSync(filePath, "utf8");
      totalLines += content.split("\n").length;
    }

    const threshold = Math.ceil(totalBaseline * 1.1);
    if (totalLines > threshold) {
      console.warn(
        `\n[ADV:TOKEN_BUDGET] Total command lines: ${totalLines} (baseline: ${totalBaseline}, threshold: ${threshold})`,
      );
    }

    // Advisory: always passes
    expect(true).toBe(true);
  });
});
