---
# Cost / Time Investment Governance (ADV v1 — behavioral-only)
#
# Conservative default thresholds. Any dimension hitting a tier promotes
# the whole report to that tier (MAX rule). Tunable without code changes —
# edit these values and restart OpenCode. The `adv_investment_report` tool
# reads thresholds from command arguments and falls back to these defaults
# when no override is provided.
thresholds:
  auto:
    tasks: 3
    retries: 0
    elapsed_minutes: 15
  escalate:
    tasks: 8
    retries: 2
    elapsed_minutes: 60
  hardstop:
    tasks: 15
    retries: 5
    elapsed_minutes: 180

# In-scope judgment categories for v1. Only these categories warrant
# surfacing upcoming decisions to the user during /adv-apply Phase 0.
# Out-of-scope (agent resolves autonomously to avoid decision fatigue):
# defaults, naming, error_semantics.
in_scope_categories:
  - non_functional_tradeoff
  - extensibility
  - scope_boundary

# Applies to ADV workflows only. Non-ADV agents (scout, build, general,
# librarian, etc.) read this file but the governance does not apply to
# their work. ADV owns the plugin tool backing that makes judgment-call
# surfacing possible.
scope: adv_only
---

# Investment Check-In Governance

This instruction governs how ADV workflows surface upcoming judgment calls
to the user when a change's cumulative investment signal indicates
non-trivial territory. It is **not** a budget gate — established scope is
assumed yes. It is a **judgment-surfacing** layer: the agent proactively
asks the user about decisions that need intuition, preference, or context
the agent doesn't have.

This instruction applies to ADV workflows only. Non-ADV agents read but do
not enforce it.

---

## Purpose

When `adv_investment_report` indicates a change has crossed into `escalate`
or `hardstop` tier, and the change has unresolved `judgment_calls[]`
entries identified during `/adv-prep`, `/adv-apply` Phase 0 surfaces those
calls via a single `question` tool call before any task starts.

This is **not** a gate. Surfacing is covered by `rq-autonomy01`'s existing
"unresolved user-value tradeoff" escape clause — judgment calls are, by
construction, unresolved user-value tradeoffs. It is **not** a new
enumerated human checkpoint.

---

## In-Scope Judgment Categories

Only three categories warrant surfacing in v1. Decision fatigue research
(Amazon Alexa clarification studies, developer decision-fatigue literature)
shows that indiscriminate preference elicitation degrades productivity.
Categories outside this list are resolved autonomously by the agent.

### `non_functional_tradeoff`

Cross-cutting tradeoffs between non-functional properties where both
options are valid and the choice depends on user priorities.

Examples:
- **Latency vs consistency** — "Favor p99 speed or data-correctness here?"
- **Simplicity vs extensibility** — "Hardcoded simple vs config-driven flexible?"
- **Caching freshness vs speed** — "Cache this for 5min (fast, stale)
  or fetch fresh each call (slow, correct)?"

### `extensibility`

Decisions about whether a new surface should be open to future change or
closed. The right answer depends on the user's product roadmap.

Examples:
- **Plugin point vs hardcoded path** — "Expose as plugin or keep internal?"
- **Event-driven vs direct call** — "Emit an event others can hook, or
  call the target directly?"
- **Config-driven vs const** — "Make this YAML-tunable or baked in?"

### `scope_boundary`

Edge cases where the agent can see an extension but isn't sure if the
user wants it handled in the current change or deferred.

Examples:
- **Cross-repo variant** — "Handle the backend integration here or
  follow-up change?"
- **Accessibility edge case** — "Include screen-reader ARIA now or
  defer to an accessibility pass?"
- **Legacy compatibility** — "Support old format X here or cut it in
  a separate migration?"

### Out of Scope (v1)

The agent resolves these autonomously to avoid decision fatigue:
- **`defaults`** — default values (timeouts, retry counts, thresholds);
  agent picks from codebase averages with a note.
- **`naming`** — public API names; agent picks consistent with local
  conventions (60%+ pattern match).
- **`error_semantics`** — throw vs return-null, fail-loud vs fail-silent;
  agent picks consistent with touched subsystem.

---

## Cadence (Single)

Surfacing happens once per change, at the start of `/adv-apply` Phase 0,
before any task executes. The flow:

1. Load `change.judgment_calls[]`.
   - `undefined` → legacy pre-v1 change, skip silently and log.
   - `[]` (empty array) → new-generation change with zero calls; record
     `batch_surfaced_at` with `surfaced_count: 0` and proceed.
   - populated → continue.
