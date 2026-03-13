# ADV Plugin - Voice & Style Quick Reference

## Core Voice: Spec-Driven, Imperative, Problem-Centric

### Signature Phrases
- **"Specs become laws"** — Specs are the single source of truth
- **"Context survives"** — Context persists across sessions/worktrees
- **"No Skip/Defer"** — Work must complete or escalate (never defer)
- **"PROHIBITED: ..."** — Hard constraints, not guidelines

### Tone Characteristics
1. **Direct & assertive** — Uses imperatives (do, don't, must, never)
2. **Problem-first** — Every feature intro starts with "The Problem"
3. **Structured for scanning** — Tables, bullet points, emoji, visual breaks
4. **Technical rigor** — Citations, research validation, decision evidence

---

## Status & Progress Markers

### Emitted at START of agent response (one marker per response)
- `[ADV:ROCKET]` 🚀 — Active implementation work
- `[ADV:TDD_RED]` 🔴 — Writing failing tests  
- `[ADV:TDD_GREEN]` 🟢 — Implementing to pass tests
- `[ADV:MOON]` 📡 — Sub-agents running (research, etc.)
- `[ADV:EARTH]` 🌍 — Work complete or awaiting input
- `[ADV:DOOM_LOOP]` 💀 — Stuck after 3 failed attempts
- `[ADV:MIC]` 🎤 — Awaiting user approval
- `[ADV:TASK_STATUS_REPORT]` — Emitting structured task report

### Tab Title Format
`<emoji> <change-title>` (e.g., `📡 Add Auth`, `🟢 Fix Bug`)
- Strips verb prefixes: add, fix, update, improve, create, remove, refactor, change
- Splits kebab/snake/camelCase to Title Case

---

## Documentation Patterns

### Command Definition (manifest.ts format)
```typescript
{
  name: "adv-apply",
  description: "Implement change with autonomous retry, TDD, and global final loop",
  phase: "implementation",
  gate: "implementation",          // Affects which quality gate?
  requiresChangeId: true,
  prerequisites: ["adv-prep"],     // Must complete first
  successors: ["adv-review"],      // Recommended next
}
```

### Proposal Structure
1. **Summary** (2-3 sentences)
2. **Why** (problem breakdown)
3. **Research Validation** (decisions + sources)
4. **Architecture Corrections** (critical findings)
5. **Implementation** (detailed technical approach)

### Decision Presentation
```markdown
| Decision | Validation | Source |
|----------|------------|--------|
| Use X | VALIDATED | Reference/Citation |
```

---

## Key Constraints & Rules

### 6-Gate Quality Checklist (Sequential, Non-Skippable)
```
research → prep → implementation → review → harden → signoff
```

**Enforcement:**
- Archive BLOCKS unless all 6 gates satisfied
- Auto-complete lightweight versions of missing gates
- `legacy` status counts as satisfied for pre-existing changes
- ALL cancellations need explicit user approval

### Doom Loop Protocol
After 3 failed attempts on a task:
1. **STOP** trying same approach
2. **Emit** `[ADV:DOOM_LOOP]`
3. **Document** all 3 attempts + diagnosis
4. **Ask** user for guidance

### Cross-Repo Rule
Tasks with `target_repo`/`target_path` MUST execute in target dir.
- "Different repo" is NEVER a cancellation reason
- Switch `workdir` to target path for all tool calls

---

## Language Markers

### Mandatory Keywords (Capitalized)
- `MUST` — Non-negotiable requirement
- `NEVER` — Hard prohibition
- `CRITICAL` — Important architectural decision
- `MANDATORY` — Required process step
- `PROHIBITED` — Explicitly forbidden action

### Validation Keywords
- `VALIDATED` — Confirmed against source
- `ANTI-PATTERN` — Known bad practice
- `LEGACY` — Grandfathered, not required
- `SKIPPED` — Explicitly bypassed with reason

### Quality Keywords
- `blocker` — Blocks progression
- `issue` — Should be fixed
- `suggestion` — Nice-to-have improvement
- `question` — Needs clarification
- `nit:` — Trivial, not required to fix

---

## Table Patterns

### 2-column: Command Purpose
```markdown
| Command | Purpose |
|---------|---------|
| `/adv-proposal` | Extract prior discussion context, agree on problem statement, then build full proposal |
```

### 3-column: Validation
```markdown
| Decision | Validation | Source |
|----------|------------|--------|
| Use Zod | VALIDATED | Zod docs |
```

### 4-column: Gate Sequence
```markdown
| # | Gate ID | Name | Triggered By |
|---|---------|------|--------------|
| 1 | `research` | Research-Done | `/adv-research` |
```

### 3-column: Auto-Completion
```markdown
| If Missing | Auto-Execute | Lightweight Version |
|------------|--------------|---------------------|
| `research` | Context7 lookup | Query library docs |
```

---

## Flow & Progression

### ASCII Diagram Style
```
/adv-proposal "Feature"
       │
       ▼
┌─────────────────┐
│ DRAFT           │
│ Define tasks    │
└────────┬────────┘
         │
         ▼
/adv-apply {change-id}
```

### Phase Grouping (manifest.ts)
- **core** — Proposal, validation, archive
- **pre-implementation** — Clarify, research, prep
- **implementation** — Apply, task
- **post-implementation** — Review, harden, audit
- **advanced** — Refactor, coordinate

---

## File Organization

### Where Info Lives
| What | Where |
|------|-------|
| Commands | `plugin/src/manifest.ts` (TypeScript constant) |
| Instructions | `ADV_INSTRUCTIONS.md` (root) |
| Gates | `docs/adv-gates.md` |
| Workflow | `docs/adv-workflow.md` |
| Proposals | `.adv/changes/*/proposal.md` |

### External State (NOT in git)
```
$XDG_DATA_HOME/opencode/plugins/advance/{project-id}/
├── changes/        # Active proposals
├── archive/        # Completed changes
├── db/spec.db      # SQLite FTS cache
├── wisdom.jsonl    # Learnings
├── agenda.jsonl    # Work queue
└── handoff.json    # Session handoff
```

---

## TDD Protocol

### RED Phase
1. Write failing test
2. Run to confirm failure
3. Emit `[ADV:TDD_RED]`
4. Show test output

### GREEN Phase
1. Implement code
2. Run to confirm pass
3. Emit `[ADV:TDD_GREEN]`
4. Show test output

### Skip Condition
Trivial tasks can skip TDD with note: `(trivial: docs change)`

---

## Context Freshness Rules

Before EACH task:
1. Re-read change via `adv_change_show`
2. Look up task via `adv_task_show` (returns full task + parent changeId)
3. Review relevant proposal sections

**TodoWrite:** Use only task IDs (`tk-abc123`), not descriptions.
This forces context lookup on every reference.

---

## API Tool Naming Convention

`adv_<entity>_<action>`

Examples:
- `adv_status` — Get project status
- `adv_change_show`, `adv_change_list`, `adv_change_update`
- `adv_task_show`, `adv_task_create`, `adv_task_cancel`
- `adv_gate_status`, `adv_gate_complete`
- `adv_spec` (with action: "list", "show", or "search")
