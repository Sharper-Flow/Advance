import { describe, expect, it } from "vitest";
import { mkdir, writeFile, readFile } from "fs/promises";
import { join } from "path";

import {
  inspectArtifactActivity,
  readArtifactActivity,
  writeArtifactActivity,
  listSpecsActivity,
  showSpecActivity,
  crossRepoArtifactActivity,
} from "./activities";
import { createTempDir, cleanupTempDir } from "../__tests__/setup";

describe("temporal activities", () => {
  describe("readArtifactActivity", () => {
    it("reads proposal.md content when present", async () => {
      const dir = await createTempDir();
      try {
        const changesDir = join(dir, "changes");
        const changeDir = join(changesDir, "myChange");
        await mkdir(changeDir, { recursive: true });
        await writeFile(join(changeDir, "proposal.md"), "# My proposal");

        const result = await readArtifactActivity({
          changesDir,
          changeId: "myChange",
          kind: "proposal",
        });

        expect(result.ok).toBe(true);
        expect(result.content).toBe("# My proposal");
      } finally {
        await cleanupTempDir(dir);
      }
    });

    it("returns ok=false with structured error when artifact missing", async () => {
      const dir = await createTempDir();
      try {
        const changesDir = join(dir, "changes");
        const changeDir = join(changesDir, "myChange");
        await mkdir(changeDir, { recursive: true });

        const result = await readArtifactActivity({
          changesDir,
          changeId: "myChange",
          kind: "design",
        });

        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/not found|ENOENT/i);
        expect(result.content).toBeUndefined();
      } finally {
        await cleanupTempDir(dir);
      }
    });

    it("supports all workflow artifact kinds", async () => {
      const dir = await createTempDir();
      try {
        const changesDir = join(dir, "changes");
        const changeDir = join(changesDir, "myChange");
        await mkdir(changeDir, { recursive: true });
        await writeFile(join(changeDir, "proposal.md"), "P");
        await writeFile(join(changeDir, "problem-statement.md"), "PS");
        await writeFile(join(changeDir, "agreement.md"), "A");
        await writeFile(join(changeDir, "design.md"), "D");
        await writeFile(join(changeDir, "acceptance.md"), "ACCEPT");
        await writeFile(join(changeDir, "executive-summary.md"), "ES");

        for (const [kind, expected] of [
          ["proposal", "P"],
          ["problemStatement", "PS"],
          ["agreement", "A"],
          ["design", "D"],
          ["acceptance", "ACCEPT"],
          ["executiveSummary", "ES"],
        ] as const) {
          const result = await readArtifactActivity({
            changesDir,
            changeId: "myChange",
            kind,
          });
          expect(result.ok).toBe(true);
          expect(result.content).toBe(expected);
        }
      } finally {
        await cleanupTempDir(dir);
      }
    });
  });

  describe("writeArtifactActivity", () => {
    it("writes new artifact and creates parent dirs", async () => {
      const dir = await createTempDir();
      try {
        const changesDir = join(dir, "changes");
        // Note: changeDir does not exist yet — activity must create it

        const result = await writeArtifactActivity({
          changesDir,
          changeId: "newChange",
          kind: "design",
          content: "# New design",
        });

        expect(result.ok).toBe(true);
        const written = await readFile(
          join(changesDir, "newChange", "design.md"),
          "utf-8",
        );
        expect(written).toBe("# New design");
      } finally {
        await cleanupTempDir(dir);
      }
    });

    it("overwrites existing artifact atomically", async () => {
      const dir = await createTempDir();
      try {
        const changesDir = join(dir, "changes");
        const changeDir = join(changesDir, "existing");
        await mkdir(changeDir, { recursive: true });
        await writeFile(join(changeDir, "proposal.md"), "OLD");

        const result = await writeArtifactActivity({
          changesDir,
          changeId: "existing",
          kind: "proposal",
          content: "NEW",
        });

        expect(result.ok).toBe(true);
        const updated = await readFile(join(changeDir, "proposal.md"), "utf-8");
        expect(updated).toBe("NEW");
      } finally {
        await cleanupTempDir(dir);
      }
    });

    it("writes acceptance.md projection artifacts", async () => {
      const dir = await createTempDir();
      try {
        const changesDir = join(dir, "changes");

        const result = await writeArtifactActivity({
          changesDir,
          changeId: "accepted",
          kind: "acceptance",
          content: "# Acceptance\n\nAll contract rows passed.",
        });

        expect(result.ok).toBe(true);
        const written = await readFile(
          join(changesDir, "accepted", "acceptance.md"),
          "utf-8",
        );
        expect(written).toContain("All contract rows passed");
      } finally {
        await cleanupTempDir(dir);
      }
    });
  });

  describe("inspectArtifactActivity", () => {
    it("returns metadata for valid artifact content without returning content", async () => {
      const dir = await createTempDir();
      try {
        const changesDir = join(dir, "changes");
        const changeDir = join(changesDir, "myChange");
        await mkdir(changeDir, { recursive: true });
        await writeFile(join(changeDir, "design.md"), "# Design\n\nBody");

        const result = await inspectArtifactActivity({
          changesDir,
          changeId: "myChange",
          kind: "design",
        });

        expect(result.ok).toBe(true);
        expect(result.kind).toBe("design");
        expect(result.path).toMatch(/design\.md$/);
        expect(result.nonWhitespaceChars).toBe(11);
        expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
        expect("content" in result).toBe(false);
      } finally {
        await cleanupTempDir(dir);
      }
    });

    it("returns deterministic metadata for blank artifacts", async () => {
      const dir = await createTempDir();
      try {
        const changesDir = join(dir, "changes");
        const changeDir = join(changesDir, "myChange");
        await mkdir(changeDir, { recursive: true });
        await writeFile(join(changeDir, "agreement.md"), " \n\t ");

        const result = await inspectArtifactActivity({
          changesDir,
          changeId: "myChange",
          kind: "agreement",
        });

        expect(result.ok).toBe(true);
        expect(result.nonWhitespaceChars).toBe(0);
      } finally {
        await cleanupTempDir(dir);
      }
    });

    it("returns structured missing errors", async () => {
      const dir = await createTempDir();
      try {
        const result = await inspectArtifactActivity({
          changesDir: join(dir, "changes"),
          changeId: "missingChange",
          kind: "acceptance",
        });

        expect(result).toMatchObject({
          ok: false,
          kind: "acceptance",
          code: "missing",
        });
        expect(result.path).toMatch(/acceptance\.md$/);
      } finally {
        await cleanupTempDir(dir);
      }
    });

    it("returns content hash metadata for executive-summary artifacts", async () => {
      const dir = await createTempDir();
      try {
        const changesDir = join(dir, "changes");
        const changeDir = join(changesDir, "myChange");
        await mkdir(changeDir, { recursive: true });
        await writeFile(
          join(changeDir, "executive-summary.md"),
          "# Executive Summary\n\nAccepted.",
        );

        const result = await inspectArtifactActivity({
          changesDir,
          changeId: "myChange",
          kind: "executiveSummary",
        });

        expect(result.ok).toBe(true);
        expect(result.kind).toBe("executiveSummary");
        expect(result.path).toMatch(/executive-summary\.md$/);
        expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
        expect(result.nonWhitespaceChars).toBeGreaterThan(0);
      } finally {
        await cleanupTempDir(dir);
      }
    });
  });

  describe("listSpecsActivity", () => {
    it("returns all spec capability names from specsDir", async () => {
      const dir = await createTempDir();
      try {
        const specsDir = join(dir, ".adv", "specs");
        await mkdir(join(specsDir, "auth"), { recursive: true });
        await mkdir(join(specsDir, "payments"), { recursive: true });
        await writeFile(
          join(specsDir, "auth", "spec.json"),
          JSON.stringify({ name: "auth", version: 1, requirements: [] }),
        );
        await writeFile(
          join(specsDir, "payments", "spec.json"),
          JSON.stringify({ name: "payments", version: 1, requirements: [] }),
        );

        const result = await listSpecsActivity({ specsDir });

        expect(result.ok).toBe(true);
        expect(result.specs?.sort()).toEqual(["auth", "payments"]);
      } finally {
        await cleanupTempDir(dir);
      }
    });

    it("returns empty list when specsDir does not exist", async () => {
      const dir = await createTempDir();
      try {
        const result = await listSpecsActivity({
          specsDir: join(dir, "nonexistent"),
        });

        expect(result.ok).toBe(true);
        expect(result.specs).toEqual([]);
      } finally {
        await cleanupTempDir(dir);
      }
    });
  });

  describe("showSpecActivity", () => {
    it("reads spec.json content for a given capability", async () => {
      const dir = await createTempDir();
      try {
        const specsDir = join(dir, "specs");
        await mkdir(join(specsDir, "auth"), { recursive: true });
        const specJson = JSON.stringify(
          { name: "auth", version: 2, requirements: [] },
          null,
          2,
        );
        await writeFile(join(specsDir, "auth", "spec.json"), specJson);

        const result = await showSpecActivity({
          specsDir,
          capability: "auth",
        });

        expect(result.ok).toBe(true);
        expect(result.content).toBe(specJson);
      } finally {
        await cleanupTempDir(dir);
      }
    });

    it("returns ok=false when capability does not exist", async () => {
      const dir = await createTempDir();
      try {
        const specsDir = join(dir, "specs");
        await mkdir(specsDir, { recursive: true });

        const result = await showSpecActivity({
          specsDir,
          capability: "missing",
        });

        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/not found|ENOENT|missing/i);
      } finally {
        await cleanupTempDir(dir);
      }
    });
  });

  describe("crossRepoArtifactActivity", () => {
    it("rejects target_path that is not a git repo", async () => {
      const dir = await createTempDir();
      try {
        const result = await crossRepoArtifactActivity({
          target_path: dir, // exists but no .git/
          relative_path: "README.md",
          operation: "read",
        });

        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/not a git repo|.git/i);
      } finally {
        await cleanupTempDir(dir);
      }
    });

    it("rejects target_path that does not exist", async () => {
      const result = await crossRepoArtifactActivity({
        target_path: "/nonexistent/path/that/should/never/exist",
        relative_path: "README.md",
        operation: "read",
      });

      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/not exist|ENOENT|target_path/i);
    });

    it("reads file from valid git repo", async () => {
      const dir = await createTempDir();
      try {
        // Make it a git repo (just need the .git/ dir to exist)
        await mkdir(join(dir, ".git"), { recursive: true });
        await writeFile(join(dir, "README.md"), "# Hello");

        const result = await crossRepoArtifactActivity({
          target_path: dir,
          relative_path: "README.md",
          operation: "read",
        });

        expect(result.ok).toBe(true);
        expect(result.content).toBe("# Hello");
      } finally {
        await cleanupTempDir(dir);
      }
    });

    it("writes file to valid git repo and creates parent dirs", async () => {
      const dir = await createTempDir();
      try {
        await mkdir(join(dir, ".git"), { recursive: true });

        const result = await crossRepoArtifactActivity({
          target_path: dir,
          relative_path: "src/nested/file.txt",
          operation: "write",
          content: "hello",
        });

        expect(result.ok).toBe(true);
        const written = await readFile(
          join(dir, "src/nested/file.txt"),
          "utf-8",
        );
        expect(written).toBe("hello");
      } finally {
        await cleanupTempDir(dir);
      }
    });

    it("rejects relative_path that escapes target_path via traversal", async () => {
      const dir = await createTempDir();
      try {
        await mkdir(join(dir, ".git"), { recursive: true });

        const result = await crossRepoArtifactActivity({
          target_path: dir,
          relative_path: "../../../etc/passwd",
          operation: "read",
        });

        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/escape|traversal|outside|relative/i);
      } finally {
        await cleanupTempDir(dir);
      }
    });

    it("requires content for write operations", async () => {
      const dir = await createTempDir();
      try {
        await mkdir(join(dir, ".git"), { recursive: true });

        const result = await crossRepoArtifactActivity({
          target_path: dir,
          relative_path: "out.txt",
          operation: "write",
          // content omitted
        });

        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/content/i);
      } finally {
        await cleanupTempDir(dir);
      }
    });
  });
});
