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
All ADV changes → mandatory worktree isolation (no exemptions)
```

**GOOD:**

```
| Signal | Action |
|--------|--------|
| Any change with file modifications | Always create/reuse worktree |
| Worktree tools unavailable | Hard block — cannot proceed |
| Existing worktree for same change | Auto-reuse existing |
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
| User requests skip + gate required | Emit `[ADV:ATTN]`, ask for sign-off                      |
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
- Governed by `rq-handoffVoice01` (handoff voice spine)
- Global `~/.config/opencode/instructions/caveman.md` remains user-config; not synced by repo

## Prose-Load Reduction Rules

ADV instruction surfaces (`ADV_INSTRUCTIONS.md`, `docs/command-voice-standard.md`, `.opencode/agents/adv.md`, `.opencode/command/adv-*.md`) MUST classify every section by enforcement class and use the matching compression template. Governed by `rq-proseReduction01`–`rq-proseReduction04`.

### Enforcement classes

| Class | Definition |
|---|---|
| **fully-enforced** | Behavior fully enforced by code: drift test, runtime guard, schema validation, tool formatter, or runtime tool requiring approval params |
| **partially-enforced** | Code enforces some aspects (output format, sequencing) but agent decides others (when to call, how to interpret) |
| **inherently-prose** | Agent-side judgment, narration, or domain context that cannot be structurally enforced |

### Compression templates

**fully-enforced:**

```markdown
{Behavior name} enforced by `{tool/file path}`. See {section reference}.

| Constraint | Value |
|---|---|
| {dimension} | {value, code-enforced} |
```

**partially-enforced:** same as fully-enforced, plus one final line:

```markdown
**Agent-side gap:** {one line — what code does not enforce}
```

**inherently-prose:**

```markdown
{One-line purpose statement.}

| {Trigger / scenario} | {Action / decision} |
|---|---|
```

### Stop condition

Compression work halts when no remaining section can be classified as fully-enforced or partially-enforced. Inherently-prose categories use the structured template but are not "compressed away" — they keep their content in scannable form.

### Drift control

`plugin/src/manifest-doc-drift.test.ts` enforces structural assertions per `rq-proseReduction02`: per-class line caps and presence of code-path reference in fully/partially-enforced sections. Assertions are structural, not content-based.

## Gate Handoff Voice

Three-section spine + blockquote wayfinder for all `/adv-*` gate-transition messages. Enforced by `plugin/src/handoff-footer-drift.test.ts`. Spec: `rq-handoffVoice01` (MUST priority). Replaces prior templates (Orchestration Summary, CONTRACT FULFILLED, ARCHIVE COMPLETE, READY FOR BUILD).

Reply instructions for human-checkpoint approvals stay outside the blockquote per § Inline Approval Voice.

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

> **{change-id}**
> {gate} ✓ → {next-gate}
>
> → `/adv-{next-command} {change-id}`
```

No other sections, headings, or structural elements in the handoff. The blockquote wayfinder block is the only content after `## Delivered`. Internal state lives in ADV tools (`adv_change_show`, `adv_task_list`, `_contextSnapshot`), not chat.

### Per-stage anchors (Chosen direction)

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

`/adv-archive` is the terminal message; verb branches by push state.

**Shipped** (push succeeded AND assets propagated):

```
## Shipped.

## Problem
{One-line restatement.}

## Chosen direction
What shipped, what spec deltas applied.

## Delivered
- Spec deltas applied: {counts}
- Archive location: {path}
- Git merge: {default-branch} ({mode})
- Push: {SHA range pushed}
- Pre-push hooks: {strategy}
- Asset sync: {action}
- Cleanup: worktree + temp artifacts
- Investment: {summary}

---

> **{change-id}** · release ✓ · Shipped.
```

**Merged locally** (no remote OR push skipped/failed):

```
## Merged locally.

## Problem
{One-line restatement.}

## Chosen direction
What was merged locally, what spec deltas applied. Note: not pushed.

## Delivered
- Spec deltas applied: {counts}
- Archive location: {path}
- Git merge: {default-branch} ({mode})
- Push: skipped ({reason: no_remote | local_only_mode | push_failed})
- Cleanup: worktree + temp artifacts
- Investment: {summary}

---

> **{change-id}** · release ✓ · Merged locally.
```

| Selection (from `/adv-archive` Phase 8) | Variant |
|---|---|
| push succeeded AND `sync_action` ∈ {`auto via hook`, `manual fix`, `not needed`} | **Shipped.** |
| no remote OR push skipped OR push failed (with explicit reason) | **Merged locally.** |

