# Archive: Add decision rationale

**Change ID:** addDecisionRationale
**Archived:** 2026-06-28T02:08:27.857Z
**Created:** 2026-06-26T17:20:26.859Z

## Tasks Completed

- ✅ Add decision-rationale spec contract and structural validators
  > Added `rq-decisionRationale01..04` to advance-workflow spec and docs mirror; added `docs/command-voice-standard.md` nested major-decision rationale contract; updated `.opencode/agents/adv.md`; added `plugin/src/decision-rationale-assets.test.ts`; added pure `plugin/src/validator/source-marker.ts` and tests validating source markers, trigger kinds, and `[source:]`/`[warrant:]` separation.
- ✅ Update ADV voice and command surfaces for major-decision rationale
  > Confirmed docs/voice surface updates from the structural pass: `docs/command-voice-standard.md` defines nested major-decision rationale, `.opencode/agents/adv.md` references it, command handoff templates avoid top-level `## Decision rationale`, and inline approval anchors remain unchanged.
- ✅ Run contract, routine-output, and checkpoint verification sweep
  > Ran cross-cutting verification and harden remediation for rationale assets, source-marker/warrant separation, handoff/footer drift, checkpoint drift, command spine assets, contract mint, touched-file formatting, typecheck, ADV validation, and merge compatibility. Acceptance/harden review tightened `source-marker.ts` to require exact four rationale fields and a concrete trigger condition, added parser regressions, added routine handoff byte-identical baseline coverage, exported the parser through the validator barrel, and made the canonical docs syntax parser-validated in the asset test. Did not mutate or close duplicate `addDecisionRationale2`.

## Specs Modified

