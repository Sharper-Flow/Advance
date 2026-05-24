# Agreement

## Objectives

- Ensure users receive a concrete preview path before accepting front-end/browser-visible ADV work.
- Make preview evidence structural in the acceptance workflow, not dependent on agent memory.
- Prevent acceptance from silently proceeding when applicable visual work has no reachable preview.
- Preserve non-front-end acceptance flow without unnecessary preview blocking.

## Acceptance Criteria

- AC1: `/adv-review` detects applicable front-end/browser-visible work, defined broadly as any visual output.
- AC2: If applicable, the acceptance summary includes `Preview URL: {url}` before user acceptance.
- AC3: Preview URL must include reachability evidence; a bare unverified URL is insufficient.
- AC4: If applicable work lacks URL or reachability evidence, acceptance is blocked before user sign-off.
- AC5: If not applicable, the acceptance summary may state `Preview URL: not_applicable`.
- AC6: The rule is encoded in durable workflow contract surfaces: spec, `/adv-review` command, and tests.
- AC7: Preview proof is included in durable acceptance or executive-summary evidence when applicable.

## Constraints

- C1: Preserve the seven-gate ADV workflow and existing acceptance checkpoint semantics.
- C2: Use structural contract surfaces (spec, command doc, tests) rather than heuristic-only prompting.
- C3: Do not require public deployment when local or equivalent dev preview is sufficient.
- C4: Keep non-front-end changes unblocked by preview URL requirements.

## Avoidances

- DONT1: Do not fabricate URLs from assumptions.
- DONT2: Do not accept a bare unverified URL for applicable visual work.
- DONT3: Do not move the requirement to archive/release; it must run before user acceptance.
- DONT4: Do not build a new dev server manager as part of this change.

## Decisions

### User Decisions

- Preview evidence: URL plus reachability evidence.
- Missing applicable preview URL: block acceptance.
- Trigger scope: any visual output.

### Agent Decisions (LBP)

- Encode the rule in `advance-workflow` spec, `/adv-review` Phase 7, and asset tests.
- Use a tri-state acceptance preview result: `live`, `not_applicable`, or `blocked`.
- Prefer structural applicability declaration/checks over heuristic-only file sniffing.
- Include preview evidence in persisted acceptance/executive-summary proof when applicable.

## Deferred Questions

None.

## Sign-Off

Approved by user reply: `approve` at the acceptance-criteria checkpoint.