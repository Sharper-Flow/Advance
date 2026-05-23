# Problem Statement

ADV's `project_id` is mechanically derived from git root commit SHA. Each git repo gets one ADV project, even when multiple repos form one logical product.

ExampleProduct has separate backend (`example-product`) and frontend (`example-web`) ADV state. Existing `target_path`, `related_repos`, `cross_project_links`, and `external_dependencies` help one-off coordination but do not provide product-level ownership, status, wisdom, or reflection.

Cost: cross-cutting features require dual tracking or hidden single-side tracking; wisdom and reflection are siloed; each new frontend compounds fragmentation; agents repeatedly decide which repo owns a product change.

Need: product-unit ADV state, while specs/worktrees/git/verification stay repo-local; subset repo scopes; low-friction adoption; no mandatory bulk migration.