Both variants use a single-line blockquote terminal — the change is final.

### Fast-track variant (`/adv-task`)

Collapses proposal → discovery → design → planning into one step. Variant at handoff:

```
## Problem
{One-line restatement.}

## Chosen direction
{Summarize combined decisions from proposal+discovery+design+planning. Two to four sentences max.}

## Delivered
{All artifacts produced: proposal, agreement, design, task graph. Bullet list.}

---

> **{change-id}**
> task ✓ → apply
>
> → `/adv-apply {change-id}`
```

### Action banner cleanup

Mid-command banner taxonomy (CONTRACT ACTIVE, CONTRACT STATUS, CONTRACT FULFILLED, QUICK CONTRACT, READY FOR BUILD, ARCHIVE COMPLETE):

| Banner | Action | Replacement |
|--------|--------|-------------|
| CONTRACT ACTIVE | Trim to purpose line | `Working on: {change-id}` + reference to `_contextSnapshot` for state |
| CONTRACT STATUS | Drop entirely | No per-task status block. State visible via `adv_task_list` and `_contextSnapshot`. TDD phase markers (`TDD_RED`/`TDD_GREEN`) were retired — TDD evidence lives in `adv_run_test` tool records |
| CONTRACT FULFILLED | Replace with spine | Use the canonical three-section spine + footer (apply → review handoff) |
| QUICK CONTRACT | Keep, apply caveman-lite | Retain contract-confirmation shape (INTENT / SCOPE / SUCCESS CRITERIA). Tighten labels, drop filler. Not a handoff — mid-command confirmation block |
| READY FOR BUILD | Replace with fast-track spine | Use the fast-track variant above |
| ARCHIVE COMPLETE | Replace with archive terminal spine | Use the archive terminal variant above |

### Safety-warning surface

Block banners remain for safety-critical confirmations (destructive actions, cancellation approval, doom-loop recovery). NOT gate handoffs — interaction prompts governed by `rq-autonomy01`. The spine does not apply.

### Auto-continue transitions

When `rq-autonomy01` permits auto-continue, the agent proceeds without emitting a handoff message. No message = no handoff to validate. Spine applies only to user-facing gate-transition messages.

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
What was built and how it was verified. Three-section spine + blockquote wayfinder block replaces all prior handoff templates.

## Delivered
- Voice standard doc extended with Gate Handoff Voice section
- All 9 command doc Output sections rewritten to spine
- Orchestration Summary in adv.md replaced with spine reference
- Action banners trimmed/dropped per taxonomy
- rq-handoffVoice01 added to spec (MUST priority)
- Build, tests, lint pass

---

> **gateHandoffVoiceStandard**
> execution ✓ → acceptance
>
> → `/adv-review gateHandoffVoiceStandard`
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
Agreed objectives + constraints + user decisions. Spine = Problem / Chosen direction / Delivered + blockquote wayfinder block. Banner cleanup included. Caveman-lite matches global config. Extend existing voice standard doc. Replace Orchestration Summary entirely.

## Delivered
- Agreement confirmed: three-section spine + blockquote wayfinder block for all gate handoffs
- Scope: all /adv-* commands, not just /adv-apply
- Constraint: extend existing voice standard doc, no sibling doc
- Constraint: replace Orchestration Summary entirely, not supplement
- 21-task graph synthesized across Phases A–G

---

