# Executive Summary

## Outcome

ADV handoffs now use the canonical command tied to the current gate, so acceptance directs users to `/adv-review` rather than an invalid command.

## Why it matters

People receive a runnable next step or a clear blocked state instead of a misleading guessed command.

## What changed

- Bound shared handoff guidance to the typed, manifest-backed route.
- Made unregistered or missing directive routes fail closed.
- Added correction-only `/adv-accept` → `/adv-review` guidance without an alias.
- Added regression coverage for manifest registration, acceptance routing, and blocked rendering.

## Verification

- Targeted suite: 219 tests passed across phase-plan parity, handoff footer drift, and context snapshot tests (`tr_ms8cvm9d_5c818c05`).
- TypeScript check passed in reviewer verification.
- Independent review found and remediated one fail-open unknown-command rendering case; final review was ready with no remaining blocker.

## Risks / Follow-ups

- `pnpm run check` remains blocked by a pre-existing schema-generation limitation and unrelated formatting warnings, reported by the implementation worker; this change did not introduce that failure.
- Unknown slash commands rejected by the host before ADV receives them remain outside this change; when the retired wording reaches ADV, guidance corrects it without an alias.