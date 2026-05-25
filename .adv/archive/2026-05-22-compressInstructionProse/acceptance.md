# Acceptance

Reviewed at: 

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Active ADV instruction surfaces use `caveman-full` as the current normative style label where a caveman label is needed. | pass | Active normative label is `caveman-full`; stale-label grep `! rg -ni "caveman-lite|caveman-light" --glob '!CHANGELOG.md' --glob '!.adv/**' --glob '!docs/archive/**' .` returned no matches. |
| SC2 | success_criterion | Audited active instruction assets have obvious compression wins applied without reducing protocol clarity. | pass | Compression audit covered 82 active instruction/test surfaces; docs/prose-load-inventory.md pass 3/T7 records changed surface groups; review approved after remediation. |
| SC3 | success_criterion | Behavioral contracts remain unchanged. | pass | Token snapshots/diff report unexpected_diff_count=0; targeted re-verification resolved restored `MUST` and guard wording findings in ADV_INSTRUCTIONS.md:904/929 and AGENTS.md:89. |
| SC4 | success_criterion | Verification is machine-backed, not visual-only. | pass | Diff is markdown instruction assets plus one asset-test label update; no runtime source, schema, enum, gate, or tool behavior changes. |
| AC1 | acceptance_criterion | Active ADV instruction surfaces no longer define current style as `caveman-lite` or `caveman-light`; normative wording uses `caveman-full`. | pass | Case-insensitive stale-label grep excluding CHANGELOG, .adv, and docs/archive returned no output; `caveman-full` anchors present in docs/test. |
| AC2 | acceptance_criterion | All active audited instruction files are reviewed; segments with obvious compression benefit are compressed without reducing protocol clarity. | pass | Audit report at /tmp/opencode/compressInstructionProse/compression-audit-report.json covers active instruction assets; Architecture & Quality re-verification resolved all compression clarity findings. |
| AC3 | acceptance_criterion | Contract tokens remain intact: tool names, gates, statuses, slash commands, enums, quoted errors, `MUST`, `NEVER`, approval checkpoints, cancellation approval, archive sign-off, JSON/code examples. | pass | Token diff report unexpected_diff_count=0; re-verification resolved `MUST` restoration, `Do NOT delete worktree`, and worktree guard ambiguity findings. |
| AC4 | acceptance_criterion | No runtime behavior, schema, or command semantics change. | pass | Git diff contains prose-only instruction/doc updates and matching asset-test label change; focused tests and full check passed. |
| AC5 | acceptance_criterion | A fresh prose-load inventory pass records changed/reclassified sections and returns archive status at completion. | pass | docs/prose-load-inventory.md lifecycle updated to POST-COMPRESSION ARCHIVE — pass 3 with `Pass 3 Delta: compressInstructionProse (T7)` rows. |
| AC6 | acceptance_criterion | Pre/post contract-token snapshots exist for in-scope files; diff is empty or intentional standard-name/test changes are justified. | pass | Pre/post snapshots exist under /tmp/opencode/compressInstructionProse (`contract-tokens-pre.json`, `contract-tokens-post.json`); `token-diff-report.json` shows unexpected_diff_count=0. |
| AC7 | acceptance_criterion | Focused asset/drift checks and `pnpm run check` pass from `plugin/`. | pass | `pnpm exec vitest run src/adv-skill-backed-commands-assets.test.ts src/manifest-doc-drift.test.ts` passed (2 files, 71 tests). `pnpm run check` passed. |
| C1 | constraint | Prose-only compression except stale standard reference changes and matching tests. | respected | Changes are prose/instruction compression plus stale-label asset-test alignment; no implementation behavior changed. |
| C2 | constraint | Preserve required command frontmatter shape. | respected | Focused manifest/doc drift tests passed; command frontmatter shape retained. |
| C3 | constraint | Keep safety, destructive-action, cancellation, and archive-signoff language unambiguous. | respected | Safety/destructive language re-verified: `MUST use as workdir`, `MUST return zero matches`, `Do NOT delete worktree`, and explicit worktree opt-out wording present. |
| C4 | constraint | Existing prose-load enforcement-class templates remain the governing compression framework. | respected | `caveman-full` remains wording-density layer over existing prose-load enforcement templates; inventory and command-voice docs retain framework references. |
| C5 | constraint | Compress obvious wins; do not pursue perfect optimization at the cost of protocol clarity. | respected | Only clear compression/clarity fixes were applied; review remediation restored clarity where compression was too aggressive. |
| DONT1 | avoidance | Do not delete contract-critical instructions only to reduce line count. | respected | Review found and fixed contract-critical wording losses; no contract-critical instruction deleted for line-count reduction. |
| DONT2 | avoidance | Do not alter workflow sequencing, gate ownership, approvals, cancellation approval, or archive sign-off. | respected | No workflow sequencing, gate ownership, approval, cancellation, or archive sign-off semantics changed; targeted review found no unresolved issues. |
| DONT3 | avoidance | Do not edit ADV external state files directly. | respected | ADV state was accessed only via ADV MCP tools; repo edits were confined to worktree files and /tmp evidence artifacts. |
| DONT4 | avoidance | Do not treat `caveman-full` as a replacement for prose-load enforcement classes. | respected | Docs explicitly preserve prose-load enforcement classes as governing framework; `caveman-full` is only wording-density compression. |
| DONT5 | avoidance | Do not rewrite archives/changelog history unless a mention is part of an active instruction surface. | respected | Stale-label grep excluded historical archive/changelog paths; active instruction surfaces updated only. |
| OOS1 | out_of_scope | Runtime behavior changes. | not_applicable | Runtime behavior changes were out of scope and not performed. |
| OOS2 | out_of_scope | Tool schema, enum, gate ID, status, or command semantic changes. | not_applicable | Tool schemas, enums, gate IDs, statuses, and command semantics were out of scope and not changed. |
| OOS3 | out_of_scope | Broad documentation rewrite outside audited instruction surfaces. | not_applicable | Broad documentation rewrite outside audited instruction surfaces was out of scope; edits stayed in audited active instruction/test surfaces. |
| OOS4 | out_of_scope | User-facing product feature changes. | not_applicable | User-facing product feature changes were out of scope and not performed. |

