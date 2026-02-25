---
name: adv-research
description: Research and validate architectural decisions using sub-agents and Context7
agent: general
---

# ADV Research - Architectural Decision Validation

Spawn sub-agents to research and validate architectural decisions in specs/changes using Context7 and web search. Applies simplicity bias - prefer boring solutions over clever ones.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

Determine target (spec OR change):

1. **If $ARGUMENTS provided**:
   - Matches spec capability? Use `adv_spec_show`
   - Matches change-id? Use `adv_change_show`
   - Ambiguous? Ask for clarification
2. **If empty**: 
   - Call `adv_change_list` and `adv_spec_list` in parallel
   - Present selection via the `question` tool

---

## Phase 1: Analyze Target

### Load Context

**Step 1: Load Project Context (REQUIRED)**

Always load the full project context first:
```
adv_project_context
```

This provides the complete tech stack including:
- Primary framework (e.g., SvelteKit, Next.js)
- Component libraries (e.g., shadcn-svelte, Radix)
- Underlying primitives (e.g., Bits UI, Headless UI)
- CSS approach (e.g., Tailwind, CSS Modules)
- State management, testing tools, etc.

**Step 2: Load Target**

For specs:
```
adv_spec_show capability: <name>
```

For changes:
```
adv_change_show change_id: <id>
```

Also read `proposal.md` for design context.

### Extract Architectural Decisions

Identify from requirements/deltas:
1. **Technologies/libraries** referenced
2. **Design patterns** described
3. **Integration points** with external systems
4. **Performance/security assumptions**

### Existing Architecture Audit (CRITICAL)

Before validating individual decisions, audit the **existing codebase architecture** that the change builds upon. The goal is to determine whether the change is **extending a bad pattern** or **moving toward best practices**.

1. **Scan the affected code area** - Read the files the change touches and their neighbors
2. **Identify existing architectural patterns** in use:
   - Layer boundaries (controller → service → repository)
   - Dependency direction (do dependencies point inward?)
   - Separation of concerns (is business logic mixed with I/O?)
   - Error handling strategy (consistent? ad-hoc?)
   - Observability patterns (where do logs/traces/metrics live?)
3. **Compare against by-the-book best practices** for the project's tech stack:
   - Use Context7 to look up canonical architecture patterns for the framework
   - Compare actual structure vs. recommended structure
4. **Classify the existing architecture**:
   - `SOUND` — Follows best practices, safe to extend
   - `DRIFTED` — Was good, has accumulated inconsistencies
   - `ANTI-PATTERN` — Fundamentally wrong, extending it makes things worse

**If DRIFTED or ANTI-PATTERN**: The change MUST NOT simply add to the existing structure. Instead, the research output MUST recommend modifications to steer the change toward best-practice architecture. The change should leave the architecture *better* than it found it, not perpetuate existing problems.

Document findings in the research report under `## Architecture Health Assessment`.

---

## Phase 2: Generate Research Questions

For each decision, formulate questions across these dimensions:

### Architecture Correctness (HIGHEST PRIORITY)
- "Does {approach} follow the canonical architecture for {framework/stack}?"
- "Is this change building on a sound architectural foundation, or extending an anti-pattern?"
- "What does the by-the-book reference architecture look like for this use case?"
- "Where does {pattern} violate separation of concerns, dependency direction, or layer boundaries?"
- "If the existing code structure is wrong, what would the correct structure look like?"

### Technology Validation
- "Is {library} best practice for {use case}?"
- "What are security considerations for {technology}?"
- "What's the maintenance status of {library}?"

### Pattern Validation
- "Is {pattern} appropriate for {context}?"
- "What are trade-offs of {approach} vs alternatives?"
- "Are there simpler patterns that achieve the same goal?"

### Simplicity Analysis (Critical)
- "Could {approach} be simpler?"
- "Does {library} have built-in solution for this?"
- "What's the most boring, proven approach?"
- "Are we over-engineering?"

### Security Considerations
- "What OWASP risks apply to {approach}?"
- "What are common vulnerabilities in {technology}?"

---

## Phase 3: Spawn Research Sub-Agents

Use SINGLE response with MULTIPLE Task calls (parallel execution).

### Orchestrator Pattern (Recommended)

When researching, spawn TWO agents in parallel for best results:

1. **librarian** - Documentation lookups, API references, code examples
2. **adv-researcher** - Architectural validation, simplicity analysis

This follows the industry-standard orchestrator-worker pattern where the command orchestrates and agents specialize.

### Agent Detection

Check which agents are available:

```
Use glob tool: .opencode/agents/adv-researcher.md
```

The global `librarian` agent is always available (defined in `~/.config/opencode/agents/`).

