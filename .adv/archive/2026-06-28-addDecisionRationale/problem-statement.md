# Add decision rationale — problem statement

## Problem

When ADV emits a major decision in user-facing output today, only the chosen direction is visible. To audit the decision — why this direction was chosen, what alternatives were rejected, when to re-evaluate — the user must reconstruct context from upstream artifacts (proposal, agreement, contract, gate transcripts, task reports).

This makes non-trivial ADV choices hard to audit and easy to challenge after the fact without enough context to either defend or revise them.

## Goal

Every major ADV decision surfaces a single, concise, source-backed **Decision rationale** block in user-facing output. The block contains:

1. Chosen direction (one sentence).
2. Why it fits (source-cited).
3. Alternatives rejected / deferred (with one-line reason each).
4. Re-evaluation trigger (concrete condition).

## Non-goals

- Do not change Gate Handoff Voice — keep cadence, terseness, and tone.
- Do not introduce new prompts or checkpoints.
- Do not bloat routine (non-major) output.
- Do not require a new user approval step per decision.
- Do not auto-fetch or evaluate re-evaluation triggers; just state them.

## Why now

Major ADV decisions are accumulating without a uniform audit surface. Continued emission without rationale will compound audit risk across active changes and archived decisions that need to be revisited.