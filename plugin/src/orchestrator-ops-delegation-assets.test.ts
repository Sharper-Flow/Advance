import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ADV_AGENT_PATH = join(REPO_ROOT, ".opencode", "agents", "adv.md");
const APPLY_COMMAND_PATH = join(
  REPO_ROOT,
  ".opencode",
  "command",
  "adv-apply.md",
);
const ADV_INSTRUCTIONS_PATH = join(REPO_ROOT, "ADV_INSTRUCTIONS.md");
const ADVANCE_META_SPEC_PATH = join(
  REPO_ROOT,
  ".adv",
  "specs",
  "advance-meta",
  "spec.json",
);

function readRepoFile(path: string): string {
  return readFileSync(path, "utf8");
}

function sectionByHeading(content: string, heading: string): string {
  const headingPattern = new RegExp(`^## ${heading}$`, "m");
  const headingMatch = headingPattern.exec(content);
  expect(headingMatch, `missing ## ${heading} heading`).toBeTruthy();

  const start = headingMatch!.index;
  const rest = content.slice(start + headingMatch![0].length);
  const nextHeading = /^## /m.exec(rest);
  const end = nextHeading
    ? start + headingMatch![0].length + nextHeading.index
    : content.length;

  return content.slice(start, end);
}

function expectIncludes(haystack: string, needle: string, label: string): void {
  expect(haystack.includes(needle), `${label} missing token: ${needle}`).toBe(
    true,
  );
}

describe("orchestrator operational delegation assets", () => {
  test("adv.md carries operational delegation as prose only", () => {
    const content = readRepoFile(ADV_AGENT_PATH);
    const section = sectionByHeading(content, "Context-Optimal Execution");

    expectIncludes(section, "operational delegation", "adv.md section");
    expectIncludes(section, "reads/searches", "adv.md section");
    expectIncludes(section, "GitHub CI", "adv.md section");
    expectIncludes(section, "check-run", "adv.md section");
    expectIncludes(section, "verification triage", "adv.md section");
    expectIncludes(section, "second", "adv.md section");
    expectIncludes(section, "adv-verifier", "adv.md section");
    expectIncludes(section, "general", "adv.md section");

    expect(
      section,
      "Context-Optimal Execution must stay prose-only; adjacent sections may contain tables",
    ).not.toContain("|");
    expect(section).not.toMatch(/^\s*\|.*\|\s*$/m);
  });

  test("ADV_INSTRUCTIONS.md owns the orchestrator-session routing table", () => {
    const content = readRepoFile(ADV_INSTRUCTIONS_PATH);

    expectIncludes(
      content,
      "Orchestrator-Session Operational Routing",
      "ADV_INSTRUCTIONS.md",
    );
    expect(content).toMatch(
      /\|\s*GitHub CI \/ check-run \/ status investigation\s*\|\s*`general`\s*\|/,
    );
    expect(content).toMatch(
      /\|\s*repeated verify\/test bursts\s*\|\s*`adv-verifier`\s*\|/,
    );
    expect(content).toContain("structured verification triage");
    expect(content).toContain("before a second primary digest cycle");
    expect(content).toMatch(
      /\|\s*code edits after task scope known\s*\|\s*`adv-engineer`/i,
    );
    expect(content).toMatch(
      /\|\s*frontend\/component implementation\s*\|\s*`adv-engineer` first; `adv-designer` matching-cycle follow-up\s*\|/i,
    );
    expect(content).not.toMatch(
      /\|\s*(code edits after task scope known|frontend\/component implementation)\s*\|\s*`general`/i,
    );
  });

  test("adv-apply keeps task-level Step 4.5 routing and no ops table duplicate", () => {
    const content = readRepoFile(APPLY_COMMAND_PATH);

    expectIncludes(content, "Context-shed test passes?", "adv-apply.md");
    expectIncludes(content, "floor ~5 files or ~50 lines", "adv-apply.md");
    expectIncludes(
      content,
      "Step 4.5 does not override Step 1 or Step 4",
      "adv-apply.md",
    );
    expect(content.includes("Orchestrator-Session Operational Routing")).toBe(
      false,
    );
    expect(
      content.includes("GitHub CI / check-run / status investigation"),
    ).toBe(false);
  });

  test("adv-apply defines verification triage packet and result contract", () => {
    const content = readRepoFile(APPLY_COMMAND_PATH);

    for (const anchor of [
      "Verification Triage Packet",
      "Verification Triage Result",
      "adv-verification-triage-bundle",
      "local_verify",
      "ci_check",
      "command/check identity",
      "head_sha",
      "error_class",
      "confidence",
      "evidence_basis",
      "failure_attribution",
      "recommended_next_action",
      "route_adv_engineer",
      "scope_risk",
      "suggested_handoff",
      "Do not edit files",
      "Do not call adv_subagent_report_submit",
      "Do not complete gates",
      'subagent_type: "adv-verifier"',
      "general unavailable-runtime fallback",
    ]) {
      expectIncludes(content, anchor, "adv-apply verification triage");
    }
  });

  test("advance-meta declares orchestrator operational delegation law", () => {
    const spec = JSON.parse(readRepoFile(ADVANCE_META_SPEC_PATH)) as {
      requirements?: {
        id: string;
        body?: string;
        scenarios?: { id?: string }[];
      }[];
    };

    const requirement = spec.requirements?.find(
      (item) => item.id === "rq-orchestratorOpsDelegation01",
    );

    expect(requirement).toBeTruthy();
    expect(requirement?.body).toContain("orchestrator-session operational");
    expect(requirement?.body).toContain("GitHub CI");
    expect(requirement?.body).toContain("structured verification triage");
    expect(requirement?.body).toContain("local verification bursts");
    expect(requirement?.body).toContain("adv-verifier");
    expect(requirement?.body).toContain("general fallback");
    expect(requirement?.body).toContain("CI/check-run failures");
    expect(requirement?.body).toContain("before a second primary digest cycle");
    expect(requirement?.body).toContain("no second");

    const scenarioIds =
      requirement?.scenarios?.map((scenario) => scenario.id) ?? [];
    expect(scenarioIds).toEqual(
      expect.arrayContaining([
        "rq-orchestratorOpsDelegation01.1",
        "rq-orchestratorOpsDelegation01.2",
        "rq-orchestratorOpsDelegation01.3",
        "rq-orchestratorOpsDelegation01.4",
        "rq-orchestratorOpsDelegation01.5",
      ]),
    );
  });
});
