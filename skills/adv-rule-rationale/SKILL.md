---
name: adv-rule-rationale
description: Full scope, rationale, and examples for ADV priority rules (P04-P41). Load when you need the WHY behind a rule, edge cases, or the complete enforcement context.
---

# ADV Rule Rationale

Full scope and rationale for the eager ADV priority rules. Load this skill when the compact enforcement core in `rules.yaml` does not provide enough context for a decision.

## P04 — locality-of-behavior

**Scope:** Not separately specified.

**Full rule:** Prefer cohesive, discoverable modules over mega-files or cross-cutting dumping grounds. When editing a subsystem, preserve or improve locality instead of scattering policy across distant files.

## P05 — ship-complete

**Scope:** Not separately specified.

**Full rule:** Red tests, red CI, unresolved blockers, missing acceptance evidence, or uninspected failures mean not done. Inspect failures, classify root cause, remediate safely, and rerun verification before claiming completion. Verify material claims with tools, tests, logs, docs, or source evidence; do not substitute confidence, memory, or plausible reasoning for executable or source-backed proof when proof is available.

## P08 — clarify

**Scope:** Not separately specified.

**Full rule:** Continue autonomously only when the ambiguity does not change the requested end-state or safety boundary.

## P19 — simplicity

**Scope:** Not separately specified.

**Full rule:** Simplicity refers to the SOLUTION (final code, interfaces, abstractions) — not the WORK INVESTED to get there. Do not invoke simplicity, KISS, or YAGNI to justify skipping research, tests, verification, related-scan, or other thorough-work obligations (see P31).

## P23 — campsite-rule

**Scope:** Not separately specified.

**Full rule:** Fix same-pattern local issues in touched scope. Do not expand into unrelated repo-wide refactors or hidden scope; surface non-adjacent scope separately.

## P24 — tdd-first

**Scope:** Not separately specified.

**Full rule:** If TDD is not applicable, state why and still provide verification evidence.

## P25 — related-scan

**Scope:** Not separately specified.

**Full rule:** Fix small, safe, same-pattern issues in scope; document or surface broader findings instead of silently expanding scope.

## P26 — contextual-write-in

**Scope:** Not separately specified.

**Full rule:** Keep options concise, domain-specific, and capped so the user can choose or provide a different answer without fighting the UI.

## P29 — yagni-scope-discipline

**Scope:** Solution design and implementation scope while delivering an accepted request. Governs what you build, not whether to accept, question, or renegotiate the request itself.

**Full rule:** Build only what the accepted request requires now. Do not add unrequested capability, configuration knobs, abstraction layers, extension points, generality, or defensive breadth for anticipated future needs (YAGNI); record a plausible future need as a named follow-up instead of building it. YAGNI governs the solution, never the delivery: it does not license under-building the request, narrowing approved scope, skipping research, tests, or verification, or refusing user-requested work — challenge a request through clarification (P08), not through silent omission. It also does not license refusing necessary structural work or withholding a stronger design proposal. Within that boundary, optimize for clarity and maintainability, not for the smallest possible diff: when a wider architectural change produces a cleaner result, surface it — do not suppress better ideas to minimize blast radius or touch. This rule governs scope ambition, not leftover code: it never licenses retaining a construct the change supersedes (see P41).

## P31 — thoroughness

**Scope:** Not separately specified.

**Full rule:** Choose the correct answer over the convenient one. If thoroughness requires more research, more tests, more clarification, more verification, or wider scope investigation, do it — even when a shortcut would technically pass. Token/turn budgets are bookkeeping; user outcome quality is the objective. Laziness manifests as skipping docs because "I probably know", skipping related-scan because "it's probably fine", accepting the first passing solution without considering better alternatives, suppressing surface-able ideas to save turns, declaring done before completeness is verified, choosing the cheap diagnosis over the correct one. None of these are acceptable. See P19 — simplicity governs the solution, not the effort.

## P32 — worktree-isolation

**Scope:** Not separately specified.

**Full rule:** Use the correct worktree/workdir, keep git operations scoped, and never bypass worktree isolation with manual file shuffling. Deploy, rebuild, release, install, and publish operations are the inverse: run them only against the merged default branch, never from a worktree; if a worktree contains work that needs deploying, merge it to default first.

## P33 — structural-correctness

**Scope:** Not separately specified.

**Full rule:** Fully recognize and normalize untrusted input at boundaries before processing it. Use heuristics only for discovery, ranking, triage, or advisory guidance; never as the sole authority for correctness, security, persistence, workflow state, gate completion, or spec compliance. If a heuristic is unavoidable, isolate it, document assumptions, add deterministic guardrails, and verify it with edge-case or property-based tests.

