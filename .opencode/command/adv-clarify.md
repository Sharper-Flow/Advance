---
name: adv-clarify
description: Ask clarifying questions to resolve ambiguous requirements
agent: build
---

# ADV Clarify — Requirements Discovery

Use the Socratic method to uncover hidden assumptions, edge cases, and acceptance criteria through structured questioning. Based on the six types of Socratic questions.

> **Goal**: Surface concrete, testable acceptance criteria through guided discovery.

---

## The Six Socratic Question Types

Cycle through these to ensure comprehensive coverage:

| Type | Purpose | Example |
|------|---------|---------|
| **1. Clarification** | Explore origin of thinking | "What do you mean by 'fast'?" |
| **2. Assumptions** | Probe underlying beliefs | "Why do you assume users will have accounts?" |
| **3. Evidence** | Demand proof | "What evidence supports that users prefer this?" |
| **4. Alternatives** | Explore other perspectives | "How would a power user see this differently?" |
| **5. Implications** | Examine downstream effects | "If this happened, what else would result?" |
| **6. Meta-questions** | Question the question | "Which of these requirements is most critical?" |

---

## Questioning Protocol

### Pacing Rules

- **Maximum 2-3 questions per response** (cognitive load limit)
- **Lead with one open-ended question**, add 1-2 clarifying if needed
- **Summarize understanding** before asking new questions
- **Watch for overwhelm signals** (short answers, "I don't know" repeats)

### Question Stems (Open-Ended)

Use these to keep discovery open:

| Avoid (Closed) | Use (Open) |
|----------------|------------|
| "Do you need X?" | "How do you handle X?" |
| "Is performance important?" | "What performance expectations exist?" |
| "Did that make sense?" | "What's unclear about that?" |

**Best stems:**
- "Walk me through..."
- "Tell me about a time when..."
- "What happens when..."
- "How would you describe..."

---

## Phase 1: Context Analysis

Before asking questions, silently analyze:

1. **Stated assumptions** - What is being taken for granted?
2. **Unstated assumptions** - What implicit beliefs might be hiding?
3. **Potential contradictions** - Are there conflicting requirements?
4. **Knowledge gaps** - What critical information is missing?

Review conversation context for:
- Specifications, proposals, or design documents discussed
- The work being requested or planned
- Existing code or architecture that may be affected
- Constraints (technical, business, timeline)

---

## Phase 2: Question Categories

### Requirements Dimensions

Use these categories to ensure coverage:

| Category | Focus Questions |
|----------|-----------------|
| **Assumptions** | "What would happen if [assumption] weren't true?" |
| **Scope** | "What's explicitly out of scope?" |
| **Users** | "Who are all the affected users?" |
| **Happy path** | "What does success look like exactly?" |
| **Edge cases** | "What about empty? Max values? Invalid input?" |
| **Errors** | "How should failures be communicated?" |
| **State** | "What states exist and how do they change?" |
| **Data** | "What inputs and outputs are expected?" |
| **Performance** | "What are latency/throughput requirements?" |
| **Security** | "What access controls are needed?" |
| **Integration** | "How does this interact with existing systems?" |
| **Observability** | "How will we know it's working in production?" |
| **Rollback** | "What if we need to undo this?" |

### Depth Scaling

Scale question count by complexity:
- **Simple changes**: 3-5 questions
- **Medium features**: 6-10 questions
- **Complex systems**: 10-15 questions

---

## Phase 3: The Funnel Technique

Structure question flow from broad to specific:

```
1. BROAD OPEN
   "Tell me about what you're trying to accomplish"
   
2. SUMMARIZE
   "So you're saying X because of Y..."
   
3. CLARIFY (1-2 specific questions)
   "What do you mean by 'scale'?"
   
4. CHALLENGE ASSUMPTION (if spotted)
   "Why do you assume users will do X?"
   
5. EXPLORE ALTERNATIVE
   "How would [other stakeholder] see this?"
   
6. CHECK IMPLICATIONS
   "If we build this, what else changes?"
   
7. SUMMARIZE & CONFIRM
   "Let me play back what I understand..."
   
8. PROBE GAPS
   "What haven't we discussed that matters?"
```

---

## Phase 4: Probing Deeper

### Universal Follow-Up Probes

- "Tell me more about that."
- "What do you mean by X?"
- "Can you give me an example?"
- "Why do you think that is?"
- "What would happen if...?"

### Laddering (Root Cause Discovery)

Keep asking "why" to get to core requirements:

```
User: "I need a dashboard"
AI: "What problem would the dashboard solve?"
User: "I need to see status at a glance"
AI: "What decisions do you make based on that status?"
User: "I need to know which items need attention"
AI: "What makes an item need attention?"
→ NOW you have the real requirement (attention triggers)
```

### Consequence Mapping

- "If we did X, what else would need to change?"
- "What would break if this didn't work?"
- "Who would be affected downstream?"

