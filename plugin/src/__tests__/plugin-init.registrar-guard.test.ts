import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const PLUGIN_INIT_SOURCE = readFileSync(
  new URL("../plugin-init.ts", import.meta.url),
  "utf8",
);

describe("structural guard: registerInProcessTemporalWorker is not exported", () => {
  test("plugin-init.ts does not export registerInProcessTemporalWorker", () => {
    // The function definition must NOT be preceded by 'export'
    expect(PLUGIN_INIT_SOURCE).not.toMatch(
      /export\s+function\s+registerInProcessTemporalWorker/,
    );
  });

  test("plugin-init.ts does not re-export registerInProcessTemporalWorker", () => {
    expect(PLUGIN_INIT_SOURCE).not.toMatch(
      /export\s*\{[^}]*registerInProcessTemporalWorker/,
    );
  });
});
