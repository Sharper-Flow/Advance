# Archive: Strengthen researcher judgement

**Change ID:** strengthenResearcherJudgement
**Archived:** 2026-07-02T20:02:59.642Z
**Created:** 2026-07-02T17:59:56.389Z

## Tasks Completed

- ✅ Implement typed researcher architecture judgement schema and legacy compatibility
  > Added required typed `architecture_judgement` for new `adv-researcher` reports, with applicable/not_applicable discriminated schema, verdict consistency checks keyed to `validation.status`, researcher field-source metadata, and deterministic legacy persisted researcher report normalization. Updated researcher fixtures/readback tests. Verified targeted schema/readback tests pass.
- ✅ Update adv-researcher prompt/report contract for Architecture Judgement
  > Updated `adv-researcher` prompt to make Architecture Judgement first-class, preserve docs/API/examples research and citation/uncertainty requirements, document `validation.status` as the single verdict, and include `architecture_judgement` in the RESEARCHER_REPORT example. Added asset assertions for the prompt contract.
- ✅ Update command/spec judgement contract and drift tests
  > Task checkpoint completed
- ✅ Regenerate schemas and run final contract verification
  > Task checkpoint completed

## Specs Modified

