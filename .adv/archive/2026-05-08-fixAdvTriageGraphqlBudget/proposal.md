## Discovery Findings

### Discovery Checklist

| Step | Status | Detail |
|------|--------|--------|
| Phase 1.0: Lineage Validation | PASS | No `cross_project_origin` or `fast_follow_of`. Local change. |
| Phase 1.5: Skill Discovery | PASS | No skills match GraphQL/GitHub-API/triage domain. No pending-review skills. |
| Prior Research Extension | PASS | Cited `docs/repo-improve-prep.md` (broad polish scan, not directly relevant). New finding: confirmed `gh project item-list` returns all field values per item in one call, making per-field re-reads unnecessary. |
| Conflict & Related-Work Scan | PASS | No overlapping active changes. `programmaticgitmutationguard` (draft) is git-guard focused, not triage. No agenda overlap. Validation: 0 errors, 11 expected pre-prep warnings. |
| Edge Case Investigation | PASS | See Edge Cases section below. |
| Design Question Depth | PASS | See Open Design Questions section below. |
| Draft Spec Delta Shapes | SKIP | No existing triage spec. Command is a utility, not a formal capability. Delta not required — change is command-contract correction only. |
| P25 Related-Pattern Scan | PASS | No similar rate-limit caching patterns in codebase. `item-list`/`item-edit` only appear in `adv-triage.md` and its archived design. No rate-limit handling exists anywhere else. |
| LBP Check | PASS | Direct GraphQL batching + cached reads + budget estimation is industry-standard. GitHub's own docs recommend batching and request minimization. No external alternatives apply — purely internal command-contract correction. |

### Skills Considered

| Skill | Match Assessment | Action |
|-------|-----------------|--------|
| adv-tron | Codebase reconnaissance — tangential | Not loaded |
| adv-comp-research | Competitive intel — not applicable | Not loaded |
| adv-slop-detection | Code quality — not applicable | Not loaded |
| No other skills match GraphQL/GitHub-API domain | — | No skill creation triggered (command-contract fix, not domain methodology) |

### Extends

**Cited artifacts:**
1. `docs/repo-improve-prep.md` — Broad polish scan (2026-05-04). Covers code quality, testing, DX, observability. Not directly relevant to GraphQL budget but provides context on codebase health.

**New findings beyond cited artifacts:**
1. **`gh project item-list` returns all custom field values in one call** — confirmed via live test: `--limit 1` returns all fields per item. No need for per-field reads.
2. **`gh project item-edit` is confirmed single-field per invocation** — `--help` shows no batch mode. This is the root cause of excessive API calls.
3. **GraphQL aliased mutations enable N field updates per HTTP request** — `updateProjectV2ItemFieldValue` can be called N times with aliases in one `gh api graphql` call. Reduces 152 calls → 38 calls (4× improvement).
4. **Primary GraphQL point cost is per-request, not per-mutation** — batching 4 mutations into 1 request costs ~1 primary point instead of ~4.
5. **Secondary rate limit: 5 points per mutation-bearing request** — batching also reduces secondary consumption 4×.
6. **`--query` filter on `item-list`** supports server-side filtering for payload optimization.
7. **GitHub rate limit is per-user, not per-token** — multiple PATs for same user share the same 5000/hr pool.
8. **GitHub App installation tokens get separate 5000/hr budget** — potential future optimization, deferred to separate change.
9. **Sharper-Flow org is on Team plan** (not Enterprise Cloud) — 5000/hr user limit, 5000/hr app installation limit.
10. **`gh` CLI supports `GH_TOKEN` env var** — can inject app tokens or any token without `gh auth login`.

### Conflict Scan