### Parallel Research Spawning

**CRITICAL: Spawn BOTH agents in a SINGLE message for parallel execution.**

Split research questions by agent specialty:

| Question Type | Agent | Examples |
|--------------|-------|----------|
| Documentation lookup | `librarian` | "How to use X", "API params for Y", "Examples of Z" |
| Architecture validation | `adv-researcher` | "Is this the right pattern?", "Could this be simpler?" |
| Best practices | Both | Librarian finds docs, Researcher validates |

### When to Skip Librarian

**Skip librarian spawning if the research is purely architectural with no library/API lookups:**

| Research Type | Spawn librarian? | Example |
|---------------|------------------|---------|
| "Is this design pattern correct?" | No | Internal architecture review |
| "Could this be simpler?" | No | Complexity analysis |
| "How to use library X?" | **Yes** | Documentation lookup needed |
| "Best practices for pattern Y?" | **Yes** | Need external references |
| "Compare our approach to industry standard" | **Yes** | Need reference implementations |

**Decision heuristic**: If the research involves:
- Specific libraries, frameworks, or APIs → Spawn librarian
- Internal architecture or design patterns → adv-researcher only
- Both external docs AND internal validation → Spawn both

### Librarian Sub-Agent Template

```
Find documentation and examples for the following:

TOPIC: {technology or pattern being researched}

PROJECT CONTEXT:
{brief description of what we're building}

SPECIFIC QUESTIONS:
{list of documentation/example questions}

Return:
- Key documentation findings with sources
- Code examples from real projects
- API reference information if relevant
```

### adv-researcher Sub-Agent Template

When using `adv-researcher` agent, the system prompt already contains all behavioral instructions. Only pass task-specific context:

```
RESEARCH QUESTION: {question}

PROJECT TECH STACK:
{full content from adv_project_context - include ALL libraries, not just the primary framework}

CONTEXT:
{relevant spec/proposal excerpt}

EXISTING CODEBASE PATTERNS:
{summary of patterns found in Phase 1 audit}

CODEBASE FILES:
{list of relevant files the subagent should read}
```

**CRITICAL**: Include the FULL project context, not a summary. The sub-agent needs to know:
- Component libraries (e.g., shadcn-svelte) to look up component-specific docs
- Underlying primitives (e.g., Bits UI) that power those components
- CSS frameworks, state management, testing tools, etc.

Without this, the sub-agent cannot research the correct libraries for the project's actual stack.

The agent's system prompt handles:
- Research protocol (Context7 → grep.app → Kagi → arxiv)
- Citation requirements
- Simplicity bias
- Response format
- Anti-hallucination controls

### Fallback Handling

**If librarian agent fails or times out:**
1. Log: "Librarian agent unavailable, continuing with adv-researcher only"
2. Proceed with adv-researcher results
3. Note in synthesis: "Documentation research incomplete - manual lookup may be needed"

**If adv-researcher fails:**
1. Log: "adv-researcher agent unavailable, falling back to explore with research protocol"
2. Use the Fallback Sub-Agent Template below
3. Spawn librarian normally for documentation

**If both fail:**
1. Log: "All research agents unavailable"
2. Emit warning in report: "Research incomplete - no sub-agents available"
3. Do manual research using Context7, grep.app, Kagi directly

### Fallback Sub-Agent Template

When using `explore` agent as fallback (no adv-researcher.md), include full instructions:

```
Research architectural decision:

QUESTION: {question}

PROJECT TECH STACK:
{full content from adv_project_context - include ALL libraries}

CONTEXT: {spec excerpt}

EXISTING CODEBASE PATTERNS: {summary of patterns found in Phase 1 audit}

RESEARCH PROTOCOL:
- You MUST cite sources for every factual claim
- Use Context7 first for library/framework questions (resolve-library-id → query-docs)
- Use grep.app to find real-world code examples
- Prefer simple, boring solutions over complex ones
- If unsure, say "I don't know" rather than guess
- Every finding MUST include a source URL

TASK:
1. Use Context7: resolve-library-id, then query-docs
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

> **Anti-Loop Protocol**: After sub-agents return:
> `>>> SYNTHESIS COMPLETE - GENERATING REPORT <<<`
> Write report immediately. Skip prose summaries.

### Research Report

```markdown
# Architecture Research: {target}

## Summary
{2-3 sentence overview}

## Architecture Health Assessment

### Existing Architecture Classification: {SOUND | DRIFTED | ANTI-PATTERN}

{Assessment of the existing code architecture the change builds upon}

