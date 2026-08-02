/**
 * recovery_audit round-trip through ChangeSchema.parse.
 *
 * Defect 2 (issue #258): poisoned_history recovery writers stamp
 * `recovery_audit` onto the disk projection across five surface categories:
 *   - gates.{release,acceptance}                       (no persisted_via)
 *   - design_concern_dispositions[]                    (no persisted_via)
 *   - verification_evidence_dispositions[]             (no persisted_via)
 *   - task.change.subagent_reports[]                   (carries persisted_via)
 *   - task.tasks[].subagent_reports[]                  (carries persisted_via)
 *
 * Before the fix, the strict sub-agent report + disposition schemas lacked a
 * `recovery_audit` field, so the disk write succeeded but the next
 * ChangeSchema.parse rejected the projection — making poisoned_history
 * recovery unusable. This test pins the round-trip for all five surfaces plus
 * backward-compat (no recovery_audit) and strictness preservation (unknown
 * keys still reject).
 */

import { describe, expect, it } from "vitest";

import { ChangeSchema } from "./changes";

const baseChange = {
  id: "fixRecoverySchemaDrift",
  title: "Recovery Audit Round-Trip",
  status: "draft" as const,
  created_at: "2026-07-20T00:00:00.000Z",
  tasks: [],
  deltas: {},
};

/** Shape stamped by saveRecoveredGateCompletion / disposition writers. */
const gateRecoveryAudit = {
  reason: "poisoned_history recovery write",
  evidence: "completed workflow could not accept signal",
  recovered_at: "2026-07-20T00:00:00.000Z",
};

/**
 * Shape stamped by saveRecoveredSubagentReport. Carries the additional
 * `persisted_via` marker recorded by the writer (active-projection vs
 * archive-sidecar) so consumers can route the sidecar back to the correct
 * terminal projection.
 */
const subagentRecoveryAudit = {
  persisted_via: "active-projection",
  reason: "poisoned_history recovery write",
  evidence: "completed workflow could not accept signal",
  recovered_at: "2026-07-20T00:00:00.000Z",
};

const designDisposition = {
  taskId: "tk-design",
  concernKey: "component_correctness",
  disposition: "fixed" as const,
  evidence: "Re-implemented with a semantic <button>.",
  dispositionedAt: "2026-07-20T00:00:00.000Z",
};

const verificationDisposition = {
  taskId: "tk-verify",
  concernKey: "verification_mismatch",
  disposition: "fixed" as const,
  evidence: "Re-ran targeted suite; binding now matches.",
  dispositionedAt: "2026-07-20T00:00:00.000Z",
};

// --- Minimal valid sub-agent report payloads, one per agent surface. -------
// Each is just valid enough to parse; the test then attaches recovery_audit.

const engineerReport = {
  schema_version: "1.0",
  change_id: "fixRecoverySchemaDrift",
  task_id: "tk-eng",
  scope: { kind: "task" as const, task_id: "tk-eng" },
  attempt: 1,
  agent: "adv-engineer",
  status: "complete" as const,
  files_touched: ["plugin/src/types/subagent-reports.ts"],
  verification: [
    {
      command:
        "bin/oc-test targeted -- src/types/recovery-audit-roundtrip.test.ts",
      exit_code: 0,
      summary: "round-trip tests pass",
    },
  ],
  decisions: [
    { what: "Extend strict schemas via .extend()", why: "P33 boundary" },
  ],
  blockers: [],
  scope_drift: null,
  follow_ups: [],
  required_main_agent_actions: [],
  related_scan: "none",
  workdir_used: "/tmp/worktree",
  context_update_for_adv: {
    what_ads_needs_to_know: "recovery_audit now round-trips",
    suggested_next_action: "Verify worker bundle",
  },
};

const taskReviewerReport = {
  schema_version: "1.0",
  change_id: "fixRecoverySchemaDrift",
  task_id: "tk-review",
  scope: { kind: "task" as const, task_id: "tk-review" },
  attempt: 1,
  agent: "adv-reviewer",
  phase: "review" as const,
  verdict: "READY" as const,
  blocking_findings: [],
  nonblocking_findings: [],
  changes_made: [],
  wisdom_candidates: [],
  verification: {
    tests_run: [
      "bin/oc-test targeted -- src/types/recovery-audit-roundtrip.test.ts",
    ],
    results: "pass" as const,
    evidence: "exit code 0",
  },
  scope_drift: null,
  risks: [],
  required_main_agent_actions: [],
  workdir_used: "/tmp/worktree",
};

