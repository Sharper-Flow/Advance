# Contract Traceability

**Change ID:** addDeclarationBehavior
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-26T21:25:30Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| C1 | constraint | respected | static_check | No writes to ~/.config/opencode/instructions/rules.yaml from this change. P38/P39 were manually pre-adopted by operator before execution; SETUP.md sections document that adoption, do not redo it. |
| C2 | constraint | respected | static_check | No advance/rules.yaml file created (fd empty). No sync script added. No CI check enforcing SETUP.md↔rules.yaml consistency. Canonicalization deferred per OOS1. |
| C3 | constraint | respected | static_check | All 6 new SETUP.md sections follow established P29/P30/P31 pattern: heading, intro paragraph, user-managed note, copy-paste YAML block, priority-calibration rationale, why-this-rule-exists prose, restart closer. Verified by reading each section. |
| C4 | constraint | respected | static_check | YAML fidelity verified by adv-verifier (report ID ...|verifier:add-declaration-behavior-docs-sync|...|1): all 6 new sections' YAML blocks character-for-character match deployed rules.yaml after 2-space indent normalization. P32:12L P34:28L P35:12L P37:19L P38:23L P39:20L. |
| DONT1 | avoidance | respected | review | P34 and P38 have distinct SETUP.md sections. P34 framed as external-surfaces rule, P38 framed as internal-surfaces twin. P38 section text explicitly cross-references: 'It is the internal-surfaces twin of P34.' |
| DONT2 | avoidance | respected | review | P38 names the declaration-to-effect join failure mode specifically (silent-default .get(key, default), getattr(obj, name, fallback) patterns). P39 names the mismatched-population ratio failure mode specifically (COUNT(DISTINCT) vs COUNT(*)). Neither is a generic 'be more careful' rule. |
| DONT3 | avoidance | respected | review | Rule text in P38/P39 sections is language-agnostic. Python patterns appear only as examples in P38 (.get, getattr, dict[key] if key in dict). P39 examples use SQL COUNT(DISTINCT) which is also language-agnostic. The rule applies to any declaration-to-effect join in any language. |
| DONT4 | avoidance | respected | review | git diff numstat on SETUP.md: 347 additions, 0 deletions. No sections added for P04, P05, P07, P08, P16, P19, P23, P24, P25, P26, P27. Backfill scope limited to P32, P34, P35, P37 per agreement. |
| DONT5 | avoidance | respected | review | P32 SETUP.md section YAML block uses plain multiline scalar matching deployed rules.yaml entry verbatim, including the 'the inverse: run them only' colon-space text. Not converted to >- folded style. Pre-existing strict-parse defect remains out of scope. |
| DONT6 | avoidance | respected | review | git diff numstat: adv-design.md 6/0, CHANGELOG.md 7/0, SETUP.md 347/0. No changes under plugin/src/, bin/, scripts/, or other .opencode/command/adv-*.md files except adv-design.md. Documentation-only confirmed. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Canonicalization architecture (advance/rules.yaml + sync enforcement) explicitly deferred per agreement OOS1. Not pursued. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Older ADV-cited rule documentation (P04-P08, P16, P19, P23-P27 SETUP.md sections) explicitly out of scope per agreement OOS2 and DONT4. Not pursued. |
| OOS3 | out_of_scope | not_applicable | not_applicable | P32 YAML strict-parse defect (colon-space at line 179 'the inverse: run them only') explicitly out of scope per agreement OOS3 and DONT5. Not pursued. |
| OOS4 | out_of_scope | not_applicable | not_applicable | No downstream user rules.yaml modified. Operator's own rules.yaml was manually updated as pre-execution work (P38/P39 added); that adoption is captured as evidence in the proposal, not redone by the change. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-8f58db69a0c5 |  |  | C1, C3, C4, DONT1, DONT4, DONT6 |  |
| tk-a662a465245c |  |  | DONT6 |  |
| tk-ec959ce96265 |  |  | DONT6 |  |
| tk-aeb400b08901 |  |  | C4 |  |
