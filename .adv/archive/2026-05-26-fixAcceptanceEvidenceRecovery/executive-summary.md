# Executive Summary

Delivered acceptance evidence recovery for ADV so acceptance proof is persisted and workflow-visible before user approval. The change makes `executive-summary.md` acceptance proof with workflow metadata and SHA-256 content hash, generates `acceptance.md` from typed contract review state during gate completion, and blocks acceptance with deterministic readiness errors when proof is missing, stale, failing, or not workflow-visible.

Recovery paths now support audited completed/poisoned workflow repair for executive-summary metadata, contract review matrix, and acceptance gate completion. Recovery requires precise evidence, recovery rationale, and prior user approval evidence where applicable; silent recovery and manual ADV state-file edits remain unsupported.

Verification passed after reviewer fixes: `pnpm run check`, `pnpm run build`, `pnpm test`, targeted recovery/readiness/workflow suites, spec JSON validation, command asset tests, and spec citation invariant.