const changeScopedReviewerReport = {
  schema_version: "1.0",
  change_id: "fixRecoverySchemaDrift",
  scope: { kind: "change" as const, scope_key: "review:acceptance" },
  attempt: 1,
  agent: "adv-reviewer",
  phase: "review" as const,
  verdict: "READY" as const,
  blocking_findings: [],
  nonblocking_findings: [],
  changes_made: [],
  wisdom_candidates: [],
  verification: {
    tests_run: [
      "bin/oc-test targeted -- src/types/recovery-audit-roundtrip.test.ts",
    ],
    results: "pass" as const,
    evidence: "exit code 0",
  },
  scope_drift: null,
  risks: [],
  required_main_agent_actions: [],
  workdir_used: "/tmp/worktree",
};

const designerReport = {
  schema_version: "1.0",
  change_id: "fixRecoverySchemaDrift",
  task_id: "tk-design",
  scope: { kind: "task" as const, task_id: "tk-design" },
  attempt: 1,
  agent: "adv-designer",
  status: "complete" as const,
  files_touched: ["src/components/Button.tsx"],
  verification: [
    {
      command: "pnpm test -- src/components/Button.test.tsx",
      exit_code: 0,
      summary: "component tests pass",
    },
  ],
  decisions: [{ what: "Use semantic <button>", why: "Accessibility baseline" }],
  blockers: [],
  scope_drift: null,
  follow_ups: [],
  required_main_agent_actions: [],
  related_scan: "none",
  workdir_used: "/tmp/worktree",
  context_update_for_adv: {
    what_ads_needs_to_know: "Button shipped",
    suggested_next_action: "Run /adv-review",
  },
  design_dimensions: {
    component_correctness: "pass" as const,
    semantic_html_a11y: "pass" as const,
    responsive_behavior: "pass" as const,
    visual_polish: "pass" as const,
    site_design_consistency: "pass" as const,
    finer_details: "pass" as const,
    notes: "All dimensions pass.",
  },
  neighboring_recommendations: [],
};

const researcherReport = {
  schema_version: "1.0",
  change_id: "fixRecoverySchemaDrift",
  scope: { kind: "change" as const, scope_key: "researcher:recovery-docs" },
  attempt: 1,
  agent: "adv-researcher",
  topic: "recovery_audit schema drift",
  sources: [
    {
      label: "issue 258",
      locator: ".adv/changes/fixRecoverySchemaDrift",
      summary: "Strict schemas rejected recovery_audit disk writes.",
    },
  ],
  architecture_assessment: "Add optional recovery_audit to ingest schemas.",
  validation: {
    status: "caution" as const,
    blockers: [],
    notes: "Zod .strict() preserves inherited optional fields via .extend().",
  },
  architecture_judgement: {
    applicability: "applicable" as const,
    confidence: "medium" as const,
    risk: "low" as const,
    tradeoffs: ["Strict schemas gain one optional recovery-only field."],
    alternatives_considered: [
      {
        option: "Strip recovery_audit at read time",
        disposition: "rejected" as const,
        rationale: "Read-side strip hides a write-side defect class.",
      },
    ],
    recommendation:
      "Persist the field; opt-in shape via SubagentReportRecoveryAuditSchema.",
  },
  recommendation: "Extend the strict schemas.",
  follow_ups: [],
  workdir_used: "/tmp/worktree",
};

const tronReport = {
  schema_version: "1.0",
  change_id: "fixRecoverySchemaDrift",
  scope: { kind: "change" as const, scope_key: "tron:recovery-flow" },
  attempt: 1,
  agent: "adv-tron",
  target: "recovery writers",
  evidence: [
    {
      file: "plugin/src/tools/_recovery-writers.ts",
      summary: "saveRecoveredSubagentReport stamps persisted_via marker.",
    },
  ],
  findings: ["Recovery writes touch 5 disk surfaces"],
  hotspots: ["plugin/src/tools/_recovery-writers.ts"],
  risks: ["Strict schemas reject writes without recovery_audit field"],
  open_questions: [],
  suggested_next_commands: ["/adv-apply fixRecoverySchemaDrift"],
  follow_ups: [],
  workdir_used: "/tmp/worktree",
};

