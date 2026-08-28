import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import {
  knipConfigSha256,
  PROVENANCE_REFRESH_COMMAND,
} from "./baseline-provenance";
import { deadCodeFingerprint, isDeadCodeFinding } from "./ratchet";
import type { SlopScanFinding } from "./schema";

const PLUGIN_ROOT = join(import.meta.dir, "../../../plugin");
const BASELINE_PATH = join(import.meta.dir, "dead-code-baseline.json");

interface DeadCodeBaselineArtifact {
  schema_version: "dead_code_baseline.v1";
  scope: {
    repo: "plugin";
    detector: "knip";
    finding_id: "MAINT-003";
    classification: "review-only";
  };
  provenance: {
    knip_config_sha256: string;
    entry_roots: string[];
    project_patterns: string[];
    git_head: string;
    fingerprint_count: number;
    kind_counts: Record<string, number>;
    review_basis: {
      classification: "review-only";
      deletion_owner: "clearDeadCodeBaseline";
      deletion_authority: false;
      provenance_refresh_owner?: string;
    };
    coverage_review: {
      before: {
        entry_roots: string[];
        normalized_finding_count: 1157;
        dead_code_fingerprint_count: 1150;
      };
      after: {
        entry_roots: string[];
        normalized_finding_count: 1157;
        dead_code_fingerprint_count: 1150;
      };
      unchanged_reason: string;
    };
  };
  fingerprints: string[];
}

function readBaseline(): DeadCodeBaselineArtifact {
  return JSON.parse(
    readFileSync(BASELINE_PATH, "utf8"),
  ) as DeadCodeBaselineArtifact;
}

function knipConfig(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(PLUGIN_ROOT, "knip.json"), "utf8"),
  ) as Record<string, unknown>;
}

function fingerprintKindCounts(fingerprints: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const fingerprint of fingerprints) {
    const kind = (JSON.parse(fingerprint) as { name: string }).name;
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

describe("reviewed dead-code baseline", () => {
  test("has the versioned plugin/Knip review-only scope", () => {
    const baseline = readBaseline();

    expect(baseline.schema_version).toBe("dead_code_baseline.v1");
    expect(baseline.scope).toEqual({
      repo: "plugin",
      detector: "knip",
      finding_id: "MAINT-003",
      classification: "review-only",
    });
  });

  test("contains sorted unique fingerprints produced by shared ratchet identity", () => {
    const baseline = readBaseline();

    expect(baseline.fingerprints.length).toBeGreaterThan(0);
    expect(baseline.fingerprints).toEqual(
      [...new Set(baseline.fingerprints)].sort(),
    );

    for (const fingerprint of baseline.fingerprints) {
      const finding = JSON.parse(fingerprint) as Pick<
        SlopScanFinding,
        "id" | "name" | "file" | "description"
      >;
      expect(
        isDeadCodeFinding({
          ...finding,
          category: "Dead Code",
        } as SlopScanFinding),
      ).toBe(true);
      expect(deadCodeFingerprint(finding, PLUGIN_ROOT)).toBe(fingerprint);
    }
  });

  test("proves capture provenance and fails when Knip coverage changes", () => {
    const baseline = readBaseline();
    const config = knipConfig();

    expect(baseline.provenance.knip_config_sha256).toBe(
      knipConfigSha256(config),
    );
    expect(baseline.provenance.entry_roots).toEqual(config.entry);
    expect(baseline.provenance.project_patterns).toEqual(config.project);
    expect(baseline.provenance.git_head).toMatch(/^[0-9a-f]{40}$/);
    expect(baseline.provenance.fingerprint_count).toBe(
      baseline.fingerprints.length,
    );
    expect(baseline.provenance.kind_counts).toEqual(
      fingerprintKindCounts(baseline.fingerprints),
    );
    expect(baseline.provenance.review_basis).toMatchObject({
      classification: "review-only",
      deletion_owner: "clearDeadCodeBaseline",
      deletion_authority: false,
    });
    const review = baseline.provenance.coverage_review;
    expect(review.before.entry_roots).not.toEqual(review.after.entry_roots);
    expect(
      review.before.entry_roots.every((root) =>
        review.after.entry_roots.includes(root),
      ),
    ).toBe(true);
    expect(review.after.entry_roots).toEqual(config.entry);
    expect(review.before.normalized_finding_count).toBeGreaterThan(0);
    expect(review.after.normalized_finding_count).toBe(
      review.before.normalized_finding_count,
    );
    expect(review.before.dead_code_fingerprint_count).toBeGreaterThan(0);
    expect(review.after.dead_code_fingerprint_count).toBe(
      review.before.dead_code_fingerprint_count,
    );
    expect(review.unchanged_reason).toContain("exact");
    expect(baseline.provenance.review_basis.provenance_refresh_owner).toBe(
      PROVENANCE_REFRESH_COMMAND,
    );
  });
});
