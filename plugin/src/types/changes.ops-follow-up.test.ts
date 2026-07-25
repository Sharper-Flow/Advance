/**
 * Ops follow-up schema tests — parsing, legacy compatibility, and field shape.
 */
import { describe, expect, it } from "vitest";
import {
  ChangeSchema,
  OpsEvidenceEntrySchema,
  OpsRunApprovalPolicySchema,
  OpsRunSchema,
  OpsFollowupLinkSchema,
  OpsFollowupProfileSchema,
  OpsFollowupResolutionSchema,
  OpsFollowupSourceSchema,
} from "./changes";

const timestamp = "2026-06-20T04:00:00.000Z";

describe("ops follow-up schemas", () => {
  it("parses a minimal ops follow-up profile", () => {
    const result = OpsFollowupProfileSchema.parse({
      kind: "migration",
      source: {
        source_change_id: "parent-1",
        source_kind: "required_follow_up",
      },
      relationship: "blocks",
      status: "not_started",
      created_at: timestamp,
    });

    expect(result).toMatchObject({
      kind: "migration",
      relationship: "blocks",
      status: "not_started",
      evidence: [],
      runs: [],
    });
  });

  it("parses a profile with evidence entries", () => {
    const result = OpsFollowupProfileSchema.parse({
      kind: "backfill",
      source: {
        source_change_id: "parent-2",
        source_project_id: "a".repeat(40),
        source_path: "/home/user/project",
        source_contract_id: "AC3",
        source_kind: "report_follow_up",
      },
      relationship: "follows_release",
      status: "running",
      created_at: timestamp,
      updated_at: timestamp,
      completion_signal: "backfill-complete",
      evidence: [
        {
          id: "ev-1",
          recorded_at: timestamp,
          env: "prod",
          action: "run-backfill",
          batch: "batch-001",
          status: "started",
          summary: "Backfill started for batch-001",
          next_step: "validate row counts",
        },
      ],
    });

    expect(result.evidence).toHaveLength(1);
    expect(result.evidence?.[0]).toMatchObject({
      id: "ev-1",
      status: "started",
      batch: "batch-001",
    });
  });

  it("parses a profile with typed ops runbook state", () => {
    const result = OpsFollowupProfileSchema.parse({
      kind: "migration",
      source: {
        source_change_id: "parent-runbook",
        source_kind: "required_follow_up",
      },
      relationship: "blocks",
      status: "running",
      created_at: timestamp,
      runs: [
        {
          id: "run-1",
          title: "Apply prod migration",
          status: "running",
          created_at: timestamp,
          plan: {
            env: "prod",
            action: "apply schema migration",
            bounds: ["tenant=batch-001", "max_rows=500"],
            evidence_policy: "command_output_summary",
            rollback_or_cleanup_plan:
              "rollback migration and verify schema version",
          },
          steps: [
            {
              id: "step-1",
              title: "Apply migration batch",
              kind: "execute",
              status: "running",
              approval_policy: {
                mode: "approval_required",
                approval_evidence: "User approved prod batch batch-001",
              },
            },
          ],
          evidence: [
            {
              id: "run-ev-1",
              recorded_at: timestamp,
              step_kind: "execute",
              env: "prod",
              run_id: "run-1",
              batch: "batch-001",
              status: "partial",
              summary: "Migration applied to batch-001; health check pending",
              artifact: {
                kind: "pointer",
                uri: "gh-run://12345",
              },
              next_status: "partial",
            },
          ],
        },
      ],
    });

    expect(result.runs).toHaveLength(1);
    expect(result.runs?.[0]?.plan.env).toBe("prod");
    expect(result.runs?.[0]?.steps[0]?.approval_policy.mode).toBe(
      "approval_required",
    );
    expect(result.runs?.[0]?.evidence[0]?.artifact.kind).toBe("pointer");
  });

  it("rejects bounded autonomous approval without explicit bounds", () => {
    expect(() =>
      OpsRunApprovalPolicySchema.parse({
        mode: "bounded_low_risk_autonomous",
        rationale: "Read-only health check is allowlisted",
        bounds: [],
      }),
    ).toThrow();
  });

  it("requires secret-safe artifact pointer or no-artifact rationale", () => {
    expect(() =>
      OpsRunSchema.parse({
        id: "run-bad-artifact",
        title: "Bad artifact",
        status: "running",
        created_at: timestamp,
        plan: {
          env: "prod",
          action: "inspect deployment",
          bounds: ["read-only"],
          evidence_policy: "summary",
          rollback_or_cleanup_plan: "no cleanup needed",
        },
        evidence: [
          {
            id: "ev-bad-artifact",
            recorded_at: timestamp,
            step_kind: "execute",
            env: "prod",
            status: "pass",
            summary: "raw logs omitted",
            artifact: { kind: "none" },
            next_status: "complete",
          },
        ],
      }),
    ).toThrow();
  });

  it("parses an outbound ops follow-up link with bounded resolution provenance", () => {
    const result = OpsFollowupLinkSchema.parse({
      id: "ofl-1",
      changeId: "child-1",
      relationship: "blocks",
      status: "running",
      linked_at: timestamp,
      resolution: {
        status: "complete",
        verified_at: "2026-06-20T04:05:00.000Z",
        child_updated_at: "2026-06-20T04:04:00.000Z",
        resolution_reason: "verified",
        source: "child_profile",
        completion_signal: "deploy finished",
        health_verification: "smoke passed",
        rollback_or_cleanup_disposition: "no rollback needed",
        evidence_summary: "child profile shows complete",
      },
    });

    expect(result.resolution).toMatchObject({
      status: "complete",
      child_updated_at: "2026-06-20T04:04:00.000Z",
      resolution_reason: "verified",
      source: "child_profile",
    });
  });

  it("rejects an unknown resolution_reason", () => {
    expect(() =>
      OpsFollowupResolutionSchema.parse({
        status: "complete",
        verified_at: timestamp,
        resolution_reason: "unknown_reason",
        source: "child_profile",
      }),
    ).toThrow();
  });

  it("parses an outbound ops follow-up link", () => {
    const result = OpsFollowupLinkSchema.parse({
      id: "ofl-1",
      target_project_id: "b".repeat(40),
      target_path: "/home/user/other",
      changeId: "child-1",
      relationship: "monitors",
      status: "partial",
      required_handoff: true,
      linked_at: timestamp,
      source_contract_id: "AC5",
    });

    expect(result).toMatchObject({
      id: "ofl-1",
      changeId: "child-1",
      relationship: "monitors",
      required_handoff: true,
    });
  });

  it("rejects an invalid source project id", () => {
    expect(() =>
      OpsFollowupSourceSchema.parse({
        source_change_id: "parent-1",
        source_project_id: "not-a-sha",
        source_kind: "manual",
      }),
    ).toThrow();
  });

  it("rejects an unknown relationship", () => {
    expect(() =>
      OpsFollowupLinkSchema.parse({
        id: "ofl-bad",
        changeId: "child-1",
        relationship: "watches",
        status: "not_started",
        linked_at: timestamp,
      }),
    ).toThrow();
  });

  it("ChangeSchema parses legacy changes without ops fields", () => {
    const result = ChangeSchema.parse({
      id: "legacy-change",
      title: "Legacy change",
      status: "draft",
      created_at: timestamp,
    });

    expect(result.id).toBe("legacy-change");
    expect(result).not.toHaveProperty("ops_followup");
    expect(result.ops_followup_links).toBeUndefined();
  });

  it("ChangeSchema round-trips ops fields", () => {
    const change = {
      id: "ops-change",
      title: "Ops change",
      status: "draft",
      created_at: timestamp,
      ops_followup: {
        kind: "cleanup",
        source: {
          source_change_id: "parent-3",
          source_kind: "agenda",
          source_agenda_id: "ag-1",
        },
        relationship: "cleanup_after",
        status: "cleanup_needed",
        created_at: timestamp,
        evidence: [
          {
            id: "ev-2",
            recorded_at: timestamp,
            env: "staging",
            action: "drop-temp-table",
            status: "complete",
            summary: "Cleanup complete",
          },
        ],
      },
      ops_followup_links: [
        {
          id: "ofl-2",
          changeId: "child-2",
          relationship: "follows_release",
          status: "not_started",
          linked_at: timestamp,
        },
      ],
    };

    const result = ChangeSchema.parse(change);
    expect(result.ops_followup?.kind).toBe("cleanup");
    expect(result.ops_followup?.evidence).toHaveLength(1);
    expect(result.ops_followup_links).toHaveLength(1);
    expect(result.ops_followup_links?.[0]?.id).toBe("ofl-2");
  });

  it("OpsEvidenceEntry rejects an invalid status", () => {
    expect(() =>
      OpsEvidenceEntrySchema.parse({
        id: "ev-bad",
        recorded_at: timestamp,
        env: "prod",
        action: "x",
        status: "in_progress",
        summary: "bad status",
      }),
    ).toThrow();
  });
});
