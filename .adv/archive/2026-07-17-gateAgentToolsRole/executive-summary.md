# Executive Summary

## Outcome

ADV agent tool exposure is now structurally role-scoped from a single source of truth (`AGENT_TOOL_POLICY`), enforced on two ADV-owned layers with no OpenCode core modification.

## Value

Operator-only and orchestrator-only tools can no longer reach a sub-agent — even if an agent manifest drifts or a sub-agent is prompt-injected. Agent manifests can no longer silently diverge from policy. Least-privilege tool exposure becomes machine-checkable rather than hand-maintained.

## Delivered

- **Generated manifests (fine-grained):** `generate-agent-manifests.ts` emits each agent's `adv_*` `tools:` block from `AGENT_TOOL_POLICY` between sentinel markers, preserving hand-owned non-adv lines. `generate:manifests:check` (in `pnpm run check`) fails CI on any drift, including dropped non-adv grants. Wired into `deploy-local.sh --fix` (non-fatal).
- **Runtime session firewall (coarse backstop):** typed `RoleFirewallError` + fail-closed `roleFirewallCheck` at the top of `tool.execute.before`. A blockable `adv_*` tool (anything outside the sub-agent union floor) is allowed only from the confirmed main/orchestrator session; sub-agent and role-unresolved sessions are blocked. Role binds to `sessionID` only.
- **Policy helpers:** `SPAWNABLE_SUBAGENT_ROSTER`, `subAgentUnionAllowlist()`, `blockableFromSubAgentSession()` with positive two-way roster parity; `tool-role-policy.ts` kept out of the Temporal workflow bundle.

## Verification

- Acceptance reviewer: READY, no scoped fixes required.
- Runtime firewall: 21 tests (block/allow/unresolved/spoofing/typed-error).
- Coexistence: 113 tests — trunk-write firewall, reachability gate, spawn accounting, todowrite projection unchanged.
- Generator: determinism, idempotence, marker structural guards, generated==committed; asset clusters 101, overlay-sync 21.
- `pnpm run check` (incl `generate:manifests:check`) + `pnpm run build` green. Zero deterministic SEMANTIC failures.
- Contract review matrix: 28/28 passing/respected/not-applicable.

## Design decisions of note

- Runtime backstop is derived from `AGENT_TOOL_POLICY` union-complement, **not** the tool-role class — workers legitimately call orchestrator-class tools like `adv_run_test`, so class-based blocking would break them.
- Fail-closed when session role is unresolved (validator-corrected from an initial fail-open draft).
- AC8/C5 fail-closed scopes to runtime derivation/role failure; static module-load integrity stays a CI-time guarantee (no dynamic-import anti-pattern) — user-approved.

## Risks / follow-ups

- **AC10 full-suite:** local `bin/oc-test full` was blocked by an external shared full-tier lock (unrelated worktrees); deterministic surface is green. CI's isolated full run on the PR is the authoritative AC10 verdict at release (user-approved).
- Nonblocking: harden the deploy generate-step failure handling (reviewer suggestion) — candidate fast-follow.
- Fine-grained per-lane exposure remains OpenCode-manifest-enforced; the runtime backstop is intentionally coarse (session-role only).