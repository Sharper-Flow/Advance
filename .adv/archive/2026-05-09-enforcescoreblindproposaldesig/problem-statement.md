## Problem
WSJF inputs from `/adv-triage` can leak into agent context via ROADMAP.md, `/adv-roadmap` output, and future issue-body prefill. Quality-producing agents may then scale depth to score, violating LBP/P31/P25.

## Desired Outcome
WSJF governs **when**, never **how well**. Triage/roadmap keep scores for sequencing. Quality-producing gates are score-blind.

## Prior Decisions
ROADMAP.md rank-only; GH Project v2 canonical scored surface; `/adv-roadmap` command/side-quest; future imports sanitized; no retroactive scrub.

## Rejected Approaches
Prose-only ignore rule; hiding scores from triage/roadmap; score-aware quality scaling.