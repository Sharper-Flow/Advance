## Why

`change.origin` typed field shipped (commit `2d4bd80`) and architecture decision shipped (`ADV_INSTRUCTIONS.md § Change Origin Linkage Strategy`, commit `bf32420`). Behavior automation that uses the schema is deferred to this change.

Without it the agent manually passes origin args on every create, manually fetches GH issue bodies for prefill, manually closes linked issues on archive, and walks active changes for cross-references. The read-side cross-reference (active-change annotation) is the only piece already wired in `adv_roadmap`.

## Coordinated With

`enforcescoreblindproposaldesig` (proposal complete, discovery pending). Their change defines `rq-roadmapOriginSanitize01` — the contract for stripping ADV scoring trailers and obvious score-field lines from roadmap-origin issue bodies before proposal synthesis. **This change consumes that contract**. They also ship `rq-scoreBlindQuality01` (quality-producing gates score-blind) and `rq-roadmapMirrorScoreFree01` (ROADMAP.md rank-only). Order: theirs ships first, ours second.

## What Changes

1. `/adv-proposal #N` argument shape — accept GitHub issue ref as positional arg. Resolve via `gh issue view <N> --json title,body,labels,number,state`. Run body through the `rq-roadmapOriginSanitize01` sanitizer before prefill. Pre-populate problem statement from sanitized output. Set `origin_kind: 'roadmap'`, `origin_issue_number: N`. Surface issue title/labels in change context.
2. `/adv-archive` Phase 5.x — when archived change has `origin.kind ∈ {'roadmap', 'triage'}` and `origin.issue_number` set, post a "shipped via {change-id} — archived {ISO-date}" comment on the linked issue, then close with `gh issue close <N> --reason completed`. **Opt-in only**: requires explicit `--close-issue` flag or persistent project-level config. No silent first-deploy surprise.
3. `/adv-triage` Phase 3a — when promoting non-GH artifact to a new GH issue, set `origin.kind: 'triage'` and `origin.source_artifact: <ag-id|wisdom-id|note-ref>` on any change the user immediately starts via `/adv-proposal` afterwards. The promotion itself just creates the GH issue; the change is still user-initiated.
4. `adv_roadmap` recommendations — Phase 2 of `/adv-roadmap` surfaces `Top item with no active change → /adv-proposal #N` recommendations using the new positional-issue argument shape.
5. **Migrate `github_project` config off `project_metadata`** — adjacent finding from session 2026-05-09: the `project_metadata` summary-string schema is `max(200)` and rejects the 563-char `github_project` JSON config blob on read (validates write but silently skips on read). Move project-link config to a dedicated typed config file (e.g. `.adv/github-project.json`) with its own Zod schema. Update `adv_roadmap source: 'live'`, `/adv-triage` Phase 0 bootstrap, and `adv_project_metadata` migration helper. Backward compat: when `.adv/github-project.json` is missing, fall back to reading `project_metadata['github_project']` (works for short summaries; failures surface a "needs migration" hint).

## Error Handling (resolves CLARIFY_MISSING_ERROR_HANDLING)

| Failure | Behavior |
|---|---|
| `gh issue view <N>` returns non-zero (auth, not found, network) | Abort `/adv-proposal #N` with the exact gh stderr + hint to run `gh auth status` or verify the issue number. No partial change. |
| Issue body contains scoring trailers the sanitizer doesn't recognize | Sanitizer logs "unrecognized scoring marker: <regex>" warning, strips conservatively, proceeds. Test fixture covers known patterns (`<!-- adv-triage:scoring v1 -->`, `WSJF=...`). |
| `gh issue close <N>` fails mid-archive | Archive succeeds locally; issue close failure surfaces as a `[ADV:ATTN]` post-archive warning with the gh stderr + manual close command. Archive state is NOT rolled back — local state is canonical. Idempotent retry: re-running archive against an already-archived change replays only the `gh issue close` step. |
| `gh issue close` finds issue already closed | Treat as success; log "issue already closed (likely manual close or duplicate run)" and continue. |
| `.adv/github-project.json` missing AND `project_metadata['github_project']` also missing | `adv_roadmap source: 'live'` returns the existing actionable error pointing at `/adv-triage --execute` to bootstrap. |
| Migration helper runs against a project where the `project_metadata` summary is malformed | Skip migration, surface error, do not delete the source entry. |

