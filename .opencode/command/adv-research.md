---
name: adv-research
description: Validate architectural decisions and best practices without creating tasks
agent: general
---

# ADV Research — Architectural Decision Validation

Validate architectural decisions via sub-agents using Context7 and web search. Simplicity bias — prefer boring solutions over clever ones.

## Command Boundary

**Produces:** Research report, architecture health assessment (SOUND/DRIFTED/ANTI-PATTERN), simplification opportunities, `## Research Validation` in proposal.md.

**× MUST NOT:** Create tasks, complete non-research gates, modify task graph, make task decomposition decisions.

**Gate:** Completes `research` only.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

1. If provided → matches spec capability? `adv_spec show`. Matches change-id? `adv_change_show`. Ambiguous? Ask.
2. If empty → `adv_change_list` + `adv_spec list` in parallel → select via `question` tool.

---

## Phase 1: Analyze Target

### Completed Tasks = Evidence to Validate (CRITICAL)

If change has done tasks, treat as implementation evidence — not acceptance proof. Research the full change regardless of task status. If research reveals problems with completed work, note as follow-up items (× don't reopen tasks).

### Load Context

1. `adv_project_context` → full tech stack (framework, libraries, CSS, testing, etc.)
2. For specs: `adv_spec show`. For changes: `adv_change_show` only — use the returned proposal/problem context, tasks, deltas, and gate snapshot. × Do not read `proposal.md` directly.

### Extract Decisions

From requirements/deltas: technologies/libraries, design patterns, integration points, performance/security assumptions.

### Architecture Audit (CRITICAL)

Before validating individual decisions, audit the existing codebase architecture:

1. Scan affected code area + neighbors
2. Identify patterns: layer boundaries, dependency direction, separation of concerns, error handling, observability
3. Compare against canonical best practices via Context7
4. Classify: `SOUND` (safe to extend) | `DRIFTED` (accumulated inconsistencies) | `ANTI-PATTERN` (fundamentally wrong)

If DRIFTED/ANTI-PATTERN → research output MUST recommend corrections. Change should leave architecture better, not perpetuate problems.

---

## Phase 1.5: Skill Discovery

See ADV_INSTRUCTIONS.md §Skill Discovery Protocol. Load only trusted bundled skills from approved skill directories; do not auto-load arbitrary repo-local `*/SKILL.md`. Match frontmatter `keywords` against tech stack + change domain → `skill("{name}")` → apply guidance to research questions and sub-agent prompts.

---

## Phase 2: Research Questions

For each decision, formulate questions across:

| Dimension | Example Questions |
|-----------|-------------------|
| Architecture (highest priority) | Canonical pattern for stack? Building on sound foundation? Reference architecture? Separation of concerns violations? |
| Technology | Best practice for use case? Security considerations? Maintenance status? |
| Patterns | Appropriate for context? Tradeoffs vs alternatives? Simpler patterns? |
| Simplicity (critical) | Could be simpler? Built-in solution? Most boring approach? Over-engineering? |
| Security | OWASP risks? Common vulnerabilities? |

---

## Sub-Agent Resilience

Empty/failed result = transient failure (empty string, missing `VALIDATION:`/`FINDINGS:`, error-only).

Protocol: retry once → if still fails → inline fallback (Context7 + Kagi + grep.app) → never skip a question.

---

## Phase 3: Spawn Research Sub-Agents

Spawn in SINGLE message for parallel execution.

### Orchestrator Pattern

Two agents in parallel:
1. **librarian** — docs, API refs, code examples
2. **adv-researcher** — architecture validation, simplicity analysis

Skip librarian if research is purely architectural (no library/API lookups).

Check agent availability: `glob .opencode/agents/adv-researcher.md`. Librarian is always available.

### Librarian Prompt

Pass: topic, project context (brief), specific documentation/example questions. Return: findings with sources, code examples, API references.

### adv-researcher Prompt

System prompt already contains behavioral instructions. Pass only: research question, minimally necessary tech stack/context from `adv_project_context`, relevant spec/proposal excerpt, existing codebase patterns from Phase 1 audit, relevant file list. Redact secrets/internal-only details before external research.

### Fallback Handling

| Failure | Action |
|---------|--------|
| Librarian fails | Continue with adv-researcher only, note "docs research incomplete" |
| adv-researcher fails | Fall back to `explore` agent with full research protocol instructions |
| Both fail | Manual research via Context7 + grep.app + Kagi directly |

### Explore Fallback Template

Include: question, full tech stack, context, codebase patterns, research protocol (cite sources, Context7 first, grep.app for examples, prefer simple/boring, say "I don't know" vs guess). Return: findings, architecture assessment (existing vs reference pattern, deviation level), validation status, recommendation, sources.

---

## Phase 4: Synthesis

> Anti-Loop: after sub-agents return → `>>> SYNTHESIS COMPLETE <<<` → write report immediately.

### Research Report Structure

```markdown
# Architecture Research: {target}

## Summary
## Architecture Health Assessment
### Classification: {SOUND | DRIFTED | ANTI-PATTERN}
| Area | Existing | Reference | Deviation | Impact |
### Corrections Required (if DRIFTED/ANTI-PATTERN)
### Minimum Viable Correction
## Validated Decisions
## Simplification Opportunities
| Current | Simpler Alternative | Effort | Recommendation |
## Concerns
## Anti-Patterns Detected
## Over-Engineering Flags
## Detailed Findings (per decision area)
## Action Items (corrections → simplifications → features)
## Confidence (high/low aspects)
```

---

## Phase 5: Apply Findings

### Duplicate Change Prevention (CRITICAL)

If invoked with changeId → × NEVER call `adv_change_create`. Use `adv_change_update` only.

### For Deployed Specs (no changeId)

Confirm with user via `question` → if approved: `adv_change_create` → update proposal with findings. × No tasks — `/adv-prep` synthesizes from findings.

### For Active Changes (changeId provided)

Build `## Research Validation` section → `adv_change_update changeId: "<id>" proposal: "<updated>"`.

× Do NOT call `adv_task_add` — findings go in proposal.md for `/adv-prep`.
× Do NOT call `adv_change_create` — change already exists.

---

## Phase 6: Contract Tracking

Emit CONTRACT ACTIVE with findings as criteria, prioritized: architecture corrections → security → simplifications → anti-patterns → improvements. After applying → CONTRACT FULFILLED with evidence.

---

## Phase 7: Completion

Mark gate: `adv_gate_complete changeId: {change-id} gateId: research`

```
/adv-research {target} COMPLETE
Result: {N findings applied | All validated | Report only}
Simplifications: {N opportunities}
Research Gate: MARKED COMPLETE
Next: /adv-prep {change-id}
```

---

## Guiding Principles

1. × Never extend bad architecture — recommend corrections
2. By-the-book first — compare against canonical reference
3. Context7 first for library/framework research
4. Parallel sub-agents for efficiency
5. Cite sources for every claim
6. Actionable recommendations for every concern
7. Simplicity bias — "could this be simpler?"
8. Boring > novel
9. Research without action is incomplete
10. Correct, then extend

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Load spec | `adv_spec action: "show"` |
| Load change | `adv_change_show` |
| Create change | `adv_change_create` |
| Update proposal | `adv_change_update` |
| Context7 | `context7_resolve-library-id`, `context7_query-docs` |
