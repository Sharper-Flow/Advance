# Design

## Architecture Overview

Use the existing `worktree_guard_enforce` project feature flag as the single structural policy switch for ADV worktree isolation. The trunk write firewall remains the enforcement mechanism for file-write tool calls, but the `tool.execute.before` hook only invokes it when the effective flag is true.

The target shape is:

1. Parse project config through the existing `ProjectConfigSchema` path.
2. Expose `worktree_guard_enforce` as an explicit typed/defaulted feature flag.
3. Compute effective feature defaults through one shared helper used by status and hook policy.
4. In `plugin/src/index.ts`, skip `checkTrunkWrite` and `checkTrunkWriteBash` entirely when `worktree_guard_enforce` is false.
5. Keep `plugin/src/tools/trunk-write-firewall.ts` focused on path/branch/write classification, not project-policy loading.
6. Opt the Advance repo into strict mode by setting `features.worktree_guard_enforce: true` in `project.json`.

## Key Decisions

### KD1 — One flag owns worktree isolation

`worktree_guard_enforce` controls both task/gate mutation isolation and trunk file-write isolation. This avoids a second partially-overlapping flag and makes `adv_status` truthful: if the flag is false, machine worktree isolation is off; if true, main-checkout mutations and direct file writes are protected.

### KD2 — Policy outside firewall classifier

The firewall module should not load project config. It should continue to answer: given a target path and git context, should this write be blocked under strict policy? The hook decides whether strict policy is enabled. This preserves locality: config policy in plugin/tool orchestration; git/path classification in `trunk-write-firewall.ts`.

### KD3 — Strict mode keeps fail-closed behavior

When strict mode is enabled and the target is in the trunk checkout but default branch cannot be verified, preserve the current block. When strict mode is disabled, do not call the firewall, so lightweight projects are not blocked by uncertainty in branch detection.

### KD4 — Type/default the flag explicitly

Add `worktree_guard_enforce: z.boolean().default(false)` to `FeatureFlagsSchema` and export a shared effective-default helper used by status and the hook. The flag is now an advertised policy surface, not only passthrough config.

### KD5 — Advance repo opts in explicitly

Update root `project.json` to include `"worktree_guard_enforce": true` under `features`. This keeps strict protection for this repo while allowing other projects to remain lightweight by default.

### KD6 — Config failure is explicit, not accidental fail-open

The hook path must have deliberate, tested config-read behavior. Omitted config or omitted flag defaults false. Schema-invalid feature config should use schema defaults only when the parser can structurally normalize it. Malformed/unreadable `project.json` must not silently disable a strict repo; it should follow the existing plugin-init/config diagnostic behavior or produce a clear warning/error path rather than accidental fail-open.

## ADR Drafts

None. The decision is important but not hard-to-reverse enough to warrant an ADR; the spec delta and agreement capture the tradeoff.

## Implementation Strategy

1. **Spec red:** Update `.adv/specs/advance-meta/spec.json` `rq-twf01` to require trunk write firewall enforcement only when `feature_flags.worktree_guard_enforce` is true, and to require flag-off allowance for file-write tools and classified destructive bash.
2. **Schema/default helper:** Add explicit `worktree_guard_enforce` default false in `FeatureFlagsSchema` and export a shared helper for effective stability feature flags. Update `adv_status` to use the same source.
3. **Hook policy:** In `plugin/src/index.ts`, resolve effective feature flags once near plugin initialization / hook setup. Use that value to skip the firewall checks when false.
4. **Config failure tests:** Add tests proving omitted/false allows, true blocks, and malformed/unreadable config does not silently become an unintended fail-open for strict mode.
5. **Firewall tests:** Keep core classifier tests for strict semantics; add or adjust policy-level tests for hook behavior.
6. **Integration tests:** Update `plugin/src/integration.test.ts` so default config allows trunk writes, flag true blocks file writes/bash, and worktree/exception behavior remains green.
7. **Repo config:** Add `features.worktree_guard_enforce: true` to root `project.json`.
8. **Docs/instructions:** Update `ADV_INSTRUCTIONS.md`, `docs/worktree-guide.md`, and any asset tests to state: strict mode is enabled by `worktree_guard_enforce=true`; omitted/false means no trunk write firewall.
9. **Verification:** Run targeted trunk firewall/integration tests, affected asset/spec tests, `pnpm run check`, and relevant build/tests from `plugin/`.

## LBP Analysis

This is the preferred long-term approach because it makes safety policy explicit, typed, and observable instead of inferred from project size or ADV activity level. It also reuses the feature flag already introduced for machine worktree isolation, aligning file writes with task/gate mutation guards.

Rejected alternatives:

- **Second flag:** more configurable but creates drift between task/gate and file-write isolation.
- **Project/path allowlist:** solves `~/toolbox` only and makes correctness heuristic/project-specific.
- **Agent-only instruction:** cheaper but violates P33; write safety must be structural when strict mode is enabled.
- **Always-on firewall:** preserves maximum safety but contradicts the documented default false rollout and creates friction in lightweight projects.

## Affected Components

- `project.json` — opt Advance into strict mode.
- `plugin/src/types/project.ts` — explicit feature flag default and shared helper export.
- `plugin/src/tools/status.ts` — effective flag display / shared default source.
- `plugin/src/index.ts` — hook-level policy gating for `write`, `edit`, `morph_edit`, and `bash`.
- `plugin/src/tools/trunk-write-firewall.ts` — likely unchanged except type comments or optional dependency shape if policy is passed inward.
- `plugin/src/tools/trunk-write-firewall.test.ts` — classifier/strict-mode expectations.
- `plugin/src/integration.test.ts` — plugin hook behavior under flag false/true.
- `.adv/specs/advance-meta/spec.json` — `rq-twf01` law update.
- `ADV_INSTRUCTIONS.md`, `docs/worktree-guide.md`, docs/assets tests — strict-mode wording.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Status says flag false but hook behaves strict | Share/default the feature policy rather than duplicating ad-hoc logic. |
| Strict projects lose protection | Tests must assert flag true preserves existing blocks and exceptions. |
| Config parse failure disables intended strict mode | Add explicit config failure behavior and tests; do not catch malformed config into silent default-false without diagnostics. |
| Config read adds per-tool overhead | Resolve once at plugin initialization or use a cheap cached effective flag; avoid reading `project.json` for every tool call. |
| Root config strictness blocks current implementation edits on trunk | Use an ADV worktree for execution after prep, or create config update as part of implementation in the isolated worktree. |
| Docs overstate migration impact | Use plain wording: set `worktree_guard_enforce: true` to enable strict trunk write firewall. |

## Validator Result

DESIGN_VALIDATION: CAUTION

- Correctness caution: design solves the objective but needs explicit malformed-config behavior so intended strict mode cannot silently fail open.
- Simplicity info: one flag plus shared helper is the simplest viable architecture.
- Spec-law caution: current `rq-twf01` requires unconditional blocking, so the spec update must precede compliant implementation.
- Alternatives info: no materially better alternative appears overlooked.

Resolution: KD6 and implementation step 4 add explicit config-failure behavior and tests. No unresolved `CONFLICT`; no contract-compromise risk.
