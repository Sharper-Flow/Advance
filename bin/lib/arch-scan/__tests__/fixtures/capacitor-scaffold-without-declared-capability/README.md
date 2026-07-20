# capacitor-scaffold-without-declared-capability (NEGATIVE fixture)

Negative fixture for the `scaffold-vs-test-green-path` arch-scan rule.

The `android/` scaffold is present and `android/build.gradle` contains the
trigger pattern literal, but the project declares no capability intent.
None of the registry's gated declaration strings appear verbatim anywhere
in this repository.

## Layout

- `android/build.gradle` — minimal scaffold trigger file. Contains the
  literal `build.gradle` substring at line 1 (same shape as the POSITIVE
  fixture). This ensures the NEGATIVE outcome is attributable to the closed
  Phase 3 intent gate, not to a missing trigger match.
- `package.json` — minimal; no test scripts and no test-runner dependency
  or config block.

## Expected scan outcome (Phase 3, `relationshipId: "scaffold-vs-test-green-path"`)

- Intent gate CLOSED (no gated declaration string in repo).
- 0 findings emitted — false-positive protection: directory presence and
  trigger pattern match alone are insufficient to fire a Phase 3 rule.
- Coverage reports the relationship as `skipped` with reason
  `intent evidence not present`.

## Line map (1-indexed) of `android/build.gradle`

| Line | Content (key only)                                                  |
|------|---------------------------------------------------------------------|
| 1    | `// android/build.gradle — NEGATIVE fixture ...`                    |

## Note on declaration strings

This README intentionally does NOT echo any of the registry's gated
declaration strings (not even inside backticks or quotes). The evaluator's
intent check is a literal substring match against the full repo text, so
any verbatim occurrence — including one inside markdown code spans — would
open the Phase 3 gate and defeat the NEGATIVE case. See
`../rule-scaffold.test.ts` for the contract under test.
