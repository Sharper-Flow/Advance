---
name: adv-cost-governance-methodology
description: "Judgment-surfacing methodology for ADV investment governance — identification protocol (Phase J), surfacing protocol (Phase 1.5), composition rules, and rq-autonomy01 escape-clause citation"
keywords: ["cost", "governance", "judgment", "investment", "check-in", "surfacing", "threshold", "tier"]
metadata:
  priority: high
  source: .opencode/instructions/cost-governance.md
---

# Cost Governance Methodology Skill

## Purpose

Reusable methodology for the judgment-surfacing investment-governance layer
shipped by `addCostTimeInvestment` (v1). This is the **single source of truth**
for the protocol; commands (`/adv-prep` Phase J, `/adv-apply` Phase 1.5) and
the user-facing instruction file (`cost-governance.md`) reference this skill
rather than duplicating policy.

**Core reframe:** This is NOT a budget gate. Established scope is assumed yes.
The agent surfaces upcoming decisions that need **user intuition, preference,
or context** — decisions the agent would otherwise make autonomously without
user input.

**Canonical sources referenced by this skill:**

- `.opencode/instructions/cost-governance.md` — tunable config (threshold values, scope, category enum)
- `ADV_INSTRUCTIONS.md § Investment Check-In` — thin subsection naming this skill
- `plugin/src/tools/investment.ts` — the `adv_investment_report` tool implementation
- `advance` spec `rq-autonomy01` — escape-clause citation anchor
- `advance` spec `rq-scopeReentry01` — re-entry is scope-driven, not threshold-driven

---

## In-Scope Judgment Categories

Only three categories warrant surfacing in v1. Decision fatigue research shows
that indiscriminate preference elicitation degrades productivity. Categories
outside this list are resolved autonomously by the agent.

### `non_functional_tradeoff`

Cross-cutting tradeoffs between non-functional properties where both options
are valid and the choice depends on user priorities.

Examples:
- **Latency vs consistency** — "Favor p99 speed or data-correctness here?"
- **Simplicity vs extensibility** — "Hardcoded simple vs config-driven flexible?"
- **Caching freshness vs speed** — "Cache this for 5min (fast, stale) or fetch fresh each call (slow, correct)?"
- **Throughput vs memory** — "Batch 100 records at a time, or stream one-by-one?"

### `extensibility`

Decisions about whether a new surface should be open to future change or closed.
The right answer depends on the user's product roadmap.

Examples:
- **Plugin point vs hardcoded path** — "Expose as plugin or keep internal?"
- **Event-driven vs direct call** — "Emit an event others can hook, or call the target directly?"
- **Config-driven vs const** — "Make this YAML-tunable or baked in?"
- **Schema field required vs optional** — "Existing callers need backward compat — optional with default, or required in v2?"

### `scope_boundary`

Edge cases where the agent can see an extension but isn't sure if the user
wants it handled in the current change or deferred.

Examples:
- **Cross-repo variant** — "Handle the backend integration here or follow-up change?"
- **Accessibility edge case** — "Include screen-reader ARIA now or defer to an accessibility pass?"
- **Legacy compatibility** — "Support old format X here or cut it in a separate migration?"
- **Test coverage expansion** — "Add integration tests for sibling paths, or keep current change tight?"

### Out of Scope (v1)

The agent resolves these autonomously to avoid decision fatigue:

- **`defaults`** — default values (timeouts, retry counts, thresholds); agent picks from codebase averages with a note.
- **`naming`** — public API names; agent picks consistent with local conventions (60%+ pattern match).
- **`error_semantics`** — throw vs return-null, fail-loud vs fail-silent; agent picks consistent with touched subsystem.

---

## Phase J — Identification Protocol (for `/adv-prep`)

Run **after task synthesis is complete** and **before Phase 3 validation**.
Review the task graph + proposal scope and identify upcoming decisions that
would otherwise be made silently by the agent.

### Steps

1. **Scan the task graph.** For each task, ask: "Does this task's
   implementation have a point where I'd otherwise pick A or B without the
   user seeing the choice?"
2. **Filter to in-scope categories.** Only keep calls matching
   `non_functional_tradeoff`, `extensibility`, or `scope_boundary`. Drop
   anything that maps to defaults/naming/error_semantics.
