---
name: adv-brainstorm
description: Interactive ideation session - explore, refine, and document ideas before creating a formal proposal
agent: general
args:
  - name: topic
    description: Initial topic or idea to explore (can be vague)
    required: false
---

# ADV Brainstorm - Interactive Ideation Session

Collaborative ideation using diverge-then-converge methodology. Creates a living document in `./temp/` that evolves through structured phases: problem framing → idea generation → clustering → evaluation → refinement.

> **Key principle**: During diverge phases, quantity beats quality. All judgment is postponed until converge phases.

<UserRequest>
  $ARGUMENTS
</UserRequest>

---

## Pre-flight Check

### Check for Existing Session

Look for `./temp/brainstorm-*.md` files:

**If found**, use the `question` tool:
```json
{
  "questions": [{
    "header": "Existing Session",
    "question": "Found existing brainstorm: <filename>. What would you like to do?",
    "options": [
      { "label": "Resume (Recommended)", "description": "Continue where you left off" },
      { "label": "Start fresh", "description": "Archive existing and begin new" },
      { "label": "View existing", "description": "Read the document first" }
    ]
  }]
}
```

---

## Phase 1: Session Setup

### Create Working Document

1. Create `./temp/` directory if it doesn't exist
2. Generate filename: `brainstorm-<slugified-topic>.md` (or `brainstorm-<timestamp>.md` if no topic)
3. Initialize with template:

```markdown
# Brainstorm: <topic or "Untitled Session">

**Started:** <timestamp>
**Status:** Active
**Phase:** Setup

---

## Problem Framing

**Point of View:**
<to be defined>

**How Might We...?**
<to be defined>

---

## Ideas (Diverge)

<to be captured during diverge phase>

---

## Clusters

<to be organized after diverge>

---

## Evaluation (Converge)

<to be completed after clustering>

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|

---

## Open Questions

- [ ] <captured during session>

---

## Next Steps

<defined during wrap-up>

---

*Working draft. When ready: `/adv-proposal "<summary>"`*
```

### Announce Session

```
============================================================
              BRAINSTORM SESSION STARTED
============================================================

Document: ./temp/<filename>.md

This is a structured ideation session with distinct phases:

1. FRAME    - Define the problem clearly
2. DIVERGE  - Generate many ideas (no judgment!)
3. CLUSTER  - Group related ideas
4. CONVERGE - Evaluate and prioritize
5. REFINE   - Develop selected ideas

I'll guide you through each phase. The document updates as we go.

============================================================
```

---

## Phase 2: Problem Framing

Frame the problem before generating solutions. Clear framing enables focused creativity.

### Step 2.1: Establish Point of View

Use the `question` tool to understand the problem space:

```json
{
  "questions": [{
    "header": "Problem Type",
    "question": "What kind of problem are we solving?",
    "options": [
      { "label": "User pain point", "description": "Something frustrates or slows users" },
      { "label": "Missing capability", "description": "Need functionality that doesn't exist" },
      { "label": "Technical limitation", "description": "Current approach has hit a wall" },
      { "label": "Opportunity", "description": "Possibility worth exploring" }
    ]
  }]
}
```

### Step 2.2: Construct POV Statement

Guide user to articulate:

```
[WHO] needs [WHAT - verb phrase] because [WHY - insight].
```

Example: "Developers need to quickly test API changes because the current feedback loop takes 5 minutes."

**Ask clarifying questions** to refine until POV is crisp.

### Step 2.3: Generate "How Might We" Questions

Transform the POV into 3-5 HMW questions that open exploration:

```
Based on your POV, here are some "How Might We" questions:

1. How might we <reduce the feedback loop time>?
2. How might we <make testing feel instant>?
3. How might we <eliminate the need to wait>?
4. How might we <test without deploying>?
5. How might we <catch issues before testing>?

Which of these feels most promising to explore?
```

Use the `question` tool with `multiple: true` to let user select focus areas.

### Update Document

