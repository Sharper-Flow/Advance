# Acceptance

Reviewed at: 2026-06-17T21:59:55.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `adv_change_forget: true` present in `.opencode/agents/adv.md` and `.opencode/agents/adv-atc.md`. | pass | grep PRESENT: adv_change_forget: true in .opencode/agents/adv.md (after status_repair) and .opencode/agents/adv-atc.md (after reenter). |
| AC2 | acceptance_criterion | `./scripts/deploy-local.sh --check` reports `✓ tool drift` for both adv and adv-atc (zero registered-but-unallowed, zero allowed-but-unregistered). | pass | deploy --check: ✓ tool drift adv.md (56 tools), ✓ tool drift adv-atc.md (56 tools) — zero drift both directions (run tr_mqim3ylt). |
| AC3 | acceptance_criterion | No change to the tool's behavior/schema/registration — allowlist entry only. | pass | git diff = exactly two allowlist lines; tool-registry.ts, schema-registry.ts, FIELD_POLICIES, change.ts unchanged. |
| AC4 | acceptance_criterion | `pnpm run check` green; no instruction-prose or code changes beyond the two allowlist lines. | pass | pnpm run check exit 0 (schemas:check/typecheck/check-test-isolation/check-lockfile-policy/lint/format:check all green, run tr_mqim59sv). |
| C1 | constraint | Allowlist entries only; no tool-registry, schema, or code changes. | respected | Only allowlist entries added; no tool-registry/schema/code changes (git diff confirms). |
| C2 | constraint | Worktree-isolated (trunk write firewall). | respected | Implemented in change/addAdvChangeForgetAgent worktree (trunk firewall honored). |
| DONT1 | avoidance | Don't touch `adv_change_forget` registration/implementation. | respected | adv_change_forget registration/implementation untouched (tool-registry.ts:329 unchanged). |
| DONT2 | avoidance | Don't expand into other allowlist cleanup. | respected | Only the two intended allowlist lines; no other allowlist cleanup expanded into. |

