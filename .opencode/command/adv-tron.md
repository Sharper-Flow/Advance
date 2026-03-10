---
name: adv-tron
description: Investigate codebase structure, hotspots, risks, and suggest follow-up agenda candidates
agent: general
---

# ADV Tron — Codebase Reconnaissance

Investigate the codebase at large or a specific target to map structure, identify hotspots, surface risks, and suggest follow-up work. Read-only — never modifies files or ADV state.

<UserRequest>
  $ARGUMENTS
</UserRequest>

---

## Argument Handling

`$ARGUMENTS` is **always optional**. `/adv-tron` supports two investigation modes:

| Invocation | Behaviour |
|------------|-----------|
| `/adv-tron` (no args) | Broad reconnaissance of the entire repository |
| `/adv-tron <target>` | Scoped investigation of a specific file, module, symbol, or theme |

**Target interpretation rules:**

| Target looks like | Resolution |
|-------------------|------------|
| File path (`src/tools/task.ts`) | Read and analyze that file directly |
| Directory (`src/tools/`) | Outline and analyze all files in it |
| Symbol name (`createStore`) | Search for the symbol and analyze its context |
| Concept or theme (`error handling`, `auth flow`) | Semantic search and analyze matches |
| Ambiguous | Try semantic → symbol → text search, report what was found |

---

## Exits

| Exit | Condition |
|------|-----------|
| ✅ Report delivered | Findings synthesized and presented with agenda suggestions |
| 🎤 Clarification needed | Target is too ambiguous to investigate meaningfully |

---

## Phase 1: Load Tron Skill

Load the Tron investigation skill to get the full reconnaissance protocol:

```
skill("adv-tron")
```

If the skill is unavailable, continue with the embedded protocol in this command file rather than aborting the investigation.

This provides:
- Investigation protocol for broad and scoped modes
- Search tool priority order
- Evidence requirements
- Report schema
- Constraints and anti-patterns

---

## Phase 2: Determine Investigation Mode

Parse `$ARGUMENTS`:

- **Empty or whitespace-only** → Broad mode (full repository scan)
- **Non-empty** → Scoped mode (target-specific investigation)

Emit the mode:

```
[ADV:ROCKET]
Tron reconnaissance: {broad scan | scoped investigation of "{target}"}
```

---

## Phase 3: Gather Context

Before spawning Tron, gather baseline context:

### Step 3.1: ADV State

```
adv_project_context
adv_change_list
adv_agenda_list
```

Note any active changes, pending agenda items, or project conventions that are relevant to the investigation.

### Step 3.2: Determine Scope

**Broad mode:**
- Get repo file tree via `lgrep_get_file_tree`
- Note total file count and directory structure

**Scoped mode:**
- Normalize the target using the resolution rules above
- Confirm the target resolves to at least one concrete file or symbol
- If the target cannot be resolved, use the `question` tool to clarify:

```json
{
  "questions": [{
    "header": "Tron Target",
    "question": "Could not resolve target '{target}' to any files or symbols. What did you mean?",
    "options": [
      { "label": "It's a file path", "description": "Treat it as a path and search for matching files" },
      { "label": "It's a concept", "description": "Search semantically for this theme across the codebase" },
      { "label": "Abort", "description": "Cancel the investigation" }
    ]
  }]
}
```

---

## Phase 4: Spawn Tron Sub-Agent

Spawn the `tron` agent via the Task tool. The agent's system prompt already contains all behavioral instructions from `.opencode/agents/tron.md`.

Pass only task-specific context:

### Broad Mode Template

```
Investigate this repository broadly.

INVESTIGATION MODE: broad
REPOSITORY ROOT: {directory}

PROJECT CONTEXT:
{output from adv_project_context}

ACTIVE ADV STATE:
- Changes: {summary of active changes}
- Agenda: {summary of pending agenda items}
- Specs: {list of capability specs}

REPO STRUCTURE:
{file tree summary — top-level directories and file counts}

TASK:
1. Map the overall architecture and module boundaries
2. Identify hotspots (high complexity, large files, deep nesting)
3. Note recurring patterns and conventions
4. Flag risks (missing tests, unclear ownership, stale code)
5. Check for drift between specs and implementation
6. Suggest possible follow-up agenda items

Return findings using the TRON RECONNAISSANCE REPORT format.
Cap findings at 10.
```

### Scoped Mode Template

```
Investigate a specific target in this repository.

INVESTIGATION MODE: scoped
TARGET: {normalized target description}
RESOLVED FILES: {list of concrete files/symbols the target resolved to}
REPOSITORY ROOT: {directory}

PROJECT CONTEXT:
{output from adv_project_context}

ACTIVE ADV STATE:
- Changes: {summary of active changes touching this area}
- Specs: {any specs related to this target}

TASK:
1. Deep-read the target files and understand their behavior
2. Trace dependencies — what the target uses and what uses it
3. Find related/sibling code and coupled components
4. Assess complexity, test coverage, and change risk
5. Check if any ADV changes or specs touch this area
6. Suggest possible follow-up agenda items

Return findings using the TRON RECONNAISSANCE REPORT format.
Cap findings at 15.
```

---

## Phase 5: Synthesize Report

After the Tron sub-agent returns, synthesize the final report.

### Step 5.1: Validate Findings

- Verify each finding has file references
- Remove any findings without evidence
- Deduplicate overlapping findings

### Step 5.2: Emit Final Report

Present the full TRON RECONNAISSANCE REPORT as defined in the skill:

```
============================================================
                TRON RECONNAISSANCE REPORT
============================================================

TARGET: {target description or "Full repository"}
SCOPE: {files examined} files across {directories} directories

FINDINGS:
  1. [{category}] {title}
     {description}
     Evidence: {file:line references}
     Confidence: {high|medium|low}

  ...

HOTSPOTS:
  - {file or module} — {why}

RISKS:
  - {risk} — {file references}

OPEN QUESTIONS:
  - {question needing human input}

POSSIBLE AGENDA ITEMS:
  These are suggestions only — not created automatically.

  - {title}
    Why: {rationale}
    Priority: {critical|high|medium|low|backlog}

SUGGESTED NEXT COMMANDS:
  - /adv-proposal "{summary}" — if findings warrant a formal change
  - /adv-task — if the follow-up is already well-understood
  - /adv-audit {capability} — if drift was detected
  - /adv-tron {deeper-target} — if a finding needs deeper investigation

============================================================
```

### Step 5.3: Offer Follow-Up

If the report contains actionable agenda suggestions, offer to discuss them:

```
[ADV:EARTH]
Tron reconnaissance complete. {N} findings, {M} possible agenda items suggested.

To act on any suggestion, you can:
  - /adv-proposal "{summary}" to start a formal change
  - /adv-task to fast-track from this conversation
  - /adv-tron {target} to investigate a finding deeper
```

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Load skill | `skill("adv-tron")` |
| Project context | `adv_project_context` |
| Active changes | `adv_change_list` |
| Agenda state | `adv_agenda_list` |
| Repo structure | `lgrep_get_file_tree`, `lgrep_get_repo_outline` |
| Spawn Tron | Task tool with `tron` agent |

## Constraints

- **Read-only** — this command never writes files or mutates ADV state
- **No agenda creation** — agenda items are suggested in human-readable form only
- **No change creation** — if follow-up is needed, the user decides which command to run
- **Bounded output** — 10 findings max (broad), 15 findings max (scoped)
