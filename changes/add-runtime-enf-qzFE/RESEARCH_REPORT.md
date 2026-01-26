# Architecture Research: add-runtime-enf-qzFE

## Summary

Research validated all four architectural decisions in the proposal. Key finding: the `tool.execute.after` hook approach for context injection has concerns - the SDK provides a purpose-built `experimental.chat.system.transform` hook that is simpler and safer. All other decisions (Zod schema extension, embedded JSON storage, soft reminder pattern) are validated as best practices.

## Validated Decisions

| Decision | Status | Rationale |
|----------|--------|-----------|
| Zod `.optional()` for schema extension | **VALIDATED** | Idiomatic pattern for backwards-compatible schema evolution |
| Embedded wisdom in `change.json` | **VALIDATED** | One-to-few relationship, bounded lifecycle, matches existing `tasks[]` pattern |
| Soft reminder vs hard block | **VALIDATED** | Research shows soft+escalation outperforms hard blocks; matches doom loop pattern |
| Nanoid for IDs | **VALIDATED** | Already in use, no change needed |

## Simplification Opportunities

| Current Approach | Simpler Alternative | Effort | Recommendation |
|------------------|---------------------|--------|----------------|
| `tool.execute.after` for context injection | `experimental.chat.system.transform` | Low | **CHANGE** - purpose-built, no corruption risk |
| Separate wisdom tools file | Could be in task.ts | Trivial | Keep separate - clearer organization |

## Concerns

### Hook Approach Change (MEDIUM)

**Current Plan:** Inject context by mutating `output.output` in `tool.execute.after`

**Concern:** This hook is designed for observation (logging, state tracking), not transformation. Mutating JSON tool output risks corruption.

**Resolution:** Use `experimental.chat.system.transform` instead:
```typescript
"experimental.chat.system.transform": async (input, output) => {
  // Inject todos and wisdom into system prompt
  output.system.push("## Active Tasks\n...");
  output.system.push("## Accumulated Wisdom\n...");
}
```

**Benefits:**
- Purpose-built for context injection
- Affects all LLM interactions, not just specific tool responses
- No risk of corrupting structured tool output
- Already have precedent with `experimental.session.compacting`

## Anti-Patterns Detected

None. The proposal follows established patterns.

## Over-Engineering Flags

None. The approach is appropriately minimal:
- Uses existing Zod patterns
- Reuses existing storage mechanisms
- Leverages SDK hooks
- No new dependencies

## Detailed Findings

### 1. Zod Schema Extension
**Current:** Add optional `wisdom` field to `ChangeSchema`  
**Research:** Zod's `.optional()` is explicitly designed for this. Old files without the field parse successfully; new files include it.  
**Simpler Option:** None - this IS the simple solution  
**Recommendation:** Proceed as planned  
**Sources:** Zod GitHub docs - handling optional fields, schema extension

### 2. Plugin Hook Pattern
**Current:** Use `tool.execute.after` to inject context into tool responses  
**Research:** OpenCode SDK provides `experimental.chat.system.transform` specifically for context injection. The `after` hooks are observation-style (like Webpack's SyncHook), not transformation-style.  
**Simpler Option:** Use `experimental.chat.system.transform` for context injection, keep `tool.execute.after` for state tracking  
**Recommendation:** **CHANGE approach** - use purpose-built hook  
**Sources:** @opencode-ai/plugin SDK types, Webpack Tapable patterns

### 3. Wisdom Storage Location
**Current:** Embed wisdom array in `change.json`  
**Research:** One-to-few relationship pattern; bounded by change lifecycle; matches existing `tasks[]` pattern; simpler atomicity than separate files  
**Simpler Option:** None - embedding IS the simple solution  
**Recommendation:** Proceed as planned  
**Sources:** Azure Cosmos DB data modeling guide, JSON Lines spec, ADV codebase patterns

### 4. Soft vs Hard Enforcement
**Current:** Soft reminder (context injection) when tasks remain  
**Research:** Academic research (AgentSpec, Pro2Guard, RACER) shows soft+escalation outperforms hard blocks. Hard blocks without recovery paths cause deadlocks and retry loops. ADV's existing doom loop protocol (3 attempts → escalate) matches validated patterns from LangChain/AutoGen.  
**Simpler Option:** None - soft+escalation IS the established pattern  
**Recommendation:** Proceed as planned  
**Sources:** arXiv papers on agent enforcement, LangChain/AutoGen documentation

## Action Items

- [ ] Change hook approach from `tool.execute.after` to `experimental.chat.system.transform` for context injection (tasks tk-X9tHQWw9, tk-MneOBYqN, tk--O8jw8fk)
- [ ] Keep `tool.execute.after` for observation only (TDD detection, sub-agent tracking)
- [ ] Update proposal.md with research validation section
- [ ] No changes needed for schema, storage, or soft reminder decisions

## Confidence

**High:**
- Zod schema extension pattern
- Embedded JSON storage
- Soft reminder + escalation approach

**Medium:**
- `experimental.chat.system.transform` availability (need to verify SDK version)

## Research Sources

1. Zod GitHub Documentation - Schema extension and optional fields
2. @opencode-ai/plugin SDK - Hook type definitions
3. Webpack Tapable - Hook pattern classification
4. Azure Cosmos DB - Data modeling best practices
5. JSON Lines specification - When to use JSONL vs JSON
6. arXiv:2503.18666v3 - AgentSpec runtime enforcement
7. arXiv:2508.00500v2 - Pro2Guard proactive enforcement
8. arXiv:2409.14674v1 - RACER failure recovery
9. LangChain/LangGraph documentation - Retry policies, HITL patterns
10. AutoGen documentation - Iterative learning, termination handling