2. Scan doom-loop state across all tasks via `getDoomLoopInfo(task.id)`.
   - If any task is in active doom-loop, defer to doom-loop recovery;
     skip batch surfacing this session. Judgment calls re-surface on the
     next Phase 0 after doom-loop clears.
3. Surface all unresolved judgment calls (`user_choice === undefined`) in
   a single `question` tool call with multiple sub-questions, one per
   call. Each sub-question:
   - Uses `judgment_calls[i].question` as the question text.
   - Lists `options[]` plus a write-in option (P26).
   - Flags `agent_recommendation` as `(Recommended)` on the matching option.
4. Record each answer to `judgment_calls[i].user_choice`, set
   `resolved_by: "user"`, stamp `surfaced_at`.
5. Record change-level `batch_surfaced_at` timestamp (including zero-call
   case for audit).
6. Proceed to first task.

Doom-loop-clearance re-surface is the **only** secondary path in v1. The
original hybrid cadence (threshold-triggered mid-apply) was deliberately
collapsed per design D4 / agreement user decision #10.

---

## Hard-Stop Semantics (Advisory in v1)

Hard-stop tier in v1 is **advisory only**:

- `adv_investment_report` returns `threshold_tier: "hardstop"`.
- `/adv-apply` Phase 0 surfaces the batch with a strongly-worded
  recommendation to pause.
- The agent **does NOT** call `adv_change_reenter`.
- The agent **does NOT** block at the tool level.
- The user can cancel manually via existing flows (`adv_task_cancel`,
  `adv_change_close`) if desired.

Hard enforcement (tool-level refusal) and gate-reset semantics are v2
upgrade paths — explicitly out of v1 scope per agreement objective #3.
Re-entry remains scope-expansion-driven per `rq-scopeReentry01`, not
threshold-driven.

---

## Composition Rules

- **Doom-loop supersedes.** Active doom-loop on any task → Phase 0 defers
  to doom-loop recovery. No double-prompts.
- **Cancellation unchanged.** `adv_task_cancel` still requires user
  approval via `question` tool. Investment governance does not hook into
  cancellation flow.
- **Re-entry unchanged.** `adv_change_reenter` remains scope-expansion
  driven. Threshold crossings never trigger re-entry in v1.
- **TDD reclassification unchanged.** `adv_task_reclassify_tdd` operates
  independently.
- **Prompt cache preserved.** No new dynamic `experimental.chat.system.transform`
  injection in v1 — cache stays stable.

---

## Tuning Thresholds

Edit the YAML frontmatter above. Restart OpenCode (or the agent session)
for changes to take effect. The agent reads thresholds from this file at
session start and passes them to `adv_investment_report` as the
`thresholds` argument.

Tuning guidance:
- **Too many interruptions?** Raise `escalate.tasks` and
  `escalate.elapsed_minutes`. Keep `hardstop` as a safety valve.
- **Want earlier check-ins?** Lower `escalate` values.
- **Never interrupted when you wish you were?** Lower `hardstop` — it's
  the safety ceiling.

Changes to categories or cadence require editing this file's body text
and updating `.opencode/command/adv-prep.md` Phase J. Behavior updates
there shape what the agent identifies and surfaces.

---

## Scope: ADV Workflows Only

This instruction is loaded globally so agents can read it for reference,
but the governance it defines applies to **ADV workflows only**. The
plugin tool backing (`adv_investment_report`, `change.judgment_calls[]`,
`/adv-prep` Phase J, `/adv-apply` Phase 0) is ADV-specific. Non-ADV
agents (scout, build, general, librarian, mechanic, etc.) read this file
but do not consult the investment report during their work.

When agreement on cross-agent governance materializes (future change),
this scope note will be revised.

---

## References

- `ADV_INSTRUCTIONS.md` § Investment Check-In (subsection under
  "Autonomy & Quality Ownership").
- `rules.yaml` P28 (cost-governance rule).
- `.opencode/command/adv-prep.md` Phase J (identify judgment calls).
- `.opencode/command/adv-apply.md` Phase 0 (batch surfacing).
- `plugin/src/tools/investment.ts` (the tool).
- `rq-autonomy01` in `advance` spec (escape clause citation).
- `rq-scopeReentry01` in `advance` spec (re-entry is scope-driven, not
  threshold-driven).
