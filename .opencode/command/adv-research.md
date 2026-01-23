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
   - Present selection via `mcp_question`

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

---

## Phase 2: Generate Research Questions

For each decision, formulate questions across these dimensions:

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

TASK:
1. Use Context7: resolve-library-id, then query-docs
2. Web search for best practices
3. Identify red flags, anti-patterns
4. Evaluate simpler alternatives (CRITICAL)
5. Check for security implications

SIMPLICITY BIAS:
- Prefer boring technology over exciting technology
- Prefer fewer dependencies over more
- Prefer built-in solutions over custom
- Prefer proven patterns over novel approaches

RETURN:
RESEARCH QUESTION: {question}

FINDINGS:
- {finding with source}

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
**Research:** {findings}
**Simpler Option:** {if exists}
**Recommendation:** {action}
**Sources:** {list}

## Action Items
- [ ] {specific change - prioritize simplifications}

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

PRIORITIZED BY:
1. Security issues
2. Simplification opportunities
3. Anti-pattern fixes
4. General improvements

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

1. **Context7 first** for library research
2. **Parallel sub-agents** for efficiency
3. **Cite sources** for every claim
4. **Actionable recommendations** for every concern
5. **Simplicity bias** - always ask "could this be simpler?"
6. **Boring is better** - prefer proven over novel
7. **Always update files** - research without action is incomplete

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Load spec | `adv_spec_show` |
| Load change | `adv_change_show` |
| Create change | `adv_change_create` |
| Add task | `adv_task_add` |
| Context7 | `resolve-library-id`, `query-docs` |
