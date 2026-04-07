# Advance Plugin - Structure & Documentation Analysis

## 1. DIRECTORY STRUCTURE

### Root-Level Files
- **ADV_INSTRUCTIONS.md** — Main instruction file for agents
- **README.md** — 450 lines covering overview, workflow, commands, features
- **CHANGELOG.md**, **SETUP.md**, **INSTALL.md**, **MIGRATION_PLAN.md** — Documentation
- **project.json** — Plugin metadata
- **slop-smells.yaml** — AI quality smell detection rules

### Key Subdirectories
```
advance/
├── plugin/                          # TypeScript implementation
│   ├── src/
│   │   ├── manifest.ts             # Command definitions with workflow metadata
│   │   ├── types.ts                # Core types (895 lines of schemas)
│   │   ├── tools/                  # MCP tool implementations
│   │   │   ├── status.ts           # adv_status tool
│   │   │   ├── change.ts           # adv_change_* tools
│   │   │   ├── task.ts             # adv_task_* tools
│   │   │   ├── spec.ts             # adv_spec_* tools
│   │   │   ├── gate.ts             # adv_gate_* tools
│   │   │   ├── agenda.ts           # adv_agenda_* tools
│   │   │   ├── wisdom.ts           # adv_wisdom_* tools
│   │   │   └── project.ts          # adv_project_* tools
│   │   ├── validator/              # Change validation logic
│   │   ├── storage/                # Persistent storage (JSON, SQLite)
│   │   └── events/                 # Status markers, telemetry
│   └── bun.lock                    # Dependency lock
│
├── docs/                            # Extended documentation
│   ├── adv-gates.md                # 6-gate quality checklist details
│   ├── adv-workflow.md             # Detailed workflow documentation
│   ├── adv-question-tool.md        # Question tool usage guide
│   ├── adv-task-report.md          # Task status report format
│   ├── QUICK_REFERENCE.md          # Bug investigation/session compaction
│   ├── checklists/                 # Investigation checklists
│   └── specs/                      # Specification schemas
│
├── .adv/                            # External mutable state (not in plugin)
│   ├── changes/                     # Active change proposals
│   ├── archive/                     # Completed/archived changes
│   ├── specs/                       # Spec registry (.adv/specs/advance/)
│   └── db/                          # SQLite database (spec.db)
│
└── AGENTS.md                        # Project-specific agent instructions

```

---

## 2. COMMAND DOCUMENTATION PATTERNS

### Organization: manifest.ts
Commands are defined as a **TypeScript constant** (not files, not markdown):

```typescript
export const COMMAND_MANIFEST: Record<string, CommandDef> = {
  "adv-status": {
    name: "adv-status",
    description: "Project overview with specs, changes, and recommendations",
    phase: "core",
    requiresChangeId: false,
    prerequisites: [],
    successors: ["adv-proposal", "adv-apply"],
  },
  // ... more commands
}
```

### Command Categories (Phases)
- **core** — `/adv-status`, `/adv-proposal`, `/adv-validate`, `/adv-archive`
- **pre-implementation** — `/adv-clarify`, `/adv-research`, `/adv-prep`
- **implementation** — `/adv-apply`, `/adv-task`
- **post-implementation** — `/adv-review`, `/adv-harden`, `/adv-audit`
- **advanced** — `/adv-refactor`, `/adv-coordinate`
- **utility** — `/adv-improve`

### Key Fields in CommandDef
- `gate?: GateId` — Which quality gate this command affects (6 gates: research, prep, implementation, review, harden, signoff)
- `prerequisites: string[]` — Commands that must be done first
- `successors: string[]` — Recommended next commands
- `requiresChangeId: boolean` — Whether command takes a change ID argument

---

## 3. CURRENT VOICE & STYLE PATTERNS

### A. Documentation Style (ADV_INSTRUCTIONS.md & README.md)

#### Tone
- **Direct, imperative** — "Specs become laws", "Context survives", "Do not skip"
- **Technical but accessible** — Explains concepts (TDD, gates, etc.) without jargon overload
- **Structured for scanning** — Heavy use of tables, bullet points, code blocks

#### Key Voice Patterns
1. **Assertions as Law** (from spec-first philosophy)
   - "Specs define the law"
   - "Do not commit secrets"
   - "NEVER skip gates"
   - "CRITICAL" / "MANDATORY" markers

2. **Problem-Centric** (why + how)
   - "The Problem ADV Solves" section leads each feature
   - Tables comparing "Challenge" → "ADV's Solution"
   - "Why ADV?" sections explain rationale

