## Executive Summary: addDelegationMatrix

### What Was Done
Added a spec-backed delegation matrix (`delegation-defaults`) defining 9 workflow-step entries that govern which sub-agents each ADV workflow step may delegate to. Aligned review/harden command remediation routing, instruction surfaces, and agent definitions to the matrix. Added regression tests that catch phantom agents, primary-agent routing errors, and inline-required contradictions.

### Key Deliverables
- `.adv/specs/delegation-defaults/spec.json` — canonical 9-entry matrix (inline_required, hybrid, subagent_primary modes)
- `plugin/src/delegation-matrix.test.ts` — structural invariant tests for matrix shape and mode classifications
- `plugin/src/phantom-subagent-roster.test.ts` — phantom/primary-agent routing enforcement
- `plugin/src/adv-instructions-assets.test.ts` + `adv-reviewer-asset.test.ts` — regression tests for instruction surface alignment
- `.opencode/command/adv-review.md` + `adv-harden.md` — remediation routing aligned to matrix
- `ADV_INSTRUCTIONS.md`, `SETUP.md`, `.opencode/agents/adv.md`, `.opencode/agents/adv-reviewer.md` — field-facing guidance aligned without downstream spec lookup dependency

### Verification
- 193 focused delegation tests pass
- `pnpm run check` (typecheck, lint, format) passes clean
- Independent reviewer verdict: NEEDS_WORK → one non-blocking docs consistency finding remediated (SETUP.md bundled-agent overview)
- Review matrix: 27/27 items pass

### Design Decisions
- Two-plane model: source spec (repo-local, test-validated) vs runtime field plane (deployed behavior)
- Matrix is a source/evaluation artifact, not a runtime lookup dependency for downstream projects
- Minimal test hardening with concrete-gap exception for review/harden remediation sub-agents