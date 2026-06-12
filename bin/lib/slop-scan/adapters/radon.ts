/** adv CLI — Radon complexity adapter */

import type { SlopScanFinding } from "../schema";
import { complexityFinding } from "./_findings";
import { toRepoRelative } from "./_paths";

interface RadonBlock {
  type?: string;
  name?: string;
  lineno?: number;
  complexity?: number;
  rank?: string;
}

export function normalizeRadonOutput(blocks: RadonBlock[], file: string): SlopScanFinding[] {
  return blocks
    .filter((block) => typeof block.complexity === "number")
    .map((block) =>
      complexityFinding({
        name: "python_complexity_hotspot",
        file,
        line: block.lineno ?? null,
        complexity: block.complexity ?? null,
        description: `Radon reported ${block.name ?? "block"} complexity ${block.complexity} (${block.rank ?? "unranked"}).`,
      }),
    );
}

export function normalizeRadonJson(raw: string, repoRoot: string): SlopScanFinding[] {
  const parsed = JSON.parse(raw) as Record<string, RadonBlock[]>;
  return Object.entries(parsed).flatMap(([file, blocks]) =>
    normalizeRadonOutput(blocks, toRepoRelative(file, repoRoot)),
  );
}

export function buildRadonCommand(targetPath: string): string[] {
  return ["radon", "cc", "--json", "--min", "B", targetPath];
}
