/** adv CLI — Vulture dead-code adapter */

import type { SlopScanFinding } from "../schema";
import { deletionCandidate } from "./_findings";

const VULTURE_LINE = /^(.*?):(\d+):\s*(.*?)\s*\((\d+)% confidence\)/;

export function normalizeVultureOutput(output: string): SlopScanFinding[] {
  const findings: SlopScanFinding[] = [];
  for (const line of output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    const match = line.match(VULTURE_LINE);
    if (!match) continue;
    const confidence = Number(match[4]);
    findings.push(
      deletionCandidate({
        name: "python_unused_code",
        file: match[1],
        line: Number(match[2]),
        description: `Vulture reported ${match[3]} (${confidence}% confidence).`,
        confidence: confidence >= 90 ? "high" : confidence >= 60 ? "medium" : "low",
      }),
    );
  }
  return findings;
}

export function buildVultureCommand(targetPath: string): string[] {
  return ["vulture", targetPath, "--min-confidence", "60"];
}