const scannerBundleReport = {
  schema_version: "1.0",
  change_id: "fixRecoverySchemaDrift",
  scope: { kind: "change" as const, scope_key: "scanner-bundle:review" },
  attempt: 1,
  agent: "adv-scanner-bundle",
  phase: "review" as const,
  scanner_count: 1,
  dimensions: ["schema"],
  summary: "Strict-schema drift blocks recovery writes.",
  findings: [
    {
      scanner: "schema",
      severity: "issue" as const,
      summary: "subagent-reports schemas lack recovery_audit",
      evidence: [
        {
          label: "spec",
          locator: "plugin/src/types/subagent-reports.ts",
          summary: "Strict schemas reject disk-projection writes.",
        },
      ],
    },
  ],
  follow_ups: [],
  workdir_used: "/tmp/worktree",
};

const verificationTriageReport = {
  schema_version: "1.0",
  change_id: "fixRecoverySchemaDrift",
  scope: { kind: "change" as const, scope_key: "verifier:local-verify" },
  attempt: 1,
  agent: "adv-verification-triage-bundle",
  workdir_used: "/tmp/worktree",
  phase: "local_verify" as const,
  targets: [
    {
      kind: "command" as const,
      command:
        "bin/oc-test targeted -- src/types/recovery-audit-roundtrip.test.ts",
      exit_code: 0,
      duration_ms: 1234,
    },
  ],
  status: "pass" as const,
  error_class: "TRANSIENT" as const,
  confidence: "high" as const,
  evidence_basis: "Round-trip tests cover all five disk surfaces.",
  findings: [],
  recommended_next_action: "continue" as const,
  scope_risk: false,
  required_main_agent_actions: [],
  follow_ups: [],
};

const visualReviewReport = {
  schema_version: "1.0",
  change_id: "fixRecoverySchemaDrift",
  scope: { kind: "change" as const, scope_key: "visual-review:screenshot" },
  attempt: 1,
  agent: "adv-visual-review",
  workdir_used: "/tmp/worktree",
  image: "screenshot.png",
  description: "Recovery write surface overview",
  text_found: [],
  elements: [],
  anomalies: [],
  confidence: "high" as const,
  confidence_reason: "Schema-derived; deterministic.",
  suggested_follow_up: [],
  blockers: [],
  follow_ups: [],
};

const allReports = [
  { name: "engineer", report: engineerReport },
  { name: "task-scoped reviewer", report: taskReviewerReport },
  { name: "designer", report: designerReport },
  { name: "change-scoped reviewer", report: changeScopedReviewerReport },
  { name: "researcher", report: researcherReport },
  { name: "tron", report: tronReport },
  { name: "scanner-bundle", report: scannerBundleReport },
  { name: "verification-triage-bundle", report: verificationTriageReport },
  { name: "visual-review", report: visualReviewReport },
];

