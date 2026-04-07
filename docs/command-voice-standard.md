# ADV Command Voice Standard

Defines the enforceable voice rules for all `/adv-*` command descriptions, protocol sections, and user-facing text.

## Core Rules

| Dimension | Rule | Example |
|-----------|------|---------|
| **Mood** | Imperative ("Do X"), not declarative ("You should X") | "Validate change compliance" not "Validates change compliance" |
| **Tense** | Present, not future | "Enforce" not "Will enforce" |
| **Specificity** | Concrete triggers, not abstract values | "3+ files OR db schema change" not "high-risk signals" |
| **Negation** | Minimize; frame positively | "Allowed exits: done, doom-loop" not "Don't skip, don't defer" |
| **Length** | Manifest descriptions: 5–14 words | "Validate change against specs and block archive on failure" |

## Manifest Description Rules

`manifest.ts` is the **single source of truth** for command descriptions. All other surfaces (command doc frontmatter, README, ADV_INSTRUCTIONS) derive from it. Drift is enforced by `plugin/src/manifest-doc-drift.test.ts`.

Every `CommandDef.description` in `manifest.ts` MUST:

1. Start with a strong verb (Validate, Implement, Detect, Propose, Archive, Scan, Refresh, Suggest)
2. Be 5–14 words
3. Mention the primary output or gate effect if one exists
4. Avoid jargon without definition ("slop", "LBP", "RSTC") — use plain verbs

### Banned Phrases in Manifest Descriptions

| Banned | Replace With |
|--------|-------------|
| "high-risk signals" | list the signals explicitly |
| "autonomous retry" | "with retry on failure" |
| "AI-slop detection" | "detect low-quality AI-generated code" |
| "Socratic clarifying questions" | "Ask clarifying questions" |
| "Gap analysis" | "Analyze gaps" |

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
| BAD | GOOD |
|-----|------|
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
| When | Then |
|------|------|
| Spec conflicts with proposal | Spec wins |
| Gate incomplete | Archive blocked |
| 3 failed task attempts | Stop → escalate |
| Cross-repo task | Execute in target repo |
| User requests cancellation | Require explicit approval |
```

### 5. Conflict Resolution Hints

Every protocol section that can conflict with another MUST include a resolution note:

```markdown
| Conflict | Resolution |
|----------|------------|
| TDD required + trivial task | Set `metadata.tdd_intent: "not_applicable"` with reason |
| User requests skip + gate required | Emit `[ADV:MIC]`, ask for sign-off |
| Cross-repo + tool unavailable | Proceed in-place, note in wisdom |
```

## Command Doc (`.opencode/command/adv-*.md`) Template

Every command doc MUST follow this structure:

```markdown
---
name: adv-{name}
description: {5-14 word imperative description}
agent: {agent}
---

# ADV {Name} — {one-line purpose}

{1-2 sentence imperative summary of what this command does and its primary output.}

## Exits

Tasks / phases end in exactly one of these states:

| Exit | Condition |
|------|-----------|
| ✅ Complete | {success condition} |
| 🔁 Retry | {retry condition, if applicable} |
| 🎤 Escalate | {escalation condition} |

## {Phase N}: {Phase Name}

...
```

## Frontmatter Contract

Command doc frontmatter `description` MUST be a **single-line YAML scalar** — no multiline `|` or `>` blocks, no folded strings. The drift test parser relies on this constraint. If multiline descriptions are ever needed, migrate the parser to a YAML-aware library (e.g., `gray-matter`).

## Enforcement

- `plugin/src/manifest.test.ts` asserts: verb-first, 5–14 words, no banned phrases
- `plugin/src/manifest-doc-drift.test.ts` asserts: exact equality between manifest descriptions and command doc frontmatter (runs in `bun test`)
- PR review checklist includes: "Does the description start with a verb? Is it ≤14 words?"
