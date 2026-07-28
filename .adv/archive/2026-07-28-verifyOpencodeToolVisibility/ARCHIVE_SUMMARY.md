# Archive: Verify OpenCode tool visibility

**Change ID:** verifyOpencodeToolVisibility
**Archived:** 2026-07-28T07:01:08.237Z
**Created:** 2026-07-27T23:37:27.962Z

## Tasks Completed

- ✅ Shared frontmatter validation core (manifest-frontmatter.ts)
  > Task checkpoint completed
- ✅ Make generator frontmatter-aware + strengthen tier4 placement test
  > Task checkpoint completed
- ✅ CI check script + chain into pnpm run check
  > Task checkpoint completed
- ✅ Replace check_agent_frontmatter with real YAML preflight
  > Task checkpoint completed
- ✅ Fix 9 ADV-owned assets with unparseable frontmatter
  > Task checkpoint completed
- ✅ Plugin-init runtime frontmatter scan + yaml dep promotion + bundle measurement
  > Task checkpoint completed
- ✅ Empirical re-probe: verify tool surface matches declared manifest
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Cached prompt tokens are NOT free, and the discount ratio varies ~2x by vendor. Moonshot Kimi K2.7 Code: cache-hit $0.19/M vs fresh $0.95/M = 0.20x. Anthropic is 0.10x; OpenAI 0.25-0.50x. Measured adv-engineer spend 2026-07-21..27: 25,890 calls, 2,707M cached-read tokens, and 78% of the $660 total was cached-input re-read (not misses — cache hit rate was 0.95 with zero mid-session model switches). Implication for ADV: fixed prompt weight (tool schemas, instructions, agent prompt) is paid on EVERY turn at 20% rate. "It's cached so it's free" is false. Reducing injected tool-schema weight has direct measurable cost impact. Source: platform.kimi.ai/docs/pricing/chat-k27-code, dev.opencode.ai/docs/go, Fireworks launch post.
- **[gotcha]** OpenCode v1.18.7 verified facts about agent prompt assembly (pinned source, packages/): (1) Config `instructions[]` AND global/project AGENTS.md inject into EVERY session including spawned sub-agents — `Instruction.system()` (session/instruction.ts:152-177) takes no agent argument. (2) There is NO per-agent instruction exclusion mechanism; the agent schema (core/src/v1/config/agent.ts:10-41) has no `instructions` field. So every token in the global instructions array is multiplied across every agent lane. (3) `tools:` frontmatter is DEPRECATED and normalizes to the same permission ruleset as `permission:`, with explicit `permission:` merging OVER it (agent.ts:67-81) — a per-agent `permission` block in opencode.jsonc overrides the generated manifest. (4) Code Mode (`OPENCODE_EXPERIMENTAL_CODE_MODE=true`) removes MCP tools from top-level and exposes `execute` instead (session/tools.ts:383-390); plugin tools are NOT affected. The `execute` catalog is budgeted at 2,000 estimated tokens with `PARTIAL - N of M shown` truncation (codemode/src/tool-runtime.ts:86-88). Re-verify against the deployed binary before relying on any of this — upstream `dev` and pinned 1.18.7 gave contradictory answers on whether denied tools are filtered from the payload.
