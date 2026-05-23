# ExampleProduct Product Linking

ExampleProduct backend is primary. ExampleProduct Web is secondary. Product-linked ADV state lives in primary product project id; repo-local git/spec/worktree mechanics stay per repo.

## Backend `project.json`

```json
{
  "name": "example-product",
  "product": {
    "id": "example-product",
    "role": "primary",
    "repo_id": "backend",
    "primary_repo_id": "backend",
    "missing_primary_policy": "block"
  },
  "related_repos": [
    {
      "id": "web",
      "path": "/path/to/example-web",
      "product_role": "secondary",
      "repo_project_id": "<example-web repo project id>",
      "trusted": true
    }
  ]
}
```

## Web `project.json`

```json
{
  "name": "example-web",
  "product": {
    "id": "example-product",
    "role": "secondary",
    "repo_id": "web",
    "primary_repo_id": "backend",
    "missing_primary_policy": "block"
  },
  "related_repos": [
    {
      "id": "backend",
      "path": "/path/to/example-product",
      "product_role": "primary",
      "repo_project_id": "<example-product backend repo project id>",
      "trusted": true
    }
  ]
}
```

## Operator notes

- From `example-web`, ADV resolves canonical product state automatically. No manual `target_path` for product changes.
- New linked changes default `scope_repos` to current repo. Cross-cutting changes should set backend + web entries and `merge_order`.
- `adv_status` and `adv_change_list` default to current repo scope. Use `scope: "product"` for all product changes.
- Wisdom/reflection entries keep `product_id`, `origin_repo_id`, `origin_repo_project_id`, and `origin_repo_path`.
- Archive writes `multi-repo-archive.json` for scoped multi-repo changes.
- Existing backend/web ADV state is additive legacy state. No mandatory bulk migration; old state remains readable/recoverable.
