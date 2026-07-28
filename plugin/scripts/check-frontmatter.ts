#!/usr/bin/env node
/**
 * CI lint script: validate YAML frontmatter in ADV agent/command manifests.
 *
 * - Parses every .md file under .opencode/agents/ and .opencode/command/.
 * - For ADV-policy manifests (those containing the ADV-GENERATED sentinel),
 *   cross-checks the `tools:` map against AGENT_TOOL_POLICY.
 * - Exits 1 on any unparseable frontmatter or policy drift.
 *
 * Accepts --deploy <dir> to scan a single directory (used by deploy preflight).
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { fileURLToPath } from "url";
import {
  parseFrontmatterText,
  assertPolicyMatch,
} from "../src/utils/manifest-frontmatter";

const ADV_GENERATED_SENTINEL = ">>> ADV-GENERATED";

const scriptDir = resolve(fileURLToPath(import.meta.url), "..");
const repoRoot = resolve(scriptDir, "../..");

interface Failure {
  file: string;
  error: string;
}

function isAdvPolicyManifest(text: string): boolean {
  return text.includes(ADV_GENERATED_SENTINEL);
}

function walk(dir: string, failures: Failure[], checked: { count: number }): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      walk(fullPath, failures, checked);
    } else if (entry.endsWith(".md")) {
      checked.count++;
      let text: string;
      try {
        text = readFileSync(fullPath, "utf8");
      } catch (e) {
        failures.push({ file: fullPath, error: (e as Error).message });
        continue;
      }

      const parsed = parseFrontmatterText(text);
      if (!parsed.ok) {
        failures.push({ file: fullPath, error: parsed.error ?? "unknown error" });
        continue;
      }

      if (parsed.doc && isAdvPolicyManifest(text)) {
        const agent = entry.replace(/\.md$/, "");
        const policy = assertPolicyMatch(parsed.doc, agent);
        if (!policy.ok) {
          failures.push({
            file: fullPath,
            error: (policy.drift ?? []).join("; "),
          });
        }
      }
    }
  }
}

function parseArgs(): { dirs: string[] } {
  const args = process.argv.slice(2);
  const deployIdx = args.indexOf("--deploy");
  if (deployIdx !== -1 && args[deployIdx + 1]) {
    return { dirs: [resolve(args[deployIdx + 1])] };
  }
  return {
    dirs: [
      join(repoRoot, ".opencode", "agents"),
      join(repoRoot, ".opencode", "command"),
    ],
  };
}

function main() {
  const { dirs } = parseArgs();
  const failures: Failure[] = [];
  const checked = { count: 0 };

  for (const dir of dirs) {
    walk(dir, failures, checked);
  }

  if (failures.length > 0) {
    for (const { file, error } of failures) {
      const display = file.startsWith(repoRoot + "/")
        ? relative(repoRoot, file)
        : file;
      console.error(`${display}: ${error}`);
    }
    console.error(
      `frontmatter check failed: ${failures.length} issue(s) in ${checked.count} file(s)`,
    );
    process.exit(1);
  }

  console.log(`frontmatter check passed: ${checked.count} file(s) scanned`);
}

main();