> **gateHandoffVoiceStandard**
> discovery ✓ → design
>
> → `/adv-design gateHandoffVoiceStandard`
```

## Inline Approval Voice

Inline prose reply instructions at the seven named human checkpoints (vs `question`-tool popups, which block chat input and prevent agent-switching/slash-command redirection). Spec: `rq-inlineApproval01` (MUST priority).

**Applies to** the seven named human checkpoints from `rq-autonomy01`:

1. Proposal confirmation (`/adv-proposal` step 9)
2. Agreement sign-off (`/adv-discover` Phase 4.5.1 + 4.6)
3. Design approval (`/adv-design` Phase 4 conditional pause)
4. Prep approval (`/adv-prep` Phase 5.2)
5. Acceptance (`/adv-review` end-of-phase)
6. Archive sign-off (`/adv-archive` Phase 5)
7. Cancellation approval (`/adv-apply` cancellation policy + any caller of `adv_task_cancel`)

**Does NOT apply to** these question-tool surfaces, which keep their current behavior:

- Doom-loop recovery (3 failed task attempts)
- Drift detection in `/adv-review` and `/adv-harden`
- Change-id selection / disambiguation
- AC clarification rounds (`/adv-discover` Phase 4.5)
- Triage commands (`/adv-idea`, `/adv-problem`, `/adv-clarify`)

### Two parsing tiers

| Tier | Reversibility | Parser |
|---|---|---|
| **A** | Reversible (proposal, agreement, design, prep, acceptance) | Forgiving whitelist + LLM fallback |
| **B** | Irreversible (archive sign-off, cancellation) | Strict whitelist; NO LLM fallback |

#### Tier A — Reversible (proposal, agreement, design, prep, acceptance)

**Whitelist (case-insensitive, trimmed):**

```
continue, go, approve, approved, yes, ok, okay, proceed, accept, accepted,
lgtm, ship it, looks good, sounds good, fine, yep, yeah
```

**Reply matches whitelist** → proceed inline immediately.

**Reply starts with `/adv-X`** → no-op for the agent. OpenCode dispatches the slash command into its own session.

**Reply does NOT match whitelist and is not a slash command** → LLM judgment classifies into one of:

| Category | Action |
|---|---|
| `approve` | Proceed inline (treat as whitelist hit). |
| `revise` | Treat reply text as the change request; loop back to refinement. |
| `redirect` | The user described an alternate slash command. Treat as no-op for the agent; invite the user to run it. |
| `stop` / `defer` | Halt; do not advance the gate. |
| `unclear` | Re-prompt with the same options. |

#### Tier B — Irreversible (archive sign-off, cancellation approval)

**Whitelist (case-insensitive). Reply MUST be the entire trimmed reply OR the first non-whitespace token. NO LLM fallback.**

**Archive sign-off whitelist:**

```
approve, approved, confirm, confirmed, yes, proceed, sign off, signoff, ship it
```

**Cancellation whitelist (regex parser, no LLM):**

```
^approve all$        → cancel all listed tasks
^reject all$         → keep all tasks active
^keep ([\d,\s]+)$    → cancel inverse of listed numbers
^cancel ([\d,\s]+)$  → cancel only listed numbers
^(stop|abort)$       → halt
```

**Anything else** → re-prompt with the same options. Do not invoke the LLM. Do not advance.

**Archive single-turn execution:** when an approval whitelist match is detected, emit a one-line acknowledgment as the opening of the response:

```
Archiving `{change-id}`.
```

Then proceed with `adv_gate_complete gateId: 'release'` → `adv_change_archive` → Phase 9 git finalization in the same response. No separate confirmation-echo turn. Tier B safety comes from the strict whitelist (no LLM fallback, deliberate phrases) plus the six prior gate approvals already cemented; the wait-one-turn pattern was removed because it added friction without meaningfully changing the abort surface.

### Pattern templates

#### Tier A — Standard inline approval (composed with Gate Handoff Voice spine)

```
## Problem
{One-line restatement.}

## Chosen direction
{Per-stage anchor.}

## Delivered
- ...

---

> **{change-id}**
> {gate} ✓ → {next-gate}
>
> → `/adv-{next-command} {change-id}`

Reply `continue` (or `go`, `approve`, `yes`, `ok`, `proceed`, `lgtm`) to proceed inline to {next-stage},
or run the command above.
Want changes? Reply with what to adjust.
Want to stop here? Reply `stop` or `defer`.
```

**Command-as-approval rule:** When the blockquote wayfinder block shows a specific continuation command (e.g., `/adv-apply {change-id}`), invoking that exact command while the checkpoint is pending counts as explicit approval equivalent to a Tier A whitelist word. The agent completes the pending gate with `userApproved: true` and proceeds immediately without a second approval prompt. This applies only to Tier A checkpoints; Tier B remains whitelist-only.

#### Tier B — Archive sign-off

```
{Change report — see .opencode/agents/adv.md § Sign-Off Boundary.}

---

> **{change-id}**
> acceptance ✓ → release

Reply `sign off` (or `signoff`, `approve`, `confirm`, `yes`, `proceed`, `ship it`) to archive,
or `dry run` to preview the archive without applying spec deltas,
or `cancel` / `stop` / `abort` to halt.
```

After whitelist match, emit `Archiving {change-id}.` and execute the archive workflow inline in the same response. No separate confirmation-echo turn.

#### Tier B — Cancellation approval (structured)

```
Cancellation requested for these tasks:

1. {tk-id} — "{title}" — Reason: {reason}
2. {tk-id} — "{title}" — Reason: {reason}

