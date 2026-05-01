# Conformance Checklist

Authoring, override, and bootstrap workflow for external CI-isolated spec conformance.

## Bootstrap

1. Run `adv_conformance action: "init"` — scaffolds `.adv/specs/_conformance/` (default) or configures sibling repo
2. For sibling mode: `adv_conformance action: "init" mode: "sibling" projectId: "<project-id>"`
3. Add conformance tests in the scaffolded directory
4. Set up GitHub Actions workflow (template below)
5. Mark spec as `conformance_required: true` via `adv_conformance action: "lock"`

## Authoring Conformance Tests

- Tests live in the conformance root (subfolder or sibling repo)
- Each test asserts an acceptance criterion from the spec
- CI produces a JSON artifact at a known path: `{ "passed": ["rq-xxx"], "failed": [{ "rq_id": "rq-yyy", "summary": "..." }] }`
- The `adv_conformance action: "run"` tool reads this artifact

## Override Workflow

When CI fails (DRIFT) or is unavailable:

1. Agent halts archive at Phase 5.5
2. User chooses one of:
   - **Fix locally** — resolve drift, re-run CI, re-run archive
   - **Override** — `adv_conformance action: "override"` (records audit entry, spec stays locked)
   - **Unlock** — `adv_conformance action: "unlock"` (flips lock off, records audit entry)

All overrides require: `{user, reason, re_verify_deadline}`.

## GitHub Actions Template

```yaml
name: Conformance Check
on:
  workflow_dispatch:
    inputs:
      spec:
        description: 'Spec name to verify'
        required: true
      artifact_path:
        description: 'Path to write verdict artifact'
        required: false
        default: 'conformance-verdict.json'

jobs:
  conformance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: ${{ vars.CONFORMANCE_REPO || '' }}
      
      - name: Run conformance tests
        run: |
          # Run your conformance test suite here
          # Produce JSON artifact at ${{ inputs.artifact_path }}
          echo '{"passed":[],"failed":[]}' > ${{ inputs.artifact_path }}
      
      - name: Upload verdict artifact
        uses: actions/upload-artifact@v4
        with:
          name: conformance-verdict
          path: ${{ inputs.artifact_path }}
```

**For other CI systems:** Produce the same JSON artifact format. The `adv_conformance action: "run"` tool reads any file at the specified `artifact_path` — it is CI-agnostic.
