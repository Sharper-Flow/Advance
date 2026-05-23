/**
 * GitHub Project Config — TDD test fixture
 *
 * Verifies the typed config replacement for `project_metadata['github_project']`.
 * The legacy summary-string store rejected long entries on read (silently, via
 * Zod safeParse). This dedicated typed store fixes that with its own schema
 * and migrates forward on first read.
 *
 * rq-issueChangeLinkage03
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import {
  GitHubProjectConfigSchema,
  readGitHubProjectConfig,
  writeGitHubProjectConfig,
  type GitHubProjectConfig,
} from "./github-project-config";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";

const SAMPLE_CONFIG: GitHubProjectConfig = {
  owner: "TestOrg",
  project_number: 2,
  project_id: "PVT_test_id",
  title: "ADV: Test",
  fields: {
    adv_type: "PVTSSF_advtype",
    priority: "PVTSSF_priority",
    value: "PVTF_value",
    time_criticality: "PVTF_tc",
    rroe: "PVTF_rroe",
    effort: "PVTF_effort",
    wsjf: "PVTF_wsjf",
  },
  adv_type_options: { bug: "opt_bug", feature: "opt_feature" },
  priority_options: {
    critical: "opt_c",
    high: "opt_h",
    medium: "opt_m",
    low: "opt_l",
  },
  persisted_by: "agent",
  persisted_at: "2026-05-09T00:00:00.000Z",
};

describe("github-project-config", () => {
  let dir: string;
  let externalDir: string;

  beforeEach(async () => {
    dir = await createTempDir("adv-gh-cfg-");
    externalDir = await createTempDir("adv-gh-cfg-ext-");
    await mkdir(join(dir, ".adv"), { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(dir);
    await cleanupTempDir(externalDir);
  });

  describe("schema", () => {
    test("accepts optional repository_filter", () => {
      expect(
        GitHubProjectConfigSchema.parse({
          ...SAMPLE_CONFIG,
          repository_filter: "Example-Web",
        }).repository_filter,
      ).toBe("Example-Web");
    });

    test("preserves backcompat when repository_filter is absent", () => {
      expect(GitHubProjectConfigSchema.parse(SAMPLE_CONFIG)).toEqual(
        SAMPLE_CONFIG,
      );
    });

    test("rejects empty repository_filter", () => {
      expect(() =>
        GitHubProjectConfigSchema.parse({
          ...SAMPLE_CONFIG,
          repository_filter: "",
        }),
      ).toThrow();
    });
  });

  describe("read", () => {
    test("returns null when neither .adv/github-project.json nor legacy entry exists", async () => {
      const result = await readGitHubProjectConfig(dir, externalDir);
      expect(result).toBeNull();
    });

    test("reads from .adv/github-project.json when present (preferred path)", async () => {
      await writeFile(
        join(dir, ".adv/github-project.json"),
        JSON.stringify(SAMPLE_CONFIG, null, 2),
      );

      const result = await readGitHubProjectConfig(dir, externalDir);
      expect(result).toEqual(SAMPLE_CONFIG);
    });

    test("falls back to legacy project_metadata['github_project'] (long blob) and migrates forward", async () => {
      // Production scenario: legacy entry has a long JSON blob (>200 chars)
      // that the legacy ProjectMetadataEntrySchema would reject. The migration
      // path bypasses that schema by reading the file raw and validating
      // against GitHubProjectConfigSchema directly.
      const longSummary = JSON.stringify(SAMPLE_CONFIG);
      expect(longSummary.length).toBeGreaterThan(200);

      await mkdir(externalDir, { recursive: true });
      await writeFile(
        join(externalDir, "project-metadata.json"),
        JSON.stringify({
          github_project: {
            key: "github_project",
            timestamp: new Date().toISOString(),
            count: 1,
            summary: longSummary,
            written_by: "agent",
          },
        }),
      );

      const result = await readGitHubProjectConfig(dir, externalDir);
      expect(result).toEqual(SAMPLE_CONFIG);

      // Migration: subsequent reads use the .adv/ file, not legacy
      expect(existsSync(join(dir, ".adv/github-project.json"))).toBe(true);
      const onDisk = JSON.parse(
        await readFile(join(dir, ".adv/github-project.json"), "utf8"),
      );
      expect(onDisk).toEqual(SAMPLE_CONFIG);

      // Legacy entry remains (NOT deleted post-migration per validator note)
      expect(existsSync(join(externalDir, "project-metadata.json"))).toBe(true);
    });

    test("returns null when legacy entry summary is malformed JSON", async () => {
      await mkdir(externalDir, { recursive: true });
      await writeFile(
        join(externalDir, "project-metadata.json"),
        JSON.stringify({
          github_project: {
            key: "github_project",
            timestamp: new Date().toISOString(),
            count: 1,
            summary: "{not valid json blob",
            written_by: "agent",
          },
        }),
      );

      const result = await readGitHubProjectConfig(dir, externalDir);
      expect(result).toBeNull();
    });

    test("returns null when legacy entry summary is JSON but fails GitHubProjectConfigSchema", async () => {
      await mkdir(externalDir, { recursive: true });
      await writeFile(
        join(externalDir, "project-metadata.json"),
        JSON.stringify({
          github_project: {
            key: "github_project",
            timestamp: new Date().toISOString(),
            count: 1,
            summary: JSON.stringify({ owner: "TestOrg" }), // missing required fields
            written_by: "agent",
          },
        }),
      );

      const result = await readGitHubProjectConfig(dir, externalDir);
      expect(result).toBeNull();
    });

    test("ignores corrupt JSON in .adv/github-project.json (returns null)", async () => {
      await writeFile(join(dir, ".adv/github-project.json"), "{not valid json");
      const result = await readGitHubProjectConfig(dir, externalDir);
      expect(result).toBeNull();
    });

    test("ignores schema-invalid JSON in .adv/github-project.json (returns null)", async () => {
      await writeFile(
        join(dir, ".adv/github-project.json"),
        JSON.stringify({ owner: "X" }), // missing required fields
      );
      const result = await readGitHubProjectConfig(dir, externalDir);
      expect(result).toBeNull();
    });
  });

  describe("write", () => {
    test("creates .adv/github-project.json with full config", async () => {
      await writeGitHubProjectConfig(dir, SAMPLE_CONFIG);

      expect(existsSync(join(dir, ".adv/github-project.json"))).toBe(true);
      const onDisk = JSON.parse(
        await readFile(join(dir, ".adv/github-project.json"), "utf8"),
      );
      expect(onDisk).toEqual(SAMPLE_CONFIG);
    });

    test("overwrites existing config idempotently", async () => {
      await writeGitHubProjectConfig(dir, SAMPLE_CONFIG);
      const updated: GitHubProjectConfig = {
        ...SAMPLE_CONFIG,
        title: "ADV: Test (Updated)",
        persisted_at: "2026-05-09T01:00:00.000Z",
      };
      await writeGitHubProjectConfig(dir, updated);

      const onDisk = JSON.parse(
        await readFile(join(dir, ".adv/github-project.json"), "utf8"),
      );
      expect(onDisk.title).toBe("ADV: Test (Updated)");
      expect(onDisk.persisted_at).toBe("2026-05-09T01:00:00.000Z");
    });

    test("creates .adv/ directory if missing", async () => {
      const freshDir = await createTempDir("adv-gh-cfg-fresh-");
      try {
        // .adv does NOT exist yet
        expect(existsSync(join(freshDir, ".adv"))).toBe(false);

        await writeGitHubProjectConfig(freshDir, SAMPLE_CONFIG);

        expect(existsSync(join(freshDir, ".adv/github-project.json"))).toBe(
          true,
        );
      } finally {
        await cleanupTempDir(freshDir);
      }
    });
  });
});
