# ADV Command Voice Standard

Defines the enforceable voice rules for all `/adv-*` command descriptions, protocol sections, and user-facing text.

## Core Rules

| Dimension       | Rule                                                  | Example                                                        |
| --------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| **Mood**        | Imperative ("Do X"), not declarative ("You should X") | "Validate change compliance" not "Validates change compliance" |
| **Tense**       | Present, not future                                   | "Enforce" not "Will enforce"                                   |
| **Specificity** | Concrete triggers, not abstract values                | "3+ files OR db schema change" not "high-risk signals"         |
| **Negation**    | Minimize; frame positively                            | "Allowed exits: done, doom-loop" not "Don't skip, don't defer" |
| **Length**      | Manifest descriptions: 5–14 words                     | "Validate change against specs and block archive on failure"   |

## Manifest Description Rules

`manifest.ts` is the **single source of truth** for command descriptions. All other surfaces (command doc frontmatter, README, ADV_INSTRUCTIONS) derive from it. Drift is enforced by `plugin/src/manifest-doc-drift.test.ts`.

Every `CommandDef.description` in `manifest.ts` MUST:

1. Start with a strong verb (Validate, Implement, Detect, Propose, Archive, Scan, Refresh, Suggest)
2. Be 5–14 words
3. Mention the primary output or gate effect if one exists
4. Avoid jargon without definition ("slop", "LBP", "RSTC") — use plain verbs

### Banned Phrases in Manifest Descriptions

| Banned                          | Replace With                           |
| ------------------------------- | -------------------------------------- |
| "high-risk signals"             | list the signals explicitly            |
| "autonomous retry"              | "with retry on failure"                |
| "AI-slop detection"             | "detect low-quality AI-generated code" |
| "Socratic clarifying questions" | "Ask clarifying questions"             |
| "Gap analysis"                  | "Analyze gaps"                         |

## Protocol Section Rules

Protocol sections (Doom Loop, Cancellation, Cross-Repo, TDD) MUST use:

### 1. Allowed-States Framing (not Prohibited Lists)

**BAD — negation-heavy:**

```
Prohibited:
- Skipping "to revisit later"
- Deferring "until more information"
- Marking blocked without 3 genuine attempts
```

**GOOD — allowed states:**

```
Tasks end in exactly one state:
- **Done** — all acceptance criteria met
- **Doom Loop** — 3 failed attempts, user guidance needed

Escalate via `adv_task_cancel` after 3 genuine attempts with documented diagnosis.
```

### 2. BAD/GOOD Tables for Failure-Prone Protocols

Use a two-column table wherever agents commonly fail. Required for:

- Doom Loop / retry protocol
- Cancellation policy
- Cross-repo execution
- TodoWrite usage

**Template:**

```markdown
| BAD            | GOOD               |
| -------------- | ------------------ |
| {anti-pattern} | {correct behavior} |
```

### 3. Concrete Triggers for Risk Thresholds

**BAD:**

```
3+ files or high-risk signals → suggest worktree
```

**GOOD:**

```
| Signal | Risk |
|--------|------|
| 3+ files affected | High |
| Breaking API changes | High |
| DB schema change | High |
| Auth logic change | High |
| Shared type changes | High |
| Docs-only or config | Low |
| 1–2 files, trivial | Low |
```

### 4. WHEN/THEN Tables for Decision Points

Replace multi-paragraph decision prose with a scannable table:

```markdown
| When                         | Then                      |
| ---------------------------- | ------------------------- |
| Spec conflicts with proposal | Spec wins                 |
| Gate incomplete              | Archive blocked           |
| 3 failed task attempts       | Stop → escalate           |
| Cross-repo task              | Execute in target repo    |
| User requests cancellation   | Require explicit approval |
```

### 5. Conflict Resolution Hints

Every protocol section that can conflict with another MUST include a resolution note:

```markdown
| Conflict                           | Resolution                                              |
| ---------------------------------- | ------------------------------------------------------- |
| TDD required + trivial task        | Set `metadata.tdd_intent: "not_applicable"` with reason |
| User requests skip + gate required | Emit `[ADV:MIC]`, ask for sign-off                      |
| Cross-repo + tool unavailable      | Proceed in-place, note in wisdom                        |
```

## Command Doc (`.opencode/command/adv-*.md`) Template

Every command doc MUST follow this structure:

```markdown
---
name: adv-{name}
description: { 5-14 word imperative description }
agent: { agent }
---

# ADV {Name} — {one-line purpose}

{1-2 sentence imperative summary of what this command does and its primary output.}

## Exits

Tasks / phases end in exactly one of these states:

| Exit        | Condition                        |
| ----------- | -------------------------------- |
| ✅ Complete | {success condition}              |
| 🔁 Retry    | {retry condition, if applicable} |
| 🎤 Escalate | {escalation condition}           |

## {Phase N}: {Phase Name}

...
```

## Frontmatter Contract

