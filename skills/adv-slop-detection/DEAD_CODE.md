# Dead Code Detection (`MAINT-003`)

<!-- rq-ss010 -->

`MAINT-003` owns deletion_candidate findings. Deletion candidates are review inputs only; they are not instructions to remove code.

## Deletion candidate subtypes

| Subtype | Evidence expectation |
|---|---|
| unused dependency | Tool-backed dependency graph evidence plus package manifest citation |
| unused export | Tool-backed export reachability plus package entrypoint/config checks |
| unused file | Tool-backed file reachability plus generated/test/fixture protection checks |
| unreachable branch | Structural AST/control-flow evidence |
| uncallable private symbol | Exact private symbol reachability proof |
| impossible feature-flag path | Typed config/constant/allowlist proof; otherwise missing detector coverage or low-confidence / user-review |

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
- Do not auto-delete or imply deletion is safe without structural evidence.
- No single external tool is the sole correctness authority for deletion safety.

<!-- rq-ss011 -->

## Deletion Safety / Actionability Boundary

- Heuristic-only or text-only unused-code guesses are not actionable removal proof.
- Regex-only or agent-judgment deletion candidates stay non-blocking.
- Route uncertain candidates to `low-confidence / user-review`.
- Actionable candidates require structural source/tool evidence plus a verification-oriented fix.

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
