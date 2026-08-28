import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";

import {
  canonicalJson,
  knipConfigSha256,
  planDeadCodeProvenanceRefresh,
  refreshDeadCodeBaselineProvenance,
  type BaselineArtifact,
} from "./baseline-provenance";

const CONFIG_HASH =
  "b3b5ea0c6bbd5bc3aaedd2d1555c5c571aa3879a068cd923fd33ce73929bf310";

function baseline(): BaselineArtifact {
  return {
    schema_version: "dead_code_baseline.v1",
    scope: {
      repo: "plugin",
      detector: "knip",
      finding_id: "MAINT-003",
      classification: "review-only",
    },
    provenance: {
      knip_config_sha256: "old-hash",
      entry_roots: ["src/index.ts"],
      project_patterns: ["src/**/*.ts"],
      git_head: "a".repeat(40),
      fingerprint_count: 1,
      kind_counts: { unused_export: 1 },
      review_basis: {
        classification: "review-only",
        deletion_owner: "clearDeadCodeBaseline",
        deletion_authority: false,
      },
      coverage_review: {
        before: {
          entry_roots: [],
          normalized_finding_count: 1,
          dead_code_fingerprint_count: 1,
        },
        after: {
          entry_roots: ["src/index.ts"],
          normalized_finding_count: 1,
          dead_code_fingerprint_count: 1,
        },
        unchanged_reason: "old exact reason",
      },
    },
    fingerprints: [
      '{"id":"MAINT-003","name":"unused_export","file":"src/index.ts","description":"old"}',
    ],
  };
}

const finding = {
  id: "MAINT-003",
  name: "unused_export",
  severity: "LOW" as const,
  category: "Dead Code",
  file: "src/index.ts",
  line: 1,
  description: "Knip reported unused export old.",
  fix: "Review this finding.",
  confidence: "high" as const,
  detectionMethod: "tool" as const,
  grouping: "user-review" as const,
  actionability: "review_required" as const,
  phase: 1 as const,
  nestingDepth: null,
  complexity: null,
};

