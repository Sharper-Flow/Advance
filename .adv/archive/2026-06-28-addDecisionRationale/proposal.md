# Add decision rationale

## Why

Today, when ADV emits a major decision in user-facing output, the user only sees the chosen direction. To audit it (why this direction, what was rejected, when to re-evaluate), the user must reconstruct context from upstream artifacts (proposal, agreement, contract, gate transcripts). That hides rationale behind artifact spelunking and weakens auditability of non-trivial ADV choices.

## What Changes

Surface a concise, source-backed **Decision rationale** block in the user-facing output of every major ADV decision. The block contains four bounded fields:

1. **Chosen direction** — one sentence.
2. **Why it fits** — one or two sentences, grounded in source artifact (path or contract ID).
3. **Alternatives rejected / deferred** — short list with one-line reason each.
4. **Re-evaluation trigger** — a concrete, evidence- or time-bounded condition.

The change is scoped to **major decisions only** (per an explicit "major" classification). Routine output is unchanged and stays terse.

## User Outcomes

- [ ] Every major ADV decision surfaces a single, structured rationale block the user can read without opening other artifacts.
- [ ] Each rationale field is traceable to a source (artifact path or contract ID).
- [ ] Routine (non-major) output remains terse; no new noise introduced.
- [ ] Re-evaluation is phrased as a concrete trigger, not aspirational language.

## Affected Code

- Gate handoff / decision-emission renderer in the ADV plugin — append the rationale block to major-decision payloads only.
- Rationale formatter — bounded four-field schema, source citation required per field.
- Decision-classification heuristic — must distinguish major from routine; default = routine (no block emitted).

## Constraints

- Do not weaken Gate Handoff Voice — voice, cadence, and existing terseness preserved.
- Do not add new prompts or checkpoints — no new user approval gates.
- Routine output stays terse — no per-routine rationale boilerplate.

## Impact

- Major decisions gain a small, bounded rationale block (4 fields).
- Routine outputs: byte-identical or shorter.
- No breaking change to consumer contracts; additive only.

## Risks

- Misclassification (routine → major) could bloat terse outputs. Mitigated by default = routine and an explicit allowlist of "major" decision kinds.
- Source-citation fields may go stale. Mitigated by rendering citation as a static path/contract ID (not a runtime lookup).
- Re-evaluation triggers may be written as aspirational prose. Mitigated by accepting only concrete conditions (date, metric threshold, or named event).

## Validation Plan

- Snapshot tests for the major-decision emission shape (golden file with all 4 fields present and cited).
- Negative test: routine-decision payload contains no rationale block.
- Voice-preservation test: diff routine-decision output before/after change; expect zero additions.
- Lint/static check: reject rationale fields without a citation marker.
- Manual review of three recent archived major decisions to confirm re-evaluation trigger phrasing is concrete.