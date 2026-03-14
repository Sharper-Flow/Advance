# ADV - Spec-Driven Development Instructions

Enforce spec-driven development where **specs become laws**. Requirements are formally defined, validated, and enforced during implementation.

## Core Decision Rules

| When | Then |
|------|------|
| Spec conflicts with proposal | Spec wins |
| Gate incomplete | Archive blocked |
| 3 failed task attempts | Stop → emit `[ADV:DOOM_LOOP]` → escalate |
| Cross-repo task | Execute in target repo (`workdir`) |
| User requests cancellation | Require explicit approval via `adv_task_cancel` |
| TDD required + trivial task | Mark trivial with reason, skip TDD |
| User requests skip + gate required | Emit `[ADV:MIC]`, ask for sign-off |

## Commands

### Core Workflow

| Command | Purpose |
|---------|---------|
| `/adv-status` | Show project overview: specs, active changes, and next-step recommendations |
| `/adv-proposal <summary>` | Extract problem statement, success criteria, and constraints without creating tasks |
| `/adv-validate <change-id>` | Validate change compliance against specs; block archive on failure |
| `/adv-apply <change-id>` | Implement change with TDD, retry on failure, and final verification |
| `/adv-archive <change-id>` | Archive completed change: apply spec deltas and finalize git |

### Pre-Implementation

| Command | Purpose |
|---------|---------|
| `/adv-clarify` | Ask clarifying questions to resolve ambiguous requirements |
| `/adv-research <target>` | Validate architectural decisions and best practices without creating tasks |
| `/adv-prep <change-id>` | Analyze gaps and synthesize tasks from validated research findings |

### Post-Implementation

| Command | Purpose |
|---------|---------|
| `/adv-review <change-id>` | Review code for correctness, security, and architecture; emit REVIEW_FINDINGS |
| `/adv-harden <change-id>` | Detect low-quality code, verify test coverage, clean up; block archive on open findings |
| `/adv-audit [capability]` | Detect drift between specs and current implementation |
| `/adv-slop-scan [path]` | Scan for AI slop patterns including defensive and nested code |

### Fast-Track

| Command | Purpose |
|---------|---------|
| `/adv-task` | Fast-track a discussed change: synthesize contract, validate best practices, prep, and hand off |

### Advanced

| Command | Purpose |
|---------|---------|
| `/adv-refactor <change-id>` | Refresh a stale proposal to reflect current codebase state |
| `/adv-coordinate` | Detect and resolve conflicts across multiple active changes |
| `/adv-improve` | Suggest targeted improvements to existing specs or implementation |
| `/adv-tron [target]` | Investigate codebase structure, hotspots, risks, and suggest follow-up agenda candidates |

## Command Boundaries

Pre-implementation commands have strict boundaries enforced by per-command specs (`adv-proposal`, `adv-research`, `adv-prep`).

| Command | Produces | MUST NOT | Gate |
|---------|----------|----------|------|
| proposal | Problem statement, success criteria, constraints | Create tasks, complete gates, make impl decisions | None |
| research | Validated approach, architecture assessment, findings in proposal.md | Create tasks, complete non-research gates | research |
| prep | Complete task graph, gap analysis, sequencing | Complete non-prep gates, make architecture decisions | prep |
| task | Change + tasks + gates (fast-track exemption) | — (intentionally crosses boundaries) | research + prep |
| apply | Implementation via TDD | Auto-complete research/prep gates | implementation |

**Key rules:**
- Only `/adv-prep` (and exempt `/adv-task`) may call `adv_task_add`
- `/adv-apply` must stop if research or prep gates are pending — it cannot auto-complete them
- Each command's `.md` file has a `## Command Boundary` section with full details

## Status Markers

Emit at START of each response:

| Marker | When | Tab emoji |
|--------|------|-----------|
| `[ADV:ROCKET]` | Active work | 🚀 |
| `[ADV:TDD_RED]` | Writing tests (red phase) | 🔴 |
| `[ADV:TDD_GREEN]` | Implementing (green phase) | 🟢 |
| `[ADV:MOON]` | Sub-agents running | 📡 |
| `[ADV:EARTH]` | Complete / awaiting input | 🌍 |
| `[ADV:DOOM_LOOP]` | Stuck in retry cycle | 💀 |
| `[ADV:MIC]` | Needs user approval | 🎤 |
| `[ADV:TASK_STATUS_REPORT]` | Emitting task report | — |

