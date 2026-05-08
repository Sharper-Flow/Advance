## Design

### Architecture

`/adv-triage` is a **utility command** (no gate ownership, no spec deltas) in the same tier as `/adv-cleanup` and `/adv-tron`. It composes existing ADV MCP tools and `gh` CLI commands — no new MCP tools, no Temporal workflow changes, no type/schema changes.

### Execution model

- **Inline only** — no sub-agents. Phase 1 is I/O-bound (parallel reads), phases 3-5 are sequential user interaction + `gh` writes.
- **Default: dry-run** — scan and report without mutation. `--execute` flag required for all write operations.
- **Idempotent** — re-running on the same state produces the same board fields and the same ROADMAP.md content.

### Phase flow

```
Phase 0 (Preflight)         ── gh auth + label check + project bootstrap
  │
Phase 1 (Gather)            ── 6 parallel source reads
  │
Phase 2 (Match)             ── stable ref → Jaccard ≥0.6 → body excerpt
  │
Phase 3a (User: issues)     ── Tier B: confirm new issues          ◄── HITL pause
  │
Phase 3b (User: Priority/Value) ── Tier B: assign fields          ◄── HITL pause
  │
Phase 4 (Agent scoring)     ── RROE/TC/Effort + WSJF, autonomous
  │
Phase 5 (Roadmap regen)     ── Tier B: local deprecation          ◄── HITL pause
  │                           Tier B: commit + push                ◄── HITL pause
  │
Phase 6 (Final report)      ── emit summary table
```

### Match algorithm

Three-tier, first-match-wins:

1. **Stable ref** — issue body contains source's `ref` (e.g., `tk-…`, `wisdom-id`, `file:line`).
2. **Title similarity** — Jaccard similarity of normalized title tokens ≥ 0.6.
3. **Body excerpt** — first 80 chars of source body (lowercased, normalized) appears verbatim in any open issue body.

### Scoring rubric

Modified Fibonacci: `1, 2, 3, 5, 8, 13`. Per-dimension anchors:

| Dimension | Low (1-2) | High (8-13) |
|-----------|-----------|-------------|
| Value | nice-to-have, niche | core differentiator, broad impact |
| TimeCriticality | no decay, 6+ months | hard deadline, security, user-blocking |
| RROE | independent feature | unblocks roadmap, reduces debt, enables follow-ons |
| Effort | <1 day, single-file | multi-week, cross-system, migration needed |

### Storage schema

```
GitHub Projects v2 board
├─ ADV Type: SINGLE_SELECT [bug, feature]
├─ Priority: SINGLE_SELECT [critical, high, medium, low]
├─ Value: NUMBER (1-13)
├─ TimeCriticality: NUMBER (1-13)
├─ RROE: NUMBER (1-13)
├─ Effort: NUMBER (1-13)
└─ WSJF: NUMBER (computed, 1 decimal)
```

ROADMAP.md layout: bugs by priority tier → features by WSJF descending → deferred/unscored → run summary.

### Tier B approval points

Four inline approval prompts (whitelist + regex, no LLM fallback):

1. **Phase 3a** — confirm new GH issues to create
2. **Phase 3b** — assign Priority (bugs) / Value (features)
3. **Phase 5a** — deprecate local sources
4. **Phase 5b** — commit and push ROADMAP.md

### Git safety constraints

- Only `ROADMAP.md` is ever staged (`git add ROADMAP.md`, never `-A`)
- Default branch only; abort if current branch ≠ default
- Dirty-tree check: `git status --porcelain` must show only `ROADMAP.md`
- `git pull --rebase --autostash` before push
- Commit message: `chore(roadmap): /adv-triage update YYYY-MM-DD`

### Tool composition

| Phase | Tools used |
|-------|-----------|
| 0 | `bash` (`gh auth status`, `gh project list/create/field-create`, `gh label create`), `adv_project_metadata` |
| 1 | `bash` (`gh issue list`, `gh project item-list`), `adv_change_list`, `adv_agenda_list`, `adv_wisdom_list`, `glob`, `read`, `lgrep_search_text` |
| 2 | Inline matching logic |
| 3 | `bash` (`gh issue create`, `gh issue edit`, `gh project item-add`, `gh project item-edit`) |
| 4 | `bash` (`gh project item-edit`), `edit` (append evidence trailer to issue body) |
| 5 | `write` (ROADMAP.md), `edit` (deprecation), `adv_agenda_complete`, `bash` (`git add/commit/pull/push`) |
| 6 | Inline report generation |

### Design decisions (rationale)

| Decision | Rationale |
|----------|-----------|
| No new MCP tools | Command composes existing tools; no novel state operations needed |
| No gate ownership | Utility command; operates on GH/ADV state outside the 7-gate lifecycle |
| Inline only (no sub-agents) | Sequential user interaction in phases 3-5 makes parallelization impossible; phase 1 I/O is fast enough inline |
| Jaccard ≥0.6 for title matching | Empirically balances false positives/negatives for short technical titles |
| Fibonacci 1-13 | Standard SAFe estimation scale; widely understood |
| HTML comment for evidence trailer | Invisible in rendered GH markdown, machine-parseable, non-destructive |
| `adv_project_metadata` for project ref | Persists across sessions without introducing new config files |