- **Active changes:** `fixAdvTriageGraphqlBudget` (this change), `cavemanCompressAdvInstruction` (draft, unrelated), `programmaticgitmutationguard` (draft, git-guard focused, 6/6 tasks done). No file overlap.
- **Validation:** Passed (0 errors). 11 warnings: NO_TASKS, NO_DELTAS, PROPOSAL_TASK_DRIFT — all expected pre-prep.
- **Agenda:** 18 items, none overlap with triage GraphQL budget fix.
- **Archived changes:** `addAdvTriageCommandBacklog` (the original triage command creation) — relevant as parent context, not a conflict.

### Current State

**What exists today:**
- `.opencode/command/adv-triage.md` — 481-line command spec with 6 phases. Phase 4 (Agent Scoring) at line 224 instructs the agent to write fields via `gh project item-edit` but does NOT specify a caching protocol, budget check, or batching strategy.
- Phase 1 (line 96) reads `gh project item-list` once for source gathering.
- Phase 5 (line 264) reads `gh project item-list` once for roadmap generation.
- **No rate-limit estimation, no cached item-ID map, no batch mutations, no resume-from-partial logic exists in the command text.**
- The live incident proved the agent called `item-list` inside the write loop (shell helper `get_item()` resolving issue_number → item_id per field update).
- GraphQL budget at incident: 75/5000 remaining. Currently: 67/5000, resets ~19:43Z UTC.
- Project has 38 items. Partial scoring: some features have TC/RROE/Effort/WSJF written, others don't.
- Field IDs already cached in `adv_project_metadata` key `github_project`.

**Gap being addressed:** The command contract uses `gh project item-edit` (1 field per call) for mutations. Replacing with direct `gh api graphql` batched mutations reduces API calls 4×. Combined with cached reads and budget gates, prevents budget exhaustion.

### Edge Cases

**Gap 1: Partial writes after rate-limit interrupt**
- EC1a: Agent scores TC for all features, then rate-limits on RROE — resume must detect TC is done per-item and skip those
- EC1b: Rate limit hits mid-batch (4 mutations in one request, 2 succeed, 2 fail) — GraphQL executes mutations sequentially within a request; partial failure returns errors for specific aliases
- EC1c: User re-runs after reset with `--rescore` — all fields should be overwritten despite being populated

**Gap 2: Batch mutation construction**
- EC2a: GraphQL request exceeds node limit or 10s timeout — must cap mutations per request (recommend 4-8 per request)
- EC2b: One mutation in a batch fails (e.g., stale item ID) — other mutations in same batch may still succeed; must parse per-alias errors
- EC2c: Field value is null/empty (unset) — `updateProjectV2ItemFieldValue` with `{number: 0}` vs clearing — must handle zero vs unset

**Gap 3: Project schema drift**
- EC3a: Field renamed between runs — cached field ID invalid; `item-list` still works (returns current field names); re-cache on mismatch
- EC3b: Item removed from project between read and write — batch mutation returns error for that alias; log and continue
- EC3c: New field added — doesn't affect existing writes; Phase 0 bootstrap already handles field creation

**Gap 4: `gh api graphql` error handling**
- EC4a: GraphQL returns `{ errors: [...] }` with HTTP 200 — must parse error array, not just HTTP status
- EC4b: Rate limit error mid-batch — `x-ratelimit-remaining: 0` in response headers; stop immediately
- EC4c: Timeout (>10s) on large batch — reduce batch size and retry

### Open Design Questions

| Question | Trust Model | Blast Radius | Alternatives | Decision |
|----------|-------------|--------------|--------------|----------|
| DQ1: Batch size cap? | Agent-only | Low — oversized batches may timeout | A) 4 per item (all fields for one item). B) 8 (two items). C) No cap. | **4 per item** — natural boundary, avoids timeout, easy to reason about |
| DQ2: Should Phase 3b Value writes also use batch mutations? | Agent-only | Low | A) Yes — consistent approach. B) No — Phase 3 is already Tier B gated, low call count. | **Yes** — consistent, and Value is set per-feature in same loop |
| DQ3: Budget buffer threshold? | Agent-only | Low | A) Fixed +100. B) 20% remaining. C) Adaptive. | **+100** — simple, conservative |
| DQ4: GitHub issue for incident? | Joint | None | A) Now. B) After fix. | **After fix** — avoid scope creep |
| DQ5: GitHub App auth for separate budget? | Joint | Medium (new infra) | A) This change. B) Deferred future change. | **Deferred** — record in agreement as follow-up objective |

