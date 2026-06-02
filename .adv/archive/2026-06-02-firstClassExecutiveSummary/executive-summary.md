# First-Class Executive Summary

## What Changed

Made `executive-summary.md` a first-class artifact across three integration surfaces:

1. **ADV archived-change reads** — `adv_change_show include.executiveSummary` (and all 5 include flags) now fall back to archive bundles when reading archived changes. Previously, archived changes returned nothing for artifact include flags.

2. **CHANGELOG enrichment** — `auto-release.yml` now injects executive summary content from `.adv/archive/*/executive-summary.md` into generated CHANGELOG entries under `### Change Highlights`.

3. **Corded release notes** — Corded reads sibling `executive-summary.md` alongside `change.json` and uses it as the primary narrative source when generating release notes, with completed task lines demoted to supporting evidence.

## Why

Executive summaries were persisted at acceptance and archived in bundles, but downstream consumers couldn't read them. Archive reads silently returned nothing, CHANGELOG generation ignored them, and Corded had no ingestion path.

## Cross-Repo

Both Advance (TypeScript plugin) and Corded (Rust release-notes service) were modified. Archive fallback uses backward-compatible optional fields. Untrusted content is capped and delimiter-escaped in Corded prompts.
