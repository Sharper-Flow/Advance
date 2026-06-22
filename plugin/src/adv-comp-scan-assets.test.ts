/**
 * adv-comp-scan command asset tests — research safety fallback boundaries.
 *
 * Verifies that `.opencode/command/adv-comp-scan.md` instructs the orchestrator
 * to redact confidential data, avoid internal-only sources, and respect public-source
 * boundaries when falling back to external research tools (AC8).
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(__dirname, "../..");
const COMP_SCAN_PATH = join(REPO_ROOT, ".opencode/command/adv-comp-scan.md");

describe("adv-comp-scan source safety boundary (AC8)", () => {
  const command = readFileSync(COMP_SCAN_PATH, "utf8");

  test("declares a source safety boundary section", () => {
    expect(command).toMatch(/## Source Safety Boundary/i);
  });

  test("requires redaction before external queries", () => {
    expect(command).toMatch(/[Rr]edact/i);
    expect(command).toMatch(
      /strip secrets|internal URLs|private identifiers|proprietary code|credentials|confidential project details/i,
    );
  });

  test("forbids confidential data in external research tools", () => {
    expect(command).toMatch(/[Nn]o confidential data/i);
    expect(command).toMatch(
      /internal-only roadmaps|unreleased designs|private user data|proprietary metrics/i,
    );
  });

  test("enforces public-source boundary and refuses bypass", () => {
    expect(command).toMatch(/[Pp]ublic-source boundary/i);
    expect(command).toMatch(
      /private|authenticated|paywalled[^\n]*stop[^\n]*surface[^\n]*boundary/i,
    );
    expect(command).toMatch(
      /rather than bypass|not[^\n]*bypass|do not[^\n]*bypass/i,
    );
  });

  test("fallback safety applies to Exa/Firecrawl fallback", () => {
    expect(command).toMatch(/[Ff]allback safety/i);
    expect(command).toMatch(/Exa|Firecrawl/);
    expect(command).toMatch(/generic|source-cited|source cited/i);
    expect(command).toMatch(/never leak|do not leak|leak project internals/i);
  });
});
