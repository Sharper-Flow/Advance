# Contract Traceability

**Change ID:** compressInstructionProse
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Active normative label is `caveman-full`; stale-label grep `! rg -ni "caveman-lite|caveman-light" --glob '!CHANGELOG.md' --glob '!.adv/**' --glob '!docs/archive/**' .` returned no matches. |
| SC2 | success_criterion | pass | review | Compression audit covered 82 active instruction/test surfaces; docs/prose-load-inventory.md pass 3/T7 records changed surface groups; review approved after remediation. |
| SC3 | success_criterion | pass | review | Token snapshots/diff report unexpected_diff_count=0; targeted re-verification resolved restored `MUST` and guard wording findings in ADV_INSTRUCTIONS.md:904/929 and AGENTS.md:89. |
| SC4 | success_criterion | pass | review | Diff is markdown instruction assets plus one asset-test label update; no runtime source, schema, enum, gate, or tool behavior changes. |
| AC1 | acceptance_criterion | pass | test | Case-insensitive stale-label grep excluding CHANGELOG, .adv, and docs/archive returned no output; `caveman-full` anchors present in docs/test. |
| AC2 | acceptance_criterion | pass | test | Audit report at /tmp/opencode/compressInstructionProse/compression-audit-report.json covers active instruction assets; Architecture & Quality re-verification resolved all compression clarity findings. |
| AC3 | acceptance_criterion | pass | test | Token diff report unexpected_diff_count=0; re-verification resolved `MUST` restoration, `Do NOT delete worktree`, and worktree guard ambiguity findings. |
| AC4 | acceptance_criterion | pass | test | Git diff contains prose-only instruction/doc updates and matching asset-test label change; focused tests and full check passed. |
| AC5 | acceptance_criterion | pass | test | docs/prose-load-inventory.md lifecycle updated to POST-COMPRESSION ARCHIVE — pass 3 with `Pass 3 Delta: compressInstructionProse (T7)` rows. |
| AC6 | acceptance_criterion | pass | test | Pre/post snapshots exist under /tmp/opencode/compressInstructionProse (`contract-tokens-pre.json`, `contract-tokens-post.json`); `token-diff-report.json` shows unexpected_diff_count=0. |
| AC7 | acceptance_criterion | pass | test | `pnpm exec vitest run src/adv-skill-backed-commands-assets.test.ts src/manifest-doc-drift.test.ts` passed (2 files, 71 tests). `pnpm run check` passed. |
| C1 | constraint | respected | static_check | Changes are prose/instruction compression plus stale-label asset-test alignment; no implementation behavior changed. |
| C2 | constraint | respected | static_check | Focused manifest/doc drift tests passed; command frontmatter shape retained. |
| C3 | constraint | respected | static_check | Safety/destructive language re-verified: `MUST use as workdir`, `MUST return zero matches`, `Do NOT delete worktree`, and explicit worktree opt-out wording present. |
| C4 | constraint | respected | static_check | `caveman-full` remains wording-density layer over existing prose-load enforcement templates; inventory and command-voice docs retain framework references. |
| C5 | constraint | respected | static_check | Only clear compression/clarity fixes were applied; review remediation restored clarity where compression was too aggressive. |
| DONT1 | avoidance | respected | review | Review found and fixed contract-critical wording losses; no contract-critical instruction deleted for line-count reduction. |
| DONT2 | avoidance | respected | review | No workflow sequencing, gate ownership, approval, cancellation, or archive sign-off semantics changed; targeted review found no unresolved issues. |
| DONT3 | avoidance | respected | review | ADV state was accessed only via ADV MCP tools; repo edits were confined to worktree files and /tmp evidence artifacts. |
| DONT4 | avoidance | respected | review | Docs explicitly preserve prose-load enforcement classes as governing framework; `caveman-full` is only wording-density compression. |
| DONT5 | avoidance | respected | review | Stale-label grep excluded historical archive/changelog paths; active instruction surfaces updated only. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Runtime behavior changes were out of scope and not performed. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Tool schemas, enums, gate IDs, statuses, and command semantics were out of scope and not changed. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Broad documentation rewrite outside audited instruction surfaces was out of scope; edits stayed in audited active instruction/test surfaces. |
| OOS4 | out_of_scope | not_applicable | not_applicable | User-facing product feature changes were out of scope and not performed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-8a3cad9c50ba |  | AC6 | C1, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-6198de841da5 | AC1 | AC1 | C1, C2, C3, C4, DONT1, DONT2, DONT4, DONT5 |  |
| tk-40ce94a0889a | AC5 | AC5 | C4, DONT1, DONT2, DONT5 |  |
| tk-34bad401b996 | AC2 |  | AC3, AC4, C1, C2, C3, C4, C5, DONT1, DONT2, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4 |  |
| tk-09f196d2a8e8 |  | AC1, AC3, AC4, AC6 | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2 |  |
| tk-5a95ad5d4294 |  | AC2, AC4, AC5, AC7 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4 |  |
