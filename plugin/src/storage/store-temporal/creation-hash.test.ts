/**
 * rq-creationRequestHash01 — unit tests for the canonical creation-request
 * hash and idempotency decision (tk-74c358188ffb, design D2 / AC4 / AC11).
 *
 * The hash establishes the "same business key + same request" idempotency
 * invariant. The business key is the deterministic change ID (project ID +
 * camelCase summary). Two create calls that collapse to the same change ID
 * are reconciled by the hash:
 *   - same hash  → idempotent match (retry / post-commit timeout recovery)
 *   - diff hash  → typed conflict (refuses before mutation per AC4 / DDC2)
 */
import { describe, expect, test } from "vitest";
import {
  computeCreationRequestHash,
  resolveCreationIdempotency,
  CREATION_HASH_CONFLICT_CODE,
} from "./creation-hash";

describe("computeCreationRequestHash", () => {
  test("is deterministic for identical stable inputs", () => {
    const a = computeCreationRequestHash({ summary: "Fix open bugs" });
    const b = computeCreationRequestHash({ summary: "Fix open bugs" });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  test("differs when summary differs", () => {
    const a = computeCreationRequestHash({ summary: "Fix open bugs" });
    const b = computeCreationRequestHash({ summary: "Fix closed bugs" });
    expect(a).not.toBe(b);
  });

  test("differs when capability differs", () => {
    const a = computeCreationRequestHash({
      summary: "Add thing",
      capability: "auth",
    });
    const b = computeCreationRequestHash({
      summary: "Add thing",
      capability: "billing",
    });
    expect(a).not.toBe(b);
  });

  test("differs when origin identity differs", () => {
    const a = computeCreationRequestHash({
      summary: "Add thing",
      origin: { kind: "triage", issue_number: 7 },
    });
    const b = computeCreationRequestHash({
      summary: "Add thing",
      origin: { kind: "triage", issue_number: 8 },
    });
    expect(a).not.toBe(b);
  });

  test("ignores fast_follow_of.linked_at timestamp (volatile)", () => {
    const a = computeCreationRequestHash({
      summary: "Add child",
      fast_follow_of: {
        parent_change_id: "parentChange",
        linked_at: "2026-07-22T01:00:00.000Z",
      },
    });
    const b = computeCreationRequestHash({
      summary: "Add child",
      fast_follow_of: {
        parent_change_id: "parentChange",
        linked_at: "2026-07-22T02:00:00.000Z",
      },
    });
    expect(a).toBe(b);
  });

  test("ignores cross_project_origin.linked_at timestamp (volatile)", () => {
    const a = computeCreationRequestHash({
      summary: "Add follow",
      cross_project_origin: {
        source_project: "toolbox",
        source_path: "/toolbox",
        source_change_id: "src1",
        linked_at: "2026-07-22T01:00:00.000Z",
      },
    });
    const b = computeCreationRequestHash({
      summary: "Add follow",
      cross_project_origin: {
        source_project: "toolbox",
        source_path: "/toolbox",
        source_change_id: "src1",
        linked_at: "2026-07-22T05:00:00.000Z",
      },
    });
    expect(a).toBe(b);
  });

  test("ignores epic_membership.linked_at timestamp (volatile)", () => {
    const a = computeCreationRequestHash({
      summary: "Add epic child",
      epic_membership_seed: {
        epic_id: "epicA",
        entry_id: "e1",
        order: 0,
        title: "T",
        linked_at: "2026-07-22T01:00:00.000Z",
      },
    });
    const b = computeCreationRequestHash({
      summary: "Add epic child",
      epic_membership_seed: {
        epic_id: "epicA",
        entry_id: "e1",
        order: 0,
        title: "T",
        linked_at: "2026-07-22T09:00:00.000Z",
      },
    });
    expect(a).toBe(b);
  });

  test("does NOT include artifact content (proposal/agreement/design)", () => {
    // Artifact content lives in workflow state.documents with its own
    // contentHash; including it here would make retry idempotency impossible
    // when a user tweaks a proposal between attempts.
    const a = computeCreationRequestHash({
      summary: "Add thing",
      // @ts-expect-error — artifacts are intentionally NOT part of input
      proposal: "# v1",
    });
    const b = computeCreationRequestHash({
      summary: "Add thing",
      // @ts-expect-error — same
      proposal: "# v2 much longer",
    });
    expect(a).toBe(b);
  });

  test("treats undefined and absent fields identically", () => {
    const a = computeCreationRequestHash({
      summary: "X",
      capability: undefined,
      origin: undefined,
    });
    const b = computeCreationRequestHash({ summary: "X" });
    expect(a).toBe(b);
  });
});

describe("resolveCreationIdempotency", () => {
  test("first creation when no existing hash", () => {
    const decision = resolveCreationIdempotency({
      existingHash: undefined,
      computedHash: "abc123",
    });
    expect(decision.kind).toBe("first_creation");
  });

  test("idempotent match when hashes equal", () => {
    const decision = resolveCreationIdempotency({
      existingHash: "abc123",
      computedHash: "abc123",
    });
    expect(decision.kind).toBe("idempotent_match");
  });

  test("hash conflict when hashes differ", () => {
    const decision = resolveCreationIdempotency({
      existingHash: "abc123",
      computedHash: "different",
    });
    expect(decision.kind).toBe("hash_conflict");
    if (decision.kind === "hash_conflict") {
      expect(decision.existing_hash).toBe("abc123");
      expect(decision.computed_hash).toBe("different");
    }
  });

  test("empty existing hash is treated as first creation (backward compat)", () => {
    // Legacy workflows pre-dating this field have undefined hash; treat as
    // first_creation so we don't block retries on already-running legacy
    // workflows. The new hash will be set on the next mutation.
    const decision = resolveCreationIdempotency({
      existingHash: "",
      computedHash: "abc123",
    });
    expect(decision.kind).toBe("first_creation");
  });
});

describe("CREATION_HASH_CONFLICT_CODE", () => {
  test("is a stable typed error code", () => {
    expect(CREATION_HASH_CONFLICT_CODE).toBe("CREATION_HASH_CONFLICT");
  });
});
