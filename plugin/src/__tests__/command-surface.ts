import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PHASE_DIRECTIVES } from "../utils/phase-directive-content";

const REPO_ROOT = resolve(__dirname, "../../..");

export function readCommandSurface(file: "adv-review.md"): string {
  const launcher = readFileSync(
    join(REPO_ROOT, ".opencode/command", file),
    "utf8",
  );
  return `${launcher}\n\n${PHASE_DIRECTIVES["adv-review"].content}`;
}
