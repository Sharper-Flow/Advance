# Design: Fix /adv-triage GraphQL Budget Exhaustion

## Approach

Edit `.opencode/command/adv-triage.md` to replace `gh project item-edit` with batched `gh api graphql` mutations, add cached-read protocol, budget gate, and resume logic. Edit `SETUP.md` to document budget separation. Single-file command-contract correction (no plugin source changes).

## Files Touched

| File | Change type | Detail |
|------|-------------|--------|
| `.opencode/command/adv-triage.md` | Command contract edit | Phase 3b, Phase 4, Phase 5, Phase 6, Key Tools, Anti-Patterns sections |
| `SETUP.md` | Documentation edit | New section: GitHub GraphQL Budget |

## Design

### D1: Batched GraphQL Mutation Protocol

Replace all `gh project item-edit` calls with `gh api graphql` using aliased mutations.

**Mutation template (per item, 4 fields):**

```bash
gh api graphql --include -f query='
  mutation {
    tc: updateProjectV2ItemFieldValue(input: {
      projectId: "<project_id>", itemId: "<item_id>",
      fieldId: "<tc_field_id>", value: {number: <tc_value>}
    }) { projectV2Item { id } }
    rroe: updateProjectV2ItemFieldValue(input: {
      projectId: "<project_id>", itemId: "<item_id>",
      fieldId: "<rroe_field_id>", value: {number: <rroe_value>}
    }) { projectV2Item { id } }
    effort: updateProjectV2ItemFieldValue(input: {
      projectId: "<project_id>", itemId: "<item_id>",
      fieldId: "<effort_field_id>", value: {number: <effort_value>}
    }) { projectV2Item { id } }
    wsjf: updateProjectV2ItemFieldValue(input: {
      projectId: "<project_id>", itemId: "<item_id>",
      fieldId: "<wsjf_field_id>", value: {number: <wsjf_value>}
    }) { projectV2Item { id } }
  }'
```

**Single-field variant (Phase 3b Value writes):**

```bash
gh api graphql --include -f query='
  mutation {
    update: updateProjectV2ItemFieldValue(input: {
      projectId: "<project_id>", itemId: "<item_id>",
      fieldId: "<value_field_id>", value: {number: <value>}
    }) { projectV2Item { id } }
  }'
```

Note: `--include` flag required to access `x-ratelimit-remaining` response headers for post-mutation budget checks.

**Error handling:**
- Parse response for `errors` array (GraphQL returns HTTP 200 even with errors).
- Parse `x-ratelimit-remaining` from response headers — primary budget check mechanism.
- If `x-ratelimit-remaining` headers are missing (known edge case on error responses), fall back to separate `rateLimit` query.
- If `x-ratelimit-remaining: 0`, stop immediately and report reset time from `x-ratelimit-reset`.
- Per-alias errors: log failing alias + message, continue with next item.

### D2: Cached Project-State Protocol

**Phase 1 (source gathering):** Read `gh project item-list` once. Build map:

```
project_items = {
  <issue_number>: {
    item_id: "PVTI_...",
    fields: { value: <num|null>, timeCriticality: <num|null>, rroe: <num|null>, effort: <num|null>, wsjf: <num|null> },
    adv_type: "bug"|"feature",
    labels: [...],
    title: "...",
    url: "..."
  }
}
```

**Phase 4 (scoring):** Reuse Phase 1 `project_items` map. No additional `item-list` call needed at Phase 4 start (Phase 1 already captured all field values).

**Phase 5 (roadmap):** Fresh `item-list` call — reads post-mutation state for ROADMAP correctness.

### D3: GraphQL Budget Gate

**Pre-mutation check (before Phase 4 scoring loop):**

Single combined query for remaining + resetAt:

```bash
budget_info=$(gh api graphql -f query='{ rateLimit { remaining resetAt } }')
graphql_remaining=$(echo "$budget_info" | jq '.data.rateLimit.remaining')
graphql_reset=$(echo "$budget_info" | jq -r '.data.rateLimit.resetAt')

# Estimate: N features × 1 batch call + 1 Phase 5 read + 100 buffer
estimated=$((features_needing_scoring + 1 + 100))
if [ "$graphql_remaining" -lt "$estimated" ]; then
  echo "[ADV:BLOCKED] GraphQL budget insufficient: ${graphql_remaining} remaining, ${estimated} needed. Resets at ${graphql_reset}."
  # Stop Phase 4, skip to report
fi
```

