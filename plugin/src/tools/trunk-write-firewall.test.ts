import { describe, expect, it, vi } from "vitest";

import {
  checkTrunkWrite,
  checkTrunkWriteBash,
  classifyDestructiveBash,
  stripHeredocs,
  type TrunkWriteFirewallDeps,
} from "./trunk-write-firewall.js";
import type { RepoState } from "./checkpoint.js";

function deps(overrides: Partial<TrunkWriteFirewallDeps> = {}): TrunkWriteFirewallDeps {
  return {
    getDefaultBranch: vi.fn(async () => "main"),
    execGit: vi.fn(async (args: string[]) => {
      if (args.join(" ") === "rev-parse --show-toplevel") return "/repo";
      if (args.join(" ") === "rev-parse --abbrev-ref HEAD") return "main";
      return "";
    }),
    getWorktreePaths: vi.fn(async () => ["/repo-wt"]),
    getProjectRoot: () => "/repo",
    getRepoState: vi.fn(async () => "ok"),
    ...overrides,
  };
}

describe("checkTrunkWrite", () => {
  it("blocks file-tool writes to trunk checkout on default branch", async () => {
    const result = await checkTrunkWrite("/repo/src/index.ts", deps());

    expect(result.decision).toBe("BLOCK");
    expect(result.reason).toContain("trunk checkout");
  });

  it("allows file-tool writes inside known worktree paths", async () => {
    await expect(checkTrunkWrite("/repo-wt/src/index.ts", deps())).resolves.toMatchObject({
      decision: "ALLOW",
    });
  });

  it.each([
    "merging",
    "rebasing",
    "cherry-picking",
    "reverting",
  ] as RepoState[])("allows trunk writes while repo state is %s", async (state) => {
    await expect(
      checkTrunkWrite(
        "/repo/src/index.ts",
        deps({ getRepoState: vi.fn(async () => state) }),
      ),
    ).resolves.toMatchObject({ decision: "ALLOW" });
  });

  it("allows writes on non-default branches", async () => {
    await expect(
      checkTrunkWrite(
        "/repo/src/index.ts",
        deps({
          execGit: vi.fn(async (args: string[]) => {
            if (args.join(" ") === "rev-parse --show-toplevel") return "/repo";
            if (args.join(" ") === "rev-parse --abbrev-ref HEAD") return "change/test";
            return "";
          }),
        }),
      ),
    ).resolves.toMatchObject({ decision: "ALLOW" });
  });

  it("allows outside-repo paths when git root cannot be resolved", async () => {
    await expect(
      checkTrunkWrite(
        "/tmp/file.txt",
        deps({
          execGit: vi.fn(async (args: string[]) => {
            if (args.join(" ") === "rev-parse --show-toplevel") {
              throw new Error("not a git repo");
            }
            return "";
          }),
        }),
      ),
    ).resolves.toMatchObject({ decision: "ALLOW" });
  });
});

describe("classifyDestructiveBash", () => {
  it.each([
    ["echo x > /repo/file.txt", ["/repo/file.txt"]],
    ["echo x >> /repo/file.txt", ["/repo/file.txt"]],
    ["echo x | tee /repo/file.txt", ["/repo/file.txt"]],
    ["echo x | tee -a /repo/file.txt", ["/repo/file.txt"]],
    ["sed -i 's/a/b/' /repo/file.txt", ["/repo/file.txt"]],
    ["cp /tmp/a /repo/file.txt", ["/repo/file.txt"]],
    ["mv /tmp/a /repo/file.txt", ["/repo/file.txt"]],
    ["rm /repo/file.txt", ["/repo/file.txt"]],
  ])("extracts write targets from %s", (command, expected) => {
    expect(classifyDestructiveBash(command)).toEqual(expected);
  });

  it("does not classify git commands as destructive writes", () => {
    expect(classifyDestructiveBash("git pull --ff-only origin main")).toEqual([]);
    expect(classifyDestructiveBash("git reset --hard origin/main")).toEqual([]);
  });

  it("strips heredoc bodies before scanning", () => {
    const command = "cat <<'EOF'\ngit reset --hard\necho x > /repo/file.txt\nEOF\n";
    expect(stripHeredocs(command)).not.toContain("/repo/file.txt");
    expect(classifyDestructiveBash(command)).toEqual([]);
  });
});

describe("checkTrunkWriteBash", () => {
  it.each([
    "echo x > /repo/file.txt",
    "echo x >> /repo/file.txt",
    "echo x | tee /repo/file.txt",
    "sed -i 's/a/b/' /repo/file.txt",
    "cp /tmp/a /repo/file.txt",
    "mv /tmp/a /repo/file.txt",
    "rm /repo/file.txt",
  ])("blocks destructive bash command: %s", async (command) => {
    await expect(checkTrunkWriteBash(command, "/repo", deps())).resolves.toMatchObject({
      decision: "BLOCK",
    });
  });

  it("allows destructive bash writes inside worktree paths", async () => {
    await expect(
      checkTrunkWriteBash("echo x > /repo-wt/file.txt", "/repo-wt", deps()),
    ).resolves.toMatchObject({ decision: "ALLOW" });
  });

  it("allows git commands without classification", async () => {
    await expect(
      checkTrunkWriteBash("git commit -m test && git pull --ff-only", "/repo", deps()),
    ).resolves.toMatchObject({ decision: "ALLOW" });
  });
});