## Success Criteria

- `/adv-proposal #51` opens a new ADV change with `origin.kind = 'roadmap'`, `origin.issue_number = 51`, problem statement pre-populated from issue #51's sanitized body, and issue title in the change context.
- `/adv-archive <change-id> --close-issue` (when change has `roadmap`/`triage` origin and an `issue_number`) posts a comment + closes the issue. Without `--close-issue`, no GH mutation happens.
- `/adv-roadmap` Phase 2 recommendations include `/adv-proposal #N` for the top item without an active change.
- `github_project` config lives in `.adv/github-project.json` with its own Zod schema. `adv_roadmap source: 'live'` reads it directly. Existing `project_metadata['github_project']` entries migrated transparently on first read post-deploy.
- Sanitizer integration: `/adv-proposal #N` body prefill never includes WSJF/V/TC/RROE/Effort fields or the `<!-- adv-triage:scoring v1 -->` block. Verified by test fixture using a real roadmap-promoted issue body.
- Asset tests + unit tests + integration tests green. `pnpm run check` passes.

## Acceptance Criteria

| AC | Evidence |
|---|---|
| AC1 | `/adv-proposal #N` accepts integer and creates roadmap-origin change | New unit test in `change.test.ts` exercising the issue-arg path; manual smoke against an open issue in this repo |
| AC2 | Issue body content prefills problem statement after sanitization | Test fixture: issue body with scoring trailers → assert prefilled proposal contains body content but NOT the trailers |
| AC3 | Archive auto-close gated behind explicit flag | Default-off behavior verified in archive test; explicit `--close-issue` test confirms `gh issue close` invocation; failure-mid-archive test asserts archive succeeds + warning posted |
| AC4 | `adv_roadmap` Phase 2 emits `/adv-proposal #N` for top non-active feature | Asset test on the roadmap command spec |
| AC5 | `github_project` config migration | Test: pre-existing `project_metadata['github_project']` entry → first read writes `.adv/github-project.json` → subsequent reads use the file directly |

## Constraints

- × MUST NOT auto-close issues without explicit user opt-in. First-time surprise = bug.
- × MUST NOT mutate `change.origin` after creation. Origin is set-on-create.
- × MUST NOT bypass the trunk-write firewall. `.adv/github-project.json` write needs the firewall allowlist extended to handle the `.adv/` namespace (or specific paths within).
- × MUST NOT include scoring fields in `/adv-proposal #N` prefill output (enforces `rq-scoreBlindQuality01`).
- ✓ MUST honor `ADV_INSTRUCTIONS.md § Change Origin Linkage Strategy` — kinds and semantics are fixed.
- ✓ MUST consume `rq-roadmapOriginSanitize01` from `enforcescoreblindproposaldesig`. Wait for that contract to land before implementing the prefill path.
- ✓ MUST keep `gh` CLI as the only GitHub API surface. No new GraphQL helpers.

## Avoidances

- Don't expand to issue-comment mirroring or label sync.
- Don't overload `adv_change_update_issues` — that stays for free-form `linked_issues[]`. `origin.issue_number` is the typed canonical link.
- Don't add both positional `#N` and `--issue N` flag forms. Pick positional (conventional GH syntax).
- Don't preemptively edit ROADMAP.md format — that's `enforcescoreblindproposaldesig`'s scope.
- Don't drive-by patch the metadata schema to allow longer summaries. Move config to a dedicated file instead (P33: structural correctness over heuristic).

## Out of Scope

- Re-parenting legacy changes to add `origin` retroactively. Legacy stays `origin = undefined` (treated as `adhoc`).
- Bidirectional sync of comments. One-way: archive → close + comment.
- Cross-project issue linkage. That uses `cross_project_origin`, different field, different semantics.
- Issue labels mirrored onto the change.
- Behavior automation for `discovery` origin (issue auto-creation post-hoc). Separate change if needed.
- Behavior automation for `adhoc` — explicitly never (kind = unlinked work).
- ROADMAP.md format changes (owned by `enforcescoreblindproposaldesig`).