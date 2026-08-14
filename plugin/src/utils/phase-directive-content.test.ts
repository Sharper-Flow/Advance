/**
 * Phase directive content registry tests (T2 / design D2).
 *
 * Pins the authored /adv-review happy-path procedure delivered via
 * `_phasePlan.directive`: schema-valid registry, hash bound by construction
 * (DD3), contract tokens verbatim (C5), and structural guards that catch
 * template-literal escape corruption.
 */

import { describe, expect, test } from "vitest";
import { PhaseDirectiveSchema } from "./phase-plan";
import { sha256Hex } from "./command-payload-hash";
import {
  PHASE_DIRECTIVES,
  ADV_REVIEW_DIRECTIVE_CONTENT,
} from "./phase-directive-content";

const REQUIRED_TOKENS: string[] = [
  // Gate completion + acceptance checkpoint (C5 contract tokens)
  "adv_gate_complete",
  "gateId: acceptance",
  "Reply `accept`",
  "Inline Approval prompt",
  // Phase 7 proof chain
  "adv_contract_review_matrix_set",
  "contractReviewMatrixSetSignal",
  "contract.reviewMatrix",
  "Pre-Acceptance Contract Preflight",
  "change.contract",
  "fresh OpenCode session",
  "adv_change_update",
  "executiveSummary",
  "executive summary",
  "workflow-visible executive-summary",
  "No-late-homework rule",
  "chat approval alone is not durable acceptance proof",
  "### Persist Executive Summary",
  "### Ask for Acceptance (Inline)",
  "generated acceptance.md projection",
  "workflow-visible `executive-summary.md`",
  "Do not manually edit acceptance.md",
  "readinessBlockers",
  // Methodology (12-dimension framework, single-source invariant)
  "### Review Methodology",
  "## 12-Dimension Review Framework",
  "| 1 | Design | Architecture, system integration, timing |",
  "| 9 | Security | Auth, validation, secrets, OWASP top 10 |",
  "| 12 | Consistency | Matches existing patterns |",
  "embedded methodology",
  "all 12 dimensions",
  "explicit justification",
  // Briefing packets
  "briefingPacket: true",
  "_briefingPacket",
  "Review Scanner Context Packet",
  "Review Reviewer Remediation Packet",
  "Review Engineer Remediation Packet",
  "BRIEFING PACKET:",
  "WORKING DIRECTORY",
  "lane: scanner",
  "lane: reviewer",
  "lane: engineer",
  // Scanner evidence surface
  "TASK EVIDENCE SUMMARY:",
  "evidence_policy",
  "evidence_plan",
  "proof_target",
  "REVIEW_FINDINGS",
  "END_REVIEW_FINDINGS",
  "rejected_with_evidence",
  "No future-work deferral",
  // Non-code evidence policy
  "Non-Code Deliverables / Evidence Policy",
  "Non-Code Evidence Policy in the Review Matrix",
  "source_citation",
  "source_audit",
  "rubric_review",
  "stakeholder_acceptance",
  "artifact_reference",
  "Do not accept bare citation lists",
  "Each applicable `AC*`/`SC*` row must have `pass` or `fail` status",
  "Failing, `unknown`, or missing evidence blocks acceptance",
  // Bad-test cleanup dimension
  "Touched-Scope Bad-Test Cleanup",
  "flaky",
  "tautological",
  "implementation-coupled",
  // Designer concern structural rail
  "Designer Concern Enforcement",
  "checkUnresolvedDesignConcerns",
  "DESIGN_CONCERN_UNRESOLVED",
  "adv_design_concern_disposition",
  "design_dimensions",
  "neighboring_recommendation",
  "design_proof",
  "Advisory only",
  "no debt-acceptance disposition",
  // Approval Consequence Context (all 8 categories, stable order)
  "Approval Consequence Context",
  "buildApprovalConsequenceContext",
  "plugin/src/utils/approval-consequence-context.ts",
  "delivered value",
  "enabling-only/follow-up dependency",
  "ops readiness",
  "migration/data impact",
  "frontend/preview impact",
  "collision/release risk",
  "open follow-ups",
  "next action",
  "## Consequence Context",
  "non-technical release-approval",
  "evidence-only impact",
  "parenthetical supporting detail",
  "supporting technical evidence",
  // Preview URL contract
  "Preview URL",
  "reachability evidence",
  "`live` | `visual_surface: true`",
  "exact-route/state/hydration/viewport/freshness proof",
  "URL-source-only evidence",
  "fixture/mock presented as live",
  "stale/error/cached preview",
  "375px",
  "Preview URL: not_applicable",
  "Preview URL: blocked",
  "Do not fabricate URLs",
  "bare unverified URL",
  "Sanitize URLs",
  "Do not perform arbitrary HTTP probing",
  "visual-surface drift",
  // Scope discovery + skills
  "docs/scope-discovery-protocol.md",
  'skill("adv-frontend-review")',
  "adv-designer",
  "apply-phase only",
  "MUST NOT be spawned",
  // Sub-agent resilience + drift rule
  "Sub-Agent Resilience",
  "Drift Detection Rule",
  "adv_subagent_report_submit",
  "SCANNER_BUNDLE_REPORT",
  "adv-scanner-bundle",
  // Spine (fallback subset requires it)
  "## Problem",
  "## Chosen direction",
  "## Delivered",
  "acceptance ✓ → release",
  "/adv-harden {change-id}",
];

