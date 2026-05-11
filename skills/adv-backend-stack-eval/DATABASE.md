# Backend Database / Data Layer Evaluation

## Consider

- Query patterns — relational, graph, full-text, vector, OLAP.
- Scale — read/write patterns, throughput, data volume.
- Schema flexibility — structured, schemaless, hybrid.
- Operational complexity — ownership, on-call, backup/restore.
- Whether PostgreSQL with extensions can satisfy need before adding stores.
- Compliance/residency — encryption, audit, retention, jurisdiction.

## Socratic prompts

1. Can PostgreSQL handle this with extensions or a read replica?
2. What query pattern forces a second store?
3. Who operates the second database at 3 AM?
4. What migration path exists if specialized store becomes bottleneck?

## Evidence to gather

- Data shape and access patterns.
- Growth assumptions and capacity estimate.
- Backup/restore and disaster-recovery needs.
- Managed-service availability and operational maturity.
- Failure modes and rollback/migration plan.