---

## Phase 5: Detect Requirements Smells

Flag these indicators of incomplete requirements:

| Smell | Example | Response |
|-------|---------|----------|
| **Subjective language** | "user-friendly" | "What makes it user-friendly specifically?" |
| **Ambiguous adverbs** | "quickly", "efficiently" | "What's the target time/metric?" |
| **Superlatives** | "best", "most" | "Compared to what baseline?" |
| **Totality claims** | "all", "every", "never" | "Are there any exceptions?" |
| **Vague scope** | "handle errors" | "Which specific errors? How?" |

---

## Output Format

### MANDATORY: Use the `mcp_question` Tool

**ALWAYS use the `mcp_question` tool for asking questions.** Never output questions as plain text - instead use the structured question tool for better UX.

#### Question Tool Schema

```typescript
mcp_question({
  questions: [{
    header: string,      // Short label, max 30 chars
    question: string,    // Full question text
    multiple?: boolean,  // Allow multiple selections (default: false)
    options: [{
      label: string,     // Display text, 1-5 words
      description: string // Explanation of choice
    }]
  }]
})
```

#### Question Tool Constraints

| Field | Limit | Notes |
|-------|-------|-------|
| `header` | max 30 chars | Very short label |
| `label` | 1-5 words | Concise display text |
| `options` | 2-5 choices | Don't include "Other" - custom input is automatic |

#### Example: Clarifying a Requirement

```json
{
  "questions": [{
    "header": "Performance Target",
    "question": "You mentioned the system should be 'fast'. What response time target do you have in mind?",
    "options": [
      { "label": "Under 100ms", "description": "Real-time user interactions" },
      { "label": "Under 1 second", "description": "Standard web response time" },
      { "label": "Under 5 seconds", "description": "Background processing acceptable" },
      { "label": "No specific target", "description": "Just faster than current" }
    ]
  }]
}
```

#### Example: Exploring Assumptions

```json
{
  "questions": [{
    "header": "User Authentication",
    "question": "You're assuming users will have accounts. What about anonymous access?",
    "options": [
      { "label": "Accounts required", "description": "All users must sign in" },
      { "label": "Optional accounts", "description": "Anonymous with limited features" },
      { "label": "No accounts", "description": "Fully anonymous access" }
    ]
  }]
}
```

#### Example: Multiple Selection

```json
{
  "questions": [{
    "header": "Error Handling",
    "question": "Which error scenarios should we handle explicitly?",
    "multiple": true,
    "options": [
      { "label": "Network failures", "description": "Connection timeouts, DNS errors" },
      { "label": "Auth failures", "description": "Invalid tokens, expired sessions" },
      { "label": "Rate limiting", "description": "API quota exhausted" },
      { "label": "Data validation", "description": "Invalid input formats" }
    ]
  }]
}
```

### During Questioning Flow

1. **Analyze** - Silently review context for assumptions and gaps
2. **Summarize** - Output a brief text summary of your understanding so far
3. **Ask** - Use `mcp_question` tool with 1-2 questions max per round
4. **Wait** - Process user's selections before next round

### After Each Exchange

Summarize before new questions:
```
So far I understand:
- [Requirement 1]
- [Requirement 2]
```

Then use `mcp_question` for the next round of clarification.

### Final Summary

After sufficient questions:

```
============================================================
           REQUIREMENTS DISCOVERY SUMMARY
============================================================

CONFIRMED REQUIREMENTS:
1. [Requirement] - (acceptance criterion)
2. [Requirement] - (acceptance criterion)

ASSUMPTIONS TO VALIDATE:
- [Assumption needing verification]

EDGE CASES IDENTIFIED:
- [Edge case and expected behavior]

REMAINING QUESTIONS:
- [ ] [Question needing follow-up]

SUGGESTED NEXT STEPS:
- Use these criteria in /adv-proposal
- Validate assumptions with stakeholders

============================================================
```

---

## Anti-Patterns to Avoid

| Anti-Pattern | Why It Fails | Fix |
|--------------|--------------|-----|
| **Plain text questions** | Poor UX, no structure | Always use `mcp_question` tool |
| **Leading questions** | Suggests desired answer | Use neutral framing |
| **Rapid-fire** | Overwhelms, interrogation feel | Max 2-3, pause for response |
| **Closed-only** | Yields yes/no, no discovery | Lead with open |
| **Jargon** | Creates confusion | Use plain language |
| **Playing devil's advocate** | Creates adversarial dynamic | Stay genuinely curious |
| **No summarization** | Misunderstanding compounds | Regularly play back |

---

## Completion Banner

```
============================================================
       /adv-clarify COMPLETE
============================================================
Result: {N} requirements clarified, {M} open questions

  ⚡ Recommended next step (Plan agent):
     /adv-task <contract-summary>
  Alternative (Plan agent):
     /adv-proposal <summary>
============================================================
```
