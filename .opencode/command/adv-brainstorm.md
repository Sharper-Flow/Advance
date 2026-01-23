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

Collaborative ideation to explore, refine, and document ideas before formalizing into a change proposal. Creates a living document in `./temp/` that evolves through conversation.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Phase 1: Session Setup

### Create Working Document

1. Create `./temp/` directory if it doesn't exist
2. Generate filename from topic: `brainstorm-<slugified-topic>.md`
   - If no topic: `brainstorm-<timestamp>.md`
3. Initialize document with template:

```markdown
# Brainstorm: <topic or "Untitled Session">

**Started:** <timestamp>
**Status:** Active

---

## Problem Space

<to be defined>

## Goals

<to be defined>

## Ideas

<to be defined>

## Decisions

<to be defined>

## Open Questions

<to be defined>

## Next Steps

<to be defined>

---

*This document is a working draft. When ready, use `/adv-proposal` to formalize.*
```

### Announce Session

```
============================================================
              BRAINSTORM SESSION STARTED
============================================================

Document: ./temp/<filename>.md

This is an interactive ideation session. I'll help you:
- Explore and refine your idea
- Identify requirements and constraints
- Surface edge cases and concerns
- Document decisions as we go

The document will be updated as we progress.

============================================================
```

---

## Phase 2: Initial Discovery

### If Topic Provided

Analyze the topic and ask clarifying questions using `mcp_question`:

```
header: "Problem Space"
question: "What's the core problem you're trying to solve?"
options:
  - label: "User pain point"
    description: "Something is frustrating or slow for users"
  - label: "Technical debt"
    description: "Code is hard to maintain or extend"
  - label: "Missing capability"
    description: "Need functionality that doesn't exist"
  - label: "Performance issue"
    description: "Something is too slow or resource-heavy"
  - label: "Integration need"
    description: "Need to connect with external system"
```

### If No Topic

Start with open exploration:

```
header: "Getting Started"
question: "What would you like to brainstorm about?"
options:
  - label: "New feature idea"
    description: "Something I want to add"
  - label: "Improve existing"
    description: "Make something better"
  - label: "Solve a problem"
    description: "Fix something that's broken or painful"
  - label: "Explore possibility"
    description: "Not sure yet, let's discover"
```

---

## Phase 3: Iterative Exploration

This is the core loop. Use these techniques **liberally**:

### Tool Usage (Use Frequently)

| Technique | When to Use |
|-----------|-------------|
| `mcp_question` | Preferences, trade-offs, multiple valid paths |
| Codebase search | Ground ideas in existing code patterns |
| Context7 | Research libraries, patterns, best practices |
| `adv_spec_list` / `adv_spec_show` | Check existing specs for conflicts/overlap |
| `adv_change_list` | Check for related active changes |

### Question Patterns

**Scope Questions:**
```
header: "Scope"
question: "How ambitious should this be?"
options:
  - label: "Minimal viable"
    description: "Smallest useful increment"
  - label: "Well-rounded"
    description: "Complete but not over-engineered"
  - label: "Comprehensive"
    description: "Handle all edge cases"
```

**Trade-off Questions:**
```
header: "Trade-off"
question: "<specific trade-off>?"
options:
  - label: "<option A>"
    description: "<pros of A>"
  - label: "<option B>"
    description: "<pros of B>"
  - label: "Need more info"
    description: "Research before deciding"
```

**Priority Questions:**
```
header: "Priority"
question: "Which aspect matters most?"
multiple: true
options:
  - label: "Simplicity"
    description: "Easy to understand and maintain"
  - label: "Performance"
    description: "Fast and efficient"
  - label: "Flexibility"
    description: "Easy to extend later"
  - label: "User experience"
    description: "Intuitive and pleasant"
```

**Validation Questions:**
```
header: "Validate"
question: "Does this capture your intent?"
options:
  - label: "Yes, continue"
    description: "This is right"
  - label: "Partially"
    description: "Close but needs adjustment"
  - label: "No, rethink"
    description: "Let's try a different approach"
```

### Document Updates

After each significant exchange, update the brainstorm document:

1. **Add new ideas** to the Ideas section
2. **Record decisions** when user makes choices
3. **Capture open questions** that surface
4. **Refine problem/goals** as clarity emerges

Use markers to show evolution:
- `[IDEA]` - Proposed, not yet validated
- `[CONSIDERING]` - Actively discussing
- `[DECIDED]` - User confirmed
- `[REJECTED]` - Explicitly ruled out
- `[QUESTION]` - Needs resolution

---

## Phase 4: Deepening

As the idea takes shape, dig deeper:

### Technical Feasibility

Search codebase for relevant patterns:
- How do similar features work?
- What patterns exist?
- What would need to change?

