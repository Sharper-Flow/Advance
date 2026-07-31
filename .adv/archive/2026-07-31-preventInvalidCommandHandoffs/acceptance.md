# Acceptance

Reviewed at: 2026-07-31T05:47:29.982Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | ADV guidance never sends a person to an unregistered command. | pass | Independent review confirmed shared wayfinder is bound to manifest-backed phase-plan commands. |
| SC2 | success_criterion | Acceptance guidance reliably directs users to `/adv-review`. | pass | Acceptance route is verified as `/adv-review`. |
| AC1 | acceptance_criterion | Given acceptance is the next gate, when ADV renders its runnable handoff, then it names `/adv-review {change-id}`. | pass | Targeted suite run tr_ms8cvm9d_5c818c05 passed acceptance-route coverage. |
| AC2 | acceptance_criterion | Given a handoff has no registered canonical command, when ADV prepares guidance, then it presents a clear blocked state and no runnable guessed command. | pass | Targeted suite run tr_ms8cvm9d_5c818c05 passed missing/unregistered route fail-closed coverage. |
| AC3 | acceptance_criterion | Given a user reaches ADV with the retired `/adv-accept` wording, when guidance is returned, then it directs them to `/adv-review` without creating an alias. | pass | Handoff drift tests cover correction-only `/adv-accept` wording with no alias. |
| AC4 | acceptance_criterion | Given a standard gate handoff is rendered through the shared wayfinder path, when its command is shown, then the command is registered for that transition. | pass | Handoff drift tests assert each displayed continuation command is manifest registered. |
| C1 | constraint | Must preserve existing gate ownership and registered command names. | respected | Manifest and seven-gate mapping were preserved; renderer checks the existing GATE_COMMAND mapping. |
| C2 | constraint | Must not add `/adv-accept` as a command or alias. | respected | No `/adv-accept` command or alias was registered; tests assert its absence. |
| C3 | constraint | Must not redesign the seven-gate lifecycle. | respected | No lifecycle state or gate ownership change was made. |
| DONT1 | avoidance | Do not implement separate symptom patches for individual gates when the shared handoff source can be corrected. | respected | Single shared handoff contract and renderer path were hardened; no per-gate symptom patch. |
| DONT2 | avoidance | Do not present a best-effort inferred command when the canonical mapping is unavailable. | respected | Unregistered/missing directives render blocked guidance without a guessed command. |
| OOS1 | out_of_scope | External integrations, cross-repository changes, and unrelated slash-command routing. | not_applicable | No external integrations, cross-repository work, or unrelated routing changed. |

