/**
 * Clarify-Readiness E2E Regression Test
 *
 * Cross-cutting test verifying zero false positives on well-specified changes
 * across all integration points: adv_change_create, adv_change_show,
 * adv_status, and adv_gate_complete prep.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { changeTools } from "../tools/change";
import { statusTools } from "../tools/status";
import { gateTools } from "../tools/gate";
import { createLegacyStore, type Store } from "../storage/store";
import {
  createTempDir,
  cleanupTempDir,
  parseToolOutput,
} from "../__tests__/setup";

/**
 * Extract JSON content from banner-wrapped output.
 */
function extractJson(output: string): Record<string, unknown> {
  if (output.startsWith("╔")) {
    const jsonStart = output.indexOf("\n\n");
    if (jsonStart !== -1) {
      return JSON.parse(output.slice(jsonStart + 2));
    }
  }
  return JSON.parse(output);
}

describe("Clarify-Readiness E2E — zero false positives on clean changes", () => {
  let tempDir: string;
  let store: Store;

  /** A well-specified proposal with all sections filled in concretely */
  const CLEAN_PROPOSAL = `# Add Rate Limiting

## Intent

Add per-IP rate limiting to the API gateway to prevent abuse.

## Scope

- src/middleware/rate-limit.ts (new file)
- src/server.ts (wire middleware)
- src/config.ts (add rate limit config)

## Success Criteria

- [ ] Rate limiter rejects requests exceeding 100 req/min per IP
- [ ] Returns HTTP 429 with Retry-After header
- [ ] Rate limit config is loaded from environment variables
- [ ] Existing endpoints are unaffected below threshold

## Error Handling

On Redis connection failure, fallback to in-memory rate limiting with
degraded accuracy. Log error and emit metric. On config parse failure,
fail fast at startup with clear error message.

## Auth Model

Uses existing JWT bearer token authentication (RS256). No new auth
mechanisms introduced.
`;

  beforeEach(async () => {
    tempDir = await createTempDir();

    // Create minimal project structure
    await mkdir(tempDir, { recursive: true });
    await writeFile(
      join(tempDir, "project.json"),
      JSON.stringify(
        {
          name: "test-project",
          version: "0.1.0",
          specs_dir: ".adv/specs",
          changes_dir: ".adv/changes",
          archive_dir: ".adv/archive",
          docs_dir: "docs/specs",
          db_dir: ".adv/db",
        },
        null,
        2,
      ),
    );

    // Create a spec with proper scenarios
    await mkdir(join(tempDir, ".adv/specs/api-gateway"), { recursive: true });
    await writeFile(
      join(tempDir, ".adv/specs/api-gateway/spec.json"),
      JSON.stringify(
        {
          $schema: "https://advance.dev/schemas/spec.v1.json",
          name: "api-gateway",
          title: "API Gateway",
          purpose: "HTTP API gateway with middleware pipeline",
          version: "1.0.0",
          updated_at: "2026-01-01T00:00:00Z",
          requirements: [],
        },
        null,
        2,
      ),
    );

    store = await createLegacyStore(tempDir);
    await store.init();
    await store.sync();
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
  });

  test("adv_change_create produces no clarifyNeeded for well-specified change", async () => {
    const result = await changeTools.adv_change_create.execute(
      {
        summary: "Add rate limiting",
        proposal: CLEAN_PROPOSAL,
      },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.changeId).toBe("addRateLimiting");
    expect(parsed.clarifyNeeded).toBeUndefined();
  });

  test("adv_change_show produces no clarifyFindings for well-specified change", async () => {
    // Create the change first
    const createResult = await changeTools.adv_change_create.execute(
      {
        summary: "Add rate limiting",
        proposal: CLEAN_PROPOSAL,
      },
      store,
    );
    const { changeId } = parseToolOutput(createResult);

    // Add a delta with proper scenarios
    const changeResult = await store.changes.get(changeId);
    expect(changeResult.success).toBe(true);
    const change = changeResult.data!;
    change.deltas = {
      "api-gateway": [
        {
          id: "dl-rate0001",
          operation: "add" as const,
          requirement: {
            id: "rq-rate0001",
            title: "Rate limiting per IP",
            body: "Enforce per-IP rate limits on all API endpoints.",
            priority: "must" as const,
            scenarios: [
              {
                id: "rq-rate0001.1",
                title: "Rejects over-limit requests",
                given: ["rate limiter is configured at 100 req/min"],
                when: "client sends 101st request within 1 minute",
                then: [
                  "response status is 429",
                  "Retry-After header is present",
                ],
              },
              {
                id: "rq-rate0001.2",
                title: "Allows under-limit requests",
                given: ["rate limiter is configured at 100 req/min"],
                when: "client sends 50th request within 1 minute",
                then: ["response status is 200"],
              },
            ],
          },
        },
      ],
    };
    await store.changes.save(change);

    // Show the change
    const showResult = await changeTools.adv_change_show.execute(
      { changeId },
      store,
    );
    const parsed = JSON.parse(showResult);

    expect(parsed.clarifyFindings).toBeUndefined();
  });

  test("adv_status produces no clarify recommendation for well-specified change", async () => {
    // Create a well-specified change
    await changeTools.adv_change_create.execute(
      {
        summary: "Add rate limiting",
        proposal: CLEAN_PROPOSAL,
      },
      store,
    );

    const statusResult = await statusTools.adv_status.execute({}, store);
    const parsed = parseToolOutput(statusResult);

    const clarifyRecs = parsed.recommendations.filter((r: string) =>
      r.includes("ambiguity finding"),
    );
    expect(clarifyRecs).toHaveLength(0);
  });

  test("adv_gate_complete prep passes without clarify warnings for well-specified change", async () => {
    // Create a well-specified change
    const createResult = await changeTools.adv_change_create.execute(
      {
        summary: "Add rate limiting",
        proposal: CLEAN_PROPOSAL,
      },
      store,
    );
    const { changeId } = parseToolOutput(createResult);

    // Complete prerequisite gates first
    await gateTools.adv_gate_complete.execute(
      { changeId, gateId: "proposal" },
      store,
    );
    await gateTools.adv_gate_complete.execute(
      { changeId, gateId: "discovery" },
      store,
    );
    await gateTools.adv_gate_complete.execute(
      { changeId, gateId: "design" },
      store,
    );

    // Complete planning gate — should pass cleanly
    const prepResult = await gateTools.adv_gate_complete.execute(
      { changeId, gateId: "planning", userApproved: true },
      store,
    );
    const parsed = extractJson(prepResult);

    expect(parsed.success).toBe(true);
    expect(parsed.clarifyWarnings).toBeUndefined();
    expect(parsed.clarifyFindings).toBeUndefined();
  });
});