3. **Structure each call** as a `JudgmentCall` entry:
   - `id` — `jc-<6char>` (nanoid-style)
   - `category` — one of the three in-scope values
   - `question` — framed around outcome/behavior/priority, NOT tech choice
   - `agent_recommendation` — the agent's best default, with rationale
   - `rationale` — why user intuition matters here (what the agent can't see)
   - `options` — 3-4 `{ label, description }` pairs, one flagged `(Recommended)` matching `agent_recommendation`
4. **Cap at ≤5 judgment calls per change.** Research: developers experience
   measurable cognitive decline after ~8-12 non-trivial decisions per session.
   Pick the highest-leverage calls — prefer ones where a wrong default has
   high blast radius or is hard to reverse.
5. **Persist via `adv_change_update`** with the identified calls written to
   `change.judgment_calls[]`.
6. **If zero calls identified**, initialize `judgment_calls: []` (empty
   array). This distinguishes new-generation changes from legacy
   `judgment_calls === undefined` changes. `/adv-apply` Phase 1.5 silently
   proceeds for both but records `batch_surfaced_at` on the empty-array case.

### Scoping Boundary

Judgment-call identification is **gap surfacing** (consistent with
`rq-prep-scope1.1` — cross-cutting concerns, INVEST gaps, requirement smells).
It is **NOT** task creation (`rq-prep-out1`) and **NOT** architectural
reopening (`rq-prep-neg1`). You are identifying pre-existing decisions that
would otherwise be made silently — not creating new work items.

---

## Phase 1.5 — Surfacing Protocol (for `/adv-apply`)

Run **as the first operational phase**, after target resolution and context
load (Phase 1), before displaying the contract (Phase 2). Six-step flow:

### Step 1: Inspect `change.judgment_calls`

- `undefined` → **legacy change** (pre-v1). Log silently, do NOT surface, do
  NOT record `batch_surfaced_at`. Proceed to Phase 2.
- `[]` (empty array) → new-generation change with zero calls. Record
  `batch_surfaced_at` via `adv_change_update` for audit. Proceed to Phase 2
  with no user interruption.
- populated → continue to Step 2.

### Step 2: Change-Level Doom-Loop Scan

Call `adv_investment_report changeId: <target>` and inspect `doom_loop_active`.
The report scans **all tasks** (not just `in_progress`) via
`getDoomLoopInfo(task.id)` — any task with an active tracker returns true.

When doom-loop is active:
- **Defer** judgment-call surfacing. Record notes `"Phase 1.5 deferred — doom-loop active on task <id>"`.
- Proceed to doom-loop recovery path per `ADV_INSTRUCTIONS.md § Doom Loop Detection`.
- Judgment calls **re-surface automatically** on the next Phase 1.5 invocation after doom-loop clears. This is the **only** secondary path in v1.

### Step 3: Surface Unresolved Calls

Filter `judgment_calls[]` to entries where `user_choice === undefined`. If
zero remain (all resolved from a prior session — e.g. after doom-loop cleared
and user answered), record `batch_surfaced_at` and proceed.

Otherwise emit **one** `question` tool call with multiple sub-questions — one
per unresolved call. For each sub-question:

- Question text = `judgment_calls[i].question`
- Options = `judgment_calls[i].options[]`, with the option matching
  `agent_recommendation` labeled `(Recommended)` inline in its label
- Include the P26 write-in option automatically
- Surface `rationale` in a brief header line before the options

### Step 4: Record Resolutions

After the user responds, for each judgment call update:

- `user_choice` = the selected option label (or `"(write-in: ...)"`)
- `resolved_by` = `"user"`
- `surfaced_at` = current ISO8601 timestamp
- Persist via `adv_change_update` with the updated `judgment_calls[]`.

### Step 5: Record Change-Level Timestamp

Set `change.batch_surfaced_at` to the current ISO8601 timestamp via
`adv_change_update`. This is the audit anchor required by AC #6 (verifiable
even for N=0 cases).

### Step 6: Report Investment Tier (Optional)

If `threshold_tier === "hardstop"`, emit a strongly-worded note in the banner
prelude: "This change has crossed the hard-stop tier (task/retry/elapsed
thresholds). Consider pausing or scoping down if the remaining work no longer
matches priority."

