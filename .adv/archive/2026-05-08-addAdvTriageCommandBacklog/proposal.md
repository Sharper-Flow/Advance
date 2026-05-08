## Summary

Introduce `/adv-triage` — a single command that reconciles every ADV backlog source into a prioritized roadmap. Storage of truth is a GitHub Projects v2 board with typed NUMBER fields; `ROADMAP.md` at repo root is the generated, git-tracked mirror.

## Why

| Today (without /adv-triage) | After /adv-triage |
|---|---|
| Backlog signal scattered across 6+ sources | Single command reconciles all sources |
| No formal feature ranking | WSJF score per feature, computed and stored |
| Local notes invisible to GitHub collaborators | Promoted to issues, then deprecated locally |
| Same item rediscovered repeatedly across sessions | Cross-link via stable refs and source trailers |
| No durable answer to "what's next" | `ROADMAP.md` committed to default branch, regenerated deterministically |
| Bug priority assigned ad-hoc | Forced assignment of `priority:*` label or explicit defer |

## Approach

`/adv-triage` runs as a 6-phase utility command (no gate ownership, sits alongside `/adv-cleanup` and `/adv-tron`):

| Phase | What it does |
|---|---|
| 0. Preflight | `gh auth` scope check, label set check, Projects v2 board bootstrap |
| 1. Gather | Inline parallel reads from GH issues, project items, ADV changes, agenda, wisdom, notes, TODO/FIXME |
| 2. Match | Cheap-to-expensive matching (stable ref → title Jaccard ≥0.6 → body excerpt) |
| 3. User assignments | Two batched Tier B prompts: (a) confirm new issues, (b) Priority/Value assignments |
| 4. Agent scoring | RROE / TC / Effort assigned with evidence trailer; WSJF computed |
| 5. Roadmap regen | Generate `ROADMAP.md`, deprecate local sources, atomic single-file commit, push |
| 6. Final report | Show updated priority table to user |

## Scope

### Files created

| Path | Purpose |
|---|---|
| `.opencode/command/adv-triage.md` | Full command spec (~330 lines): preflight, 6 phases, Tier B prompts, anti-patterns, key tools |

### Files modified

| Path | Change |
|---|---|
| `plugin/src/manifest.ts` | Add `adv-triage` entry under `utility` phase with `args_hint` |
| `plugin/src/manifest.test.ts` | Expected command count 25 → 26; add `adv-triage` to expected list |
| `ADV_INSTRUCTIONS.md` | Add row in Fast-Track / Advanced section |
| `README.md` | Add row in advanced commands table |
| `SETUP.md` | Add `gh` to Optional prerequisites; add new `### GitHub CLI authentication` section; add Final auth check block at end of Project Initialization |

### Files NOT touched

- `plugin/src/tools/**` — no new MCP tool. The command composes existing tools (`adv_change_list`, `adv_agenda_list`, `adv_wisdom_list`, `adv_project_metadata`, `glob`, `read`, `lgrep_search_text`, `gh` via bash, `edit`, `write`).
- `plugin/src/temporal/**` — no Temporal workflow changes.
- `plugin/src/types.ts` — no new types.
- `plugin/schemas/**` — no schema changes.
- `.adv/specs/**` — no spec deltas (this is a utility command; it does not own a gate or modify capabilities).
- `scripts/sync-global.sh` — unchanged; no new agent or skill bundling needed.

### Modules affected

- **Manifest layer** (`plugin/src/manifest.ts`) — adds a 26th command entry.
- **Documentation surface** — three top-level docs (`README.md`, `SETUP.md`, `ADV_INSTRUCTIONS.md`).
- **Command surface** (`.opencode/command/`) — adds one new slash command, no changes to existing commands.

### Runtime impact

- New slash command available after OpenCode session restart. No plugin rebuild strictly required for the command file itself (OpenCode reads `.opencode/command/*.md` directly), but `pnpm run build` is needed for the manifest change to surface in `adv_status` recommendations and `getCommandDef("adv-triage")` lookups.
- No database/Temporal schema migrations.
- No breaking changes to existing commands or tools.

## Authentication & authorization model