Tab title format: `<emoji> <normalized change code>` when active change is set (e.g. `📡 Feature X`); bare `<emoji>` when no active change. camelCase/kebab/snake_case IDs are split to Title Case words; common verb prefixes (add/fix/update/improve/create/remove/refactor/change) are stripped.

System-emitted: `[ADV:ACCUMULATED_WISDOM]`, `[ADV:TODO_CONTINUATION]`, `[ADV:RECORD_WISDOM]`

### Context Snapshot Protocol

`adv_change_show` includes a `_contextSnapshot` field — a compact, scannable summary of the agent's internal state for the active change. This closes the **context agreement gap** between what the agent knows and what the user sees.

**Content** (max 10 lines):
- Change ID and title
- Gate progress as inline visual: `[✓ research] [✓ prep] [○ impl] ...`
- Task counts by status: `2 done | 1 active | 5 pending`
- Current in-progress task (if any)
- Current workdir

**Emission triggers** — the snapshot is included automatically when:

| Trigger | Tool/Command |
|---------|-------------|
| Change loaded for work | `adv_change_show` |
| Gate transitions | `adv_gate_complete` (reflected in next `adv_change_show`) |
| Task switches | `adv_task_update` to `in_progress` (reflected in next `adv_change_show`) |

**Cross-Repo Switch Indicator** — when switching `workdir` to a different repository during a change, emit a formatted block using `formatCrossRepoSwitch()` from `plugin/src/utils/context-snapshot.ts`:

```
╔═══════════════════════════════════════════════════════════╗
║ 🔀 SWITCHING REPOSITORY CONTEXT                          ║
║ From: ~/dev/frontend                                      ║
║ To:   ~/dev/backend                                       ║
║ Task: tk-backend01 (Add /api/oauth/callback endpoint)     ║
╚═══════════════════════════════════════════════════════════╝
```

## Critical Protocols

### ADV State Access Policy

**NEVER** read ADV state files directly using `read`, `bash cat`, `ls`, or any filesystem tool. ADV state is external to the repo and must be accessed exclusively through ADV MCP tools.

Forbidden paths (never read directly):
- `~/.local/share/opencode/plugins/advance/**/change.json`
- `~/.local/share/opencode/plugins/advance/**/proposal.md`
- `~/.local/share/opencode/plugins/advance/**/agenda.jsonl`
- `~/.local/share/opencode/plugins/advance/**/wisdom.jsonl`
- `~/.local/share/opencode/plugins/advance/**/handoff.json`

**ALWAYS** use the ADV MCP tools instead:

| You want | Use this tool |
|----------|---------------|
| Change details + tasks | `adv_change_show` |
| A specific task + its changeId | `adv_task_show` |
| Tasks ready to work | `adv_task_ready` |
| All tasks for a change | `adv_task_list` |
| List all active changes | `adv_change_list` |
| Validate a change | `adv_change_validate` |
| Agenda items | `adv_agenda_list` |
| Wisdom entries | `adv_wisdom_list` |

**If a direct read attempt fails** (file not found, wrong path, permission error) — do NOT retry with a different path. Stop immediately and call `adv_change_show` or `adv_task_show` instead. Direct reads bypass schema validation, conflict detection, and workflow invariants.

### Question Tool UX Policy

The write-in option requirement is enforced globally by **P26** in `rules.yaml`. ADV-specific notes:

1. Use contextual write-in labels (e.g. `Other`, `Different approach`, `Custom value`) — not a generic "Other".
2. Keep question options within schema limits (2-5 total options including the write-in option, concise labels).
3. Preserve custom text-entry behavior by leaving custom input enabled.
4. Treat formatted/WYSIWYG input as best-effort UI behavior; do not assume rich-text controls are always available.

### Tradeoff Prioritizer Protocol

When ADV work reaches a decision with **2+ viable approaches** and the best choice depends on user values, use the `prioritizer` sub-agent before asking the user.

Workflow:
1. Spawn `prioritizer` with the decision, domain, and up to 5 high-signal files/symbols
2. Let it draft context-specific criteria questions plus a decision map
3. Pass the returned `questions` JSON to the `question` tool with minimal paraphrasing
4. Restate the user's priorities before recommending the winning approach

Canonical `task` payload:
```json
{
  "subagent_type": "prioritizer",
  "description": "Draft tradeoff criteria for auth decision",
  "prompt": "Decision: choose between Redis-backed sessions, JWT cookies, and Auth.js delegation for protected routes. Domain: authentication. Key files: src/hooks.server.ts, src/lib/auth/, src/routes/login/+page.server.ts. Real tradeoff: operational simplicity vs extensibility vs dependency surface. Draft context-specific criteria questions and a decision map following the prioritizer output format."
}
```

