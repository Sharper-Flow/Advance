# Problem Statement

## Root Cause

Agents — especially GPT-family models — frequently misuse ADV MCP tools. The most visible symptom is that `adv_change_create` receives placeholder-heavy payloads: blank strings, zero-valued integers, empty arrays, and sentinel values like `"none"` for fields the agent shouldn't set. But this is a surface manifestation of a deeper problem: **agents lack sufficient structural guidance on how ADV tools expect to be called.**

## Evidence

1. **Reproduced in-session:** This change was created only after multiple failed `adv_change_create` attempts with blank `agreement`, `design`, `executiveSummary`, `target_path`, `origin_issue_number: 0`, and `origin_source_artifact: ""` — all rejected by preflight before succeeding with a 4-field minimal payload.
2. **GPT-specific severity:** The placeholder pattern is significantly worse with GPT models. Provider hints already say "omit rather than guess" but GPT agents still send placeholder values for optional fields.
3. **Cross-tool pattern:** The same issue affects `adv_change_update`, task tools, and likely other ADV mutation tools.
4. **Flat schema amplifies the problem:** ADV tool schemas are flat with many optional fields. LLMs interpret flat optional schemas as "fill everything," leading to placeholder pollution.

## Impact

- Wasted agent turns on rejected tool calls
- Agents get stuck in retry loops, unable to self-correct
- User frustration from stalled workflows
- Degraded trust in ADV tooling reliability across providers

## Scope

This change addresses placeholder-sensitive ADV tool argument traps across ADV tools, anchored by `adv_change_create`:
1. Structural preflight handling of placeholder/blank fields
2. Guidance and diagnostics for canonical minimal calls
3. Provider behavior evidence
4. Same field-policy pattern for durable state, audit, workflow transitions, paths, external execution, and semantic filters
