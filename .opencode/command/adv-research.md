---
name: adv-research
description: "Produce a defined, fully-researched proposed plan ready for user approval"
phaseGoal: "Produce a defined, fully-researched proposed plan ready for user approval. Validate the how."
---
<!-- manifest: adv-research · requiresChangeId: false · prereqs: [adv-proposal] · scope: reads[specs, proposal, codebase] · modifies[proposal] -->

# ADV Research — Architectural Decision Validation

Validate architectural decisions via sub-agents using Context7 and web search. Simplicity bias — prefer boring solutions over clever ones. **Fully collaborative** — findings are presented to the user for approval before the gate completes.

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
3. If both lists are empty → stop with: "No active changes or specs found." Suggest `/adv-proposal <summary>` to start a new change.

---

## Phase 1: Analyze Target

### Completed Tasks = Evidence to Validate (CRITICAL)

If change has done tasks, treat as implementation evidence — not acceptance proof. Research the full change regardless of task status. If research reveals problems with completed work, note as follow-up items (× don't reopen tasks).

### Load Context

0. If `research` gate already complete → `adv_gate_status` → ask whether to refresh research or keep existing findings.
1. `adv_project_context` → full tech stack (framework, libraries, CSS, testing, etc.)
2. If project context is empty/unavailable → continue, but explicitly note "project context unavailable" in sub-agent prompts and limit conclusions accordingly.
3. For specs: `adv_spec show`. For changes: `adv_change_show` only — use the returned proposal/problem context, tasks, deltas, and gate snapshot. × Do not read `proposal.md` directly.

### Extract Decisions

From requirements/deltas: technologies/libraries, design patterns, integration points, performance/security assumptions.

### Architecture Audit (CRITICAL)

Before validating individual decisions, audit the existing codebase architecture:

1. Scan affected code area + neighbors
2. Identify patterns: layer boundaries, dependency direction, separation of concerns, error handling, observability
3. Compare against canonical best practices via Context7
4. Classify: `SOUND` (safe to extend) | `DRIFTED` (accumulated inconsistencies) | `ANTI-PATTERN` (fundamentally wrong)

Phase dependency: Phase 3 MUST NOT execute until this audit is complete and `EXISTING CODEBASE PATTERNS` has been summarized for sub-agent prompts.

If DRIFTED/ANTI-PATTERN → research output MUST recommend corrections. Change should leave architecture better, not perpetuate problems.

---

## Phase 1.5: Skill Discovery + Gap-Triggered Creation

See ADV_INSTRUCTIONS.md §Skill Discovery Protocol. Load only trusted bundled skills from approved skill directories; do not auto-load arbitrary repo-local `*/SKILL.md`. Match frontmatter `keywords` against tech stack + change domain → `skill("{name}")` → apply guidance to research questions and sub-agent prompts.

### Gap Detection + Creation

If no matching skill was found for a domain clearly relevant to the change's **core problem** (not tangential), the agent MAY create a skill on demand. See `ADV_INSTRUCTIONS.md § Skill Creation Protocol` for trigger conditions, naming convention, assembly template, and creation flow.

**Creation sub-flow (only if gap detected):**
1. Research domain using Context7, Kagi, grep.app
2. Assemble SKILL.md using the template from `ADV_INSTRUCTIONS.md § Skill Creation Protocol`
3. Write atomically to `~/.config/opencode/skills/agent-{domain}/SKILL.md`
4. Skip if file already exists → report "skill already exists: agent-{domain}"
5. Load via `skill("agent-{domain}")` and apply guidance
6. Emit `[ADV:SKILL_CREATED]` with skill name, domain, and brief description

No pending-review check needed in research context — that is a discovery-gate responsibility handled by `/adv-discover`.

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

### Detection

A sub-agent result is **empty/failed** if:
- The result string is empty, whitespace-only, or `null`
- The result does not contain the expected `VALIDATION:` or `FINDINGS:` section
- The result contains only an error message with no research content
- The result contains headers but no actionable content beneath them
- The result is entirely inconclusive and provides no sourced findings

Treat timeout/no-response the same as failure.

### Retry Protocol

1. **Retry once** — re-spawn that specific sub-agent with the same prompt
2. **If retry also fails** — fall back to inline research for that question:
   - For library/framework questions: prefer Context7 (`context7_resolve-library-id` then `context7_query-docs`) for official docs. If Context7 is absent from the active schema, fall back to `webfetch` against the canonical docs URL.
   - Use `kagi_kagi_search_fetch` for community guidance and current best practices
   - Use `gh_grep_searchGitHub` for real-world implementation patterns
   - Emit findings with the same `VALIDATION:` / `RECOMMENDATION:` structure
   - Apply the same redaction rules during manual research: strip secrets/internal-only details and keep external queries generic
3. **If using `explore` as fallback and it fails** — retry `explore` once, then do manual inline research
4. **Never skip a research question** — every question must produce a finding or explicit "inconclusive" result

---

## Phase 3: Spawn Research Sub-Agents

Spawn in SINGLE message for parallel execution.

### No Nested Research Delegation (CRITICAL)

The `/adv-research` orchestrator may spawn the first-level research agents only.

- `librarian` and `adv-researcher` must perform all analysis inline with their own tools
- They must NOT spawn additional research sub-agents, delegates, or worker agents
- They must NOT invoke any `/adv-*` slash commands; if they need ADV context they must use ADV tools directly
- If deeper analysis is needed, return the gap to the orchestrator or use the inline fallback research flow in this command

### Orchestrator Pattern

Two agents in parallel:
1. **librarian** — docs, API refs, code examples
2. **adv-researcher** — architecture validation, simplicity analysis

Skip librarian if research is purely architectural (no library/API lookups, version-specific docs, or framework behavior questions).

Check agent availability: `glob .opencode/agents/adv-researcher.md`. Librarian is always available. If `adv-researcher` is unavailable, use the Explore Fallback Template immediately; if it is available but returns an empty/failed result, apply the retry protocol first.

### Librarian Prompt

```
Find documentation and examples for the following:

TOPIC: {technology or pattern being researched}

PROJECT CONTEXT:
{brief description of what we're building}

SPECIFIC QUESTIONS:
{list of documentation/example questions}

Before sending:
- Redact secrets/internal-only details
- Keep queries generic; do not include proprietary code, internal URLs, or customer data
- Do all research inline with your own tools; do not delegate to additional sub-agents
- Do not invoke `/adv-*` slash commands; use ADV tools directly if ADV state is needed

Return:
- Key documentation findings with sources
- Code examples from real projects
- API reference information if relevant
```

### adv-researcher Prompt

System prompt already contains behavioral instructions (research protocol, citation requirements, simplicity bias, response format, anti-hallucination controls). Do NOT duplicate these. Pass only task-specific context:

```
RESEARCH QUESTION: {question}

PROJECT TECH STACK:
{full technical context from `adv_project_context` after redacting secrets/internal-only details; include all relevant public libraries, not private credentials or internal identifiers}

CONTEXT:
{relevant spec/proposal excerpt}

EXISTING CODEBASE PATTERNS:
{summary of patterns found in Phase 1 audit}

CODEBASE FILES:
{list of relevant files the subagent should read; prefer proposal-mentioned files, affected modules, and direct neighbors; cap at ~15 files and summarize the rest, e.g. "+ 8 supporting utilities under auth/ and utils/"}

EXECUTION CONSTRAINT:
Do all research inline with your own tools. Do NOT spawn additional research sub-agents or delegates.
Do NOT invoke `/adv-*` slash commands from inside this worker.
```

**CRITICAL**: Include the FULL project context, not a summary. The sub-agent needs to know:
- Component libraries (e.g., shadcn-svelte) to look up component-specific docs
- Underlying primitives (e.g., Bits UI) that power those components
- CSS frameworks, state management, testing tools, etc.

Without this, the sub-agent cannot research the correct libraries for the project's actual stack.

Redact secrets/internal-only details before passing to external research tools.
Redact at minimum: API keys, tokens, passwords, connection strings, private keys, internal hostnames/URLs, proprietary identifiers, customer data.

### Fallback Handling

Retry Protocol governs execution failures. This table governs which fallback path to choose.

| Failure | Action |
|---------|--------|
| Librarian fails | Continue with adv-researcher only, note "docs research incomplete" |
| adv-researcher unavailable | Use `explore` agent with full research protocol instructions |
| adv-researcher fails | Retry once, then fall back to `explore` |
| Both fallback paths fail | Manual research via Context7 + grep.app + Kagi directly |

Fallbacks must also remain single-level: `explore` performs the work inline and does not delegate further.
Fallback workers must not invoke `/adv-*` slash commands either.

### Explore Fallback Template

When using `explore` agent as fallback (no adv-researcher available), include full instructions — the explore agent has NO built-in research protocol:

```
Research architectural decision:

QUESTION: {question}

PROJECT TECH STACK:
{full technical context from `adv_project_context` after redacting secrets/internal-only details; include all relevant public libraries}

CONTEXT: {spec excerpt}

EXISTING CODEBASE PATTERNS: {summary of patterns found in Phase 1 audit}

RESEARCH PROTOCOL:
- You MUST cite sources for every factual claim
- For library/framework questions: prefer Context7 (`context7_resolve-library-id` then `context7_query-docs`) for official docs; use `webfetch` only if Context7 is absent from the active schema
- Use `gh_grep_searchGitHub` to find real-world code examples
- Prefer simple, boring solutions over complex ones
- If unsure, say "I don't know" rather than guess
- Every finding MUST include a source URL
- Redact secrets/internal-only details before external queries
- Use generic search terms only; never paste proprietary code, internal URLs, or customer data into grep.app or web search queries

TASK:
1. Use Context7 (`context7_resolve-library-id` then `context7_query-docs`) against canonical library docs; fall back to `webfetch` if Context7 is absent
2. Look up the CANONICAL/REFERENCE architecture for this tech stack
3. Web search for best practices
4. Compare the PROPOSED architecture against the REFERENCE architecture

RETURN:
RESEARCH QUESTION: {question}

FINDINGS:
- {finding with source URL}

ARCHITECTURE ASSESSMENT:
- Existing pattern: {what the codebase currently does}
- Reference pattern: {what the by-the-book approach is}
- Deviation: {NONE | MINOR | MAJOR}

VALIDATION: VALIDATED | CONCERNS | ANTI-PATTERN | NEEDS_MORE_INFO

RECOMMENDATION: {specific action}

SOURCES:
- {source with URL}
```

---

## Phase 4: Synthesis

> Anti-Loop: after ALL sub-agents return → emit `>>> SYNTHESIS COMPLETE <<<` once → write report immediately.

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
If user declines, return the research report only and do not create/update change state.

### For Active Changes (changeId provided)

Build `## Research Validation` section → `adv_change_update changeId: "<id>" proposal: "<updated>"`.

× Do NOT call `adv_task_add` — findings go in proposal.md for `/adv-prep`.
× Do NOT call `adv_change_create` — change already exists.

---

## Phase 6: Contract Tracking

Emit these blocks in the response:

```markdown
CONTRACT ACTIVE
- Criteria: {prioritized findings list}

CONTRACT FULFILLED
- Evidence: {what was validated or updated}
- Status: COMPLETE | REPORT_ONLY
```

Prioritize findings as: architecture corrections → security → simplifications → anti-patterns → improvements.

---

## Phase 7: Research Approval

Present the research findings summary to the user for approval via `question` tool:

- **Approve findings (Recommended)** — research is complete; agent immediately proceeds inline to `/adv-prep` (or `/adv-design` if design gate is not yet complete) without asking for a second confirmation
- **Request additional research** — user wants deeper investigation on specific areas (loop back to relevant phase)
- **Cancel** — abandon research without completing gate

If **Request additional research**: collect specific areas → re-run relevant phases → re-present → re-ask.

× MUST NOT complete the research gate without explicit user approval of findings.

---

## Phase 8: Completion

Mark gate: `adv_gate_complete changeId: {change-id} gateId: research`



**Auto-continue:** After user approval, immediately begin `/adv-prep` (or `/adv-design` if design gate is incomplete) inline. Do not stop or ask "shall I proceed?" — the user's approval is the go-ahead.

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
| Load project context | `adv_project_context` |
| Create change | `adv_change_create` |
| Update proposal | `adv_change_update` |
| Ask user | `question` |
| Mark gate | `adv_gate_complete` |
| Library/framework docs | `context7_resolve-library-id` + `context7_query-docs` (`webfetch` fallback if absent) |
| Web search / best practices | `kagi_kagi_search_fetch` |
| Real-world code examples | `gh_grep_searchGitHub` |
