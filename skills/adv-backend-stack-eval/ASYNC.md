# Backend Async / Workflow Evaluation

## Consider

- Durability — is job loss acceptable?
- Scope — single service vs cross-service coordination.
- Ordering — strict ordering vs idempotent out-of-order handling.
- Throughput — sustained vs bursty.
- Complexity budget — in-process async → job queue → event bus → workflow engine.
- Operational model — managed service, self-hosted broker, or workflow engine ownership.

## Socratic prompts

1. Can a simple job queue handle this before Kafka or Temporal?
2. What happens if an event is lost — acceptable or user-visible?
3. Do multiple services need to react, or is this internal to one service?
4. Is ordering hard requirement, or can idempotency handle disorder?

## Evidence to gather

- Retry/idempotency requirements.
- Delivery guarantees needed (at-most/at-least/exactly-once illusion).
- Observability and dead-letter handling.
- Operational ownership and incident runbooks.
- Throughput, latency, and retention estimates.