Skip the prioritizer for obvious bug fixes, mechanical work, or choices already constrained by security/API compatibility/established architecture.

### Context Freshness

**Work one task at a time with fresh context.** Before EACH task:
1. Re-read change via `adv_change_show`
2. Look up the specific task via `adv_task_show` (returns full task + parent changeId)
3. Review relevant proposal sections

**TodoWrite Rules:** Use task IDs only (`tk-abc123`), not descriptions. Forces context lookup via `adv_task_show`.

### TDD Protocol (RSTC)

**Inline TDD is the default.** Red/green phases happen WITHIN each implementation task — do NOT create separate "Write tests" tasks for the same scope.

**RED Phase:** Write failing test → run → emit `[ADV:TDD_RED]` → show output
**GREEN Phase:** Implement → run → emit `[ADV:TDD_GREEN]` → show output
**Trivial Tasks:** Note `(trivial: docs change)` and skip TDD
**Separate Verification:** Cross-cutting tests spanning multiple impl tasks are legitimate separate tasks — mark with `metadata.tdd_intent: "separate_verification"`

### Doom Loop Detection

Tasks end in exactly one state:

| Exit | Condition |
|------|-----------|
| ✅ Done | All acceptance criteria met |
| 🔁 Doom Loop | 3 failed attempts, user guidance needed |
| 🌍 Environmental | Missing external dependency — escalate immediately |

After 3 failed attempts:
1. **STOP** — Don't retry same approach
2. **Emit** `[ADV:DOOM_LOOP]`
3. **Document** all 3 attempts with diagnosis
4. **Ask** via `question` tool for guidance

| BAD | GOOD |
|-----|------|
| Retry same approach | Try a different strategy |
| Silent retries | Document each attempt |
| 4+ attempts same method | Escalate after 3 |
| "Let me try again" | "Approach X failed because Y" |

### Cross-Repo Execution Protocol

Changes often span multiple repositories (e.g., frontend + backend, app + database).

| BAD (Invalid Cancellation) | GOOD |
|----------------------------|------|
| "Out of scope for this repo" | Switch `workdir` and execute |
| "Different repository" | Switch `workdir` and execute |
| "Cannot modify external code" | Use `workdir` parameter |
| "Backend/API changes needed" | Switch `workdir` and execute |

**Key rules:**
1. Tasks with `target_repo`/`target_path` metadata must be executed in the target directory
2. Switch `workdir` to the target repo path for all tool calls on that task
3. "Different repo" / "out of scope" is NEVER a valid cancellation reason
4. If a task title hints at another repo but lacks metadata, confirm with the user via `question` tool

**Project config supports generic repo routing:**
```json
{
  "related_repos": [
    { "id": "backend", "path": "/home/user/dev/my-backend", "role": "API server" },
    { "id": "db", "path": "/home/user/dev/my-db", "role": "Database migrations" }
  ]
}
```

**Review and Harden gates block** if cross-repo tasks are incomplete or cancelled without approval.

### Cancellation Policy

**All task cancellations require explicit user approval.**

| BAD | GOOD |
|-----|------|
| `adv_task_update status: "cancelled"` | `adv_task_cancel` with user approval |
| Self-approve cancellation | Present reasons to user, get sign-off |
| Cancel cross-repo task as "out of scope" | Execute in target repo |

**Workflow:**
1. Agent identifies tasks to cancel with per-task reasons
2. Agent presents table to user via `question` tool
3. User approves (or rejects/reviews individually)
4. Agent calls `adv_task_cancel` with approval evidence

### Task Status Report

On loop stop or compaction: emit `[ADV:TASK_STATUS_REPORT]` with completed/cancelled/remaining tasks.
See: [docs/adv-task-report.md](docs/adv-task-report.md)

## 6-Gate Quality Checklist

| Gate | Triggered By |
|------|--------------|
| 1. `research` | `/adv-research` or Context7 |
| 2. `prep` | `/adv-prep` |
| 3. `implementation` | All tasks done |
| 4. `review` | `/adv-review` |
| 5. `harden` | `/adv-harden` |
| 6. `signoff` | User confirmation |

Gates are sequential. Archive blocks until all 6 satisfied.
See: [docs/adv-gates.md](docs/adv-gates.md)

