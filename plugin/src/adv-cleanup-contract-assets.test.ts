/**
 * ADV Cleanup Command + Skill Contract Assets Tests
 *
 * Verifies that the `/adv-cleanup` command and the `adv-cleanup` skill document
 * the unified four-surface hygiene triage contract per rq-cleanupHygieneScope01:
 *   - Discovery covers all four hygiene surfaces (changes, worktrees, merged
 *     archived branches, archived/closed state leaks)
 *   - Every candidate bucket carries an explicit reversibility marker
 *   - Irreversible buckets require count-matched typed confirmation and reject
 *     the reversible-bucket `approve all` token
 *   - Deletion delegates to adv_worktree_delete / adv_worktree_cleanup and never
 *     treats adv_worktree_triage classification as deletion authority
 *     (rq-terminalCleanupSafety01)
 *   - Dry-run remains the default mode
 *
 * The four worktree drift groups from rq-worktreeBoundedCleanup01 are retained.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

/**
 * Extract a markdown section by heading pattern, spanning from the matching
 * heading to the next heading of the same or higher level. Structural rather
 * than whole-file substring matching so bucket-scoped rules are asserted
 * against the bucket that owns them.
 */
function extractSection(md: string, headingPattern: RegExp): string {
  const lines = md.split("\n");
  const start = lines.findIndex(
    (line) => /^#{2,4}\s/.test(line) && headingPattern.test(line),
  );
  if (start === -1) return "";
  const level = lines[start].match(/^(#{2,4})/)?.[1].length ?? 2;
  for (let i = start + 1; i < lines.length; i++) {
    const heading = lines[i].match(/^(#{2,4})\s/);
    if (heading && heading[1].length <= level) {
      return lines.slice(start, i).join("\n");
    }
  }
  return lines.slice(start).join("\n");
}

describe("adv-cleanup hygiene triage contract", () => {
  const command = readRepoFile(".opencode/command/adv-cleanup.md");
  const skill = readRepoFile("skills/adv-cleanup/SKILL.md");
  const files: Array<[string, string]> = [
    ["command", command],
    ["skill", skill],
  ];

  describe("worktree drift groups (rq-worktreeBoundedCleanup01, retained)", () => {
    test.each(files)("%s references adv_worktree_triage", (_name, content) => {
      expect(content).toContain("adv_worktree_triage");
    });

    test.each(files)(
      "%s documents four worktree drift groups",
      (_name, content) => {
        const lower = content.toLowerCase();
        expect(lower).toContain("safe");
        expect(lower).toContain("blocked");
        expect(lower).toContain("dirty");
        expect(lower).toContain("needs-investigation");
      },
    );
  });

  describe("AC1 — four-surface discovery", () => {
    test("command routes discovery through all four surface tools", () => {
      expect(command).toContain("adv_change_list");
      expect(command).toContain("adv_worktree_triage");
      expect(command).toContain("adv_worktree_cleanup");
      expect(command).toContain("adv_status");
    });

    test("command names the archived-branch discovery mode", () => {
      expect(command).toContain("archived_branches");
    });

    test("command names the state-leak discovery view", () => {
      expect(command).toMatch(/adv_status[^\n]*hygiene/);
    });

    test.each(files)(
      "%s documents the four hygiene surfaces",
      (_name, content) => {
        const lower = content.toLowerCase();
        expect(lower).toContain("worktree drift");
        expect(lower).toContain("archived");
        expect(lower).toMatch(/state leak|leak detection/);
      },
    );

    test.each(files)(
      "%s requires an explicit empty state per surface",
      (_name, content) => {
        expect(content).toMatch(/empty state|explicit empty|rather than omit/i);
      },
    );
  });

  describe("AC2 — reversibility labelling", () => {
    test.each(files)(
      "%s marks buckets as reversible or irreversible",
      (_name, content) => {
        expect(content).toMatch(/\birreversible\b/i);
        expect(content).toMatch(/\breversible\b/i);
      },
    );

    test.each(files)(
      "%s states the reflog recovery bound for branch deletion",
      (_name, content) => {
        expect(content).toMatch(/reflog/i);
      },
    );
  });

  describe("AC3 — typed confirmation for irreversible buckets", () => {
    const irreversibleSections = files.map(
      ([name, content]) =>
        [name, extractSection(content, /irreversible/i)] as [string, string],
    );

    test.each(irreversibleSections)(
      "%s has a dedicated irreversible-bucket approval section",
      (_name, section) => {
        expect(section).not.toBe("");
      },
    );

    test.each(irreversibleSections)(
      "%s requires the count-matched delete-all form",
      (_name, section) => {
        expect(section).toContain("^delete all (\\d+)$");
      },
    );

    test.each(irreversibleSections)(
      "%s accepts subset, skip, and halt replies",
      (_name, section) => {
        // Markdown tables require escaping `|` as `\|`, so compare against a
        // pipe-normalized view rather than the raw source.
        const normalized = section.replace(/\\\|/g, "|");
        expect(normalized).toContain("^delete ([\\d,\\s]+)$");
        expect(normalized).toContain("^skip$");
        expect(normalized).toContain("^(stop|abort)$");
      },
    );

    test.each(irreversibleSections)(
      "%s rejects the reversible-bucket approve-all token",
      (_name, section) => {
        expect(section).toMatch(/approve all/);
        expect(section).toMatch(/reject|not accepted|refuse/i);
      },
    );

    test.each(irreversibleSections)(
      "%s re-prompts on count mismatch",
      (_name, section) => {
        expect(section).toMatch(/mismatch/i);
        expect(section).toMatch(/re-prompt/i);
      },
    );

    test.each(irreversibleSections)(
      "%s forbids LLM fallback",
      (_name, section) => {
        expect(section).toMatch(/no llm fallback/i);
      },
    );
  });

  describe("AC4 — named candidates, never counts", () => {
    test.each(files)(
      "%s requires exact worktree paths and branch names in destructive prompts",
      (_name, content) => {
        const section = extractSection(content, /irreversible/i);
        expect(section).toMatch(/path/i);
        expect(section).toMatch(/branch name/i);
        expect(section).toMatch(/never a count|not a count|count-only/i);
      },
    );
  });

  describe("AC5 — delegated deletion authority (rq-terminalCleanupSafety01)", () => {
    test.each(files)(
      "%s names the delegated deletion tools",
      (_name, content) => {
        expect(content).toContain("adv_worktree_delete");
        expect(content).toContain("adv_worktree_cleanup");
      },
    );

    test.each(files)(
      "%s states triage classification is not deletion authority",
      (_name, content) => {
        expect(content).toMatch(/never deletion authority|not deletion authority/i);
      },
    );

    test.each(files)(
      "%s surfaces tool safety refusals verbatim",
      (_name, content) => {
        expect(content).toMatch(/refusal/i);
      },
    );

    test.each(files)(
      "%s does not claim cleanup never deletes worktrees",
      (_name, content) => {
        // AC9 false-green guard: the retired report-only invariant must be gone,
        // not merely shadowed by the surviving phrase "drift report".
        expect(content).not.toMatch(/never deletes worktrees/i);
        expect(content).not.toMatch(/does not delete worktrees/i);
      },
    );
  });

  describe("AC6 — dry-run default preserved", () => {
    test.each(files)("%s defaults to dry-run", (_name, content) => {
      expect(content).toMatch(/dry-run/i);
      expect(content).toMatch(/default/i);
    });

    test("command tells the user how to re-run with execution enabled", () => {
      expect(command).toContain("--execute");
    });
  });

  describe("AC7 / DONT5 — reversible parser unchanged", () => {
    test.each(files)(
      "%s retains the reversible-bucket reply tokens",
      (_name, content) => {
        expect(content).toContain("^approve all$");
        expect(content).toContain("^reject all$");
        expect(content).toContain("^keep ([\\d,\\s]+)$");
        expect(content).toContain("^cancel ([\\d,\\s]+)$");
      },
    );

    test.each(files)(
      "%s retains the existing change buckets",
      (_name, content) => {
        const lower = content.toLowerCase();
        expect(lower).toContain("duplicate");
        expect(lower).toContain("stuck at proposal");
        expect(lower).toContain("abandoned");
        expect(lower).toContain("ready to archive");
      },
    );
  });

  describe("DONT3 — no second execute flag", () => {
    test("command does not introduce an escalation flag", () => {
      expect(command).not.toMatch(/--execute-destructive/);
      expect(command).not.toMatch(/--force-delete/);
    });
  });

  describe("DONT4 — state leaks stay report-only", () => {
    test.each(files)(
      "%s routes state-leak remediation to adv_archive_purge",
      (_name, content) => {
        expect(content).toContain("adv_archive_purge");
      },
    );
  });

  describe("AC8 / C5 — spec citations", () => {
    test("command cites the new hygiene-scope requirement", () => {
      expect(command).toContain("rq-cleanupHygieneScope01");
    });

    test("command retains its existing requirement citations", () => {
      expect(command).toContain("rq-inlineApproval01.4");
      expect(command).toContain("rq-inlineApproval01.3");
      expect(command).toContain("rq-autonomy01");
    });

    test("command cites the delegated-deletion safety requirement", () => {
      expect(command).toContain("rq-terminalCleanupSafety01");
    });
  });

  describe("C4 — skill loading contract preserved", () => {
    test("command loads the adv-cleanup skill", () => {
      expect(command).toContain('skill("adv-cleanup")');
    });

    test("command keeps a fallback phrase near the skill reference", () => {
      const lines = command.split("\n");
      const refIndex = lines.findIndex((line) =>
        line.includes('skill("adv-cleanup")'),
      );
      expect(refIndex).toBeGreaterThanOrEqual(0);
      const window = lines
        .slice(Math.max(0, refIndex - 3), refIndex + 9)
        .join("\n");
      expect(window).toMatch(
        /fallback|unavailable|inconclusive|degradation|otherwise continue/i,
      );
    });

    test("command introduces no additional skill references", () => {
      const refs = [...command.matchAll(/skill\("([^"]+)"\)/g)].map(
        (match) => match[1],
      );
      expect(new Set(refs)).toEqual(new Set(["adv-cleanup"]));
    });
  });

  describe("C6 — skill stays read-only guidance", () => {
    test("skill states the command owns mutation", () => {
      expect(skill).toMatch(/command owns/i);
      expect(skill).toMatch(/read-only guidance/i);
    });
  });

  describe("C7 — no retired headings, no gate spine", () => {
    test("command has no retired next-stage headings", () => {
      expect(command).not.toMatch(/^##\s+Next(\s+stage)?\s*$/m);
    });

    test("command does not grow a gate-handoff spine", () => {
      const hasSpine =
        /^##\s+Problem\s*$/m.test(command) &&
        /^##\s+Chosen direction\s*$/m.test(command) &&
        /^##\s+Delivered\s*$/m.test(command);
      expect(hasSpine).toBe(false);
    });
  });
});