Command doc frontmatter `description` MUST be a **single-line YAML scalar** — no multiline `|` or `>` blocks, no folded strings. The drift test parser relies on this constraint. If multiline descriptions are ever needed, migrate the parser to a YAML-aware library (e.g., `gray-matter`).

## Voice Contract (runtime prose)

Manifest descriptions and command doc text cover **what** and **when**. This section covers **how to speak** when emitting runtime user-facing prose.

### Style target — terse/caveman-lite

- Short sentences. Fragments OK.
- Bullets and tables over prose.
- Concrete verbs. Drop fluff, filler, pleasantries, hedging.
- Technical terms exact. Quoted errors exact.
- Recommend, do not over-explain.

### Applies to

- Phase summaries and banners' prose portion
- Findings, verdicts, recommendations
- User-facing questions (question tool `question` field + option `description`)
- Progress reports and gate summaries

### Does not apply to (keep normal)

- JSON schemas and structured sub-agent outputs
- Code, commits, PR descriptions
- Status markers and banner **structure** (keep required fields/labels exactly)
- Command doc frontmatter descriptions (governed by manifest rules above)
- Safety warnings, destructive-action confirmations, cancellation approval prose
- Multi-step sequences where fragment order risks misread

### Bad / good

| BAD                                                                                           | GOOD                         |
| --------------------------------------------------------------------------------------------- | ---------------------------- |
| "I'll go ahead and take a look at the situation and see if I can figure out what's going on." | "Investigating."             |
| "It seems like there might potentially be an issue with..."                                   | "Bug in X."                  |
| "Sure! Happy to help. First, let's..."                                                        | "First:"                     |
| "Would you like me to proceed?" (at clean auto-continue step)                                 | (do not ask — auto-continue) |
| "The implementation was successfully completed and all tests are passing."                    | "Done. Tests pass."          |

### Scope

- ADV primary agent + shared agents that run ADV work (`build`, `plan`)
- Provider-hint wording in `plugin/src/index.ts` should not contradict terse voice

### Drift control

- Lightweight: voice block referenced in `.opencode/agents/adv.md` and shared-agent overlays
- Governed by `rq-presentationSurface01` (surface discipline) and `rq-handoffVoice01` (handoff voice spine)
- Global `~/.config/opencode/instructions/caveman.md` remains user-config; not synced by repo

## Gate Handoff Voice

Every `/adv-*` command that emits a user-facing gate-transition message MUST use the Gate Handoff Voice spine. This replaces all prior handoff templates (Orchestration Summary, CONTRACT FULFILLED, ARCHIVE COMPLETE, READY FOR BUILD, etc.).

**Spec requirement:** `rq-handoffVoice01` (MUST priority). Violations are spec violations.

### Canonical spine

Every gate handoff uses exactly three narrative sections, in this order:

```
## Problem
{One-line restatement of the problem this change addresses.}

## Chosen direction
{Per-stage anchor — see table below. One to three sentences max.}

## Delivered
{What was produced in this stage. Bullet list. Concrete artifacts, not process.}

---
**{change-id}** · {gate} ✓ → {next-gate} · `/adv-{next-command} {change-id}`
```

No other sections, headings, or structural elements in the handoff. The footer line is the only content after `## Delivered`. Internal state (task lists, gate checkboxes, sub-agent counts, step logs) lives in ADV tools (`adv_change_show`, `adv_task_list`, `_contextSnapshot`), not in chat.

### Per-stage anchors (Chosen direction)

The `Chosen direction` section content differs per stage. Use the anchor from this table:

| Stage | Chosen direction anchor |
|-------|------------------------|
| proposal | Agreed problem framing + scope boundary |
| discover | Agreed objectives + constraints + user decisions |
| design | Chosen architecture + key tradeoff outcomes |
| prep | Firm plan shape (task structure, approach, not task list) |
| apply | What was built and how it was verified |
| review | What was reviewed and user-accepted |
| harden | What was cleaned, hardened, and verified for release |
| archive | What shipped, what spec deltas applied |

### Archive terminal variant

The `/adv-archive` handoff is the terminal message. Use this variant:

```
## Shipped.
{No heading — just the word.}

## Problem
{One-line restatement.}

## Chosen direction
What shipped, what spec deltas applied.

## Delivered
{Spec deltas applied + git merge + cleanup + investment summary. Bullet list.}

---
**{change-id}** · release ✓ · Shipped.
```

No footer arrow or command — the change is complete.

### Fast-track variant (`/adv-task`)

`/adv-task` collapses proposal → discovery → design → planning into one step. Use this variant at the handoff point:

```
## Problem
{One-line restatement.}

## Chosen direction
{Summarize combined decisions from proposal+discovery+design+planning. Two to four sentences max.}

## Delivered
{All artifacts produced: proposal, agreement, design, task graph. Bullet list.}

---
**{change-id}** · task ✓ → apply · `/adv-apply {change-id}`
```

### Action banner cleanup

Mid-command banners (CONTRACT ACTIVE, CONTRACT STATUS, CONTRACT FULFILLED, QUICK CONTRACT, READY FOR BUILD, ARCHIVE COMPLETE) are replaced or trimmed per this taxonomy:

