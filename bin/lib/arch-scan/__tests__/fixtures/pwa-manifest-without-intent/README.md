# pwa-manifest-without-intent (NEGATIVE fixture)

Negative fixture for the `manifest-reference-vs-runtime-registration`
arch-scan rule (Phase 3, severity minor, confidence low).

- `index.html` references `/site.webmanifest` via `<link rel="manifest">`.
- `package.json` is minimal — no offline, caching, or service-worker
  libraries are declared.
- There is no `src/` directory and no `.ts` / `.js` file containing a
  service worker registration.

This fixture intentionally omits every author declaration that the
rule's `intent_required` gate searches for. None of the registry's
three declaration strings appear verbatim anywhere on disk, so the
Phase 3 intent gate stays CLOSED and the rule MUST be skipped with no
finding emitted. This is the false-positive protection required by
acceptance criterion #8.

## Expected scan outcome (Phase 3, `relationshipId: "manifest-reference-vs-runtime-registration"`)

- 0 findings emitted.
- `coverage.skippedRelationships` contains an entry whose `id` equals
  the rule id and whose `reason` mentions "intent".
- `coverage.appliedRelationships` does NOT contain the rule id.

## Line map (1-indexed)

| File         | Line | Content (key only)                                       |
|--------------|------|----------------------------------------------------------|
| index.html   | 6    | `<link rel="manifest" href="/site.webmanifest">`         |
