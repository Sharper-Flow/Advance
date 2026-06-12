/** adv CLI — gocyclo complexity adapter */

import type { SlopScanFinding } from "../schema";
import { complexityFinding } from "./_findings";

const GOCYCLO_LINE = /^(\d+)\s+\S+\s+(.+?)\s+(.+?):(\d+):(\d+)$/;

export function normalizeGocycloOutput(output: string): SlopScanFinding[] {
  const findings: SlopScanFinding[] = [];
  for (const line of output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    const match = line.match(GOCYCLO_LINE);
    if (!match) continue;
    findings.push(
      complexityFinding({
        name: "go_complexity_hotspot",
        file: match[3],
        line: Number(match[4]),
        complexity: Number(match[1]),
        description: `gocyclo reported ${match[2]} complexity ${match[1]}.`,
      }),
    );
  }
  return findings;
}

export function buildGocycloCommand(targetPath: string, threshold: number): string[] {
  return ["gocyclo", "-over", String(threshold), targetPath];
}
