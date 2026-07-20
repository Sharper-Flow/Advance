# knip-config-without-dep (POSITIVE fixture)

Positive fixture for the `config-vs-dependency-presence` arch-scan rule.

- `package.json` declares `knip`, `eslintConfig`, and `prettier` config blocks.
- None of `knip`, `eslint`, `prettier`, `stylelint`, or `@commitlint/cli`
  appear in `dependencies` or `devDependencies`.
- No `pnpm-workspace.yaml` or `lerna.json` — no hoist exception signal.

Expected scan outcome (Phase 1, `relationshipId: "config-vs-dependency-presence"`):

- 3 findings emitted, one per config-block trigger hit.
- Each finding: `severity: "major"`, `confidence: "high"`,
  `detection_method: "regex"`, `category: "capability-consistency"`.
- Trigger evidence `file: "package.json"`, `line` points at the config block.
- `absence_proof.searchedRoots` non-empty; `includedGlobs` contains
  `**/package.json`; `parseFailures` is an array.

Line map (1-indexed) of `package.json`:

| Line | Content (key only)                |
|------|-----------------------------------|
| 8    | `"knip": {`                       |
| 11   | `"eslintConfig": {`               |
| 14   | `"prettier": {`                   |
