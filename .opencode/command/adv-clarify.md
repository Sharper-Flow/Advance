---
name: adv-clarify
description: Ask clarifying questions to resolve ambiguous requirements
---
# ADV Clarify — Cross-Stage Requirements Clarification
Use structured questions to uncover hidden assumptions, edge cases, acceptance criteria, and decision gaps across proposal, discovery, agreement, and design.
## Six Socratic Question Types
| Type | Purpose | Example |
|------|---------|---------|
| Clarification | Explore origin of thinking | "What do you mean by 'fast'?" |
| Assumptions | Probe underlying beliefs | "Why assume users will have accounts?" |
| Evidence | Demand proof | "What evidence supports that?" |
| Alternatives | Other perspectives | "How would a power user see this?" |
| Implications | Downstream effects | "If this happened, what else results?" |
| Meta-questions | Question the question | "Which requirement is most critical?" |
## Questioning Protocol
- Max 2-3 questions per response (cognitive load limit)
- Lead with one open-ended, add 1-2 clarifying
- Summarize understanding before new questions
- Watch for overwhelm signals
| × Closed | ✓ Open |
|----------|--------|
| "Do you need X?" | "How do you handle X?" |
| "Is performance important?" | "What performance expectations exist?" |

Best stems: "Walk me through...", "Tell me about a time when...", "What happens when..."
## Stage Coverage
Use `/adv-clarify` whenever ambiguity blocks:
- `proposal` — problem framing and scope
- `discovery` — current-state assumptions and objectives
- `agree` — constraints, avoidances, and acceptance criteria
- `design` — architecture choices and operational implications
## Phase 1: Context Analysis
Silently analyze: stated assumptions, unstated assumptions, contradictions, knowledge gaps. Review conversation for specs, proposals, code, constraints.
## Phase 2: Question Categories
| Category | Focus |
|----------|-------|
| Assumptions | "What if [assumption] weren't true?" |
| Scope | "What's explicitly out of scope?" |
| Users | "Who are all affected users?" |
| Happy path | "What does success look like exactly?" |
| Edge cases | "Empty? Max values? Invalid input?" |
| Errors | "How should failures be communicated?" |
| State | "What states exist, how do they change?" |
| Data | "What inputs/outputs expected?" |
| Performance | "Latency/throughput requirements?" |
| Security | "What access controls needed?" |
| Integration | "How does this interact with existing systems?" |
| Observability | "How will we know it's working in production?" |
| Rollback | "What if we need to undo this?" |

Scale: simple 3-5 questions, medium 6-10, complex 10-15.
## Phase 3: Funnel Technique
Broad open → summarize → clarify (1-2 specific) → challenge assumption → explore alternative → check implications → summarize & confirm → probe gaps.
## Phase 4: Probing Deeper
**Laddering:** Keep asking "why" to reach core requirements. "I need a dashboard" → "What problem?" → "See status" → "What decisions?" → "Which items need attention?" → NOW you have the real requirement.

**Consequence mapping:** "If we did X, what else changes?", "What would break?", "Who's affected downstream?"
## Phase 5: Requirements Smells
| Smell | Response |
|-------|----------|
| Subjective ("user-friendly") | "What makes it user-friendly specifically?" |
| Ambiguous ("quickly") | "What's the target time/metric?" |
| Superlative ("best") | "Compared to what baseline?" |
| Totality ("all", "never") | "Are there exceptions?" |
| Vague scope ("handle errors") | "Which specific errors? How?" |
## Output
**ALWAYS use `question` tool** — never plain text questions.

Flow: analyze → summarize understanding → ask via `question` (1-2 questions) → process response → repeat.

After sufficient questions, emit REQUIREMENTS DISCOVERY SUMMARY: confirmed requirements with acceptance criteria, assumptions to validate, edge cases identified, remaining questions, suggested next steps.
## Anti-Patterns
| × Anti-Pattern | ✓ Fix |
|----------------|-------|
| Plain text questions | Use `question` tool |
| Leading questions | Neutral framing |
| Rapid-fire (>3) | Max 2-3, pause |
| Closed-only | Lead with open |
| No summarization | Regularly play back |
```
/adv-clarify COMPLETE
Result: {N} requirements clarified, {M} open questions
Next: /adv-discover, /adv-design, or /adv-task
```