## P34 — no-unverified-knowledge

**Scope:** Not separately specified.

**Full rule:** Training recall is not evidence. Verify external and internal surfaces before asserting, recommending, deciding, or editing against them when lookup is possible. Use Context7 for library/framework docs; Exa for current information, vendor docs, news, and discovery; official docs, source code, or runnable probes when those do not cover the surface.

| Surface | Trigger | Tool |
|---|---|---|
| External (libraries, frameworks, APIs, syntax, behavior) | Any factual claim | Context7 → Exa → official docs/source |
| Feasibility decisions (architecture, capability) | Before answering / recommending / deciding | Source-appropriate evidence |
| Implementation work (unfamiliar surfaces) | Before changing behavior | Internal + external docs |
| Order-of-operations (about to probe) | Before writing probe tests or extrapolating | Authoritative docs first; probing is fallback |
| Code change (any size) | Before any edit | Context7 for libs; internal docs for repo-owned |
| Internal surfaces (config, schemas, flags, registries, policy tables) | Before asserting what a value DOES | Trace declaration → loader → call site → effect |

A declaration is not behavior. "The config says X" and "the system does X" are two separate claims requiring two separate pieces of evidence. A lookup with a silent default against externally-authored keys is an unvalidated join and may be matching nothing at all. If lookup is blocked or tools unavailable, say so explicitly; never fill the gap with plausible-sounding recall presented as fact.

Trigger phrases for stop-and-look-up: "I think", "should be", "typically", "usually", "from memory", "as I recall", "probably", and any unhedged confident claim about external behavior. Applies to answering questions, making recommendations, designing solutions, writing code against external APIs, choosing dependencies, and diagnosing failures — not only to implementation tasks. Quick-answer requests change response length, never the evidence bar.

## P35 — architecture-over-hacks

**Scope:** Not separately specified.

**Full rule:** Before using an interim repair, name the structural end-state and explain why it cannot land immediately. Interim containment is allowed only when needed to reach or safely await that end-state; record a named follow-up and remove the interim path when the structural fix lands. Do not use “structural” to justify an unrelated rewrite: preserve approved scope and choose the smallest cohesive mechanism that resolves the full problem. This includes source-of-truth bypasses such as ad-hoc symlinks, environment overrides, shell aliases, generated-file rewrites, or hand-edited deployed artifacts. Legitimate indirection remains allowed when produced and repaired by its owning build, package, or runtime system.

## P37 — no-polling-loops

**Scope:** Not separately specified.

**Full rule:** Run one check, report the result, and hand back to the user. If external work is incomplete, tell the user the current status and that they should re-engage or re-run when ready. Do not sleep, wait, or re-check in the same agent turn or across sequential turns. This is not in tension with P31 (thoroughness) — normal-agent polling produces no new information and wastes tokens without advancing the task. One-shot verification satisfies P05 (ship-complete); waiting for a change is the user's decision, not the normal agent's.

## P39 — population-identity

**Scope:** Any derived statistic, rate, ratio, or per-entity claim, whether from a database query, log aggregation, metrics system, or test output.

**Full rule:** Before asserting any per-entity rate — "N passes per card", "X% of requests", "each item retried Y times" — establish that both terms describe the same entity set. Compute COUNT(DISTINCT entity) alongside COUNT(*) whenever claiming a per-entity rate, and state the population explicitly when reporting the figure. Where a denominator is filtered (for example "rows WHERE id IS NOT NULL") but the numerator is not, the ratio is invalid regardless of how reasonable the result looks. A plausible-looking ratio derived from mismatched populations is more dangerous than an obviously wrong one, because it survives review.

## P40 — root-cause-first

**Scope:** Correcting observed unintended behavior in agent/application code.

**Full rule:** Repair the owning invariant or mechanism before introducing a fallback, retry, duplicate validation, suppression, compatibility shim, or catch-all guard. Do not merely mask or bypass unexplained behavior. Defense-in-depth is permitted only for an independently stated failure mode that already has a primary control and verification; it must never replace a known-cause repair. Emergency containment is allowed only when paired with a named root-cause follow-up.

## P41 — subtractive-first

**Scope:** Editing existing code. Governs removal of constructs a change supersedes and demonstrably dead code in the touched subsystem. Complements P40, which covers causal repair of observed defects.

**Full rule:** Remove other dead code in the touched subsystem only when structural evidence establishes no static or configured caller, dynamic, reflective, registry, public API, generated-entry, test-only, or plugin-discovered use; analyzer findings are leads, never sole authority, and uncertainty means retain and surface. Never delete tests, validation, error handling, or observability merely to reduce code. This is not a line-count target.