| Area | Existing Pattern | Reference Pattern | Deviation | Impact |
|------|-----------------|-------------------|-----------|--------|
| {area} | {what exists} | {what's correct} | {NONE/MINOR/MAJOR} | {risk if unchanged} |

### Architecture Corrections Required
{If DRIFTED or ANTI-PATTERN: specific changes needed to steer toward
 best practices. These take priority over feature work.}

1. {correction with authoritative source citation}

### Minimum Viable Correction
{If full correction is too large: the minimum changes this proposal
 MUST make to avoid perpetuating the anti-pattern, plus follow-up
 tasks for complete correction.}

## Validated Decisions
{confirmed best practices - keep these}

## Simplification Opportunities
{simpler approaches that meet requirements - prioritize these}

| Current | Simpler Alternative | Effort | Recommendation |
|---------|---------------------|--------|----------------|
| {approach} | {alternative} | {effort} | {action} |

## Concerns
{trade-offs requiring attention}

## Anti-Patterns Detected
{contradicts best practices - requires revision}

## Over-Engineering Flags
{complexity without corresponding benefit}

## Detailed Findings

### {Decision Area}
**Current:** {spec decision}
**Reference (by-the-book):** {canonical approach with source}
**Research:** {findings}
**Simpler Option:** {if exists}
**Recommendation:** {action}
**Sources:** {list}

## Action Items
- [ ] {architecture corrections first}
- [ ] {then simplifications}
- [ ] {then feature-specific changes}

## Confidence
- High: {well-validated aspects}
- Low: {needs more research}
```

---

## Phase 5: Apply Findings

### Determine Scope

**If target is deployed spec**: Create change proposal
**If target is active change**: Update directly

### For Deployed Specs

1. Create change:
   ```
   adv_change_create summary: "Simplify/harden {capability} based on research"
   ```

2. Add tasks for each finding:
   ```
   adv_task_add change_id: <new-id> title: "{finding action}"
   ```

### For Active Changes

1. Add tasks:
   ```
   adv_task_add change_id: <target> title: "Apply research: {finding}"
   ```

2. Update proposal.md with `## Research Validation` section

3. Update deltas if requirements need revision

---

## Phase 6: Contract Tracking

If findings require updates:

```
============================================================
                    CONTRACT ACTIVE
============================================================

OBJECTIVE: Apply research findings to {target}

SUCCESS CRITERIA:
{for each finding requiring action}
- [ ] (R{n}) {finding} - {action}
{end}
- [ ] All sources cited in proposal.md
- [ ] Architecture corrections applied (if any deviations found)

PRIORITIZED BY:
1. Architecture corrections (DRIFTED/ANTI-PATTERN fixes)
2. Security issues
3. Simplification opportunities
4. Anti-pattern fixes in proposed design
5. General improvements

============================================================
```

After applying updates:

```
============================================================
                  CONTRACT FULFILLED
============================================================

OBJECTIVE: Apply research findings to {target}

ALL CRITERIA MET:
{for each finding}
- [x] (R{n}) {finding} - {evidence}
{end}

============================================================
```

---

## Phase 7: Completion

### Mark Research Gate (for changes)

If target is a change, mark the research gate as complete:

```
adv_gate_complete changeId: {change-id} gateId: research
```

### Summary

```
## Research Complete

FILES UPDATED:
- {list}

KEY CHANGES:
1. {change with rationale}

SIMPLIFICATIONS APPLIED:
- {what was simplified and why}

GATE STATUS:
- Research gate: COMPLETE ✓

NEXT STEPS:
- [ ] Review updates
- [ ] /adv-prep {change-id} (next gate)
- [ ] /adv-validate {change-id}
```

### Completion Banner

```
============================================================
       /adv-research {target} COMPLETE
============================================================
Result: {N findings applied | All validated | Report only}
Simplifications: {N opportunities identified}
Research Gate: MARKED COMPLETE

  ⚡ Recommended next step (Build agent):
     /adv-prep {change-id}   (then /adv-apply {change-id})
============================================================
```

---

## Guiding Principles

1. **Never extend a bad architecture** - If the existing structure is wrong, recommend corrections, don't rubber-stamp it
2. **By-the-book first** - Always compare against the canonical/reference architecture for the tech stack
3. **Context7 first** for library and framework research
4. **Parallel sub-agents** for efficiency
5. **Cite sources** for every claim, especially for what "correct architecture" means
6. **Actionable recommendations** for every concern
7. **Simplicity bias** - always ask "could this be simpler?"
8. **Boring is better** - prefer proven over novel
9. **Always update files** - research without action is incomplete
10. **Correct, then extend** - Fix architectural deviations before adding new features on top of them

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Load spec | `adv_spec_show` |
| Load change | `adv_change_show` |
| Create change | `adv_change_create` |
| Add task | `adv_task_add` |
| Context7 | `resolve-library-id`, `query-docs` |
