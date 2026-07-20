# capacitor-scaffold-with-script (POSITIVE fixture)

Positive fixture for the `scaffold-vs-test-green-path` arch-scan rule.

The `android/` scaffold is present and the project declares a `test:native`
script entry in package.json referencing the scaffold. The literal
declaration `script entry in package.json referencing the scaffold` (one of
the registry's `intent_required` strings) opens the Phase 3 intent gate.

No acceptable counterpart is present: there is no test runner configuration
file in scope. The `package.json` script invokes maestro flows directly but
does not match the acceptable-counterpart pattern (no `<runner>.*config`
literal on a single line).

## Layout

- `android/build.gradle` — minimal scaffold trigger file. Contains the
  literal `build.gradle` substring at line 1.
- `android/capacitor.settings.gradle` — minimal placeholder; collected as
  a trigger file by the `**/android/**` glob but produces no trigger hit.
- `package.json` — declares `test:native` script invoking maestro flows;
  no dependency or config block for any test runner.

## Expected scan outcome (Phase 3, `relationshipId: "scaffold-vs-test-green-path"`)

- Intent gate OPEN (declaration string present in this README).
- 1 finding emitted on the trigger hit at `android/build.gradle` line 1.
- Finding shape: `severity: "minor"`, `confidence: "low"`,
  `detection_method: "regex"`, `category: "capability-consistency"`.
- Trigger evidence `file: "android/build.gradle"`, `line: 1`,
  `matchedSignal: "build.gradle"`.
- `absence_proof.includedGlobs` spans the counterpart scope
  (`**/*.ts`, `**/*.js`, `**/*.json`, `**/*.yaml`); `excludedGlobs`
  includes `node_modules`.

## Line map (1-indexed) of `android/build.gradle`

| Line | Content (key only)                                                  |
|------|---------------------------------------------------------------------|
| 1    | `// android/build.gradle — POSITIVE fixture ...`                    |
