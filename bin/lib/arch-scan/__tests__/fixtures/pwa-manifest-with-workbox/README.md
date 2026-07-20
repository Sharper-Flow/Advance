# pwa-manifest-with-workbox (POSITIVE fixture)

Positive fixture for the `manifest-reference-vs-runtime-registration`
arch-scan rule (Phase 3, severity minor, confidence low).

- `index.html` references `/site.webmanifest` via `<link rel="manifest">`.
- `package.json` declares `workbox-cli` as a devDependency, but no
  service worker is actually registered at runtime.
- There is no `src/` directory and no `.ts` / `.js` file containing a
  `navigator.serviceWorker.register(...)` call or a `new Workbox(...)`
  instantiation. The acceptable-counterpart scope is therefore empty.

## Declared PWA intent

This fixture intentionally contains the literal declaration
**workbox dependency in package.json** so that the Phase 3
`intent_required` gate OPENS. The generic evaluator's `intentDeclared`
probe performs a literal substring match across all non-ignored files;
this README is the surface that satisfies the gate.

## Expected scan outcome (Phase 3, `relationshipId: "manifest-reference-vs-runtime-registration"`)

- 1 finding emitted on the manifest trigger hit.
- Finding shape: `severity: "minor"`, `confidence: "low"`,
  `category: "capability-consistency"`.
- `detection_method` is `"regex"` — the generic evaluator hardcodes
  this field for every finding it emits; the rule's heuristic character
  lives in `detection_phase: 3` + `intent_required`, not in this field.
- Trigger evidence `file: "index.html"`, line 6, `matchedSignal`
  contains `manifest`.
- `absence_proof.includedGlobs` spans the SW-registration counterpart
  scope (`**/*.ts`, `**/*.js`); `excludedGlobs` includes `node_modules`.

## Line map (1-indexed)

| File         | Line | Content (key only)                                       |
|--------------|------|----------------------------------------------------------|
| index.html   | 6    | `<link rel="manifest" href="/site.webmanifest">`         |
| README.md    | 15   | `**workbox dependency in package.json**`                 |
