# Executive Summary

## Outcome

Advance plugin now ships an `explore` overlay that injects the canonical MCP-active-surface routing contract into the spawned explore sub-agent's prompt, closing the gap that allowed explore to silently fall back to `glob`/`grep` under `oc`-launched (CodeMode-on) sessions. Approver is deciding whether to release this plugin change and its accompanying drift-detection test plus mode-neutral rewrites of four user-owned agent base files.

## Why It Matters

Before this change, the `explore` sub-agent (spawned for fast codebase reconnaissance) was missing the same routing contract that `general` already carried — so under CodeMode-on sessions it could not discover that semantic and symbol code intelligence (lgrep) was exposed via the `execute` tool's generated catalog, and fell back to blunt `glob`/`grep`. The fix adds a 9-line overlay (byte-identical to `general.overlay.md`), a single `apply_overlay_block "explore"` deploy line, and a new test that fails if any future overlay-only source drops the contract. Stale direct-callable routing prose in the four user-owned base files (`explore`, `general`, `build`, `plan`) was also rewritten to be mode-neutral so the prompts no longer fight the runtime tool surface.

## Verdict

APPROVED

## What Was Built

1. **New overlay** (`.opencode/overlays/explore.overlay.md`, 9 lines) — byte-identical to `general.overlay.md`, carries the canonical `MCP_ACTIVE_SURFACE_CONTRACT` text and the same ADV_SYNC bullets about /adv-* dispatch, worker nesting, and TDD path.
2. **Deploy hook** (`scripts/deploy-local.sh` line 1608) — new `apply_overlay_block "explore" "$GLOBAL_AGENTS/explore.md"` invocation, alphabetically ordered with the existing `build`/`general`/`plan` lines.
3. **Drift-detection test** (`plugin/src/tool-name-assets.test.ts`, +32 lines) — new test "overlay-only sources each carry the canonical contract exactly once" filters `.opencode/overlays/*.overlay.md` to overlay-only sources (those without an advance-source agent file), asserting `explore` and `general` each carry the contract exactly once. Structurally sidesteps the validator-flagged every-overlay conflict with the existing exactly-once invariant for source-backed agents.
4. **User base file rewrites** (`~/.config/opencode/agents/{explore,general,build,plan}.md`) — replaced stale "MCP Tools Available" / "Code Exploration Priority" sections with mode-neutral versions that point at the ADV_SYNC block (or global instruction) for routing rather than hard-coding direct-callable names.

## What Was Verified

- **Verdict**: APPROVED with 2 findings (0 blockers, 0 issues, 1 suggestion, 1 praise)
- **Tests**: 25/25 pass — `bin/oc-test targeted -- src/tool-name-assets.test.ts src/mcp-runtime-matrix.test.ts` (14/14 + 11/11). Re-ran from both trunk `dd2c1b8b` and worktree `e1502260`.
- **CI**: PR #250 squash-merged at `dd2c1b8b7c3ca916418777d42293ccdaae1cf65f`, 6/6 green (Gitleaks, OSV, Semgrep, Trivy, Test 24.x).
- **Static checks**: `pnpm run check` all green (71.5s; schemas, typecheck, isolation, lint, format).
- **Contract matrix**: 30/30 required rows pass/respected/not_applicable (3 SC, 7 AC, 7 C, 13 DONT/OOS).
- **Preview URL**: not_applicable — `visual_surface: false` per agreement; pure prompt/config change with no UI, browser, or visual output.
- **Verification matrix** (SC1/SC3): 8/8 cells PASS across 4 agents × 2 modes. explore/general covered via overlay contract; build/plan covered via global always-on `lgrep-tools.md` instruction (AD8/OOS5 preserved asymmetry).

## Remaining Concerns

- **Non-blocking OOS5 doc-gap (suggestion-level)**: User `build.md:161` and `plan.md:158,162` reference "See the ADV_SYNC block at the top of this prompt for routing guidance" but the build/plan ADV_SYNC overlay blocks lack the canonical contract line (preserved asymmetry per design AD8/OOS5). Functionally harmless — routing reaches build/plan via the always-on global `~/.config/opencode/instructions/lgrep-tools.md` instruction loaded into every OpenCode agent. Future OOS5 cleanup candidate: either add the contract to build/plan overlays coordinated with source-body removal (per C7/DONT5) or soften the cross-reference wording.
- **OpenCode restart required** (C1): User base file edits at `~/.config/opencode/agents/*.md` do not take effect until OpenCode is restarted. Operational step outside this change's deliverable.

## Supporting Evidence

- Tasks: `tk-04ac4d218892` (Stage 1 impl), `tk-55875ab46075` (PR #250 merged), `tk-b0bc8a964818` (deploy + AC3), `tk-3aca03a1e520` (AC4 user files), `tk-346e103e1012` (verification matrix SC1/SC3/AC7).
- Review report: `fixSubAgentMcpRouting|change:scanner-bundle:review|adv-scanner-bundle|1` (inline-checked 12 dimensions; 1 suggestion, 1 praise).
- Design validation: `fixSubAgentMcpRouting|change:researcher:design-validation|adv-researcher|1` (fail → advisory-only per rq-designValidatorAdvisory01; all 4 findings addressed at design gate).
- Test artifacts: `plugin/src/__fixtures__/mcp-runtime-live-evidence.json` (transcript-level mode-switching proof), `plugin/src/__fixtures__/mcp-runtime-matrix.json` (structural runtime fixture).
- Contract matrix: 30 rows persisted via `adv_contract_review_matrix_set`.

## Consequence Context

1. **Delivered value**: Closes the CodeMode-on gap that allowed the spawned explore sub-agent to silently fall back to `glob`/`grep`. Adds drift-detection test so future overlay regressions surface at test time. Removes stale direct-callable routing prose from 4 user-owned base files. Source: acceptance summary + task implementation summaries + contract matrix.
2. **Enabling-only/follow-up dependency**: n/a — no required follow-ups for release. The change is self-contained.
3. **Ops readiness**: pending — harden owns release/deploy/production/docs/cleanup readiness. Operational step: user must restart OpenCode for `~/.config/opencode/agents/*.md` edits to take effect (C1).
4. **Migration/data impact**: n/a — pure prompt/config change. No data persistence, schema, or migration surface.
5. **Frontend/preview impact**: not_applicable — `visual_surface: false` per agreement. No UI, browser, or visual output.
6. **Collision/release risk**: none identified. PR #250 squash-merged cleanly; trunk at `dd2c1b8b`; no concurrent branch conflicts. Stage 2 deploy idempotent (`overlay already current: explore`).
7. **Open follow-ups**: 1 non-blocking OOS5 future cleanup (build/plan ADV_SYNC cross-reference wording). No required follow-ups.
8. **Next action**: acceptance approval proceeds inline to `/adv-harden fixSubAgentMcpRouting`. Fixes/re-entry/split/stop follow the standard reply parser.