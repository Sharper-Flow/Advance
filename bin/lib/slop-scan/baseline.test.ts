import { describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

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

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalJson(item)]),
    );
  }
  return value;
}

function knipConfig(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(PLUGIN_ROOT, "knip.json"), "utf8"),
  ) as Record<string, unknown>;
}

function knipConfigSha256(): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalJson(knipConfig())))
    .digest("hex");
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

    expect(baseline.provenance.knip_config_sha256).toBe(knipConfigSha256());
    expect(baseline.provenance.entry_roots).toEqual(config.entry);
    expect(baseline.provenance.project_patterns).toEqual(config.project);
    expect(baseline.provenance.git_head).toMatch(/^[0-9a-f]{40}$/);
    expect(baseline.provenance.fingerprint_count).toBe(
      baseline.fingerprints.length,
    );
    expect(baseline.provenance.kind_counts).toEqual(
      fingerprintKindCounts(baseline.fingerprints),
    );
    expect(baseline.provenance.review_basis).toEqual({
      classification: "review-only",
      deletion_owner: "clearDeadCodeBaseline",
      deletion_authority: false,
    });
    expect(baseline.provenance.coverage_review).toEqual({
      before: {
        entry_roots: [
          "src/cli/projection-boundary.ts",
          "src/index.ts",
          "src/mcp-server/index.ts",
          "src/reconcile-cli.ts",
        ],
        normalized_finding_count: 1157,
        dead_code_fingerprint_count: 1150,
      },
      after: {
        entry_roots: config.entry,
        normalized_finding_count: 1157,
        dead_code_fingerprint_count: 1150,
      },
      unchanged_reason:
        "Added package-script roots are executable evidence but remain outside project src/**/*.ts; MCP/reconcile roots expose only candidates already present in the pre-coverage set. Independent before/after normalized-set comparison was exact.",
    });
  });
});
