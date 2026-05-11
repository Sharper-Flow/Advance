# Dead Code Detection (`MAINT-003`)

## Tool priority

| Language | Tool priority | Command |
|---|---|---|
| Python | vulture | `vulture <path> --min-confidence 80` |
| TypeScript/JS | knip → ts-prune fallback | `pnpm dlx knip --no-exit-code` |
| Go | deadcode | `deadcode ./...` |

No tool available → note skipped detector and continue Phase 2.

## Evidence rules

- Prefer tool-reported symbol/file/line evidence.
- Treat public exports, framework entrypoints, generated files, tests, fixtures, CLI command modules, and plugin registration surfaces as high false-positive risk.
- Do not delete from slop scan. Report finding and remediation path; harden/review command owns scoped fix decision.

## Confidence

- Tool-backed, private, unreferenced symbol: medium/high depending on ecosystem.
- Regex or text-only unused-looking code: low.
- Exported symbols or files referenced by config/globs: low unless tool proves unreachable.

## Report wording

Use precise location and suggested verification:

```jsonc
{
  "id": "MAINT-003",
  "name": "Dead code",
  "file": "src/foo.ts",
  "line": 42,
  "confidence": "medium",
  "detectionMethod": "ast",
  "fix": "Remove if not referenced by plugin registry; rerun typecheck and affected tests."
}
```