Reply EXACTLY one of:
- `approve all` — cancel all listed tasks
- `reject all` — keep all tasks active
- `keep N` (or `keep N,M`) — cancel only the unlisted tasks
- `cancel N` (or `cancel N,M`) — cancel only the listed tasks
- `stop` / `abort` — halt; do not cancel anything

Anything else → agent re-prompts with the same options.
```

#### AC checkpoint with `/adv-clarify` literal detection

```
Acceptance Criteria for {change-id}:

1. ...
2. ...

Reply:
- `approve` (or whitelist hit) — approve AC and proceed to agreement persistence
- `/adv-clarify {change-id}` — halt /adv-discover; user runs /adv-clarify; rerun /adv-discover after
- Or describe what to add/clarify — agent normalizes into revised AC and re-runs this checkpoint
```

**Detection rules (in order):**

1. Reply trimmed = `/adv-clarify` or `/adv-clarify {change-id}` → halt cleanly (no `agreement.md` write, no `adv_gate_complete` call).
2. Reply trimmed first token = `/adv-clarify` → halt cleanly.
3. Reply matches Tier A whitelist → approve AC, proceed.
4. Otherwise → treat as revision text. Revise AC. Re-run checkpoint (max 3 loops, then recommend `/adv-clarify`).

**× Do NOT** treat phrases like "I want to clarify something" or "let's clarify X" as `/adv-clarify` invocation. Only the literal slash command triggers the halt branch. Non-literal "clarify" intent is revision text.

### Prep gate machine contract

The prep gate's `userApproved: true` argument on `adv_gate_complete` is a machine contract independent of the UX surface. When the user replies with a Tier A whitelist word at `/adv-prep` Phase 5.2, the agent MUST pass `userApproved: true` to `adv_gate_complete`. Inline approval is the upstream signal source; the machine contract is unchanged.

### BAD / GOOD

| BAD | GOOD |
|---|---|
| `question` popup with "Approve and proceed to /adv-discover" option | Inline blockquote wayfinder block with `Reply `continue` to proceed inline to discovery, or run `/adv-discover {change-id}`` |
| Cancellation popup with "Approve all / Review individually / Reject" | Inline numbered task list with `Reply `approve all`, `reject all`, `keep N`, `cancel N`, `stop`` |
| LLM fallback for archive sign-off | Whitelist-only, single-turn execution on match |
| Two-turn archive (echo + wait + execute) | One-turn archive (whitelist match → `Archiving {id}.` + execute in same response) |
| Phrase "I want to clarify" treated as `/adv-clarify` | Only literal `/adv-clarify` reply triggers halt branch |
| Two `question` calls (popup + "shall I proceed?") | One inline blockquote wayfinder block; whitelist match or exact command invocation advances immediately |
| Prose-labeled footer block with `Current phase:`, `Next phase:`, `Run when ready:` | Blockquote wayfinder block: `> **{id}**` / `> {gate} ✓ → {next}` / `> → `/adv-cmd {id}`` |
| Redundant command lines in wayfinder block | Exactly one runnable command shown |

### Anti-patterns

- × Don't ask "shall I proceed?" after the user replies with a whitelist word or invokes the exact shown continuation command — that's the go-ahead.
- × Don't add LLM fallback for Tier B checkpoints. Reversibility is the axis.
- × Don't migrate non-checkpoint `question` uses (doom-loop, drift detection, change-id selection, AC clarification rounds). They keep structured options.
- × Don't keep the old "Ask via `question`..." phrasing in any of the seven checkpoint command docs after this section is in force. Regression test `plugin/src/checkpoint-surface-drift.test.ts` enforces this.
- × Don't show redundant alternative command lines in the blockquote wayfinder block — show exactly the one command needed to continue.
- × Don't make the wayfinder block a separate section or heading — it is the only content after `## Delivered` and `---`.
- × Don't allow slash-command invocation to bypass Tier B whitelist-only approval.
- × Don't put reply instructions inside the blockquote — keep them as plain prose below.

## Enforcement

- `plugin/src/manifest.test.ts` asserts: verb-first, 5–14 words, no banned phrases
- `plugin/src/manifest-doc-drift.test.ts` asserts: exact equality between manifest descriptions and command doc frontmatter (runs in `bun test`)
- `plugin/src/checkpoint-surface-drift.test.ts` asserts: each of the seven checkpoint-owning command docs uses the Inline Approval Voice anchor phrase, and does NOT contain old `question`-tool checkpoint phrasing
- PR review checklist includes: "Does the description start with a verb? Is it ≤14 words?"