**Gate behaviors:**
- `/adv-research` and `/adv-prep` evaluate the **full change including completed tasks**. Completed work is proof-of-concept evidence to validate, not acceptance proof. Findings apply regardless of task status — add targeted follow-up tasks where gaps are found. (See: Phase 1 recovery sections in `.opencode/command/adv-research.md` and `.opencode/command/adv-prep.md`.)
- `/adv-review` emits a `REVIEW_FINDINGS` block listing all actionable findings (`blocker`, `issue`, `suggestion`, `question`).
- `/adv-harden` **blocks** if any actionable review findings are unresolved and not documented as accepted debt in `proposal.md`. `nit:` findings are not required. Also runs a **non-destructive merge compatibility check** against the default branch before quality scanners — blocks on conflicts so they are caught early, not at archive time.
- `/adv-archive` **runs mandatory Phase 9 Git Finalization**: stage+commit all changes, detect default branch, merge (or open PR), verify merge is clean, clean up worktree, remove temp artifacts.

## Command Execution Model

Every ADV command runs in exactly one of two modes:

### Inline Commands

Execute entirely within the orchestrating agent session. No sub-agents spawned.

**Use inline when:**
- The command requires user dialogue (questions, confirmations, Socratic questioning)
- The command mutates ADV state (creates changes, adds tasks, updates status)
- The command performs git operations (commit, merge, worktree management)
- The work is sequential and context-dependent (TDD loops, gap analysis)

**Inline commands:** `/adv-status`, `/adv-proposal`, `/adv-validate`, `/adv-apply`, `/adv-archive`, `/adv-clarify`, `/adv-prep`, `/adv-coordinate`

### Orchestrator Commands

The agent orchestrates by spawning read-only sub-agents for parallel analysis, then synthesizes results inline. Sub-agents never mutate ADV state or spawn their own sub-agents.

**Use orchestration when:**
- Multiple independent analysis dimensions can run in parallel
- The work is read-heavy scanning/research across files or documentation
- Parallelism provides material speedup (3+ independent scan dimensions)
- Each sub-agent's scope is bounded and its output is structured JSON

**Orchestrator commands and their sub-agents:**

| Command | Sub-Agents | Agent Types | Why Delegated |
|---------|-----------|-------------|---------------|
| research | 2 | librarian + adv-researcher | Parallel docs lookup + architecture validation |
| review | 5 | explore × 5 | 5 independent review dimensions |
| harden | 5 | explore × 5 | 5 independent quality scanners |
| audit | 4 | explore × 4 | Staged spec→code→drift→conflict pipeline |
| slop-scan | up to 9 | explore × 9 | 9 independent smell category scanners |
| tron | 1 | tron | Specialized reconnaissance agent |
| task | 1-2 | librarian (+ adv-researcher if needed) | LBP validation via research orchestration |
| improve | 0 (inline) | — | Inline analysis with Context7; no sub-agents |
| refactor | 3 | explore × 3 | Drift + obsolescence + conflict scanning |

**Anti-recursion rule:** Sub-agents NEVER spawn sub-agents. The `enforceTaskPolicy` guard blocks nested Task tool calls. If a sub-agent needs deeper analysis, it performs it inline or returns a finding for the orchestrator to investigate.

## Sub-Agent Selection

When spawning sub-agents via the Task tool, select based on the task type:

| Agent | Use For | Tools |
|-------|---------|-------|
| `librarian` | Documentation, API references, code examples | Context7, grep.app, Kagi |
| `adv-researcher` | Architectural validation, simplicity analysis | Context7, Kagi, ADV read-only |
| `explore` | Codebase navigation, find usages | Read, Glob, Grep |
| `general` | Complex multi-step implementation | Full tool access |
| `tron` | Codebase reconnaissance, hotspot detection | Read, Glob, Grep, lgrep |

### Orchestrator Pattern

For parallel research: spawn `librarian` (docs) + `adv-researcher` (architecture validation) simultaneously, then synthesize.

## Worktree Integration

ADV uses **external mutable state** so that all worktrees of the same repo share changes, archive, wisdom, agenda, and the SQLite cache. Specs remain in-repo (`.adv/specs/`).

### External State Layout

Mutable state lives at `$XDG_DATA_HOME/opencode/plugins/advance/{project-id}/`:

```
{project-id}/
├── changes/          # Active change proposals
├── archive/          # Completed changes
├── db/spec.db        # SQLite FTS cache
├── wisdom.jsonl      # Project-level learnings
├── agenda.jsonl      # Work queue
└── handoff.json      # Session handoff (fallback, multi-session only)
```

**project-id** = root commit SHA (`git rev-list --max-parents=0 HEAD`), stable across all worktrees.

### Worktree Decision