| Banner | Action | Replacement |
|--------|--------|-------------|
| CONTRACT ACTIVE | Trim to purpose line | `Working on: {change-id}` + reference to `_contextSnapshot` for state |
| CONTRACT STATUS | Drop entirely | No per-task status block. State visible via `adv_task_list` and `_contextSnapshot`. Keep `[ADV:TDD_RED]`/`[ADV:TDD_GREEN]` markers — those are semantic signals, not banners |
| CONTRACT FULFILLED | Replace with spine | Use the canonical three-section spine + footer (apply → review handoff) |
| QUICK CONTRACT | Keep, apply caveman-lite | Retain contract-confirmation shape (INTENT / SCOPE / SUCCESS CRITERIA). Tighten labels, drop filler. Not a handoff — mid-command confirmation block |
| READY FOR BUILD | Replace with fast-track spine | Use the fast-track variant above |
| ARCHIVE COMPLETE | Replace with archive terminal spine | Use the archive terminal variant above |

### Safety-warning surface

Block banners remain for safety-critical confirmations (destructive actions, cancellation approval, doom-loop recovery). These are NOT gate handoffs — they are interaction prompts governed by `rq-autonomy01` human checkpoints. The spine does not apply to them.

### Auto-continue transitions

When `rq-autonomy01` permits auto-continue (no unresolved user-value tradeoff, no required approval), the agent proceeds without emitting a handoff message between stages. No message = no handoff to validate. The spine applies only when the agent emits a user-facing gate-transition message.

### BAD / GOOD transcript examples

#### Pair 1: /adv-apply handoff (verbose → spine)

**BAD — mechanics dump:**

```
## Orchestration Summary

### Steps Completed
1. [execution] Implemented Phase A.1 — extended voice standard doc
2. [execution] Implemented Phase A.2 — added BAD/GOOD examples
3. [execution] Implemented Phase B — replaced orchestrator overlay

### Gates
[✓ proposal] [✓ discovery] [✓ design] [✓ planning] [✓ execution] [○ acceptance] [○ release]

### Sub-Agents Spawned
- librarian × 2 (API docs)
- adv-researcher × 1 (architecture validation)

### Result
All 21 tasks completed. Build passes. Tests pass. Lint clean.

### Next Step
Run /adv-review gateHandoffVoiceStandard
```

**GOOD — spine:**

```
## Problem
Gate handoff messages dump internal mechanics (todo lists, step logs, gate checkboxes, sub-agent counts) instead of user-relevant content.

## Chosen direction
What was built and how it was verified. Three-section spine + footer replaces all prior handoff templates.

## Delivered
- Voice standard doc extended with Gate Handoff Voice section
- All 9 command doc Output sections rewritten to spine
- Orchestration Summary in adv.md replaced with spine reference
- Action banners trimmed/dropped per taxonomy
- rq-handoffVoice01 added to spec (MUST priority)
- Build, tests, lint pass

---
**gateHandoffVoiceStandard** · execution ✓ → acceptance · `/adv-review gateHandoffVoiceStandard`
```

#### Pair 2: /adv-discover handoff (artifact-recall → spine)

**BAD — artifact recall headings:**

```
## Discoveries

- The Orchestration Summary template in `.opencode/agents/adv.md` (lines ~247-269) is the primary source of verbose handoffs.
- `ADV_INSTRUCTIONS.md` has zero handoff/Orchestration Summary references.
- `adv-refactor.md` has 1 CONTRACT ACTIVE reference to trim.
- Overlays do NOT define handoff prose.

## Accomplished

Completed gates: proposal ✓, discovery ✓
In progress: Ready for design via /adv-design

Task graph: 21 pending tasks, 1 cancelled.

First ready task: tk-QLAlusEM (Phase A.1)

Remaining gates: design ○, planning ○, execution ○, acceptance ○, release ○
```

**GOOD — spine:**

```
## Problem
Gate handoff messages dump internal mechanics instead of user-relevant content.

## Chosen direction
Agreed objectives + constraints + user decisions. Spine = Problem / Chosen direction / Delivered + footer. Banner cleanup included. Caveman-lite matches global config. Extend existing voice standard doc. Replace Orchestration Summary entirely.

## Delivered
- Agreement confirmed: three-section spine + footer for all gate handoffs
- Scope: all /adv-* commands, not just /adv-apply
- Constraint: extend existing voice standard doc, no sibling doc
- Constraint: replace Orchestration Summary entirely, not supplement
- 21-task graph synthesized across Phases A–G

---
**gateHandoffVoiceStandard** · discovery ✓ → design · `/adv-design gateHandoffVoiceStandard`
```

## Enforcement

- `plugin/src/manifest.test.ts` asserts: verb-first, 5–14 words, no banned phrases
- `plugin/src/manifest-doc-drift.test.ts` asserts: exact equality between manifest descriptions and command doc frontmatter (runs in `bun test`)
- PR review checklist includes: "Does the description start with a verb? Is it ≤14 words?"
