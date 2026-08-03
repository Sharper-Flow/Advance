# Research Pack: Remove Redundant Defense in Depth That Slows Agents

Target: redundant defense-in-depth on ADV agent hot paths
Mode: scoped concept scan
Created: 2026-08-02
Updated: 2026-08-02

## Purpose & Scope

Identify overlapping safeguards that add agent-loop latency or maintenance cost without weakening the authority boundary. Preserve protections that own distinct invariants: tool authorization, trunk isolation, workflow-state limits, and malformed-input rejection.

Covered: host-plugin tool execution, sub-agent report parsing, git/worktree checks, tool-argument preflight, and change creation validation.

Deliberate non-scope: removing Temporal-side authoritative validation, reducing user-approved gates, changing the external state model, or switching orchestration frameworks.

## Current State

### Developer Experience

- Severity: HIGH
  - Evidence: `plugin/src/index.ts:906-966`; `plugin/src/tools/trunk-write-firewall.ts:158-268`.
  - Impact: each `write`, `edit`, or `morph_edit` invokes topology, repository-root, branch, default-branch, and repository-state resolution. The topology memo lasts only for one firewall call; `firewallDeps` is rebuilt for every tool hook. The scout counted five to seven git subprocesses per protected write, but did not benchmark elapsed time.
  - Recommendation: build immutable firewall dependencies once per plugin session; cache topology per repository and add a short, explicitly invalidated cache for mutable probes. Preserve fail-closed behavior whenever a trunk target cannot be verified.
  - Follow-up: `/adv-proposal Reduce agent guard overhead`.

- Severity: HIGH
  - Evidence: `plugin/src/tools/subagent-report.ts:210-237`.
  - Impact: every sub-agent report first parses against `reportAgentProbeSchema`, then parses the same payload against `ScopedSubagentReportSchema`. Reports are among the largest routine agent payloads.
  - Recommendation: parse once with `ScopedSubagentReportSchema`; derive the existing implementation-cycle hint from its failure issues. Add a regression test proving malformed reports retain the same `INVALID_REPORT` hint.
  - Follow-up: `/adv-proposal Reduce agent guard overhead`.

### Code Quality

- Severity: MEDIUM
  - Evidence: `plugin/src/utils/tool-arg-preflight.ts:823-829`; exact-reference scan found production use of `preflightToolArgs` at the registry while `validateToolArgsBeforeExecute` has only test references.
  - Impact: no material runtime cost, but duplicate public entry points obscure the canonical validation route.
  - Recommendation: remove the passthrough or re-export the canonical function under one name; update tests to import that name.
  - Follow-up: `/adv-proposal Reduce agent guard overhead`.

- Severity: MEDIUM
  - Evidence: `plugin/src/tool-role-firewall.ts:115-132,142-172`.
  - Impact: the asynchronous ancestry wrapper and the synchronous predicate repeat the `adv_` and blockable-set checks. This is minor latency but creates two authority paths to maintain.
  - Recommendation: retain a single production check that resolves ancestry and evaluates authorization once; preserve a narrow synchronous, injected-set test seam if needed.
  - Follow-up: `/adv-proposal Reduce agent guard overhead`.

- Severity: LOW
  - Evidence: `plugin/src/tools/change/create-clarify.ts:368-403`; `plugin/src/utils/tool-arg-preflight.ts:838-879`.
  - Impact: blank-artifact and origin-placeholder checks deliberately repeat preflight normalization for direct callers. They add small work to normal `adv_change_create` calls.
  - Recommendation: do not remove them until all direct callers are structurally proven to traverse preflight. If measured cost matters, pass a typed preflight-complete marker and retain the fallback checks only for bypass paths.
  - Follow-up: `/adv-discover Reduce agent guard overhead`.

### Reliability — Retain

- Severity: SOUND
  - Evidence: `plugin/src/temporal/change-state.ts:854-869,892-939`.
  - Impact: tool/store size checks provide early feedback; workflow-state checks remain the authoritative barrier when callers bypass the tool layer. The source documents a 2 MB Temporal payload constraint and avoids throwing in a signal handler.
  - Recommendation: retain both layers. This is distinct-invariant defense in depth, not redundant protection.

## LBP / Reference Comparison

