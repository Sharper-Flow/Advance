import { describe, it, expect } from "vitest";
import {
  isMutating,
  enforceBashPolicy,
  enforceTddBashPolicy,
  enforceConformanceBashPolicy,
} from "./bash";

describe("Bash Policy Guard", () => {
  describe("isMutating", () => {
    it("should allow safe read-only commands", () => {
      expect(isMutating("ls -la")).toBe(false);
      expect(isMutating("git status")).toBe(false);
      expect(isMutating("git diff HEAD")).toBe(false);
      expect(isMutating("grep 'pattern' file")).toBe(false);
      expect(isMutating("cat file.txt")).toBe(false);
      expect(isMutating("git log --oneline")).toBe(false);
    });

    it("should block obviously mutating commands", () => {
      expect(isMutating("sed -i 's/a/b/' file")).toBe(true);
      expect(isMutating("rm file.txt")).toBe(true);
      expect(isMutating("mv a b")).toBe(true);
      expect(isMutating("cp a b")).toBe(true);
      expect(isMutating("mkdir dir")).toBe(true);
      expect(isMutating("touch file")).toBe(true);
      expect(isMutating("echo 'test' > file")).toBe(true);
      expect(isMutating("command >> file")).toBe(true);
    });

    it("should block git mutations", () => {
      expect(isMutating("git commit -m 'test'")).toBe(true);
      expect(isMutating("git add .")).toBe(true);
      expect(isMutating("git checkout branch")).toBe(true);
      expect(isMutating("git push")).toBe(true);
    });

    it("should block package manager mutations", () => {
      expect(isMutating("npm install lodash")).toBe(true);
      expect(isMutating("yarn add lodash")).toBe(true);
      expect(isMutating("pip install requests")).toBe(true);
    });
  });

  describe("enforceBashPolicy", () => {
    it("should throw error for restricted agents with mutating commands", () => {
      expect(() => enforceBashPolicy("explore", "rm -rf /")).toThrow(
        /Mutation blocked/,
      );
      expect(() => enforceBashPolicy("librarian", "sed -i 's/x/y/' f")).toThrow(
        /Mutation blocked/,
      );
    });

    it("should NOT throw for restricted agents with safe commands", () => {
      expect(() => enforceBashPolicy("explore", "ls")).not.toThrow();
      expect(() => enforceBashPolicy("librarian", "git status")).not.toThrow();
    });

    it("should NOT throw for unrestricted agents with any commands", () => {
      expect(() => enforceBashPolicy("general", "rm -rf /")).not.toThrow();
      expect(() => enforceBashPolicy("build", "npm install")).not.toThrow();
      expect(() => enforceBashPolicy("unknown", "rm -rf /")).not.toThrow();
    });
  });

  describe("enforceTddBashPolicy", () => {
    const activeContext = {
      activeChangeId: "cleanTddExecutionPaths",
      activeInlineTddTaskId: "tk-guard",
    };

    it("blocks heredoc write to test file during active inline TDD", () => {
      expect(
        enforceTddBashPolicy("cat <<'EOF' > src/foo.test.ts", activeContext),
      ).toMatchObject({ action: "block" });
    });

    it("blocks python write_text to test file during active inline TDD", () => {
      expect(
        enforceTddBashPolicy(
          'python -c "from pathlib import Path; Path("src/foo.test.py").write_text("x")"',
          activeContext,
        ),
      ).toMatchObject({ action: "block" });
    });

    it("blocks echo redirect to test file during active inline TDD", () => {
      expect(
        enforceTddBashPolicy("echo 'x' > src/foo.test.ts", activeContext),
      ).toMatchObject({ action: "block" });
    });

    it("blocks tee to spec file during active inline TDD", () => {
      expect(
        enforceTddBashPolicy("printf 'x' | tee src/foo.spec.ts", activeContext),
      ).toMatchObject({ action: "block" });
    });

    it("blocks cat redirect to go test file during active inline TDD", () => {
      expect(
        enforceTddBashPolicy("cat > src/foo_test.go", activeContext),
      ).toMatchObject({ action: "block" });
    });

    it("advises on direct vitest bash without recent adv_run_test", () => {
      expect(
        enforceTddBashPolicy(
          "pnpm exec vitest run src/foo.test.ts",
          activeContext,
        ),
      ).toMatchObject({ action: "advisory" });
    });

    it("allows direct pytest bash with matching recent adv_run_test", () => {
      expect(
        enforceTddBashPolicy("pytest tests/test_foo.py", {
          ...activeContext,
          lastAdvRunTest: {
            taskId: "tk-guard",
            phase: "red",
            atMs: Date.now(),
          },
        }),
      ).toMatchObject({ action: "allow" });
    });

    it("allows heredoc to non-test file", () => {
      expect(
        enforceTddBashPolicy("cat <<'EOF' > src/foo.ts", activeContext),
      ).toMatchObject({ action: "allow" });
    });

    it("allows commands when no active inline-TDD task", () => {
      expect(
        enforceTddBashPolicy("pnpm exec vitest run src/foo.test.ts", {
          activeChangeId: "cleanTddExecutionPaths",
        }),
      ).toMatchObject({ action: "allow" });
    });

    it("allows commands when no active change", () => {
      expect(
        enforceTddBashPolicy("pnpm exec vitest run src/foo.test.ts", {}),
      ).toMatchObject({ action: "allow" });
    });
  });

  describe("enforceConformanceBashPolicy (sibling-repo URL block)", () => {
    const lockedRoot = "/home/u/dev/advance-conformance-abc123";
    const otherLocked = "/home/u/dev/advance-conformance-def456";

    it("allows any command when no locked sibling roots are tracked", () => {
      expect(
        enforceConformanceBashPolicy(
          "git clone https://github.com/foo/advance-conformance-abc123.git",
          { lockedSiblingRoots: [] },
        ),
      ).toMatchObject({ action: "allow" });
    });

    it("blocks git clone of a tracked sibling repo by URL", () => {
      expect(
        enforceConformanceBashPolicy(
          "git clone https://github.com/foo/advance-conformance-abc123.git",
          { lockedSiblingRoots: [lockedRoot] },
        ),
      ).toMatchObject({ action: "block" });
    });

    it("blocks git clone of a tracked sibling repo by absolute path", () => {
      expect(
        enforceConformanceBashPolicy(`git clone ${lockedRoot} /tmp/copy`, {
          lockedSiblingRoots: [lockedRoot],
        }),
      ).toMatchObject({ action: "block" });
    });

    it("blocks curl of a tracked sibling-repo CI artifact URL", () => {
      expect(
        enforceConformanceBashPolicy(
          "curl https://ci.example.com/advance-conformance-abc123/artifact.json",
          { lockedSiblingRoots: [lockedRoot] },
        ),
      ).toMatchObject({ action: "block" });
    });

    it("blocks wget of a tracked sibling-repo URL", () => {
      expect(
        enforceConformanceBashPolicy(
          "wget https://example.com/advance-conformance-abc123/raw.tgz",
          { lockedSiblingRoots: [lockedRoot] },
        ),
      ).toMatchObject({ action: "block" });
    });

    it("blocks even when only a different locked root is the actual target (multi-spec safety)", () => {
      expect(
        enforceConformanceBashPolicy(
          "git clone https://example.com/advance-conformance-def456.git",
          { lockedSiblingRoots: [lockedRoot, otherLocked] },
        ),
      ).toMatchObject({ action: "block" });
    });

    it("allows benign git clone of an unrelated repo", () => {
      expect(
        enforceConformanceBashPolicy(
          "git clone https://github.com/foo/some-other-repo.git",
          { lockedSiblingRoots: [lockedRoot] },
        ),
      ).toMatchObject({ action: "allow" });
    });

    it("allows benign curl to an unrelated URL", () => {
      expect(
        enforceConformanceBashPolicy("curl https://example.com/unrelated.json", {
          lockedSiblingRoots: [lockedRoot],
        }),
      ).toMatchObject({ action: "allow" });
    });

    it("returns a block message that names the conformance boundary", () => {
      const result = enforceConformanceBashPolicy(
        "git clone https://github.com/foo/advance-conformance-abc123.git",
        { lockedSiblingRoots: [lockedRoot] },
      );
      expect(result.action).toBe("block");
      expect(result.message).toMatch(/conformance/i);
    });
  });
});
