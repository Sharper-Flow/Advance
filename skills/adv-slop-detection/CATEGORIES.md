# Slop Detection Categories

## Phase 1 thresholds

Load `features.slop_scan` from `project.json`.

| Key | Default | Use |
|---|---:|---|
| `nesting_depth` | 4 | Deep nesting threshold |
| `defensive_guard` | 3 | Repeated guard threshold |
| `complexity` | 10 | Cyclomatic complexity threshold |
| `ast_timeout_ms` | 10000 | Per-detector timeout |

## AST structural tools

| Language | Tool | Command |
|---|---|---|
| TypeScript/JS | ESLint | `pnpm dlx eslint --rule '{max-depth:[error,{max:N}],complexity:[error,N]}'` |
| Python | radon | `radon cc -n C <path>` |
| Go | gocyclo | `gocyclo -over N <path>` |

If unavailable or timed out: brace/indent counting fallback; set `detectionMethod: "degraded"`.

## Regex / signal layer

| Category | Smell IDs | Signals |
|---|---|---|
| Debug artifacts | AI-008 | `console.log/debug/info`, `debugger`, `print(`, `fmt.Print` |
| Type evasion | AI-007, AI-006 | `as any`, `as unknown as`, `@ts-ignore`, `@ts-nocheck`, `eslint-disable` |
| Incomplete work | QUAL-004, QUAL-009 | `TODO`, `FIXME`, `HACK`, `XXX` |
| Error suppression | QUAL-007 | Empty catch blocks, `except: pass` |
| Hardcoded env | MAINT-005 | `localhost`, `/Users/`, `/home/`, `127.0.0.1` |
| AI signatures | DOC-003 | `Certainly!`, `Sure!`, `I'll help`, `As an AI` |
| Security | QUAL-003 | String-concat SQL, hardcoded passwords/keys/secrets |
| Structural correctness bypass | QUAL-012 | Heuristic/fuzzy/LLM decisions owning correctness boundaries |

## Defensive Overkill (`QUAL-011`)

Detect repeated null/undefined guards on same identifier. Escalate at `defensive_guard` threshold. Same-identifier redundant-guard evidence upgrades confidence.

## Confidence defaults

- AST-backed structural findings default to `confidence: high`.
- Regex-only defensive-overkill findings default to `confidence: medium` unless corroborated by same-identifier redundant guards.
- Degraded fallback findings default to `confidence: low` unless corroborated by another detector.
- Security secret patterns may be high confidence only when source evidence is concrete; never print secret values.

## Phase 2 scanner buckets

| Scanner | Category | Focus | File selection |
|---|---|---|---|
| Hallucination | `HALLU-*` | Phantom imports, invented methods, version confusion | All, batched |
| Structure | `STRUCT-*` | Cargo cult, context amnesia, frankencode | All, batched |
| Quality | `QUAL-*` | Happy path only, confident incorrectness | All, batched |
| Documentation | `DOC-*` | Obvious comments, stale docs, copy-paste | Export-heavy |
| Dependency | `DEP-*` | Bloat, version roulette, phantom deps | Config + imports |
| Maintainability | `MAINT-*` | Dead code, context collapse, style whiplash | All, batched |
| AI-Specific | `AI-*` | Sycophantic code, context blindness | Newest files from git |
| Performance | `PERF-*` | N+1 queries, excessive renders | Large files >100 lines |
| Test | `TEST-*` | Magic numbers, assertion roulette | `tests/`, `__tests__/` |

Cap each file at 3 scanners. Priority: Hallucination, Structure, Quality; add only strongest specialized bucket.