### Draft Spec Deltas

No spec deltas required. `/adv-triage` is a utility command without a formal capability spec. The fix is a command-contract correction to `.opencode/command/adv-triage.md` only.

### Related Pattern Scan

Searched for: `item-list`, `item-edit`, `rate.limit`, `graphql`, `budget`, `gh api graphql` across the codebase.
- **No similar rate-limit caching or batching patterns exist** — this is the only command that does bulk GraphQL writes.
- `item-list`/`item-edit` only appear in `adv-triage.md` and its archived design.
- No rate-limit handling exists anywhere in plugin source or command specs.
- **Result: no similar patterns found.**

### LBP Check

**Direction:** Direct GraphQL batched mutations + cached single-read + budget gate + sequential paced writes + idempotent resume.

**Evidence:**
1. GraphQL batching (aliased mutations) is standard practice — reduces HTTP round trips and point cost.
2. GitHub's own optimization docs recommend: "Split large queries", "Request only required fields", "Reduce query depth".
3. Cached-read-then-write pattern is the canonical approach for bulk API operations.
4. Budget estimation with safety buffer is standard for rate-limited APIs.
5. `gh api graphql` is fully supported and documented — no hack or workaround.

**No external alternatives apply** — this is a purely internal command-contract correction using GitHub's first-party APIs.

### Budget Model (revised with batching)

| Scenario | Mutations | Batch calls (4/batch) | Primary points | % of 5000 |
|----------|-----------|----------------------|----------------|-----------|
| Current (38 items, 4 fields) | 152 | 152 (1-field each) | ~152 | 3.0% |
| Fixed (batch 4/batch) | 152 | 38 + 2 reads | ~40 | 0.8% |
| 10× scale (10 agents, batch) | 1520 | 380 + 20 reads | ~400 | 8.0% |
| 10× scale current approach | 1520 | 1520 | ~1520 | 30.4% |

Batching reduces budget consumption 4× at any scale.

### Recommended Objectives

1. Replace `gh project item-edit` with `gh api graphql` batched mutations (4 fields per request per item) in Phase 4.
2. Add cached project-state protocol to Phase 4: one `item-list` call at start, build local `issue_number → {item_id, current_field_values}` map.
3. Add GraphQL budget estimation gate before Phase 4 mutations: estimate batch calls, check `remaining ≥ estimated + 100`, halt if insufficient with reset time.
4. Add 1-second delay between batch requests; stop immediately on rate-limit error with reset time reported.
5. Add idempotent resume logic: before each batch, check if all field values in the batch already match targets; skip if correct.
6. Phase 5 uses separate `item-list` read for ROADMAP freshness (not Phase 4 cache).
7. Update SETUP.md: REST/core (5000/hr) vs GraphQL (5000/hr) budget separation; N concurrent sessions share one token's budget.
8. Update Phase 6 report: show GraphQL points consumed.
9. Validate by resuming interrupted triage after GraphQL reset.
10. Record GitHub App auth as deferred follow-up objective (separate 5000/hr budget per installation).

### AMBIGUITY ANALYSIS

| ID | Severity | Category | Finding |
|----|----------|----------|---------|
| S1 | LOW | Completion Signals | "Resume completes without rate-limit error" — verifiable but doesn't guarantee field correctness. Accepted per user preference. |

Coverage: B:C F:C S:P M:C

**Trigger evaluation:** 0 CRITICAL, 0 HIGH, 1 LOW. Continue to Phase 3.