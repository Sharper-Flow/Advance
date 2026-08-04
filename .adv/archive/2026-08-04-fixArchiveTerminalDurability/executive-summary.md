# Executive Summary — fixArchiveTerminalDurability

## Outcome

Archives can no longer report success while the system silently loses the record that a change finished. Previously, ADV could tell a user "archived" while never notifying the workflow that owns the change's durable state; weeks later, when the workflow's history expired, hundreds of supposedly finished changes resurfaced as if they were still in flight (299 observed in production). Both root causes are repaired, the existing damaged population has a safe repair path, and every success claim in the archive path now requires durable proof.

## Why it matters

- **Operators can trust archive output.** A reported success now means the terminal state is durably recorded — verified against the workflow's own committed write, not against a cache that may be stale.
- **The 299 leaked changes stay fixed.** Read surfaces (list, summary, show) now agree on terminal status when an archive bundle exists, and a proof-gated repair converges any change whose workflow is already gone.
- **The failure mode is structurally closed, not patched over.** The workflow itself writes its terminal record before completing (for both archived and closed outcomes), so durability no longer depends on any caller remembering to check.
- **Honest failures replace silent ones.** When the system cannot prove the transition was recorded, archive now says so with a typed, actionable error instead of a false success — including the previously invisible "committed but unverified" release-gate case.

## What was verified

- 496 automated tests across 13 test files pass, including end-to-end Temporal integration tests that drive a real workflow through archival to completion and prove the terminal record survives the workflow's end, plus the original production failure sequence (bundle written, then failure before status) and a simulated retention-expiry case.
- Replay-safety fixtures prove in-flight workflows from before the patch continue without errors after upgrade.
- An independent reviewer inspected the full diff four times; three substantive proof-integrity gaps were found and fixed during review, and the final verdict was approve-with-followups (all follow-ups completed).
- Full static gate (typecheck, lint, format, schema checks) is clean.

## Risks and follow-ups (non-blocking)

- **Repair of the historical fleet is available but not yet run at scale.** The proof-gated repair path exists and is tested; running it across the full leaked population is an operator action, intentionally separate from this change.
- **Three pre-existing issues were recorded as follow-ups, not fixed here:** a literal-only pattern matcher in the workflow-evolution guard (misses constant-indirected patch markers), a report-submission discriminator gap for one agent type, and latent write-before-verify orderings in two storage paths (neither produces the reported symptom).
- **Two unmerged sibling changes touch some of the same files** (release-gate preflight, temporal read saturation); they address different concerns and merge order should be watched.

## Release readiness summary

All seven quality gates pass through acceptance. Behavior is backward-compatible for operators: archives that genuinely complete will succeed as before; archives that cannot be proven now fail loudly with remediation guidance instead of succeeding falsely. No migration, retention change, or configuration change is required.