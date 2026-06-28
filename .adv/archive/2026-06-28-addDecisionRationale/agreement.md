# Add decision rationale — agreement

## Objectives

- Every emitted **major** ADV decision carries a structured rationale block (chosen direction, why-it-fits, alternatives, re-evaluation trigger) in user-facing output.
- Each rationale field is source-backed (artifact path or contract ID).
- Routine decisions stay terse and unchanged.
- Gate Handoff Voice is preserved; no new prompts/checkpoints.

## Acceptance criteria

- AC1: For every emitted major decision, user-facing output contains a single `Decision rationale` block with all four required fields present and non-empty.
- AC2: Each rationale field includes a source citation (artifact path or contract ID). A lint check rejects missing citations.
- AC3: Routine (non-major) decisions produce byte-identical-or-shorter output compared to baseline; no rationale block is emitted. Verified by snapshot diff.
- AC4: Gate Handoff Voice is preserved — voice/cadence/tone checks pass on a sample of 5 recent gate handoffs before and after the change.
- AC5: No new prompt or user-approval checkpoint is added. Verified by prompt-inventory diff.
- AC6: Re-evaluation trigger is phrased as a concrete condition (date, metric threshold, or named event) — not aspirational prose. Verified by reviewer rubric on a 5-decision sample.
- AC7: Decision-classification default is `routine`. A change only emits the rationale block if it matches an allowlisted "major" kind. Unit test covers allowlist boundary cases.

## Success criteria

- All 7 ACs pass automated checks (snapshot + lint + unit) and one human-review pass on a sample of recent archived decisions.
- No regression in routine-output terseness on the `bin/oc-fast-check` and any voice-preservation test surface.

## Constraints

- Must not weaken Gate Handoff Voice.
- Must not add new prompts or checkpoints.
- Routine output must remain terse (default = routine; rationale is opt-in by classification).

## Avoidances

- Do not gate decisions behind new user approval.
- Do not introduce per-decision prompts.
- Do not bury rationale in tool-result transcripts — it must live in the user-facing output layer.
- Do not invent new prompts/checkpoints to enforce rationale quality.

## Out of scope

- Auto-evaluation of re-evaluation triggers.
- Cross-project rationale federation beyond the current ADV surface.
- UI/format changes unrelated to the rationale block.