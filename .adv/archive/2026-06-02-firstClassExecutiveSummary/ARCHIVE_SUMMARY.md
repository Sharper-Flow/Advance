# Archive: First-class executive summary

**Change ID:** firstClassExecutiveSummary
**Archived:** 2026-06-02T20:46:29.776Z
**Created:** 2026-05-20T23:25:15.618Z

## Tasks Completed

- ✅ Add shared `readArtifactWithArchiveFallback` helper + extend 4 simple include flags
  > Added readArtifactWithArchiveFallback(changeDir, archiveDir, changeId, filename) in plugin/src/tools/change.ts. Updated include.problemStatement, include.agreement, include.design, and include.executiveSummary to read active artifact content first and fall back to the latest archive bundle located by findArchiveBundle(). Added a parameterized archived-bundle regression test covering problem-statement.md, agreement.md, design.md, and executive-summary.md.
- ✅ Extend `loadProposalWithFallback` to support archive bundle fallback
  > Updated loadProposalWithFallback(changeDir, title, options) to accept optional archiveDir/changeId, read active proposal.md first, then read proposal.md from the latest archive bundle via findArchiveBundle before generating a scaffold. Wired adv_change_show's proposal context and include.proposal path to pass archive context. Added storage-level and tool-level archived proposal regression tests.
- ✅ Enrich auto-release.yml CHANGELOG with executive summary content
  > Enhanced `.github/workflows/auto-release.yml` Generate CHANGELOG step to collect `.adv/archive/*/executive-summary.md` files changed between the last tag and HEAD, render each under `### Change Highlights` using the archive bundle directory name, and skip gracefully when files are missing or empty. Also fixed the existing `sha256sum *.tar.gz` shellcheck warning by using `./*.tar.gz` so actionlint passes.
- ✅ Corded: extend `ArchivedReleaseChange` with `executive_summary: Option<String>` + load sibling file
  > Created Corded branch change/firstClassExecutiveSummary. Added `executive_summary: Option<String>` to `ArchivedReleaseChange`. Added `archive_executive_summary_path()` to map `.adv/archive/*/change.json` to sibling `executive-summary.md`. Updated `load_adv_archived_changes()` to build a path-to-blob map from the Git tree, fetch a non-empty sibling executive summary when present, and store it on the resolved archived change. Updated existing ArchivedReleaseChange test fixtures.
- ✅ Corded: extend `ReleaseSummaryInputArchiveChange` + thread exec-summary into prompts.rs
  > Extended `ReleaseSummaryInputArchiveChange` with `executive_summary: Option<String>`. Threaded the field from `ArchivedReleaseChange` into archive-summary AI inputs. Updated `build_release_summary_prompt_from_archived_changes()` to render non-empty executive summaries under `executive_summary (primary narrative source)` and label completed task lines as supporting evidence. Updated the archive system prompt to prefer executive_summary when present, and added regression coverage.
- ✅ Full verification: ADV tests + corded build/test + smoke check
  > Ran full Advance verification (`pnpm run check`, `pnpm test`, `pnpm run build`, `actionlint .github/workflows/auto-release.yml`) and full Corded verification (`cargo build`, `cargo test`). Review remediation passed: ADV raw include fallback no longer scaffolds missing proposal and no longer falls back from existing empty active artifacts; Corded archive prompt treats executive summaries as untrusted data, caps by char count, preserves later source_index records, and escapes BEGIN/END sentinel-looking lines inside summary content. Committed review remediation in both repos (`a793e436` Advance, `1b81af2` Corded).

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For archived-change narrative artifact reads, keep the active-dir read first and fall back through `findArchiveBundle()` rather than branching on change status. This covers active, archived, and partially-migrated states with one helper and keeps missing artifacts as `undefined` at the tool surface.
- **[pattern]** When extending a widely-used helper like `loadProposalWithFallback`, add archive behavior behind an optional options object (`{ archiveDir, changeId }`) so existing call sites keep their current scaffold fallback semantics while tool paths that know archive context opt in structurally.
- **[gotcha]** `actionlint` runs shellcheck against workflow `run:` blocks and can surface pre-existing same-file issues while validating a workflow edit. Fix adjacent shellcheck findings (e.g. `sha256sum ./*.tar.gz` for SC2035) before treating workflow verification as green.
- **[pattern]** For Corded archive enrichment, keep `change.json` serde pure and put sibling markdown (`executive-summary.md`) on the resolved `ArchivedReleaseChange` layer. Build one path→blob map from the Git tree, then optional-fetch the sibling blob so old archive bundles remain backward-compatible.
- **[pattern]** For Corded archive prompts, label curated ADV `executive_summary` content explicitly as the primary narrative source and demote completed task lines to supporting evidence. This gives the AI a deterministic priority order without removing task-level grounding.
- **[success]** Cross-repo verification stayed clean by committing Corded work on its own `change/firstClassExecutiveSummary` branch and keeping Advance verification commits separate. `adv_task_checkpoint` can record clean verification tasks after all implementation commits are already checkpointed.
- **[gotcha]** Do not use scaffold-generating helpers for raw include/read APIs. `adv_change_show include.proposal` must omit `_proposal` when proposal.md is absent; `loadProposalWithFallback` is appropriate for context snapshots/readiness, not raw artifact attachment.
- **[gotcha]** Rust `String::truncate(byte_len)` panics if `byte_len` is not a UTF-8 char boundary. Prompt builders handling arbitrary markdown should cap by `.chars()` or another boundary-safe mechanism, especially when content may include emoji or non-ASCII text.
- **[pattern]** When wrapping untrusted markdown in prompt delimiters, also escape delimiter-looking lines inside the data. Delimiters plus anti-instruction prose are weaker if content can visually emit the same BEGIN/END sentinel.