Write POV and selected HMW questions to the document.

---

## Phase 3: Diverge (Idea Generation)

**Rules for this phase:**
- Quantity over quality
- Wild ideas welcome - "scaling back crazy is easier than making mundane desirable"
- No evaluation, no "but", no "that won't work"
- Build on ideas with "Yes, and..."

### Step 3.1: Set Diverge Context

```
============================================================
                    DIVERGE PHASE
============================================================

Goal: Generate as many ideas as possible. 
Rules: No judgment. Wild ideas welcome. Quantity > quality.

For each HMW question, I'll help you brainstorm solutions.
We're aiming for 10+ ideas before we evaluate anything.

============================================================
```

### Step 3.2: Idea Generation Techniques

Cycle through these techniques to stimulate ideas:

**Open Prompt:**
Use the `question` tool:
```json
{
  "questions": [{
    "header": "Ideas",
    "question": "What solutions come to mind for: <HMW question>?",
    "options": [
      { "label": "I have ideas", "description": "Let me share my thoughts" },
      { "label": "Need prompts", "description": "Give me provocations to spark ideas" },
      { "label": "Explore codebase", "description": "Look at existing patterns first" }
    ]
  }]
}
```

**SCAMPER Provocations** (use when user needs prompts):

| Lens | Provocation |
|------|-------------|
| **Substitute** | What if we replaced <component> with something else? |
| **Combine** | What if we merged this with <existing feature>? |
| **Adapt** | How do other systems solve this? |
| **Modify** | What if we made it 10x faster? 10x simpler? |
| **Put to other use** | What else could this enable? |
| **Eliminate** | What if we removed the need for this entirely? |
| **Rearrange** | What if the order was reversed? |

Present 2-3 relevant provocations at a time using the `question` tool:
```json
{
  "questions": [{
    "header": "Provocation",
    "question": "<SCAMPER provocation relevant to context>?",
    "options": [
      { "label": "That sparks an idea", "description": "Let me build on that" },
      { "label": "Try another", "description": "Give me a different angle" },
      { "label": "I'm stuck", "description": "Let's look at examples" }
    ]
  }]
}
```

**Wild Ideas Push:**
If ideas feel too safe, use the `question` tool:
```json
{
  "questions": [{
    "header": "Go Wilder",
    "question": "What's the craziest solution that might work if constraints didn't exist?",
    "options": [
      { "label": "Let me think wild", "description": "Removing constraints now" },
      { "label": "Show me examples", "description": "What have others done?" }
    ]
  }]
}
```

### Step 3.3: Research Grounding

When needed, ground ideas in reality:

- **Codebase search**: How do similar features work here?
- **Context7**: What do libraries recommend?
- **`adv_spec_list`**: What capabilities exist?

Present findings as inspiration, not constraints.

### Step 3.4: Capture All Ideas

Update document continuously. Use simple format:

```markdown
## Ideas (Diverge)

### For: <HMW question 1>

1. <idea> 
2. <idea>
3. <wild idea> ⚡
4. <idea building on #2>
...

### For: <HMW question 2>

1. <idea>
...
```

Mark wild ideas with ⚡ to preserve them.

### Diverge Exit Criteria

Ready to cluster when:
- 10+ ideas generated across HMW questions
- Ideas starting to repeat or overlap
- User signals readiness

Use the `question` tool:
```json
{
  "questions": [{
    "header": "Diverge Check",
    "question": "We have <N> ideas. Ready to organize them?",
    "options": [
      { "label": "Yes, let's cluster", "description": "Move to organizing phase" },
      { "label": "More ideas first", "description": "Continue diverging" },
      { "label": "Take a break", "description": "Pause session, resume later" }
    ]
  }]
}
```

---

## Phase 4: Cluster (Organize)

Group ideas to reveal patterns. This is a transition phase - still avoid hard evaluation.

### Step 4.1: Identify Themes

Review all ideas and propose groupings:

