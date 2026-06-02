# First-Class Executive Summary

## Intent
Make `executive-summary.md` first-class for downstream consumers. Currently the artifact persists at acceptance and lands in archive bundles, but archived-change reads via `adv_change_show include.executiveSummary` silently return nothing (read path only checks active change dir), GitHub Actions `auto-release.yml` doesn't read it for CHANGELOG enrichment, and corded's release-notes pipeline doesn't ingest it. This change closes all three gaps.

## LBP Targets
- ADV-side: archive-aware fallback in existing `include.executiveSummary` read path (extend existing tool surface — no new tool, no new schema). Same fallback applies to all 5 include flags as a campsite win.
- `auto-release.yml`: glob `.adv/archive/*/executive-summary.md` matching the release commit range; inject content into generated CHANGELOG entries.
- Corded: extend `AdvArchivedChangeFile` deserializer to read sibling `executive-summary.md`; thread content into `build_release_summary_prompt_from_archived_changes` and the archive system prompt.

## Scope
**ADV repo (`Sharper-Flow/Advance`):**
- `plugin/src/tools/change.ts` — extend include-flag read paths to fall back to archive bundle
- `plugin/src/tools/change.test.ts` — round-trip tests for archived-change include (all 5 flags)
- `.github/workflows/auto-release.yml` — new step: read exec-summary files in commit range and inject into CHANGELOG output

**Corded repo (`Sharper-Flow/Corded`, workdir `/home/jon/dev/corded`):**
- `src/handlers/github_webhook.rs` — extend `AdvArchivedChangeFile` struct OR add sibling loader; surface exec-summary in `ArchivedReleaseChange`
- `src/ai/prompts.rs` — thread exec-summary into archive prompt; prefer as primary narrative when present
- `src/ai/types.rs` (probable) — extend `ReleaseSummaryInputArchiveChange` payload
- Cargo tests covering the new field

## Success Criteria
1. **Archived-change reads work**: `adv_change_show include.executiveSummary` (and `include.proposal/agreement/design/problemStatement`) returns the artifact content for archived changes, sourcing from `.adv/archive/{bundle}/<id>/executive-summary.md`. Round-trip tests cover present + missing cases for both active and archived.
2. **CHANGELOG enrichment**: `auto-release.yml` produces CHANGELOG entries that include executive-summary content when an archived change is in the release window. Falls back gracefully to commit-subject behavior when no bundle matches. Manual smoke test on a tagged release confirms content lands in CHANGELOG.md.
3. **Corded release notes use exec-summary**: Corded reads `executive-summary.md` sibling to `change.json` when generating release notes. When present, the content is the primary narrative source in the archived-prompt builder (over `tasks[]` titles). Existing corded tests pass; new test asserts exec-summary appears in the rendered prompt.
4. **No regressions**: ADV-side test suite passes (target 2532+ baseline). Corded compiles cleanly via `cargo build`; touched-module `cargo test` passes.

## Out-of-Scope
- GitHub issue closure comments (deferred per user direction in prior turn)
- Dedicated changelog/release-notes aggregator tool
- Corded's stale gate-name set (signoff/harden/review/implementation → acceptance/release) — surface as separate follow-up
- Archive compression / bundle restructuring

## Cross-Repo Execution
Corded tasks switch `workdir` to `/home/jon/dev/corded`. ADV tasks stay in current worktree.

## LBP Validation Required
- Rust serde deserialization patterns for adding optional fields to existing `Deserialize` structs (verify backward-compat with older archive bundles that lack executive-summary.md)
- GitHub Actions: `cat`/`awk`/`yq` patterns for reading markdown content inside a shell step and injecting it into a generated CHANGELOG section
- ADV: review-checklist's stance on extending all 5 include flags simultaneously (campsite) vs scoped extension