**Do NOT** call `adv_change_reenter` — hard-stop is advisory in v1. Re-entry
remains scope-expansion-driven per `rq-scopeReentry01`.

---

## Composition Rules

- **Doom-loop supersedes.** Active doom-loop on any task → Phase 1.5 defers
  to doom-loop recovery. No double-prompts.
- **Cancellation unchanged.** `adv_task_cancel` still requires user approval
  via `question` tool. Investment governance does not hook into cancellation.
- **Re-entry unchanged.** `adv_change_reenter` remains scope-expansion
  driven. Threshold crossings never trigger re-entry in v1.
- **TDD reclassification unchanged.** `adv_task_reclassify_tdd` operates
  independently.
- **Prompt cache preserved.** No new dynamic `experimental.chat.system.transform`
  injection in v1 — cache stays stable.

---

## Hard-Stop Semantics (Advisory in v1)

Hard-stop tier in v1 is **advisory only**:

- `adv_investment_report` returns `threshold_tier: "hardstop"`
- `/adv-apply` Phase 1.5 surfaces the batch with strongly-worded recommendation to pause
- The agent **does NOT** call `adv_change_reenter`
- The agent **does NOT** block at the tool level
- The user can cancel manually via existing flows (`adv_task_cancel`, `adv_change_close`)

Hard enforcement (tool-level refusal) and gate-reset semantics are v2 upgrade
paths — explicitly out of v1 scope. Re-entry remains scope-expansion-driven
per `rq-scopeReentry01`.

---

## `rq-autonomy01` Escape-Clause Citation

Phase 1.5 surfacing **does not** introduce a new enumerated human checkpoint.
Judgment-call surfacing is covered by `rq-autonomy01`'s existing **"unresolved
user-value tradeoff"** escape clause — unresolved entries in `judgment_calls[]`
are, by construction, unresolved user-value tradeoffs (non-functional
tradeoffs, extensibility decisions, scope boundaries are all inherently
value-weighted).

The 7 enumerated human checkpoints in `rq-autonomy01` (proposal confirmation,
agreement sign-off, design approval, acceptance, archive sign-off, cancellation
approval, doom-loop recovery) remain the only enumerated pause points. Phase
1.5 is a dynamic instance of the "unresolved user-value tradeoff" escape
clause, not an extra enumerated checkpoint.

---

## Worked Example

For a change adding a new caching layer, typical judgment calls might be:

```
jc-a7f2b1
  category: non_functional_tradeoff
  question: "Cache TTL for the new endpoint — favor freshness or hit rate?"
  agent_recommendation: "5 minute TTL (balanced)"
  rationale: "TTL choice depends on your tolerance for stale data vs p99
             improvement. Typical web workloads accept 5min; realtime apps
             need <1min; static content can cache 1h+."
  options:
    - label: "1 minute TTL (fresh, lower hit rate)"
      description: "Minimizes stale data at ~60% hit rate"
    - label: "5 minute TTL — balanced (Recommended)"
      description: "Typical web-app tradeoff, ~85% hit rate"
    - label: "15 minute TTL (high hit rate, staler)"
      description: "Maximize cache efficiency, accept staler reads"
```

```
jc-c8d3e2
  category: extensibility
  question: "Cache key namespace — scoped or global?"
  agent_recommendation: "Scoped by endpoint"
  rationale: "Scoped keys prevent cross-endpoint interference and simplify
             invalidation. Global keys allow cross-endpoint sharing but
             complicate ownership. Depends on whether you expect endpoints
             to share data."
  options:
    - label: "Scoped by endpoint (Recommended)"
      description: "Each endpoint gets its own keyspace"
    - label: "Global namespace"
      description: "Any endpoint can hit any key"
    - label: "Configurable via option"
      description: "Runtime flag selects scoping"
```

Note: both calls are in-scope categories. Default values (exact numeric TTL
boundaries, key format) are NOT surfaced — agent picks from codebase
conventions with a note.

---

## Constraints

- **Read-only guidance** — this skill does not mutate ADV state
- **No gate completion** — commands (`/adv-prep`, `/adv-apply`) own their respective gates
- **Canonical source** — defer to this skill for the protocol; `cost-governance.md` owns only tunable config
- **ADV-only scope** — non-ADV agents read but do not apply this methodology