describe("dead-code baseline provenance", () => {
  test("canonicalizes object keys with code-point ordering", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toEqual({
      a: { b: 3, y: 2 },
      z: 1,
    });
  });

  test("reproduces the current plugin Knip configuration hash", () => {
    const config = {
      z: true,
      entry: ["src/index.ts"],
      project: ["src/**/*.ts"],
    };
    expect(knipConfigSha256(config)).toMatch(/^[0-9a-f]{64}$/);
    expect(
      knipConfigSha256({
        $schema: "https://unpkg.com/knip@6/schema.json",
        entry: [
          "scripts/bench-adv-latency.ts",
          "scripts/build-plugin.ts",
          "scripts/check-frontmatter.ts",
          "scripts/check-lockfile-policy.ts",
          "scripts/check-prompt-budget.ts",
          "scripts/check-sdk-parity.ts",
          "scripts/check-skill-references.ts",
          "scripts/check-test-isolation.ts",
          "scripts/generate-agent-manifests.ts",
          "scripts/generate-json-schemas.ts",
          "scripts/write-build-identity.ts",
          "src/cli/projection-boundary.ts",
          "src/doctor-cli.ts",
          "src/index.ts",
          "src/mcp-server/index.ts",
          "src/reconcile-cli.ts",
          "src/summary-candidates-cli.ts",
        ],
        project: ["src/**/*.ts"],
        ignore: [
          "src/__mocks__/**",
          "src/__tests__/**",
          "**/*.test.ts",
          "dist/**",
        ],
        ignoreDependencies: ["@opencode-ai/plugin"],
      }),
    ).toBe(CONFIG_HASH);
  });

  test("requires exact normalized and dead-code sets before output", () => {
    const oldBaseline = baseline();
    oldBaseline.provenance.knip_config_sha256 = knipConfigSha256({
      entry: ["src/index.ts"],
      project: ["src/**/*.ts"],
    });
    const currentConfig = {
      entry: ["src/index.ts", "src/extra.ts"],
      project: ["src/**/*.ts"],
    };
    const currentConfigHash = knipConfigSha256(currentConfig);
    const result = planDeadCodeProvenanceRefresh({
      baseline: oldBaseline,
      currentConfig,
      reconstructedConfig: {
        entry: ["src/index.ts"],
        project: ["src/**/*.ts"],
      },
      currentConfigHash,
      gitHead: "b".repeat(40),
      beforeFindings: [finding, finding],
      afterFindings: [finding, finding],
      repoRoot: "/repo",
    });

    expect(result.status).toBe("refreshed");
    expect(result.comparison).toMatchObject({
      normalizedFindingCount: 2,
      deadCodeFingerprintCount: 1,
      added: [],
      removed: [],
    });
    expect(result.artifact?.provenance).toMatchObject({
      knip_config_sha256: currentConfigHash,
      entry_roots: ["src/index.ts", "src/extra.ts"],
      git_head: "b".repeat(40),
    });
    expect(result.artifact?.fingerprints).toEqual(oldBaseline.fingerprints);
    expect(result.artifact?.provenance.review_basis.deletion_authority).toBe(
      false,
    );
  });

  test("refuses a changed set without an artifact", () => {
    const oldBaseline = baseline();
    oldBaseline.provenance.knip_config_sha256 = knipConfigSha256({
      entry: ["src/index.ts"],
      project: ["src/**/*.ts"],
    });
    const result = planDeadCodeProvenanceRefresh({
      baseline: oldBaseline,
      currentConfig: {
        entry: ["src/index.ts", "src/extra.ts"],
        project: ["src/**/*.ts"],
      },
      reconstructedConfig: {
        entry: ["src/index.ts"],
        project: ["src/**/*.ts"],
      },
      currentConfigHash: "new-hash",
      gitHead: "b".repeat(40),
      beforeFindings: [finding],
      afterFindings: [{ ...finding, name: "different" }],
      repoRoot: "/repo",
    });

    expect(result.status).toBe("refused");
    expect(result.artifact).toBeUndefined();
    expect(result.comparison?.added.length).toBeGreaterThan(0);
    expect(result.comparison?.removed.length).toBeGreaterThan(0);
  });

  test("refuses a reconstructed configuration hash mismatch", () => {
    const oldBaseline = baseline();
    oldBaseline.provenance.knip_config_sha256 = knipConfigSha256({
      entry: ["src/index.ts"],
      project: ["src/**/*.ts"],
    });
    const result = planDeadCodeProvenanceRefresh({
      baseline: oldBaseline,
      currentConfig: {
        entry: ["src/index.ts", "src/extra.ts"],
        project: ["src/**/*.ts"],
      },
      reconstructedConfig: {
        entry: ["src/index.ts"],
        project: ["src/**/*.ts"],
        ignore: ["unsafe"],
      },
      currentConfigHash: "new-hash",
      gitHead: "b".repeat(40),
      beforeFindings: [finding],
      afterFindings: [finding],
      repoRoot: "/repo",
    });

    expect(result.status).toBe("refused");
    expect(result.diagnostics.join("\n")).toContain("reconstructed");
  });

  test("rejects malformed immutable scope and authority fields", () => {
    const mutations = [
      (artifact: BaselineArtifact) => {
        artifact.scope.repo = "other" as "plugin";
      },
      (artifact: BaselineArtifact) => {
        artifact.provenance.knip_config_sha256 = "A".repeat(64);
      },
      (artifact: BaselineArtifact) => {
        artifact.provenance.git_head = "not-a-sha";
      },
      (artifact: BaselineArtifact) => {
        artifact.provenance.review_basis.classification =
          "other" as "review-only";
      },
      (artifact: BaselineArtifact) => {
        artifact.provenance.review_basis.deletion_owner = "other";
      },
      (artifact: BaselineArtifact) => {
        artifact.provenance.review_basis.deletion_authority = true as false;
      },
      (artifact: BaselineArtifact) => {
        artifact.provenance.entry_roots = "invalid" as unknown as string[];
      },
      (artifact: BaselineArtifact) => {
        artifact.provenance.coverage_review.after.entry_roots.push(
          "src/unrecorded.ts",
        );
      },
      (artifact: BaselineArtifact) => {
        artifact.fingerprints[0] = "null";
      },
    ];
    for (const mutate of mutations) {
      const artifact = baseline();
      artifact.provenance.knip_config_sha256 = knipConfigSha256({
        entry: ["src/index.ts"],
        project: ["src/**/*.ts"],
      });
      mutate(artifact);
      const result = planDeadCodeProvenanceRefresh({
        baseline: artifact,
        currentConfig: {
          entry: ["src/index.ts", "src/extra.ts"],
          project: ["src/**/*.ts"],
        },
        reconstructedConfig: {
          entry: ["src/index.ts"],
          project: ["src/**/*.ts"],
        },
        currentConfigHash: "new-hash",
        gitHead: "b".repeat(40),
        beforeFindings: [finding],
        afterFindings: [finding],
        repoRoot: "/repo",
      });
      expect(result.status).toBe("blocked");
      expect(result.artifact).toBeUndefined();
    }
  });

  test("blocks empty scan results instead of emitting a self-invalid artifact", () => {
    const oldConfig = {
      entry: ["src/index.ts"],
      project: ["src/**/*.ts"],
    };
    const currentConfig = {
      entry: ["src/index.ts", "src/extra.ts"],
      project: ["src/**/*.ts"],
    };
    const oldBaseline = baseline();
    oldBaseline.provenance.knip_config_sha256 = knipConfigSha256(oldConfig);

    const result = planDeadCodeProvenanceRefresh({
      baseline: oldBaseline,
      currentConfig,
      reconstructedConfig: oldConfig,
      currentConfigHash: knipConfigSha256(currentConfig),
      gitHead: "b".repeat(40),
      beforeFindings: [],
      afterFindings: [],
      repoRoot: "/repo",
    });

    expect(result.status).toBe("blocked");
    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.join("\n")).toContain("must contain");
  });

  test("runs both snapshots with one runner and atomically writes provenance only", async () => {
    const root = await mkdtemp(join("/tmp/opencode", "provenance-"));
    try {
      const baselinePath = join(root, "baseline.json");
      const configPath = join(root, "knip.json");
      const oldConfig = { entry: ["src/index.ts"], project: ["src/**/*.ts"] };
      const currentConfig = {
        entry: ["src/index.ts", "src/extra.ts"],
        project: ["src/**/*.ts"],
      };
      const artifact = baseline();
      artifact.provenance.knip_config_sha256 = knipConfigSha256(oldConfig);
      const baselineRaw = JSON.stringify(artifact, null, 2) + "\n";
      await writeFile(baselinePath, baselineRaw);
      await writeFile(
        configPath,
        JSON.stringify(currentConfig, null, 2) + "\n",
      );
      const requests: string[][] = [];
      let writes = 0;
      const runner = {
        async run(request: {
          command: string[];
          detectorId: string;
          cwd: string;
          timeoutMs: number;
          findingsExitCodes?: number[];
        }) {
          requests.push(request.command);
          return {
            detectorId: request.detectorId,
            command: request.command,
            status: "findings" as const,
            exitCode: 1,
            stdout: JSON.stringify({
              issues: [
                { file: "src/index.ts", exports: [{ name: "old", line: 1 }] },
              ],
            }),
            stderr: "",
            durationMs: 1,
          };
        },
      };

      const result = await refreshDeadCodeBaselineProvenance({
        baselinePath,
        configPath,
        pluginRoot: root,
        runner,
        readGitHead: async () => "b".repeat(40),
        writeAtomic: async (path, content) => {
          writes += 1;
          await writeFile(path, content);
        },
      });

      expect(result.status).toBe("refreshed");
      expect(writes).toBe(1);
      expect(requests).toHaveLength(2);
      expect(
        requests.every(
          (command) =>
            command.slice(0, 5).join(" ") === "pnpm exec knip --reporter json",
        ),
      ).toBe(true);
      expect(requests.every((command) => command.includes("--config"))).toBe(
        true,
      );
      const output = JSON.parse(
        await readFile(baselinePath, "utf8"),
      ) as BaselineArtifact;
      expect(output.provenance.entry_roots).toEqual(currentConfig.entry);
      expect(output.provenance.review_basis.provenance_refresh_owner).toBe(
        "dead-code:provenance:refresh",
      );
      expect(output.fingerprints).toEqual(artifact.fingerprints);
      expect((await readdir(root)).sort()).toEqual([
        "baseline.json",
        "knip.json",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("blocks degraded or invalid output without writing", async () => {
    const root = await mkdtemp(join("/tmp/opencode", "provenance-"));
    try {
      const baselinePath = join(root, "baseline.json");
      const configPath = join(root, "knip.json");
      const config = {
        entry: ["src/index.ts", "src/extra.ts"],
        project: ["src/**/*.ts"],
      };
      const artifact = baseline();
      artifact.provenance.knip_config_sha256 = knipConfigSha256(config);
      artifact.provenance.entry_roots = [...config.entry];
      const baselineRaw = JSON.stringify(artifact, null, 2) + "\n";
      await writeFile(baselinePath, baselineRaw);
      await writeFile(configPath, JSON.stringify(config));
      let writes = 0;
      const result = await refreshDeadCodeBaselineProvenance({
        baselinePath,
        configPath,
        pluginRoot: root,
        runner: {
          async run(request) {
            return {
              ...request,
              status: "failed" as const,
              exitCode: 2,
              stdout: "{}",
              stderr: "Knip failed",
              durationMs: 1,
            };
          },
        },
        readGitHead: async () => "a".repeat(40),
        writeAtomic: async () => {
          writes += 1;
        },
      });
      expect(result.status).toBe("blocked");
      expect(writes).toBe(0);
      expect(await readFile(baselinePath, "utf8")).toBe(baselineRaw);
      expect((await readdir(root)).sort()).toEqual([
        "baseline.json",
        "knip.json",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("blocks a malformed baseline before creating snapshots", async () => {
    const root = await mkdtemp(join("/tmp/opencode", "provenance-"));
    try {
      const baselinePath = join(root, "baseline.json");
      const configPath = join(root, "knip.json");
      await writeFile(baselinePath, "not json");
      await writeFile(configPath, JSON.stringify({ entry: [], project: [] }));
      let runs = 0;
      const result = await refreshDeadCodeBaselineProvenance({
        baselinePath,
        configPath,
        pluginRoot: root,
        runner: {
          run: async () => {
            runs += 1;
            throw new Error("must not run");
          },
        },
        readGitHead: async () => "a".repeat(40),
      });
      expect(result.status).toBe("blocked");
      expect(runs).toBe(0);
      expect((await readdir(root)).sort()).toEqual([
        "baseline.json",
        "knip.json",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("refuses duplicate-count or project-pattern drift", () => {
    const oldBaseline = baseline();
    oldBaseline.provenance.knip_config_sha256 = knipConfigSha256({
      entry: ["src/index.ts"],
      project: ["src/**/*.ts"],
    });
    const result = planDeadCodeProvenanceRefresh({
      baseline: oldBaseline,
      currentConfig: {
        entry: ["src/index.ts", "src/extra.ts"],
        project: ["src/**/*.tsx"],
      },
      reconstructedConfig: {
        entry: ["src/index.ts"],
        project: ["src/**/*.ts"],
      },
      currentConfigHash: "new-hash",
      gitHead: "b".repeat(40),
      beforeFindings: [finding],
      afterFindings: [finding, finding],
      repoRoot: "/repo",
    });

    expect(result.status).toBe("refused");
    expect(result.diagnostics.join("\n")).toContain("project patterns");
  });

  test("keeps the baseline unchanged when atomic replacement fails", async () => {
    const root = await mkdtemp(join("/tmp/opencode", "provenance-"));
    try {
      const baselinePath = join(root, "baseline.json");
      const configPath = join(root, "knip.json");
      const oldConfig = { entry: ["src/index.ts"], project: ["src/**/*.ts"] };
      const currentConfig = {
        entry: ["src/index.ts", "src/extra.ts"],
        project: ["src/**/*.ts"],
      };
      const artifact = baseline();
      artifact.provenance.knip_config_sha256 = knipConfigSha256(oldConfig);
      const baselineRaw = JSON.stringify(artifact, null, 2) + "\n";
      await writeFile(baselinePath, baselineRaw);
      await writeFile(configPath, JSON.stringify(currentConfig));
      const result = await refreshDeadCodeBaselineProvenance({
        baselinePath,
        configPath,
        pluginRoot: root,
        runner: {
          run: async (request) => ({
            ...request,
            status: "success" as const,
            exitCode: 0,
            stdout: JSON.stringify({
              issues: [
                { file: "src/index.ts", exports: [{ name: "old", line: 1 }] },
              ],
            }),
            stderr: "",
            durationMs: 1,
          }),
        },
        readGitHead: async () => "a".repeat(40),
        writeAtomic: async () => {
          throw new Error("rename denied");
        },
      });
      expect(result.status).toBe("blocked");
      expect(await readFile(baselinePath, "utf8")).toBe(baselineRaw);
      expect((await readdir(root)).sort()).toEqual([
        "baseline.json",
        "knip.json",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("refuses a reconstructed hash mismatch before snapshots or runner calls", async () => {
    const root = await mkdtemp(join("/tmp/opencode", "provenance-"));
    try {
      const baselinePath = join(root, "baseline.json");
      const configPath = join(root, "knip.json");
      const oldConfig = { entry: ["src/index.ts"], project: ["src/**/*.ts"] };
      const currentConfig = {
        entry: ["src/index.ts", "src/extra.ts"],
        project: ["src/**/*.ts"],
        ignore: ["changed"],
      };
      const artifact = baseline();
      artifact.provenance.knip_config_sha256 = knipConfigSha256(oldConfig);
      await writeFile(baselinePath, JSON.stringify(artifact, null, 2));
      await writeFile(configPath, JSON.stringify(currentConfig));
      let runs = 0;
      const result = await refreshDeadCodeBaselineProvenance({
        baselinePath,
        configPath,
        pluginRoot: root,
        runner: {
          run: async () => {
            runs += 1;
            throw new Error("must not run");
          },
        },
        readGitHead: async () => "a".repeat(40),
      });
      expect(result.status).toBe("refused");
      expect(runs).toBe(0);
      expect((await readdir(root)).sort()).toEqual([
        "baseline.json",
        "knip.json",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("returns current without runner calls or target writes", async () => {
    const root = await mkdtemp(join("/tmp/opencode", "provenance-"));
    try {
      const baselinePath = join(root, "baseline.json");
      const configPath = join(root, "knip.json");
      const config = {
        entry: ["src/index.ts", "src/extra.ts"],
        project: ["src/**/*.ts"],
      };
      const artifact = baseline();
      artifact.provenance.knip_config_sha256 = knipConfigSha256(config);
      artifact.provenance.entry_roots = [...config.entry];
      artifact.provenance.git_head = "c".repeat(40);
      artifact.provenance.review_basis.provenance_refresh_owner =
        "dead-code:provenance:refresh";
      artifact.provenance.coverage_review = {
        before: {
          entry_roots: ["src/index.ts"],
          normalized_finding_count: 1,
          dead_code_fingerprint_count: 1,
        },
        after: {
          entry_roots: [...config.entry],
          normalized_finding_count: 1,
          dead_code_fingerprint_count: 1,
        },
        unchanged_reason:
          "Independent before/after normalized-set comparison was exact. Both scans produced 1 normalized findings and 1 dead-code fingerprints, with zero added and removed values.",
      };
      const baselineRaw = JSON.stringify(artifact, null, 2) + "\n";
      await writeFile(baselinePath, baselineRaw);
      await writeFile(configPath, JSON.stringify(config));
      let runs = 0;
      let writes = 0;
      const result = await refreshDeadCodeBaselineProvenance({
        baselinePath,
        configPath,
        pluginRoot: root,
        runner: {
          run: async () => {
            runs += 1;
            throw new Error("must not run");
          },
        },
        readGitHead: async () => "a".repeat(40),
        writeAtomic: async () => {
          writes += 1;
        },
      });
      expect(result.status).toBe("current");
      expect(runs).toBe(0);
      expect(writes).toBe(0);
      expect(await readFile(baselinePath, "utf8")).toBe(baselineRaw);
      expect((await readdir(root)).sort()).toEqual([
        "baseline.json",
        "knip.json",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("blocks stale rereads and a changed HEAD after scans", async () => {
    for (const mode of ["stale-baseline", "stale-config", "head"] as const) {
      const root = await mkdtemp(join("/tmp/opencode", "provenance-"));
      try {
        const baselinePath = join(root, "baseline.json");
        const configPath = join(root, "knip.json");
        const oldConfig = { entry: ["src/index.ts"], project: ["src/**/*.ts"] };
        const currentConfig = {
          entry: ["src/index.ts", "src/extra.ts"],
          project: ["src/**/*.ts"],
        };
        const artifact = baseline();
        artifact.provenance.knip_config_sha256 = knipConfigSha256(oldConfig);
        const baselineRaw = JSON.stringify(artifact, null, 2);
        const configRaw = JSON.stringify(currentConfig);
        await writeFile(baselinePath, baselineRaw);
        await writeFile(configPath, configRaw);
        const reads = new Map<string, number>();
        let heads = 0;
        const result = await refreshDeadCodeBaselineProvenance({
          baselinePath,
          configPath,
          pluginRoot: root,
          readText: async (path) => {
            const count = (reads.get(path) ?? 0) + 1;
            reads.set(path, count);
            if (
              mode === "stale-baseline" &&
              path === baselinePath &&
              count > 1
            ) {
              return `${baselineRaw} `;
            }
            if (mode === "stale-config" && path === configPath && count > 1) {
              return `${configRaw} `;
            }
            return path === baselinePath ? baselineRaw : configRaw;
          },
          runner: {
            run: async (request) => ({
              ...request,
              status: "success" as const,
              exitCode: 0,
              stdout: JSON.stringify({ issues: [] }),
              stderr: "",
              durationMs: 1,
            }),
          },
          readGitHead: async () => {
            heads += 1;
            return mode === "head" && heads > 1
              ? "b".repeat(40)
              : "a".repeat(40);
          },
        });
        expect(result.status).toBe("blocked");
        expect((await readdir(root)).sort()).toEqual([
          "baseline.json",
          "knip.json",
        ]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  test("blocks timeout, failed, and invalid Knip output with cleanup", async () => {
    for (const mode of ["timed_out", "failed", "invalid"] as const) {
      const root = await mkdtemp(join("/tmp/opencode", "provenance-"));
      try {
        const baselinePath = join(root, "baseline.json");
        const configPath = join(root, "knip.json");
        const oldConfig = { entry: ["src/index.ts"], project: ["src/**/*.ts"] };
        const currentConfig = {
          entry: ["src/index.ts", "src/extra.ts"],
          project: ["src/**/*.ts"],
        };
        const artifact = baseline();
        artifact.provenance.knip_config_sha256 = knipConfigSha256(oldConfig);
        await writeFile(baselinePath, JSON.stringify(artifact, null, 2));
        await writeFile(configPath, JSON.stringify(currentConfig));
        const result = await refreshDeadCodeBaselineProvenance({
          baselinePath,
          configPath,
          pluginRoot: root,
          runner: {
            run: async (request) => ({
              ...request,
              status: mode === "invalid" ? ("success" as const) : mode,
              exitCode: mode === "failed" ? 2 : mode === "invalid" ? 0 : null,
              stdout: mode === "invalid" ? "{}" : "",
              stderr: mode === "failed" ? "failed" : "",
              durationMs: 1,
            }),
          },
          readGitHead: async () => "a".repeat(40),
        });
        expect(result.status).toBe("blocked");
        expect((await readdir(root)).sort()).toEqual([
          "baseline.json",
          "knip.json",
        ]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });

  test("returns a typed blocked result when snapshot cleanup fails", async () => {
    const root = await mkdtemp(join("/tmp/opencode", "provenance-"));
    try {
      const baselinePath = join(root, "baseline.json");
      const configPath = join(root, "knip.json");
      const oldConfig = { entry: ["src/index.ts"], project: ["src/**/*.ts"] };
      const currentConfig = {
        entry: ["src/index.ts", "src/extra.ts"],
        project: ["src/**/*.ts"],
      };
      const artifact = baseline();
      artifact.provenance.knip_config_sha256 = knipConfigSha256(oldConfig);
      await writeFile(baselinePath, JSON.stringify(artifact, null, 2));
      await writeFile(configPath, JSON.stringify(currentConfig));
      const result = await refreshDeadCodeBaselineProvenance({
        baselinePath,
        configPath,
        pluginRoot: root,
        runner: {
          run: async (request) => ({
            ...request,
            status: "failed" as const,
            exitCode: 2,
            stdout: "",
            stderr: "failed",
            durationMs: 1,
          }),
        },
        readGitHead: async () => "a".repeat(40),
        cleanupTemporary: async (path) => {
          await rm(path, { force: true });
          throw new Error("cleanup denied");
        },
      });
      expect(result.status).toBe("blocked");
      expect(result.diagnostics.join("\n")).toContain("cleanup failed");
      expect((await readdir(root)).sort()).toEqual([
        "baseline.json",
        "knip.json",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("restores exact prior bytes and blocks when replacement directory sync fails", async () => {
    const root = await mkdtemp(join("/tmp/opencode", "provenance-"));
    try {
      const baselinePath = join(root, "baseline.json");
      const configPath = join(root, "knip.json");
      const oldConfig = { entry: ["src/index.ts"], project: ["src/**/*.ts"] };
      const currentConfig = {
        entry: ["src/index.ts", "src/extra.ts"],
        project: ["src/**/*.ts"],
      };
      const artifact = baseline();
      artifact.provenance.knip_config_sha256 = knipConfigSha256(oldConfig);
      const priorBytes = JSON.stringify(artifact, null, 2);
      await writeFile(baselinePath, priorBytes);
      await writeFile(configPath, JSON.stringify(currentConfig));
      let syncCalls = 0;
      const result = await refreshDeadCodeBaselineProvenance({
        baselinePath,
        configPath,
        pluginRoot: root,
        runner: {
          run: async (request) => ({
            ...request,
            status: "success" as const,
            exitCode: 0,
            stdout: JSON.stringify({
              issues: [
                { file: "src/index.ts", exports: [{ name: "old", line: 1 }] },
              ],
            }),
            stderr: "",
            durationMs: 1,
          }),
        },
        readGitHead: async () => "a".repeat(40),
        syncDirectory: async () => {
          syncCalls += 1;
          if (syncCalls === 1) throw new Error("sync denied");
        },
      });
      expect(result.status).toBe("blocked");
      expect(result.diagnostics.join("\n")).toContain("sync denied");
      expect(syncCalls).toBe(2);
      expect(await readFile(baselinePath, "utf8")).toBe(priorBytes);
      expect((await readdir(root)).sort()).toEqual([
        "baseline.json",
        "knip.json",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("keeps restored prior bytes when rollback directory sync also fails", async () => {
    const root = await mkdtemp(join("/tmp/opencode", "provenance-"));
    try {
      const baselinePath = join(root, "baseline.json");
      const configPath = join(root, "knip.json");
      const oldConfig = { entry: ["src/index.ts"], project: ["src/**/*.ts"] };
      const currentConfig = {
        entry: ["src/index.ts", "src/extra.ts"],
        project: ["src/**/*.ts"],
      };
      const artifact = baseline();
      artifact.provenance.knip_config_sha256 = knipConfigSha256(oldConfig);
      const priorBytes = JSON.stringify(artifact, null, 2);
      await writeFile(baselinePath, priorBytes);
      await writeFile(configPath, JSON.stringify(currentConfig));
      let syncCalls = 0;
      const result = await refreshDeadCodeBaselineProvenance({
        baselinePath,
        configPath,
        pluginRoot: root,
        runner: {
          run: async (request) => ({
            ...request,
            status: "success" as const,
            exitCode: 0,
            stdout: JSON.stringify({
              issues: [
                { file: "src/index.ts", exports: [{ name: "old", line: 1 }] },
              ],
            }),
            stderr: "",
            durationMs: 1,
          }),
        },
        readGitHead: async () => "a".repeat(40),
        syncDirectory: async () => {
          syncCalls += 1;
          throw new Error(
            syncCalls === 1
              ? "replacement sync denied"
              : "rollback sync denied",
          );
        },
      });
      expect(result.status).toBe("blocked");
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toContain("replacement sync denied");
      expect(result.diagnostics[0]).toContain("rollback sync denied");
      expect(syncCalls).toBe(2);
      expect(await readFile(baselinePath, "utf8")).toBe(priorBytes);
      expect((await readdir(root)).sort()).toEqual([
        "baseline.json",
        "knip.json",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
