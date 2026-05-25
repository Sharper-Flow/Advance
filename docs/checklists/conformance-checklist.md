# Conformance Checklist

Authoring, override, and bootstrap workflow for external CI-isolated spec conformance.

## Bootstrap

1. Run `adv_conformance action: "init"` — scaffolds `.adv/specs/_conformance/` (default) or configures sibling repo
2. For sibling mode: `adv_conformance action: "init" mode: "sibling" projectId: "<project-id>"`
3. Add conformance tests in the scaffolded directory
4. Set up GitHub Actions workflow (template below)
5. Ensure the spec is tracked with `conformance_required: true`, then lock it with `adv_conformance action: "lock"`

## Authoring Conformance Tests

- Tests live in the conformance root (subfolder or sibling repo)
- Each test asserts an acceptance criterion from the spec
- CI produces a JSON artifact at a known path; default convention: `conformance-verdict.json`
- The `adv_conformance action: "run"` tool reads this artifact

## Artifact Schema

This JSON shape is the CI contract consumed by `adv_conformance action: "run"`:

```json
{
  "passed": ["rq-confSource01"],
  "failed": [
    { "rq_id": "rq-confLock01", "summary": "lock state did not persist" }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `passed` | `string[]` | Requirement/scenario IDs that passed |
| `failed` | `{rq_id:string, summary:string}[]` | Failed AC labels and brief diagnostic |

Empty `failed` ⇒ `PASS`; non-empty `failed` ⇒ `DRIFT`.

## Sibling Repo Setup

Sibling mode is opt-in for stronger physical isolation.

1. Run `adv_conformance action: "init" mode: "sibling" projectId: "<project-id>"`.
2. Create the repo at `{project-parent}/advance-conformance-{project-id}/`.
3. Initialize git and add remote:
   ```bash
   git init
   git remote add origin <conformance-repo-url>
   git add . && git commit -m "Initial conformance suite"
   ```
4. Configure CI to clone that repo or set `CONFORMANCE_REPO` to the repo slug.

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

## Other CI Providers

GitHub Actions is the shipped template. Other CI systems are supported if they produce the same artifact schema above at the `artifact_path` passed to `adv_conformance action: "run"`.

Minimum contract:

1. Checkout the conformance source.
2. Run the conformance tests.
3. Write `conformance-verdict.json` using the artifact schema above.
4. Make the artifact available to the archive environment before Phase 5.5.