| Aspect | Mechanism |
|---|---|
| **Auth surface** | GitHub CLI (`gh`) on the operator's machine. ADV does not store, transmit, or proxy credentials — it shells out to `gh` as the current user. |
| **Token type** | User-global OAuth token (`gho_*`) issued by `gh auth login`. Coarse-grained, not per-repo. |
| **Required scopes** | `repo` (issues + content), `project` (Projects v2 typed fields), `read:org` (resolve org repos and projects), `workflow` (used by external conformance gate during `/adv-archive`). |
| **Coverage rule** | The token MUST authenticate every repo and every Projects v2 board any ADV agent will touch — including this repo and all `target_path` cross-project peers. SETUP.md documents this requirement. |
| **Refusal mode** | `/adv-triage` Phase 0 refuses to run if `gh auth status` reports a missing scope, the GitHub remote is unreachable, or the token cannot create a project under the resolved owner. Refusal emits the exact `gh auth refresh -s …` command the operator should run. |
| **Org-owned repos** | Org admin must approve the GitHub CLI app under Settings → Third-party access. Without approval, fallback is creating the project under the user's `@me` namespace and linking the org repo via `gh project link`. |
| **Multi-machine** | `gho_*` tokens are bound to the machine that ran `gh auth login`. Each machine an ADV agent runs from needs its own login. SETUP.md documents this. |
| **No fine-grained PAT path** | v1 standardizes on coarse OAuth via `gh auth login`. Fine-grained PATs are explicitly out of scope; users who prefer them can set `GH_TOKEN` and ADV will use it transparently, but ADV does not validate fine-grained scope coverage. |
| **Authorization** | Whatever the GitHub user can do via the web UI, ADV can do via this command. ADV adds no privilege escalation. |
| **Audit** | Every issue created or edited by `/adv-triage` carries either a `Promoted by /adv-triage from {source}: {ref}` body trailer (for new issues) or a `<!-- adv-triage:scoring v1 ... -->` HTML comment (for agent-scored fields), giving permanent provenance. |

## Storage architecture

```
GitHub Projects v2 board (canonical, typed)
    ├─ ADV Type: SINGLE_SELECT (bug, feature)
    ├─ Priority: SINGLE_SELECT (critical, high, medium, low)   ← bugs only
    ├─ Value: NUMBER (1-13)                                     ← features, user-only
    ├─ TimeCriticality: NUMBER (1-13)                          ← features, agent-filled
    ├─ RROE: NUMBER (1-13)                                     ← features, agent-filled
    ├─ Effort: NUMBER (1-13)                                   ← features, agent-filled
    └─ WSJF: NUMBER (computed = (V+TC+RROE)/E)
            │
            ▼ regenerated each run
    ROADMAP.md (git-tracked, default branch only)
            ├─ Bugs by priority tier
            ├─ Features by WSJF descending
            ├─ Deferred / unscored
            └─ Run summary
```

ADV stores `{owner, project_number, project_id, fields}` in `adv_project_metadata` so the bootstrap is one-time per ADV project.

## Key decisions (locked with user)

| Decision | Choice | Rationale |
|---|---|---|
| Storage | GH Projects v2 typed fields | Native sort/filter, real types, no string parsing, scales to future use |
| WSJF formula | Full SAFe `(V + TC + RROE) / E` | Standard formula, captures decay/urgency via TC |
| Roadmap location | `ROADMAP.md` at repo root | Top-level visibility, easy README link |
| Commit policy | Auto-commit + push to default branch | User-chosen; constrained to single-file stage to satisfy P32 spirit |
| HITL mode | Hybrid | Minimum interrupts: only Priority and Value require user judgment |
| Bug ranking | Existing `priority:*` labels | Reuse what works; no synthetic WSJF for bugs |
| Local source deprecation | Per-source action after promotion | Single source of truth; prevents re-triage of same item |

## Success criteria

See acceptance criteria in problem statement (10 items). Verifiable by:

- Running `/adv-triage --execute` on this repo end-to-end — must produce a board, a `ROADMAP.md`, and a commit.
- 1864 unit tests still pass after manifest changes (verified).
- `pnpm run check` clean — typecheck, lint, format (verified).

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| Org-owned repos block GitHub CLI app | SETUP.md documents the third-party access fix; fallback is `@me`-owned project linked to org repo |
| Token missing scopes on a fresh machine | Phase 0 preflight refuses to run with explicit `gh auth refresh` instruction |
| Trunk commit pollution | Single-file stage (`git add ROADMAP.md` only), default-branch enforcement, dirty-tree abort |
| LLM hallucination on WSJF scores | Evidence trailer required per scored dimension; rubric anchors per Fibonacci value |
| User defers Value indefinitely | Deferred items surface in "Deferred / unscored" section every run — visible drift signal |
| Multiple machines need separate auth | SETUP.md documents that `gho_*` tokens are per-machine and not transferable |

## Out of scope

See problem statement.
