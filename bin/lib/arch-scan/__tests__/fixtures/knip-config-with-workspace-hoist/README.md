# knip-config-with-workspace-hoist (NEGATIVE fixture)

Negative fixture for the `config-vs-dependency-presence` arch-scan rule.

- `package.json` declares a `knip` config block; `knip` is NOT in deps.
- `pnpm-workspace.yaml` is present and its content matches the rule's
  exception signal `/(hoist|workspace)/i` (via the `hoist: true` line).

Expected scan outcome (Phase 1, `relationshipId: "config-vs-dependency-presence"`):

- 0 findings — exception signal suppresses every trigger hit.
- `coverage.appliedRelationships` includes `config-vs-dependency-presence`.
- The applied reason references the exception suppression.
