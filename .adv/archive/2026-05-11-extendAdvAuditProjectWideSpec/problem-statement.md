# Problem

ADV has no project-wide capability for detecting and clarifying ambiguous wording in committed spec laws (`.adv/specs/*.md`).

The ambiguity taxonomy (B/F/S/M/D/X/Q/I/E/C/T) exists in canonical doc form (`ADV_INSTRUCTIONS.md § Ambiguity Taxonomy`) and runs against **in-flight change artifacts** in `/adv-proposal` Phase 2.6 (B/F/S scan over proposal.md) and `/adv-discover` Phase 2.5 (B/F/S/M scan over discovery artifacts). It never runs against the **laws themselves** once archived into `.adv/specs/`.

Spec-as-law is structural correctness (P33). Ambiguous laws break that contract project-wide regardless of impl drift — the impl can faithfully implement a vague requirement and still leave behavior unclear, untestable, or contradictory across capabilities.

# Why this matters now

- `/adv-audit` already owns project-wide spec health: drift, conflicts, orphans, malformed-requirement smells, terminology mismatch. Ambiguity is the missing axis.
- `clarify-readiness.ts` exists as a pure-function ambiguity validator but is scoped to Change objects (in-flight artifacts), not spec files.
- `/adv-clarify` is artifact-agnostic per its skill body but has no entry point for spec-file input.
- Users currently have no command/skill that surfaces "this committed law is ambiguous — let's rewrite it" without manual reading.

# Desired Outcome

Extend `/adv-audit` to scan all (or one) spec(s) for ambiguity findings using the canonical taxonomy, surface them as a new audit dimension alongside drift/conflicts/orphans, gate project health on ambiguity thresholds, and hand findings to `/adv-clarify` in findings-driven mode for collaborative rewrite — without mutating ADV state directly. Clarify produces a rewrite-ready proposal; user runs `/adv-proposal` to apply.