const FORBIDDEN_TOKENS: string[] = [
  "accepted_debt",
  "accepted-debt",
  "accepted debt",
  '"Note for agent"',
  "Sub-Agent 1:",
  "Sub-Agent 2:",
  "Sub-Agent 3:",
  "Sub-Agent 4:",
  "Sub-Agent 5:",
  'skill("adv-review-methodology")',
  'skill("adv-apply-methodology")',
];

describe("phase-directive-content registry", () => {
  test("registry exposes the adv-review directive, schema-valid at load", () => {
    const entry = PHASE_DIRECTIVES["adv-review"];
    expect(entry).toBeDefined();
    expect(entry.kind).toBe("phase_directive");
    expect(entry.command).toBe("adv-review");
    expect(entry.content.length).toBeGreaterThan(10000);
    // Load-time parse already ran at module import; re-validate explicitly.
    expect(() => PhaseDirectiveSchema.parse(entry)).not.toThrow();
  });

  test("contentHash is bound to content by construction (DD3)", () => {
    const entry = PHASE_DIRECTIVES["adv-review"];
    expect(entry.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.contentHash).toBe(sha256Hex(entry.content));
    expect(entry.contentHash).toBe(sha256Hex(ADV_REVIEW_DIRECTIVE_CONTENT));
  });

  test("template-literal escape integrity: no unresolved escapes, no interpolation junk", () => {
    // A missed \` escape would leave a literal backslash in the output.
    expect(ADV_REVIEW_DIRECTIVE_CONTENT).not.toContain("\\`");
    expect(ADV_REVIEW_DIRECTIVE_CONTENT).not.toContain("\\${");
    expect(ADV_REVIEW_DIRECTIVE_CONTENT).not.toContain("${");
    // Placeholders survive verbatim.
    expect(ADV_REVIEW_DIRECTIVE_CONTENT).toContain("{change-id}");
    expect(ADV_REVIEW_DIRECTIVE_CONTENT).toContain("{workdir}");
  });

  test("code-fence parity: fenced blocks are balanced", () => {
    const fences = ADV_REVIEW_DIRECTIVE_CONTENT.match(/```/g) ?? [];
    expect(fences.length % 2).toBe(0);
    expect(fences.length).toBeGreaterThan(10);
  });

  test("12-dimension framework is single-source inside the directive", () => {
    expect(
      ADV_REVIEW_DIRECTIVE_CONTENT.match(/^\| 1 \| Design \|/gm) ?? [],
    ).toHaveLength(1);
    expect(
      ADV_REVIEW_DIRECTIVE_CONTENT.match(/^\| 12 \| Consistency \|/gm) ?? [],
    ).toHaveLength(1);
    const methodologyIdx = ADV_REVIEW_DIRECTIVE_CONTENT.indexOf(
      "### Review Methodology",
    );
    const frameworkIdx = ADV_REVIEW_DIRECTIVE_CONTENT.indexOf(
      "## 12-Dimension Review Framework",
    );
    expect(methodologyIdx).toBeGreaterThan(-1);
    expect(frameworkIdx).toBeGreaterThan(methodologyIdx);
  });

  test("checkpoint ordering: preflight < consequence context < persist < ask < gate completion", () => {
    const c = ADV_REVIEW_DIRECTIVE_CONTENT;
    const preflight = c.indexOf("Pre-Acceptance Contract Preflight");
    const consequence = c.indexOf("Approval Consequence Context");
    const persist = c.indexOf("### Persist Executive Summary");
    const ask = c.indexOf("### Ask for Acceptance (Inline)");
    const gateCall = c.search(
      /adv_gate_complete[^\n]*gateId:\s*['"]?acceptance/,
    );
    expect(preflight).toBeGreaterThan(-1);
    expect(consequence).toBeGreaterThan(-1);
    expect(persist).toBeGreaterThan(consequence);
    expect(ask).toBeGreaterThan(persist);
    expect(gateCall).toBeGreaterThan(ask);
    // Inline approval prompt precedes the actual acceptance gate call.
    const inlineIdx = c.indexOf("Inline Approval prompt");
    expect(inlineIdx).toBeGreaterThan(-1);
    expect(gateCall).toBeGreaterThan(inlineIdx);
  });

  test("required contract tokens are present verbatim (C5)", () => {
    const missing = REQUIRED_TOKENS.filter(
      (token) => !ADV_REVIEW_DIRECTIVE_CONTENT.includes(token),
    );
    expect(missing).toEqual([]);
  });

  test("forbidden tokens are absent", () => {
    const present = FORBIDDEN_TOKENS.filter((token) =>
      ADV_REVIEW_DIRECTIVE_CONTENT.includes(token),
    );
    expect(present).toEqual([]);
  });

  test("Target Resolution and frontmatter are NOT in the directive (launcher-owned)", () => {
    expect(ADV_REVIEW_DIRECTIVE_CONTENT).not.toContain("## Target Resolution");
    expect(ADV_REVIEW_DIRECTIVE_CONTENT).not.toContain("phaseGoal:");
  });
});
