## Agreement

### Objectives

1. Harden Phase 0 gains a "Review Findings Ingestion" step that validates and implements `suggestion:`/`question:` findings before 6-scanner run
2. Every review finding reaches terminal status (`fixed` or `rejected_with_evidence`) before archive is allowed
3. Review emits a signal when APPROVED with unresolved suggestions so harden knows to process them

### Acceptance Criteria

- AC1: `adv-harden.md` Phase 0 has new "Review Findings Ingestion" sub-section with validate → classify → implement → emit flow
- AC2: `adv-harden.md` Review Findings Audit section updated to include validation of suggestions/questions (not just blockers/issues)
- AC3: `adv-review.md` APPROVED verdict notes unresolved suggestions for harden attention
- AC4: Drift-detection rule applies to suggestion implementation in harden
- AC5: No plugin code changes required

### Constraints

- Command-contract files only (`.opencode/command/adv-harden.md`, `.opencode/command/adv-review.md`)
- No changes to harden's 6-scanner framework
- No new ADV tools or state

### Out of Scope

- Plugin code changes
- Changes to review's own remediation behavior
- Auto-implementing suggestions that would change proposal scope