```
Looking at your ideas, I see these emerging themes:

1. **<Theme A>**: Ideas #1, #4, #7
2. **<Theme B>**: Ideas #2, #5, #8
3. **<Theme C>**: Ideas #3, #6
4. **Outliers**: Ideas #9, #10 (unique angles)
```

Use the `question` tool:
```json
{
  "questions": [{
    "header": "Clusters",
    "question": "Do these groupings make sense?",
    "options": [
      { "label": "Yes, good clusters", "description": "Move to evaluation" },
      { "label": "Adjust groupings", "description": "Some ideas fit differently" },
      { "label": "Need more themes", "description": "I see other patterns" }
    ]
  }]
}
```

### Step 4.2: Update Document

```markdown
## Clusters

### Theme: <Theme A>
- Idea 1: <description>
- Idea 4: <description>
- Idea 7: <description>

**Common thread:** <what unites these>

### Theme: <Theme B>
- Idea 2: <description>
...

### Outliers (Don't Discard)
- Idea 9: <wild idea worth keeping>
```

---

## Phase 5: Converge (Evaluate)

Now apply judgment. Evaluate ideas against criteria.

### Step 5.1: Establish Evaluation Criteria

Use the `question` tool:
```json
{
  "questions": [{
    "header": "Priorities",
    "question": "What matters most for this solution?",
    "multiple": true,
    "options": [
      { "label": "Simplicity", "description": "Easy to build and maintain" },
      { "label": "User impact", "description": "Significant improvement for users" },
      { "label": "Speed to ship", "description": "Can implement quickly" },
      { "label": "Future-proof", "description": "Scales and extends well" },
      { "label": "Low risk", "description": "Minimal chance of problems" }
    ]
  }]
}
```

### Step 5.2: Evaluate Top Candidates

For each cluster, identify 1-2 strongest ideas:

Use the `question` tool:
```json
{
  "questions": [{
    "header": "Evaluate <Theme A>",
    "question": "Which idea from this cluster is most promising?",
    "options": [
      { "label": "Idea 1", "description": "<brief description>" },
      { "label": "Idea 4", "description": "<brief description>" },
      { "label": "Combine 1+4", "description": "Merge best aspects" },
      { "label": "None yet", "description": "Need to develop further" }
    ]
  }]
}
```

### Step 5.3: Check Feasibility

For selected ideas, quick feasibility check:

- Search codebase for complexity indicators
- Check for conflicts with existing specs: `adv_change_list`, `adv_spec_search`
- Estimate effort: trivial | small | medium | large | huge

### Step 5.4: Update Document

```markdown
## Evaluation (Converge)

**Criteria:** <selected priorities>

### Top Candidates

| Idea | Theme | Pros | Cons | Effort |
|------|-------|------|------|--------|
| <idea 1> | A | <pros> | <cons> | medium |
| <idea 2> | B | <pros> | <cons> | small |

### Deferred (Good but not now)
- <idea> - <reason to defer>

### Rejected
- <idea> - <why not viable>
```

---

## Phase 6: Refine (Develop Selected Ideas)

Develop the top 1-3 ideas into actionable concepts.

### Step 6.1: Deep Dive Each Candidate

For each selected idea:

Use the `question` tool:
```json
{
  "questions": [{
    "header": "Develop <idea>",
    "question": "What aspects need clarification?",
    "multiple": true,
    "options": [
      { "label": "Technical approach", "description": "How would we build it?" },
      { "label": "User experience", "description": "How would users interact?" },
      { "label": "Edge cases", "description": "What could go wrong?" },
      { "label": "Dependencies", "description": "What do we need first?" }
    ]
  }]
}
```

### Step 6.2: Research Specifics

Use tools to answer questions:
- Context7 for library/pattern research
- Codebase search for integration points
- `adv_spec_show` for related capabilities

### Step 6.3: Capture Decisions

As choices are made, record them:

```markdown
## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Approach | <choice> | <why> |
| Library | <choice> | <why> |
| Scope | <choice> | <why> |
```

