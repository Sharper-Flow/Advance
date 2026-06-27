# Executive Summary — Enforce preview verification

ADV now treats visual preview handoffs as verified evidence, not bare URL claims. The strengthened `rq-acceptancePreviewUrl01` contract requires exact affected route/state proof, hydration/readiness context, viewport evidence including 375px or documented equivalent, freshness/cache context when relevant, and fixture/mock labeling. URL-source-only evidence no longer satisfies visual acceptance.

Workflow guidance now aligns discovery, review, apply, designer, and reviewer surfaces around the same rule: non-visual work can still record `Preview URL: not_applicable`, while applicable visual work must provide exact-route/post-hydration/viewport proof or surface a blocker/fallback rationale.

Verification passed:

- Targeted asset suites: 179 tests passed.
- `pnpm --dir plugin run check`: schemas, typecheck, isolation, lockfile, lint, and format passed.
- Independent acceptance reviewer verdict: READY, with small in-scope remediation checkpointed.
- Contract review matrix: 26/26 rows passing or respected.