3. **Workflow as Diagrams**
   - ASCII flow diagrams showing progression
   - Emoji markers for status (🚀, 🔴, 🟢, 📡, 🌍, 💀, 🎤)
   - Sequential phase visualization

4. **Error Prevention Language**
   - "No Skip/Defer"
   - "PROHIBITED: ..."
   - "MUST use", "NEVER use"
   - Explicit blockers and constraints

### B. Code Organization Style

#### Tool Naming Pattern
MCP tools named with convention: `adv_<entity>_<action>`
- `adv_status` — Get project status
- `adv_change_show`, `adv_change_list`, `adv_change_update` — Change operations
- `adv_task_show`, `adv_task_create`, `adv_task_cancel` — Task operations
- `adv_gate_status`, `adv_gate_complete` — Gate tracking

#### Documentation in Code
Tools include JSDoc comments with clear purpose:
```typescript
/**
 * Status Tool
 *
 * Project-wide status overview with manifest-driven recommendations.
 * Uses the workflow manifest to recommend next commands based on
 * gate status of active changes.
 */
```

### C. Proposal/Change Documentation

#### Structure (from .adv/changes/add-6-gate-qual-RS08/proposal.md)
1. **Summary** — 2-3 sentence high-level overview
2. **Why** — Problem statements broken into subproblems
3. **Research Validation** — Decision + validation source + citation
4. **Architecture Corrections** — Critical findings with corrections
5. **Implementation** — Detailed technical approach

#### Validation Language
- "VALIDATED" / "CRITICAL" / "NEW" markers
- Always cite sources (e.g., "apenwarr.ca/log/20181113", "FDA 21 CFR Part 11")
- Anti-pattern calls: "This is an ANTI-PATTERN"
- Trade-off documentation (e.g., "Cost vs Benefit")

#### Decision Presentation
```markdown
| Decision | Validation | Source |
|----------|------------|--------|
| Zod `.passthrough()` + `.optional()` | VALIDATED | Zod docs |
```

### D. Type/Schema Documentation (types.ts)

#### Pattern
- Heavy use of `zod` schemas with comments
- IDs prefixed with type hints: `rq-` (requirement), `tk-` (task), `dl-` (delta)
- RFC 2119 keywords for priority: `must`, `should`, `may`
- Forward/backward compatibility via `.passthrough()` on all schemas

---

## 4. PRIORITY & CONFLICT RESOLUTION MECHANISMS

### A. Gate Ordering (Sequential, Non-Skippable)
```
research → prep → implementation → review → harden → signoff
```
- **Enforcement** — Archive BLOCKS unless all gates satisfied
- **Legacy Support** — Pre-existing changes get `legacy` status (counts as satisfied)
- **Auto-Completion** — Missing gates are auto-executed in lightweight form if user runs later-phase command

### B. Status Values
- `pending` — Not yet completed
- `done` — Completed with timestamp + evidence
- `legacy` — Predates gate system, grandfathered
- `skipped` — Explicitly skipped with documented reason

### C. Conflict Detection
- **Cross-repo tasks** — MUST be executed in target repo, not cancelled
- **Cancellation policy** — ALL task cancellations require explicit user approval + evidence
- **Review/Harden gates** — Block if actionable findings unresolved (unless documented as accepted debt)

### D. Doom Loop Detection
After 3 failed attempts on a single task:
1. **STOP** — Don't retry same approach
2. **Emit** `[ADV:DOOM_LOOP]` marker
3. **Document** all 3 attempts with diagnosis
4. **Ask** via question tool for user guidance

---

## 5. KEY INSTRUCTION PATTERNS

### A. Status Markers (Emitted at Response Start)
| Marker | Emoji | When | Purpose |
|--------|-------|------|---------|
| `[ADV:ROCKET]` | 🚀 | Active work | Current work in progress |
| `[ADV:TDD_RED]` | 🔴 | Writing tests | Red phase (test first) |
| `[ADV:TDD_GREEN]` | 🟢 | Implementing | Green phase (make pass) |
| `[ADV:MOON]` | 📡 | Sub-agents running | Spawned parallel research |
| `[ADV:EARTH]` | 🌍 | Complete/awaiting | Work complete or waiting for input |
| `[ADV:DOOM_LOOP]` | 💀 | Stuck in retry | Failed 3 attempts, need help |
| `[ADV:MIC]` | 🎤 | Needs approval | Awaiting user confirmation |
| `[ADV:TASK_STATUS_REPORT]` | — | Task compaction | Emitting structured task report |

