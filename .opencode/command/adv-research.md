---
name: adv-research
description: Research and validate architectural decisions using sub-agents and Context7
agent: build
---

# ADV Research - Architectural Decision Validation

Spawn sub-agents to research and validate architectural decisions in specs/changes using Context7 and web search.

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

For each decision, formulate questions:

**Technology Validation:**
- "Is {library} best practice for {use case}?"
- "Security considerations for {technology}?"

**Pattern Validation:**
- "Is {pattern} appropriate for {context}?"
- "Trade-offs of {approach} vs alternatives?"

**Simplicity Analysis:**
- "Could {approach} be simpler?"
- "Does {library} have built-in solution?"
- "What's the simplest proven approach?"

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
4. Evaluate simpler alternatives

RETURN:
RESEARCH QUESTION: {question}

FINDINGS:
- {finding with source}

VALIDATION: VALIDATED | CONCERNS | ANTI-PATTERN

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
{confirmed best practices}

## Simplification Opportunities
{simpler approaches that meet requirements}

## Concerns
{trade-offs requiring attention}

## Anti-Patterns
{contradicts best practices - requires revision}

## Detailed Findings

### {Decision Area}
**Current:** {spec decision}
**Research:** {findings}
**Simplicity:** {simpler approach?}
**Recommendation:** {action}
**Sources:** {list}

## Action Items
- [ ] {specific change}
- [ ] {simplification}

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
   adv_change_create summary: "Harden {capability} based on research"
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
- [ ] All sources cited

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
============================================================
```

---

## Constraints

1. **Context7 first** for library research
2. **Parallel sub-agents** for efficiency
3. **Cite sources** for every claim
4. **Actionable recommendations** for every concern
5. **Question complexity** - prefer boring solutions
6. **Always update files** - research without action is incomplete

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Load spec | `adv_spec_show` |
| Load change | `adv_change_show` |
| Create change | `adv_change_create` |
| Add task | `adv_task_add` |
| Context7 | `resolve-library-id`, `query-docs` |
