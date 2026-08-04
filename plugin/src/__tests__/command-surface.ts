import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PHASE_DIRECTIVES } from "../utils/phase-directive-content";

const REPO_ROOT = resolve(__dirname, "../../..");

/**
 * Composed command surface for retargeted asset tests: directive content (the
 * canonical procedure) followed by the launcher wrapper. Directive-first so
 * positional `indexOf` procedure-order invariants resolve against the
 * procedure source, not against fallback-subset headings duplicated in the
 * launcher. Contains-checks are order-independent and remain satisfied either
 * way. See design D6 (corrected: launcher-first was abandoned because the D5
 * inline fallback duplicates some procedure headings, breaking indexOf order).
 */
export function readCommandSurface(file: "adv-review.md"): string {
  const launcher = readFileSync(
    join(REPO_ROOT, ".opencode/command", file),
    "utf8",
  );
  return `${PHASE_DIRECTIVES["adv-review"].content}\n\n${launcher}`;
}
