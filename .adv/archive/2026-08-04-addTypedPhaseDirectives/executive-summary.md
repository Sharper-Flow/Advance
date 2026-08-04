# Executive Summary — Add typed phase directives

## Outcome

`/adv-review` now starts quiet in the OpenCode terminal. The 728-line (48KB) inline procedure paste that previously flooded the transcript on every acceptance review is gone. In its place: a 142-line thin launcher that reads a typed `directive` from the existing phase-plan tool result, which the TUI renders as one collapsed, expandable entry. Instructions for branches the phase never enters no longer enter the session at all.

## Why it matters

Starting `/adv-review` was the single noisiest moment in the ADV lifecycle — a 48KB wall of procedure text that made the transcript unscrollable at the exact moment the user wants to read review results. This pilot proves the mechanism (typed directive delivered inside a tool result) on the worst offender before committing the other four lifecycle commands to the same shape. Token cost drops too: the happy-path-only directive (~30KB) replaces the full 48KB paste, and only when the branch is actually entered.

## What was built

- A new `PhaseDirectiveSchema` (typed: kind, command, content, contentHash) added as an optional field on the actionable phase-plan variant only — non-actionable plans (blocked, degraded, etc.) structurally cannot carry one.
- A host-only content registry (`phase-directive-content.ts`) holding the /adv-review happy-path procedure verbatim, with its hash computed at load so the content and its integrity anchor can never drift apart.
- A pure assembler (`withPhaseDirective`) that attaches the directive only when a plan is actionable AND bound to adv-review. It never mutates input, performs I/O, or completes gates.
- A lean-response shaping path in `adv_change_show` so the directive content survives the tool-output budget intact (the default 21KB envelope would otherwise truncate a 30KB directive). Explicit companion includes are preserved; only unrequested heavy defaults are suppressed.
- A rewritten `adv-review.md` launcher: a 5-row decision table (actionable+directive → execute; non-actionable → surface reason; read error → bounded retry then halt; retry-success → proceed; version-skew → inline fallback) plus a strict-subset inline fallback for when the directive is unavailable.
- A composed-surface test helper that lets the existing pinned-invariant suites assert against the new delivery shape (launcher + directive) without weakening any check.

## Verification

- 397/397 across the 16 touched and adjacent suites (integration sweep, runId tr_msf4qex2).
- 194/194 reviewer-targeted + full `pnpm run check` (schemas, typecheck, lint, format) green after acceptance review.
- Replay-determinism suite 15/15 unmodified — no PHASE_PLAN_VERSION bump, no Temporal patch marker (Temporal behavior unchanged).
- Worker-bundle reachability guard confirms the authored content never enters the workflow bundle.
- Acceptance review (adv-reviewer): READY, 0 remaining findings; remediated one pilot limitation (explicit-include preservation in lean responses).

## Risks and follow-ups

- **Display verification (SC1–SC4):** the collapsed-entry rendering is proven structurally (the directive arrives complete inside a tool result — the mechanism the TUI collapses) but the live visual confirmation is a post-deploy observation, by design — the deploy-from-trunk rule forbids deploying the worktree build pre-merge. The user's first real `/adv-review` after merge is the visual proof.
- **Other lifecycle commands** (prep, apply, harden, archive) still use the inline-prose shape. Converting them is explicitly deferred past this pilot (out of scope); the directive enum and registry are structured to extend cleanly when that decision is made.
- **Cross-file dedup** of `Target Resolution`/`Key Tools` (repeated in 14 command files) and **readCommand helper hoist** are recorded follow-up candidates, not blockers.

## Evidence anchors

Branch `change/addTypedPhaseDirectives` (tip f541dffa), 7 commits. Contract coverage: AC1–AC8, C1–C5, DONT1–DONT5 all satisfied; SC1–SC4 mechanism proven, visual pending post-deploy.