### B. Tab Title Format (When Active Change)
`<emoji> <normalized change code>`
- Example: `📡 Feature X`, `🟢 Fix Bug`
- Verb prefixes stripped: add, fix, update, improve, create, remove, refactor, change
- CamelCase/kebab/snake_case split to Title Case

### C. Context Freshness Protocol
Before EACH task:
1. Re-read change via `adv_change_show`
2. Look up task via `adv_task_show` (returns full task + parent changeId)
3. Review relevant proposal sections

**TodoWrite Rules:** Use task IDs only (`tk-abc123`), not descriptions. Forces context lookup.

### D. TDD Protocol (RSTC)
- **RED Phase** — Write failing test → run → emit `[ADV:TDD_RED]` → show output
- **GREEN Phase** — Implement → run → emit `[ADV:TDD_GREEN]` → show output
- **Trivial Tasks** — Set `metadata.tdd_intent: "not_applicable"` with reason during prep

---

## 6. TABLE & PATTERN FORMATS

### Command Recommendation Table
```markdown
| Command | Purpose |
|---------|---------|
| `/adv-status` | Project overview (specs, changes, recommendations) |
| `/adv-proposal <summary>` | Create new change proposal |
```

### Status Table (from adv-gates.md)
```markdown
| # | Gate ID | Name | Triggered By |
|---|---------|------|--------------|
| 1 | `research` | Research-Done | `/adv-research` or Context7 lookup |
```

### Decision Validation Table
```markdown
| Decision | Validation | Source |
|----------|------------|--------|
| Zod `.passthrough()` | VALIDATED | Zod docs |
```

### Architecture Correction Table
```markdown
| If Missing | Auto-Execute | Lightweight Version |
|------------|--------------|---------------------|
| `research` | Context7 docs lookup | Query relevant library docs |
```

---

## 7. DOCUMENTATION LOCATIONS & FILE PATTERNS

### Where Different Info Lives
- **Commands** → `plugin/src/manifest.ts` (TypeScript constant)
- **Core Instructions** → `ADV_INSTRUCTIONS.md` (in repo root)
- **Gate Details** → `docs/adv-gates.md`
- **Workflow Details** → `docs/adv-workflow.md`
- **Tool List** → `README.md` (lines 148+, "MCP Tools" section)
- **Problem/Solution** → `README.md` (lines 17-48, "Why ADV?" section)
- **Change Proposals** → `.adv/changes/*/proposal.md`

### Naming Conventions
- Spec files: `.adv/specs/<capability>/spec.json`
- Changes: `.adv/changes/<kebab-case-id>/change.json` + `proposal.md`
- Archive: `.adv/archive/<DATE>-<abbreviated-title>/`

---

## 8. EXTERNAL STATE LAYOUT

Located at `$XDG_DATA_HOME/opencode/plugins/advance/{project-id}/`:
```
{project-id}/                  # = root commit SHA
├── changes/                   # Active proposals
├── archive/                   # Completed changes
├── db/spec.db                 # SQLite FTS cache
├── wisdom.jsonl               # Project learnings (patterns, gotchas)
├── agenda.jsonl               # Work queue
└── handoff.json               # Session handoff (fallback)
```

---

## 9. SUMMARY: VOICE & PATTERNS

### What Makes ADV Documentation Distinctive

1. **Spec-First Thinking** — Specs are the "law", everything is validated against them
2. **Structured Workflow** — 6 mandatory sequential gates with explicit blockers
3. **Problem-Solution Framing** — Every feature explained as "Problem → Solution"
4. **Technical Rigor** — Research validation, citations, RFC 2119 keywords
5. **Status Transparency** — Emoji markers, gate tracking, task reports, accumulated wisdom
6. **Flow Visualization** — ASCII diagrams, phase grouping, predecessor/successor chains
7. **Error Prevention** — "PROHIBITED", "MUST", "NEVER" language; no skip/defer allowed
8. **Audit Trail** — Everything archived, every decision logged, no black boxes

### Style Markers
- **"become laws"** — Signals spec-driven approach
- **"context survives"** — Signals session persistence & worktree support
- **CAPITALS for mandatory requirements** — `MUST`, `NEVER`, `CRITICAL`, `MANDATORY`
- **[ADV:MARKER]** — Status transparency in agent responses
- **emoji + text** — Visual status indicators for quick scanning

