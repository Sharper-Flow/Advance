# adv-triage WSJF + Scoring

## Match algorithm

Structural first, heuristic last:

1. **Stable ref match** — issue body contains source `ref` (`wisdom-id`, `tk-...`, `file:line`, `change-id`). Exact evidence → represented.
2. **Body excerpt match** — first 80 chars of source body, lowercased/normalized, appears verbatim in open issue body. Exact evidence → represented.
3. **Title similarity** — Jaccard similarity of normalized title tokens ≥ `0.6`. Heuristic only → candidate duplicate, not represented.

Title normalization: lowercase, trim, collapse whitespace, strip punctuation, drop stopwords (`a`, `the`, `and`, `or`, `for`, `to`, `of`, `in`).

Only ref/body matches may auto-suppress issue creation. Title similarity stays in user-confirmation list with candidate issue number.

## Feature Value rubric

Value is user-owned unless user explicitly selects autofill.

| Value | Meaning |
|---|---|
| 1-2 | cosmetic, niche, single-user, easily deferrable |
| 3 | quality-of-life, narrow surface, no growth multiplier |
| 5 | active workflow improvement, recurring friction signal |
| 8 | core differentiator, unblocks roadmap stream, broad surface |
| 13 | strategic/foundational, blocks multiple workflows or commitments |

Autofill requires issue-body quote or `(no body content)` marker and an `<!-- adv-triage:scoring v1 ... -->` evidence block. If signal insufficient, log `autofill_failed: insufficient_signal` and defer. Do not guess.

Bug priority is user-only. Autofill MUST NOT apply to bugs.

## Agent scoring

For each feature with Value set but missing TimeCriticality/RROE/Effort (or all when `--rescore`), assign modified-Fibonacci values: `1, 2, 3, 5, 8, 13`.

`WSJF = (Value + TimeCriticality + RROE) / Effort`, rounded to 1 decimal.

| Dimension | Anchor 1-2 | Anchor 8-13 |
|---|---|---|
| Value | nice-to-have polish, niche audience | core differentiator, broad user impact |
| TimeCriticality | no decay, can wait 6+ months | hard deadline, security, user-blocking |
| RROE | independent feature | unblocks roadmap, reduces arch debt, enables follow-ons |
| Effort | <1 day, single-file mechanical | multi-week, cross-system, research + migration |

## Evidence block

For each agent-assigned dimension, attach one-line justification in project Notes field or issue body:

```html
<!-- adv-triage:scoring v1
TimeCriticality=5: blocks /adv-discover for new users; user growth-aware
RROE=8: enables Phase 5 roadmap auto-update without manual edits
Effort=3: contained in single command + manifest entry
WSJF=5.3 = (8 + 5 + 8) / 3
scored_by=agent
scored_at=2026-05-08T12:34:56Z
-->
```

## GraphQL writes

Use cached `project_items` map from inventory for Phase 4. Do not call `gh project item-list` again until final roadmap generation.

Before writes, estimate budget: `features_needing_scoring + 1 + 100`. If GraphQL remaining is lower, block and surface reset time.

Batch TC/RROE/Effort/WSJF updates per item via `gh api graphql --include`. Pace writes with 1-second sleep. After each batch, parse `x-ratelimit-remaining`; if `< 10`, stop and report reset. If response headers missing, query `rateLimit`.

GraphQL returns HTTP 200 with errors. Parse `errors[]`, log per-alias failures, continue when safe.

## Idempotent resume

Before each batch:

1. Compare cached fields against target values.
2. All four match → skip item.
3. Subset matches → include only non-matching fields.
4. `--rescore` → include all four.
5. WSJF tolerance: `±0.05`.

## Bug rebound

Bugs do not get Value/TC/RROE/Effort/WSJF. If bug has numeric fields, warn in report and leave untouched.