describe("recovery_audit round-trips through ChangeSchema.parse", () => {
  describe("gates.{release,acceptance} (already supported — verifies continued support)", () => {
    it("parses gates.release carrying recovery_audit", () => {
      const change = ChangeSchema.parse({
        ...baseChange,
        gates: {
          release: { status: "done", recovery_audit: gateRecoveryAudit },
        },
      });
      expect(change.gates?.release?.recovery_audit).toEqual(gateRecoveryAudit);
    });

    it("parses gates.acceptance carrying recovery_audit", () => {
      const change = ChangeSchema.parse({
        ...baseChange,
        gates: {
          acceptance: { status: "done", recovery_audit: gateRecoveryAudit },
        },
      });
      expect(change.gates?.acceptance?.recovery_audit).toEqual(
        gateRecoveryAudit,
      );
    });
  });

  describe("design_concern_dispositions", () => {
    it("round-trips a disposition with recovery_audit", () => {
      const change = ChangeSchema.parse({
        ...baseChange,
        design_concern_dispositions: [
          { ...designDisposition, recovery_audit: gateRecoveryAudit },
        ],
      });
      expect(change.design_concern_dispositions?.[0].recovery_audit).toEqual(
        gateRecoveryAudit,
      );
    });

    it("rejects unknown field on disposition (strictness preserved)", () => {
      expect(() =>
        ChangeSchema.parse({
          ...baseChange,
          design_concern_dispositions: [
            { ...designDisposition, bogus_field: 1 },
          ],
        }),
      ).toThrow();
    });
  });

  describe("verification_evidence_dispositions", () => {
    it("round-trips a disposition with recovery_audit", () => {
      const change = ChangeSchema.parse({
        ...baseChange,
        verification_evidence_dispositions: [
          { ...verificationDisposition, recovery_audit: gateRecoveryAudit },
        ],
      });
      expect(
        change.verification_evidence_dispositions?.[0].recovery_audit,
      ).toEqual(gateRecoveryAudit);
    });

    it("rejects unknown field on disposition (strictness preserved)", () => {
      expect(() =>
        ChangeSchema.parse({
          ...baseChange,
          verification_evidence_dispositions: [
            { ...verificationDisposition, bogus_field: 1 },
          ],
        }),
      ).toThrow();
    });
  });

  describe("contract.reviewMatrix", () => {
    it("round-trips a review matrix with recovery_audit", () => {
      const change = ChangeSchema.parse({
        ...baseChange,
        contract: {
          version: 1,
          rigor: "standard",
          source: {
            artifact: "agreement",
            approvedAt: "2026-07-20T00:00:00.000Z",
          },
          items: [
            {
              id: "AC1",
              kind: "acceptance_criterion",
              text: "Recovery audit round-trips on review matrix.",
              sourceArtifact: "agreement",
              verificationRequired: true,
              evidencePolicy: "test",
              status: "approved",
            },
          ],
          reviewMatrix: {
            reviewedAt: "2026-07-20T00:00:00.000Z",
            rows: [
              {
                contractId: "AC1",
                kind: "acceptance_criterion",
                status: "pass",
                evidencePolicy: "test",
                evidence: "recovery-audit-roundtrip.test.ts passes",
              },
            ],
            recovery_audit: gateRecoveryAudit,
          },
          amendments: [],
        },
      });
      expect(change.contract?.reviewMatrix?.recovery_audit).toEqual(
        gateRecoveryAudit,
      );
    });
  });

  describe("subagent_reports[]", () => {
    it.each(allReports)(
      "round-trips $name report with recovery_audit",
      ({ report }) => {
        const change = ChangeSchema.parse({
          ...baseChange,
          subagent_reports: [
            { ...report, recovery_audit: subagentRecoveryAudit },
          ],
        });
        expect(change.subagent_reports?.[0].recovery_audit).toEqual(
          subagentRecoveryAudit,
        );
      },
    );

    it("rejects subagent report with unknown top-level field (strictness preserved)", () => {
      expect(() =>
        ChangeSchema.parse({
          ...baseChange,
          subagent_reports: [{ ...engineerReport, bogus_field: 1 }],
        }),
      ).toThrow();
    });

    it("rejects subagent report recovery_audit missing persisted_via", () => {
      const { persisted_via: _omit, ...missingVia } = subagentRecoveryAudit;
      void _omit;
      expect(() =>
        ChangeSchema.parse({
          ...baseChange,
          subagent_reports: [{ ...engineerReport, recovery_audit: missingVia }],
        }),
      ).toThrow();
    });
  });

  describe("task-scoped reports via tasks[].subagent_reports[]", () => {
    it("round-trips an engineer report attached to its task", () => {
      const change = ChangeSchema.parse({
        ...baseChange,
        tasks: [
          {
            id: "tk-eng",
            title: "Implement fix",
            intent: "schema",
            source: "user",
            status: "in_progress",
            classification: "code",
            phase_start: "execution",
            created_at: "2026-07-20T00:00:00.000Z",
            updated_at: "2026-07-20T00:00:00.000Z",
            subagent_reports: [
              { ...engineerReport, recovery_audit: subagentRecoveryAudit },
            ],
          },
        ],
      });
      expect(change.tasks[0].subagent_reports?.[0].recovery_audit).toEqual(
        subagentRecoveryAudit,
      );
    });
  });

  describe("backward compatibility (no recovery_audit anywhere)", () => {
    it("parses a change with dispositions + reports but no recovery_audit", () => {
      const change = ChangeSchema.parse({
        ...baseChange,
        design_concern_dispositions: [designDisposition],
        verification_evidence_dispositions: [verificationDisposition],
        subagent_reports: [engineerReport, researcherReport],
      });
      expect(
        change.design_concern_dispositions?.[0].recovery_audit,
      ).toBeUndefined();
      expect(
        change.verification_evidence_dispositions?.[0].recovery_audit,
      ).toBeUndefined();
      expect(change.subagent_reports?.[0].recovery_audit).toBeUndefined();
      expect(change.subagent_reports?.[1].recovery_audit).toBeUndefined();
    });

    it("parses a minimal change with no gates/dispositions/reports", () => {
      const change = ChangeSchema.parse(baseChange);
      expect(change.gates).toBeUndefined();
      expect(change.design_concern_dispositions).toBeUndefined();
      expect(change.subagent_reports).toBeUndefined();
    });
  });
});