### Existing Spec Alignment

```
adv_spec_list
adv_spec_search keyword: <relevant-term>
```

- Does this fit existing capabilities?
- Would it require new specs?
- Any conflicts with current design?

### Library/Pattern Research

Use Context7 for:
- Best practices for this type of feature
- Libraries that might help
- Common pitfalls to avoid

### Edge Cases

Proactively surface:
- Error scenarios
- Performance considerations
- Security implications
- Migration/compatibility concerns

---

## Phase 5: Convergence

When ideas are crystallizing, help converge:

### Synthesis Prompt

```
header: "Synthesis"
question: "Ready to synthesize what we've discussed?"
options:
  - label: "Yes, summarize"
    description: "Capture current state"
  - label: "More exploration"
    description: "Still have questions"
  - label: "Pivot direction"
    description: "Want to explore different angle"
```

### Update Document Structure

Transform working notes into structured sections:

```markdown
## Problem Space

<clear problem statement>

## Goals

1. <primary goal>
2. <secondary goal>

## Proposed Approach

<high-level solution>

### Key Ideas

- [DECIDED] <idea 1> - <rationale>
- [DECIDED] <idea 2> - <rationale>

### Rejected Alternatives

- [REJECTED] <alternative> - <why not>

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| <decision point> | <choice> | <why> |

## Open Questions

- [ ] <unresolved question>

## Risks & Concerns

- <risk 1>
- <concern 1>

## Next Steps

- [ ] <action item>
```

---

## Phase 6: Session Management

### Pause Session

If user needs to step away:

```
header: "Pause Session"
question: "Save progress and pause?"
options:
  - label: "Pause (Recommended)"
    description: "Save document, resume later"
  - label: "Continue"
    description: "Keep going"
```

Output:
```
============================================================
              BRAINSTORM SESSION PAUSED
============================================================

Document saved: ./temp/<filename>.md

To resume: /adv-brainstorm (I'll detect the existing document)

============================================================
```

### Resume Session

If `./temp/brainstorm-*.md` exists, offer to resume:

```
header: "Existing Session"
question: "Found existing brainstorm. Resume or start fresh?"
options:
  - label: "Resume (Recommended)"
    description: "Continue from where you left off"
  - label: "Start fresh"
    description: "Archive old, begin new session"
```

---

## Phase 7: Completion

### Ready for Proposal

When user is ready to formalize:

```
header: "Ready to Propose"
question: "Convert this brainstorm into a formal proposal?"
options:
  - label: "Create proposal (Recommended)"
    description: "Run /adv-proposal with this context"
  - label: "Keep brainstorming"
    description: "Not ready yet"
  - label: "End session"
    description: "Save document, decide later"
```

### If Creating Proposal

1. Update document status to `Complete`
2. Add summary section
3. Suggest proposal command:

```
============================================================
              BRAINSTORM SESSION COMPLETE
============================================================

Document: ./temp/<filename>.md
Status: Ready for proposal

SUMMARY:
<2-3 sentence summary of the idea>

SUGGESTED NEXT STEP:
/adv-proposal "<one-line summary>"

The brainstorm document will serve as context for the proposal.

============================================================
```

### If Ending Without Proposal

```
============================================================
              BRAINSTORM SESSION ENDED
============================================================

Document saved: ./temp/<filename>.md

When ready to continue:
- Resume brainstorming: /adv-brainstorm
- Create proposal: /adv-proposal "<summary>"

============================================================
```

---

## Behavioral Guidelines

### Be Proactive

- **Ask questions frequently** - Use `mcp_question` liberally
- **Surface concerns early** - Don't wait for user to ask
- **Research actively** - Use tools to ground ideas in reality
- **Update document often** - Keep the living document current

### Be Collaborative

- **Build on user ideas** - Enhance, don't replace
- **Offer alternatives** - "Have you considered...?"
- **Validate understanding** - "So if I understand correctly..."
- **Respect decisions** - Once decided, move forward

### Be Organized

- **Track state in document** - Single source of truth
- **Use clear markers** - [DECIDED], [QUESTION], etc.
- **Summarize periodically** - Help user see progress
- **Connect to specs** - Ground in existing system

### Avoid

- Long monologues without interaction
- Making decisions for the user
- Ignoring existing codebase patterns
- Over-engineering during ideation
- Letting document get stale

---

## Key Tools

| Purpose | Tool |
|---------|------|
| User choices | `mcp_question` |
| List specs | `adv_spec_list` |
| Show spec | `adv_spec_show` |
| Search specs | `adv_spec_search` |
| List changes | `adv_change_list` |
| Codebase search | Grep/Glob |
| Library research | Context7 |
