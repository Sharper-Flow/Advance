---
name: adv-research
description: Research and validate architectural decisions using sub-agents and Context7
agent: build
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

Use SINGLE response with MULTIPLE Task calls (parallel execution):

### Sub-Agent Template

```
Research architectural decision:

QUESTION: {question}

CONTEXT: {spec excerpt}

EXISTING CODEBASE PATTERNS: {summary of patterns found in Phase 1 audit}

TASK:
1. Use Context7: resolve-library-id, then query-docs
2. Look up the CANONICAL/REFERENCE architecture for this tech stack
3. Web search for best practices
4. Identify red flags, anti-patterns
5. Evaluate simpler alternatives (CRITICAL)
6. Check for security implications
7. Compare the PROPOSED architecture against the REFERENCE architecture
8. If the existing code deviates from best practices, recommend how the
   change should CORRECT the architecture rather than extend the deviation

ARCHITECTURE CORRECTION MANDATE:
- Never recommend "follow the existing pattern" if the existing pattern is wrong
- Always recommend the by-the-book correct approach
- If correcting the architecture is too large for this change, recommend
  the minimum correction needed to avoid making things worse, plus a
  follow-up task for full correction
- Cite the authoritative source for what "correct" means (framework docs,
  design pattern book, official style guide)

SIMPLICITY BIAS:
- Prefer boring technology over exciting technology
- Prefer fewer dependencies over more
- Prefer built-in solutions over custom
- Prefer proven patterns over novel approaches

RETURN:
RESEARCH QUESTION: {question}

FINDINGS:
- {finding with source}

ARCHITECTURE ASSESSMENT:
- Existing pattern: {what the codebase currently does}
- Reference pattern: {what the by-the-book approach is}
- Deviation: {NONE | MINOR | MAJOR}
- If deviation: {what the change should do differently}

VALIDATION: VALIDATED | CONCERNS | ANTI-PATTERN | OVER-ENGINEERED

SIMPLICITY CHECK:
- Simpler alternative exists: YES/NO
- If YES: {what and why}

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

### Summary

```
## Research Complete

FILES UPDATED:
- {list}

KEY CHANGES:
1. {change with rationale}

SIMPLIFICATIONS APPLIED:
- {what was simplified and why}

NEXT STEPS:
- [ ] Review updates
- [ ] /adv-validate {change-id}
```

### Completion Banner

```
============================================================
       /adv-research {target} COMPLETE
============================================================
Result: {N findings applied | All validated | Report only}
Simplifications: {N opportunities identified}
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
