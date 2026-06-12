/** adv CLI — Go deadcode adapter */

import type { SlopScanFinding } from "../schema";
import { deletionCandidate } from "./_findings";

const DEADCODE_LINE = /^(.*?):(\d+)(?::\d+)?:\s*unreachable func:\s*(.+)$/;

export function normalizeGoDeadcodeOutput(output: string): SlopScanFinding[] {
  const findings: SlopScanFinding[] = [];
  for (const line of output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    const match = line.match(DEADCODE_LINE);
    findings.push(
      deletionCandidate({
        name: "go_unreachable_function",
        file: match?.[1] ?? "go package graph",
        line: match ? Number(match[2]) : null,
        description: `Go deadcode reported ${match?.[3] ?? line}.`,
        confidence: "high",
      }),
    );
  }
  return findings;
}

export function buildGoDeadcodeCommand(targetPackage = "./..."): string[] {
  return ["deadcode", targetPackage];
}
