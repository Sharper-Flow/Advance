# Acceptance

Reviewed at: 2026-07-21T00:41:50.754Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| C1 | constraint | ADD only — do not modify existing voice rules. | pass | 6 modified files; User-Focus inserted at docs/command-voice-standard.md:15-46 while Core Rules remain :5-13 and Manifest Description Rules begin :48. No existing voice rule text changed. |
| C2 | constraint | No new enforcement mechanism; no new drift test for this rule. | pass | No test file changed. Section :34 and :42 explicitly classify judgment-only/no drift test. 98/98 voice-enforcement drift tests pass (manifest-doc-drift 17/17). |
| C3 | constraint | Cross-project rule: generalize the prose; toolbox example is motivational aside only. | pass | Motivational aside at docs/command-voice-standard.md:44-46 explicitly says 'not normative' and 'The rule generalizes.' Toolbox instance motivates only. |
| C4 | constraint | Preserve doc length discipline (use compression templates from Prose-Load Reduction Rules where applicable). | pass | 32-line inherently-prose structured section (one-line purpose + tables). Only Prose-Load Reduction Rules section is capped at 80 (plugin/src/manifest-doc-drift.test.ts:350-360); User-Focus not subject to that cap. |
| DONT1 | avoidance | Do not invent a heuristic detector for "internal artifact names" — the translation discipline is human/agent judgment, not a regex. | respected | Translation discipline at docs/command-voice-standard.md:28-30 explicitly framed as 'Judgment — not a regex.' No heuristic detector language. |
| DONT2 | avoidance | Do not bloat the ADV overlay with multi-paragraph explanations if injection is chosen — pointer-style only. | respected | Single pointer-style reminder at .opencode/agents/adv.md:156 and mirror at .opencode/overlays/adv.overlay.md:15. No multi-paragraph bloat. |
| DONT3 | avoidance | Do not cite the toolbox `reduceLaunchTime` change as normative; it is an instance, not the rule. | respected | Aside at docs/command-voice-standard.md:44-46 says 'not normative' and 'rule generalizes'; toolbox reduceLaunchTime framed as instance-not-rule. |

