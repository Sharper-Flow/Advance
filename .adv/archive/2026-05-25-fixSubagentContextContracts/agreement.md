# Agreement

## Objectives

- O1: Repair typed sub-agent context identity gaps for `phase`, `attempt`, and `task_id`.
- O2: Make report-schema-to-context-packet coverage structural and test-enforced.
- O3: Preserve strict Zod ingest and durable task report persistence semantics.
- O4: Keep scanner lanes and typed persisted worker lanes distinct.
- O5: Add durable guidance so future agent-callable tool / sub-agent contract work checks schema, context packet, prompt, and skill surfaces together.

## Acceptance Criteria

- AC1: `adv-reviewer` remediation packets include `WORKING DIRECTORY`, `CHANGE`, `TASK`, `PHASE`, and `ATTEMPT` anchors.
- AC2: `adv-engineer` typed-worker packets include `WORKING DIRECTORY`, `CHANGE`, `TASK`, and `ATTEMPT` anchors.
- AC3: `/adv-review` and `/adv-harden` scanner lanes remain non-persisted `explore` output contracts and do not claim `adv_subagent_report_submit` transport.
- AC4: Asset/schema tests fail when report-required identity fields lack command-packet and agent-instruction coverage.
- AC5: `subagent-reports` and `delegation-defaults` specs pin `PHASE`, `TASK`, `ATTEMPT`, and scanner-vs-worker lane distinction where under-specified.
- AC6: Strict ingest remains intact: malformed persisted reports return `INVALID_REPORT`; unsupported reserved agents return `UNSUPPORTED_AGENT`.
- AC7: Focused asset/schema tests and `pnpm run check` pass.
- AC8: A clear durable doc is added for agent-callable tool / sub-agent context contracts, and the relevant globally synced skill guidance is updated so future tool/agent builders check schema, context packet, prompt, and tests together.

## Constraints

- C1: Use structural correctness first: Zod schemas, typed maps, parsers, asset tests, and spec anchors own enforcement where possible.
- C2: Do not weaken required report schema fields or accept missing `phase`, `attempt`, or `task_id` for typed persisted reports.
- C3: Keep `explore` scanners useful as read-only/non-persisted analysis workers.
- C4: Preserve `adv-engineer` and `adv-reviewer` no-nested-delegation and no-ADV-orchestration-mutation boundaries.
- C5: Include only small adjacent guardrails found during discovery when local, low-risk, and same-pattern.
- C6: Update specs now when implementation reveals under-specified packet/report contracts.

## Avoidances

- DONT1: Do not redesign the full ADV delegation system.
- DONT2: Do not add persisted report support for `adv-researcher` or `adv-tron` in this change.
- DONT3: Do not migrate all scanner flows to typed persisted reports.
- DONT4: Do not introduce runtime packet generation unless design proves it simpler and safer than asset tests.
- DONT5: Do not rely on prose-only reminders as the recurrence-prevention mechanism.
- DONT6: Do not expand into unrelated review/harden verdict logic.

## Out of Scope

- OOS1: Full delegation routing redesign.
- OOS2: Persistent typed report schemas for `adv-researcher` and `adv-tron`.
- OOS3: Changing OpenCode built-in skill source outside this repository if it is not repo-owned; if the most relevant built-in skill is not editable here, update the closest repo-owned globally synced ADV skill and cite the limitation in the doc.

## Decisions

### User Decisions

- Include small adjacent guardrails found during discovery.
- Require focused asset/schema tests plus `pnpm run check` for acceptance evidence.
- Update specs now when they under-specify packet contracts.
- Add a clear doc and relevant globally synced skill guidance so future agent-callable tool builders do not repeat this contract-gap class.

### Agent Decisions (LBP)

- Split scanner packets from remediation worker packets rather than making one conditional packet.
- Use a small schema-adjacent anchor map for required context fields instead of scattered hardcoded assertions.
- Keep strict Zod ingest as the boundary; fix packets/prompts/tests rather than relaxing validation.
- Treat `customize-opencode` as the relevant global skill conceptually for agent-callable tools, but verify repo ownership during implementation. If built-in content is not repo-editable, update a repo-owned globally synced ADV skill such as `adv-arch-detection` or an appropriate bundled guidance skill and link the new doc.

## Deferred Questions

None.

## Sign-Off

User approved acceptance criteria and added AC8 via reply: `approve -- make sure we have a clear doc and add to relevant global skill so we dont make a similar mistake when building agent callable tools again`.