**Post-mutation check:** Use `x-ratelimit-remaining` from `gh api graphql --include` response headers (not a separate query). If `< 10`, stop and report. If headers missing, fall back to `rateLimit` query.

**Same gate before Phase 3b Value writes.**

### D4: Sequential Paced Writes

- 1-second `sleep` between batch requests.
- No concurrent mutation requests.
- On rate-limit error in response: stop immediately, emit `[ADV:BLOCKED]` with reset time, do not retry.

### D5: Idempotent Resume

Before constructing each item's batch mutation:

1. Check cached `project_items[issue_number].fields` for each target field.
2. Compare target value vs current value.
3. If all 4 fields (TC, RROE, Effort, WSJF) already match targets → skip entire item, log "skipped: already correct".
4. If subset matches → only include non-matching fields in batch mutation.
5. `--rescore` flag overrides: always include all 4 fields regardless of current values.

**Float comparison:** WSJF values compared with `±0.05` tolerance (WSJF range 0-39, float64 precision is exact at this range, but tolerance provides safety margin).

### D6: Phase 3b Value Writes

Replace line 217 (`gh project item-edit`) with single-field `gh api graphql --include` mutation. Same error handling and budget gate pattern. Value writes are typically 1 call per feature.

### D7: Phase 6 Report Addition

Add to report template:

```
### API Budget
- GraphQL points consumed: {N} (estimated)
- GraphQL points remaining: {N}
- GraphQL reset: {ISO-8601}
- Batch mutations issued: {N}
- Items skipped (already correct): {N}
```

### D8: SETUP.md Documentation

New section after GitHub CLI auth:

```markdown
### GitHub GraphQL Budget

GitHub enforces two separate rate-limit budgets:

| Budget | Scope | Limit |
|--------|-------|-------|
| REST / Core | Per user per hour | 5,000 requests |
| GraphQL | Per user per hour | 5,000 points |

Projects v2 operations (`gh project item-list`, `gh api graphql` against ProjectV2 types) consume the **GraphQL** budget. Issue operations (`gh issue list`, `gh issue create`) consume the **REST** budget.

`/adv-triage` uses batched GraphQL mutations to minimize budget consumption: 4 field updates per HTTP request instead of 1. For N features needing scoring, the command issues approximately N batch requests + 2 reads.

**Multi-session note:** All `opencode` sessions on the same machine share the same `gh auth` token and its GraphQL budget. Plan for N concurrent triage runs sharing one 5,000/hr pool.
```

## Key Tools Update

Replace `gh project item-edit` row with:

| Purpose | Tool |
|---------|------|
| Edit project field (single) | `gh api graphql --include -f query='mutation { ... }'` |
| Edit project fields (batch 4) | `gh api graphql --include -f query='mutation { tc: ... rroe: ... effort: ... wsjf: ... }'` |
| Check GraphQL budget (initial gate) | `gh api graphql -f query='{ rateLimit { remaining resetAt } }'` |
| Check GraphQL budget (per-response) | Parse `x-ratelimit-remaining` from `--include` response headers |

## Anti-Patterns Update

Add:

| × Bad | ✓ Good |
|-------|--------|
| Use `gh project item-edit` for bulk writes (1 field/call) | Use `gh api graphql` batched mutations (4 fields/call) |
| Ignore `x-ratelimit-remaining` response header | Check after each batch via `--include` flag; stop if < 10 |
| Use `rateLimit` query for every post-mutation check | Use response headers (primary); `rateLimit` query only for initial gate and fallback |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Batch mutation timeout (>10s) | Low (4 simple mutations) | Medium — partial write | Cap batch at 4; if timeout, re-check budget gate, retry as individual calls |
| GraphQL schema change | Low | Low — stable mutation | Version check in Phase 0 |
| Response parsing error | Low | Medium — silent failure | Validate response structure before continuing |
| Resume miscompares float values | Medium (WSJF rounding) | Low | Compare with tolerance (±0.05) for WSJF; exact match for integers |
| Missing rate-limit headers on error response | Low | Medium — can't track budget | Fallback to `rateLimit` query |

## Validation

Independent validator verdict: **VALIDATED** (3 suggestions incorporated: `--include` flag for headers, combined `rateLimit` query, header-absent fallback; 1 question addressed: timeout retry re-checks budget gate).

## No Spec Deltas

This change modifies a utility command contract (`.opencode/command/adv-triage.md`). No formal capability spec exists for triage. No spec deltas required.