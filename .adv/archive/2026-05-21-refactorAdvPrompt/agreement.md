# Agreement

## Objectives

1. Replace wholesale `ADV_INSTRUCTIONS.md` concatenation with lean, self-contained ADV runtime prompt assembly.
2. Preserve every valuable runtime protocol through retained text, structural enforcement, command/spec ownership, or explicit reference-only classification.
3. Update specs/docs/tests that currently require full `ADV_INSTRUCTIONS.md` static order.
4. Verify deploy/check/runtime composition, including provider hints and composed prompt budget.

## Acceptance Criteria

1. `scripts/deploy-local.sh --fix` writes one selectable global `adv.md` and does not append the full `ADV_INSTRUCTIONS.md` wholesale.
2. Duplicate protocol across runtime instruction surfaces is trimmed or removed when coverage mapping proves the behavior remains retained, enforced, command-owned, spec-owned, or reference-only.
3. Non-duplicated/runtime-critical protocol is treated conservatively: it remains in the runtime prompt unless there is explicit replacement enforcement or user-approved classification.
4. A protocol coverage inventory maps every removed or compressed runtime section to retained runtime text, code/spec enforcement, command contract, or reference-only material.
5. `advance-meta` spec law and mirrored docs are updated where they currently require `canonical ADV body + ADV_INSTRUCTIONS.md` static order.
6. Provider-specific `adv-{provider}.md` files are not generated or required; provider hints continue through structured runtime system-block injection and append to `output.system[0]` only.
7. Prompt-size success is coverage-first: tests/reporting measure lean static `adv.md`, full reference protocol, provider hint, ADV dynamic banner estimate, and caveman allowance, without forcing unsafe trimming to hit a hard cap.
8. Tests cover prompt assembly, stale provider cleanup, invariant presence, coverage inventory, spec/doc drift, and prompt-size reporting.
9. Verification passes with relevant unit/asset tests, `pnpm run check`, build as needed, and `scripts/deploy-local.sh --check`; restarted OpenCode smoke is not required for acceptance, but restart implications must be documented.

## Constraints

- Preserve single selectable `adv` agent behavior.
- Keep `ADV_INSTRUCTIONS.md` as the full repo/dev source-of-truth reference unless a later explicit decision changes that.
- Preserve caveman/ADV plugin composition discipline: append to `output.system[0]`; do not add separate system entries.
- Do not hand-edit installed global files as the fix; fix source/generator behavior.
- Do not silently weaken due diligence, ADV state access, worktree isolation, cancellation approval, gate sequencing, or checkpoint semantics.

## Avoidances

- No 7-gate lifecycle redesign.
- No provider-specific selectable ADV agents.
- No global `ADV_INSTRUCTIONS.md` registration via OpenCode `instructions[]`.
- No OMP phase routing implementation.
- No caveman plugin behavior changes.

## Decisions

### User Decisions

- Runtime retention: trim/remove definitely duplicated instruction content; otherwise be conservative. Keep the decision about full `ADV_INSTRUCTIONS.md` inclusion centered on whether its content is duplicated or still uniquely needed at runtime.
- Prompt budget: coverage-first, not hard numeric cap.
- Validation: tests/script verification are enough; restarted OpenCode smoke is not required.
- AC approval: user replied `approve`.

### Agent Decisions (LBP)

- Use structural coverage inventory + drift tests as the correctness mechanism.
- Treat current full `ADV_INSTRUCTIONS.md` concatenation as spec-law drift to amend, not just script cleanup.
- Keep provider/caveman dynamic additions separate from static `adv.md` prompt assembly and preserve single-system-block discipline.

## Deferred Questions

None.

## Sign-Off

Acceptance criteria approved by user reply: `approve`.