| Area | Current | Reference | Classification | Correction |
| --- | --- | --- | --- | --- |
| Report validation | Probe parse plus full parse of every payload (`subagent-report.ts:215-237`) | Zod `safeParse` returns either validated `data` or a `ZodError.issues` array for a single schema parse: https://github.com/colinhacks/zod/blob/main/packages/docs-v3/home.md | DRIFTED | Use one full-schema parse and retain issue-derived error presentation. |
| Workflow payload protection | Tool/store fail-fast check plus state-mutation guard (`change-state.ts:854-939`) | Temporal TypeScript docs specify a 2 MB default single-payload limit: https://docs.temporal.io/develop/typescript/activities/basics | SOUND | Keep the authoritative workflow guard; optimize only caller-side duplicate work that does not own another invariant. |
| Trunk protection | Fresh git topology and mutable branch probes per protected file operation | Local invariant requires target-relative trunk protection and fail-closed uncertainty handling (`trunk-write-firewall.ts:151-268`) | NEEDS MEASUREMENT | Benchmark first; cache only immutable topology or mutable values with explicit invalidation. |

Greenfield note: centralize each invariant in one owner. Permit a second layer only when it protects a different trust boundary, such as fast user feedback before an authoritative Temporal mutation.

## Competitors & Alternatives

The scan found no evidence that a framework change would solve the identified duplicate checks. The relevant external landscape is therefore architectural, not a migration recommendation.

| Name | Summary | Difference | Maturity signal | Source | Relevance |
| --- | --- | --- | --- | --- | --- |
| LangGraph | Stateful graph-oriented agent orchestration framework. | Public framework comparison describes explicit stateful multi-agent control flow; it is not a replacement proof for ADV's Temporal-backed lifecycle. | Ecosystem/framework reference. | https://www.langchain.com/resources/ai-agent-frameworks | Low: useful only as a comparison point for stateful orchestration design. |
| Temporal Platform | Durable workflow platform already used by ADV. | Enforces payload boundaries that require an authoritative workflow-side guard. | Current official TypeScript documentation. | https://docs.temporal.io/develop/typescript/activities/basics | High: supports retaining the Layer 2 size guard. |
| Production agent-framework comparisons | Editorial landscape highlights separate concerns for orchestration, testing, security guardrails, and observability. | Does not establish that duplicated local checks are beneficial. | Editorial, not normative. | https://www.openlayer.com/blog/post/best-ai-agent-frameworks-production-teams | Low: no migration or product decision follows from this source. |

## Emerging Patterns

- Boundary-specific validation: retain an authoritative mutation-boundary validator while removing duplicate parsing and repeated environment discovery before the same action.
- Measured guard budgets: instrument high-frequency safeguards before adding caches or removing checks; structural subprocess counts alone are not latency proof.

## Applicability to This Repo

1. Prioritize single-parse sub-agent reports: high confidence, bounded scope, and directly on an agent handoff hot path.
2. Benchmark trunk firewall execution, then cache immutable topology and share per-hook session identity. Do not cache fail-closed decisions without invalidation.
3. Remove the dead preflight passthrough as adjacent cleanup, not as a performance claim.
4. Keep Temporal payload validation and direct-caller fallback validation until a typed boundary proves normal callers cannot bypass the primary check.

Active-change overlap could not be resolved through `adv_change_show` because the target read exceeded the host tool's 10-second deadline. `adv_change_list` showed a proposal-stage change named `removeCompensatingAntiPatterns`; assess its artifact and scope before creating another overlapping change.

## Open Questions for Research

1. What are p50/p95 costs of `handleToolExecuteBefore` for `write`, `edit`, and `morph_edit` with one and multiple worktrees?
2. Does a full `ScopedSubagentReportSchema` failure preserve the implementation-cycle hint in every malformed-payload case now handled by the probe schema?
3. Which production call paths invoke `roleFirewallCheck` directly, and can the public sync predicate become test-only?
4. Can a typed preflight marker distinguish tool-registry callers from harness/direct callers without exposing an untrusted bypass?
5. Does `removeCompensatingAntiPatterns` already own these findings? The current read path timed out despite a healthy ADV doctor result.

## Sources

- Local: `plugin/src/tools/subagent-report.ts:210-237`
- Local: `plugin/src/index.ts:906-966`
- Local: `plugin/src/tools/trunk-write-firewall.ts:158-268`
- Local: `plugin/src/utils/tool-arg-preflight.ts:823-900`
- Local: `plugin/src/tool-role-firewall.ts:115-172`
- Local: `plugin/src/tools/change/create-clarify.ts:368-463`
- Local: `plugin/src/temporal/change-state.ts:854-939`
- Zod docs via Context7: https://github.com/colinhacks/zod/blob/main/packages/docs-v3/home.md
- Temporal TypeScript docs: https://docs.temporal.io/develop/typescript/activities/basics
- LangChain framework overview: https://www.langchain.com/resources/ai-agent-frameworks
- OpenLayer framework comparison: https://www.openlayer.com/blog/post/best-ai-agent-frameworks-production-teams
