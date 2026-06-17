---
name: adv-instructions-audit
description: "Audit Advance instruction prose (AGENTS.md, project.md, ADV_INSTRUCTIONS.md, command/agent files) against executable anchors. Use when editing instructions, suspecting drift after a docs edit broke CI, or checking whether a protocol rule has any executable backing."
keywords: ["adv", "instructions", "drift", "anchors", "docs-as-code", "coverage", "audit"]
metadata:
  priority: medium
  source: adv-instructions-audit-skill
---

# ADV Instructions Audit

## Purpose
Read-only methodology: treat Advance's `*-assets.test.ts` / invariant / drift test files as the **anchor layer** for instruction prose, and audit instruction surfaces against it. Adds no enforcement; makes the ad-hoc anchor layer systematic and discoverable. Different axis from `adv-audit` (spec↔code) — this is instruction-prose↔anchor.

## When to use
- After editing any instruction surface (`AGENTS.md`, `project.md`, `ADV_INSTRUCTIONS.md`, `.opencode/command|agents/`, skills).
- When a docs edit broke CI (a prose claim drifted from its anchor).
- When checking whether a protocol rule has any executable backing.

## Core rules
1. **Trace-to-anchor (fidelity)** — every load-bearing claim must trace to an executable anchor whose assertion fails for *this claim's failure mode*. Presence ≠ fidelity: a substring match that mentions a claim but doesn't fail when the claim's matrix goes stale is a false anchor.
2. **Test-or-cut** — load-bearing claim with no fidelity anchor → add a drift-guard test OR delete the claim. No sovereign prose.
3. **Single-source-per-surface** — each surface owns one claim kind (`project.md`=agent context, `AGENTS.md`=dev ramp-up, `ADV_INSTRUCTIONS.md`=full protocol, `command/*.md`=per-gate contract, `specs/`=laws); others point, never restate.
4. **Runtime-assembly-aware** — edits to `.opencode/agents/` + `overlays/` reach the live session only after `deploy-local.sh --fix` + restart.

## Anchor taxonomy (enumerate at runtime — never embed a static list)
| Kind | Enumerate via |
|---|---|
| Surface-asset | `rg -l 'AGENTS\.md\|ADV_INSTRUCTIONS\.md\|project\.md' plugin/src/**/*.test.ts` |
| Invariant | filename `*invariant*` / `*no-psw*` |
| Boundary | `workflow-bundle-boundary`, `context-snapshot.purity` |
| Per-command | filename `adv-<cmd>-assets.test.ts` |
| Drift | filename `*drift*` |

## Audit dimensions
| Dimension | Detects | Sev |
|---|---|---|
| Anchor mapper | claim with no matching test | REVIEW |
| Drift detector (**fidelity**) | prose contradicts anchor, OR anchor only mentions the claim (no fidelity) | HIGH |
| Coverage checker | invariant with no anchor anywhere | MEDIUM |
| Duplication detector | same claim restated across surfaces | MEDIUM |
| Orphan detector | prose with no anchor and no load-bearing role | LOW |

## Findings & health
Finding: `{ id, surface, claim, dimension, anchor\|null, fidelity (pass/fail/n/a), severity, fix }`.
Health: `ALIGNED` (all anchored, no drift) · `DRIFT_DETECTED` (any unanchored/dup/orphan) · `MAJOR_DRIFT` (any HIGH drift/contradiction).

## Dry-run procedure
1. Pick ≥3 surfaces (e.g. `project.md`, `AGENTS.md`, one `ADV_INSTRUCTIONS.md` section).
2. Enumerate the anchor layer via `rg` (no baked list).
3. Map each load-bearing claim → anchor test → fidelity.
4. Run the 5 dimensions; emit findings.
5. Report. **Modify no files** — fixes are follow-up changes.

## Constraints
- Read-only; never auto-fix (mirrors `adv-audit`).
- Methodology-only SKILL.md; no standing inventories (`rq-skillProseCompression01` / `advance-meta.md`).
- Different axis from `adv-audit`; `adv-instructions-assets.test.ts` and the runtime-coverage doc are anchor *instances*/prior art, not competitors.
