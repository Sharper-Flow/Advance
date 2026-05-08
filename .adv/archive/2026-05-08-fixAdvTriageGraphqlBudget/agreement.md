# Agreement

## Objectives

1. Replace `gh project item-edit` with `gh api graphql` batched mutations (4 field updates per item per request) in Phase 4 scoring and Phase 3b Value writes.
2. Add cached project-state protocol: one `item-list` call per phase, local `issue_number → {item_id, current_fields}` map, no re-reads inside write loops.
3. Add GraphQL budget estimation gate: `estimated_batch_calls + 100 ≤ remaining`; halt with reset time if insufficient.
4. Add sequential paced writes: 1-second delay between batch requests; immediate stop on rate-limit error.
5. Add idempotent resume: detect already-correct field values, skip matching batches.
6. Phase 5 ROADMAP generation uses separate `item-list` read for freshness.
7. Update SETUP.md with REST/core vs GraphQL budget separation docs.
8. Update Phase 6 report to include GraphQL points consumed.
9. Validate by resuming interrupted triage after GraphQL reset.
10. Record GitHub App auth as deferred follow-up objective.

## Acceptance Criteria

1. `adv-triage.md` Phase 4 replaces `gh project item-edit` with `gh api graphql` batched mutations — 4 field updates per item in one GraphQL request (aliased `updateProjectV2ItemFieldValue` mutations).
2. `adv-triage.md` Phase 4 specifies: one `item-list` call at phase start to cache `issue_number → {item_id, current_fields}` map; no `item-list` calls inside write loops.
3. `adv-triage.md` Phase 4 specifies: GraphQL budget estimation before mutations (`estimated_batch_calls + 100 ≤ remaining`); halt with reset time if insufficient.
4. `adv-triage.md` Phase 4 specifies: 1-second delay between batch requests; immediate stop on rate-limit error with reset time reported.
5. `adv-triage.md` Phase 4 specifies: resume reads project state once, detects already-correct field values per batch, skips batches where all fields match.
6. `adv-triage.md` Phase 5 uses a separate `item-list` read (not Phase 4 cache) for ROADMAP generation freshness.
7. `adv-triage.md` Phase 3b Value writes also use batched GraphQL mutations (consistent approach).
8. `SETUP.md` documents: REST/core (5000/hr) and GraphQL (5000/hr) are separate budgets; Projects v2 operations consume GraphQL budget; N concurrent sessions share one token's budget; batching reduces consumption 4×.
9. Resume of current interrupted triage completes without GraphQL rate-limit error.
10. All 18 Must-Not rules from proposal remain satisfied.
11. Phase 6 report includes GraphQL points consumed this run.
12. GitHub App auth recorded as deferred follow-up objective (separate 5000/hr budget per installation).

## Constraints

- Keep GitHub Projects v2 as canonical store.
- Keep `ADV Type` field name (GitHub reserves `Type`).
- Preserve existing Tier B approvals for issue creation, Value/Priority assignment, ROADMAP commit.
- Prefer command-contract correction over new tool implementation.
- P33: structural identifiers and typed fields own writes; heuristics only suggest candidates.
- Sharper-Flow org is on Team plan (not Enterprise Cloud); 5000/hr user GraphQL limit applies.
- GraphQL rate limit is per-user not per-token; multiple PATs share the same pool.

## Avoidances

- No replacing GitHub Projects v2 as canonical store.
- No new MCP tool in v1.
- No custom GraphQL batch mutation client beyond `gh api graphql`.
- No changing WSJF formula or user-owned Value/Priority model.
- No auto-creating or auto-scoring issues without Tier B approvals.
- No GitHub App auth implementation in this change (deferred).
- No multi-agent budget coordination (deferred).

## Decisions

### User Decisions

1. **Resume scope:** Trust user-assigned fields (Value/Priority) on resume; only re-read agent-scored fields (TC/RROE/Effort/WSJF). — Avoids unnecessary re-validation of user-owned data.
2. **Rate limit scope:** Primary hourly limit (5000/hr) only; 1-second delays between batch requests naturally stays under secondary limit (2000/min). Simpler command text.
3. **Phase 5 freshness:** Separate `item-list` read for ROADMAP generation. 1 extra point, guarantees correctness.
4. **Batch mutation approach:** Replace `gh project item-edit` with direct `gh api graphql` aliased mutations. 4× reduction in API calls and budget consumption.
5. **Scale target:** Single-session safety; document multi-session shared-budget constraint. Multi-agent coordination and GitHub App auth deferred to separate change.
6. **S1 verification:** Resume completes without rate-limit error (simpler bar, per user preference).

### Agent Decisions (LBP)

1. **Cache model:** Conceptual/instructions-only, no temp file. `item-list` costs 1 point; re-reading is cheap if cache is lost.
2. **Budget buffer:** Fixed +100 points. Simple, conservative.
3. **Batch size:** 4 mutations per request (one item's 4 fields). Natural boundary, avoids timeout, easy to reason about.
4. **Incident issue:** Defer GitHub issue creation to post-correction. Avoid scope creep.
5. **GraphQL batching research:** Aliased `updateProjectV2ItemFieldValue` mutations confirmed viable via GitHub docs and community patterns. Primary point cost is per-request not per-mutation.

## Deferred Questions

1. **GitHub App auth** — Creating a GitHub App installation for ADV triage would provide a separate 5000/hr budget independent of the user's personal budget. Requires: app registration, PEM key storage, installation token generation (JWT → installation token → `GH_TOKEN` injection). Deferred to separate change `advGithubAppAuth`.
2. **Multi-agent budget coordination** — For N concurrent agents sharing one token, a semaphore or budget-reservation mechanism via `adv_project_metadata` could prevent budget collisions. Deferred; single-session safety + documentation is sufficient for current scale.
3. **Enterprise Cloud upgrade** — Would double per-user limit to 10,000/hr. Org billing decision, not a code change.

## Sign-Off

AC approved by user via Tier A inline approval at Phase 4.5.1.