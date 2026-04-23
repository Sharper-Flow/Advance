# ADV Local Storage Comparison

## Metadata
- repo_root: /home/jrede/.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/reduceTemporalRoundTrip
- temporal_disabled: true

## Benchmarks
| Candidate | Operation | p50 | p95 | Notes |
| --- | --- | ---: | ---: | --- |
| sqlite_first_candidate | adv_status | 0.6 | 3.1 | current local ADV path representative hot-path tool |
| jsonl | agenda.add | 0.4 | 0.6 | agenda append |
| jsonl | agenda.load | 0.5 | 2.5 | agenda load |
| jsonl | wisdom.add | 0.3 | 0.7 | wisdom append |
| jsonl | wisdom.load | 0.5 | 3.0 | wisdom load |

## Tradeoffs
### sqlite_first_candidate
- Strengths: query richness; WAL durability; same-host shared state
- Risks: checkpoint/lock tuning; doctor path can still be expensive

### jsonl
- Strengths: append-only audit trail; fast append/load at current scale
- Risks: compaction; replay/snapshot drift; projection complexity for rich queries
