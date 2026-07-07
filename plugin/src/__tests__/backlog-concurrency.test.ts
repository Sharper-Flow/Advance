/**
 * Backlog concurrent append tests.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createTempDir, cleanupTempDir } from "./setup";
import { addBacklogItem, readBacklog } from "../utils/backlog-store";

describe("backlog-concurrency", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("backlog-concurrency-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  test("concurrent adds produce valid JSONL", async () => {
    const writers = Array.from({ length: 20 }, (_, i) =>
      addBacklogItem(tempDir, {
        title: `Concurrent ${i}`,
        success_hint: "hint",
      }),
    );
    await Promise.all(writers);

    const result = await readBacklog(tempDir);
    expect(result.latestItems).toHaveLength(20);
    expect(result.malformed).toHaveLength(0);
  });
});