### Step 6.4: Document Open Questions

```markdown
## Open Questions

- [ ] <question needing more research>
- [ ] <question for stakeholder>
- [ ] <technical uncertainty>
```

---

## Phase 7: Wrap-Up

### Step 7.1: Check Readiness

Use the `question` tool:
```json
{
  "questions": [{
    "header": "Session Status",
    "question": "Where are you with this brainstorm?",
    "options": [
      { "label": "Ready for proposal", "description": "Idea is clear enough to formalize" },
      { "label": "Need more time", "description": "Pause and resume later" },
      { "label": "Pivot direction", "description": "Want to explore different angle" },
      { "label": "Archive this", "description": "Not pursuing right now" }
    ]
  }]
}
```

### Step 7.2: If Ready for Proposal

1. Update document status to `Complete`
2. Generate summary
3. Define next steps

```markdown
## Next Steps

1. Create proposal: `/adv-proposal "<summary>"`
2. Key decisions to carry forward:
   - <decision 1>
   - <decision 2>
3. Open questions to address in proposal:
   - <question>
```

Output:
```
============================================================
              BRAINSTORM SESSION COMPLETE
============================================================

Document: ./temp/<filename>.md
Status: Ready for proposal

SUMMARY:
<2-3 sentence summary of the refined idea>

TOP APPROACH:
<selected approach from evaluation>

SUGGESTED NEXT:
/adv-proposal "<one-line summary>"

The brainstorm document provides context for the proposal.

============================================================
```

### Step 7.3: If Pausing

Update status to `Paused`:

```
============================================================
              BRAINSTORM SESSION PAUSED
============================================================

Document: ./temp/<filename>.md
Phase: <current phase>

Progress saved. To resume:
/adv-brainstorm

============================================================
```

### Step 7.4: If Archiving

Move to `./temp/archive/` with timestamp:

```
============================================================
              BRAINSTORM SESSION ARCHIVED
============================================================

Document moved to: ./temp/archive/<filename>-<timestamp>.md

To start fresh: /adv-brainstorm <new topic>

============================================================
```

---

## Behavioral Guidelines

### During Diverge Phases

- Generate prompts actively - offer provocations, ask "what else?"
- Capture everything - no idea too small or wild
- Build on user ideas - "Yes, and..." not "But..."
- Research for inspiration, not limitation
- Update document continuously

### During Converge Phases

- Apply judgment now - evaluate against stated criteria
- Surface trade-offs honestly
- Check feasibility with real research
- Respect user decisions - once decided, move forward

### Throughout Session

- Use the `question` tool frequently - every 2-3 exchanges
- Keep document as single source of truth
- Summarize progress periodically
- Connect ideas to existing specs/codebase when relevant

---

## Session Management

### Resuming Sessions

When resuming an existing session:
1. Read the document to understand current state
2. Check the Phase field
3. Summarize where we left off
4. Continue from that phase

### Multiple Sessions

If multiple `brainstorm-*.md` files exist, use the `question` tool:
```json
{
  "questions": [{
    "header": "Multiple Sessions",
    "question": "Found multiple brainstorms. Which one?",
    "options": [
      { "label": "<filename1> (<topic>)", "description": "Status: <status>" },
      { "label": "<filename2> (<topic>)", "description": "Status: <status>" },
      { "label": "Start new", "description": "Begin fresh session" }
    ]
  }]
}
```

---

## Completion Banner

```
============================================================
       /adv-brainstorm COMPLETE
============================================================
Result: <Session complete | Session paused | Session archived>
Document: ./temp/<filename>.md
============================================================
```

---

## Key Tools

| Purpose | Tool |
|---------|------|
| User choices | `question` tool |
| List specs | `adv_spec_list` |
| Show spec | `adv_spec_show` |
| Search specs | `adv_spec_search` |
| List changes | `adv_change_list` |
| Codebase search | Grep/Glob |
| Library research | Context7 |