```
┌─ Risk Assessment ──────────────────────────────────┐
│ 3+ files OR db schema, auth, shared types,         │
│ breaking API, structural refactor, spike work      │──→ Ask user ──→ Create ──→ Continue inline
│                                                    │
│ 1–2 files AND trivial changes                      │
│ OR docs-only / config                              │──→ Proceed in-place
└────────────────────────────────────────────────────┘
```

### Worktree Reuse Protocol

Before creating a new worktree, always check if one already exists for the target change:

```bash
git worktree list --porcelain
```

Parse for a worktree whose branch matches `change/{change-id}`. If found:

1. **Verify the path exists** on disk (the directory may have been manually deleted while the git record remains).
2. **If path exists (healthy)** — offer to reuse: switch `workdir` to the existing worktree path.
3. **If path does NOT exist (stale)** — run `git worktree prune` to clean up the stale record, then proceed as if no worktree existed.

This prevents duplicate worktrees for the same change and allows resuming work in an existing isolated workspace.

### Spec Divergence Rule

**Specs are branch-local; mutable ADV state is shared.**

| Data | Location | Shared Across Worktrees? |
|------|----------|--------------------------|
| Specs (`.adv/specs/`) | In-repo, git-tracked | No — each worktree sees its own branch's version |
| Changes, archive, wisdom, agenda | External (`~/.local/share/...`) | Yes — keyed by project-id |
| Handoff | External | Yes |

**Implication:** If a spec is modified in worktree A (e.g., via `/adv-archive` applying deltas), worktree B will NOT see the updated spec until the change branch is merged to the default branch and worktree B pulls or rebases.

**When this matters:**
- Running `/adv-validate` in worktree B may validate against stale specs if worktree A has already archived a change that modified those specs.
- Running `/adv-audit` in worktree B may report false drift if specs were updated in worktree A but not yet merged.

**Mitigation:** After archiving a change that modifies specs, merge the change branch to the default branch promptly. `/adv-archive` Phase 9 handles this automatically.

### Inline Worktree Protocol (Default)

When a worktree is created during an active ADV change, continue in the same agent session:

1. **Emit navigation hint BEFORE creating the worktree** — `worktree_create` may open a new tmux window and shift focus, so the user must see navigation keys in the current window first:
   ```
   Creating worktree for change/{change-id}...

   A new tmux tab may open. To navigate back here:
     • Ctrl+b l          — last (previously active) window
     • Ctrl+b n / p      — next / previous window
     • Ctrl+b w          — interactive window chooser
     • oc switch         — switch between openchad sessions

   Implementation continues inline in this session via workdir.
   ```
2. **Create worktree** via `worktree_create`
3. **Capture worktree path** from tool output and confirm:
   ```
   ✅ Worktree ready: {worktree-path}
   Branch: change/{change-id}
   ```
4. **Switch execution context** by setting `workdir` to the worktree path for subsequent tool calls
5. **Continue implementation inline** in the same conversation/session

No session handoff is required for the default flow.

### Session Handoff Protocol (Fallback)

Use handoff only when explicitly using multi-session workflows (for example, a separate OpenCode session):

1. **Parent session** writes `handoff.json` with `{changeId, currentTaskId, gateStatus, objective}`
2. **Child session** reads and clears `handoff.json` on startup, hydrating `PluginState.activeChange`
3. **system.transform** injects `[ADV:WORKTREE_SESSION]` marker with full change context

### Worktree Cleanup Protocol

**`/adv-archive` handles git finalization automatically** via its mandatory Phase 9. This includes staging+committing all changes, merging to the default branch, verifying the merge is clean, and deleting the worktree.

Phase 9 steps (run automatically after archive):
1. Stage and commit all modified files
2. Detect default branch (`main` / `trunk` / remote HEAD)
3. Merge `change/{change-id}` to default branch (or push + open PR)
4. Verify merge: `git log --oneline {default}..change/{change-id}` must return empty
5. Delete worktree via `worktree_delete` (gracefully skipped if tool unavailable)
6. Remove temp artifacts (`.bak`, `.tmp`, `.orig`)

**Never delete a worktree with unmerged commits.** Phase 9 enforces this — it will not call `worktree_delete` until the merge is verified clean.

### Graceful Degradation

If `worktree_create`/`worktree_delete` tools are not installed, commands skip Phase 0 with:
```
[ADV:INFO] Worktree tools not available — proceeding with in-place implementation.
```
All other ADV functionality works identically.

## When to Use ADV

**Use for:** New features, breaking changes, architecture, compliance
**Skip for:** Bug fixes, typos, deps, exploration
