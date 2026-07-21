# adv-triage Anti-Patterns + Coexistence

## Coexistence

| Command | Role | Relationship to `/adv-triage` |
|---|---|---|
| `/adv-status` | Read-only project overview | Health/status counterpart, not portfolio prioritization |
| `/adv-cleanup` | Close/archive abandoned, duplicate, or completed ADV changes | Owns cleanup mutations surfaced by triage |
| `/adv-epic` | Create/update Epic initiative containers | Supplies initiative context; triage never mutates membership implicitly |
| `/adv-proposal` | Start issue-linked work | Consumes Open issues worth solving pointers |
| `/adv-idea` / `/adv-problem` | Shape ideas or bugs | Their durable outputs may enter triage inventory |

## Anti-patterns

| × Bad | ✓ Good |
|---|---|
| Auto-create GH issues without Tier B approval | Batch unrepresented items into explicit approval prompt |
| Create issues or assign priorities before cleanup validation | Complete source cleanup validation first |
| Link a change↔issue pair from title similarity alone | Show heuristic evidence and require approval |
| `approve all` links hidden overflow pairs | Limit authority to displayed indices; prompt next batch separately |
| Propose a pair already linked by origin, issue URL, or typed Epic evidence | Exclude existing links before numbering candidates |
| Detect change↔change duplicates in Coalesce | Delegate duplicate/superseded changes to `/adv-cleanup` |
| Close/cancel/archive changes from Portfolio balance | Report bucket counts/IDs and point to `/adv-cleanup` |
| Treat Epic order as blocking | Use order as advisory context only |
| Suppress issue-only work because of heuristic overlap | Keep it visible until structurally linked or explicitly resolved |
| Ask users to confirm or choose a priority | Gather at most two context answers; agent assigns priority |
| Ask users to assign priority to stale or already-addressed items | Resolve relevance before any bug priority assignment |
| Post priority rationale as an issue comment | Emit `<issue#>: priority=<tier> :: <rationale>` in chat output only |
| Generate or commit ROADMAP.md / `.adv/roadmap-snapshot.json` | Emit the three-section report in chat only |
| Recommend removed `/adv-roadmap`, `adv roadmap`, or the retired portfolio reader MCP tool | Route portfolio requests to `/adv-triage` |

## Coalesce execution sequence

1. Exclude existing structural links.
2. Produce structural candidates before heuristic candidates.
3. Attach bounded evidence and optional Epic context.
4. Display at most 20 numbered candidates.
5. Parse only the exact Tier B grammar.
6. Call `adv_change_update_issues` for approved displayed pairs.
7. Preserve successful links when another pair fails; report exact retry calls.
8. Prompt overflow as a new authority batch.

Any ambiguous response re-prompts. No LLM fallback.

## Portfolio rendering

- Exactly: Important to complete, Cleanup needed, Open issues worth solving.
- Cap 10 rows each; show explicit overflow count.
- Use issue priority, gate proximity, then recency for deterministic ordering.
- Include Epic context without creating a fourth section or blocking on Epic order.
- Never write files or perform git operations.
