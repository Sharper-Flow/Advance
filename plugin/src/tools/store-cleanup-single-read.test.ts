/**
 * Single-read guarantee for `scanStoresForCleanup` (AC2, SC4): each store's
 * `agenda.jsonl` is read exactly once per scan. Isolated in its own file because
 * it mocks `fs/promises` to count reads; the ESM namespace cannot be spied
 * directly, so a hoisted-counter `vi.mock` wrapper is used instead.
 */

import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";

const { readFileCalls } = vi.hoisted(() => ({
  readFileCalls: [] as string[],
}));

vi.mock("fs/promises", async (importActual) => {
  const actual = await importActual<typeof import("fs/promises")>();
  return {
    ...actual,
    readFile: (path: unknown, ...rest: unknown[]) => {
      if (typeof path === "string") readFileCalls.push(path);
      return (actual.readFile as (...a: unknown[]) => unknown)(path, ...rest);
    },
  };
});

// Imported after the mock is declared (vi.mock is hoisted above imports).
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { scanStoresForCleanup } from "./store-cleanup";

const N = 40;
const shard = "f".repeat(40);
const projectIds = Array.from({ length: N }, (_, i) =>
  i.toString(16).padStart(40, "0"),
);

let base: string;
let dataHomeRoot: string;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "adv-store-cleanup-single-read-"));
  dataHomeRoot = join(base, "xdg");
  for (const id of projectIds) {
    const dir = join(
      dataHomeRoot,
      "opencode-projects",
      shard,
      "opencode/plugins/advance",
      id,
    );
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "agenda.jsonl"),
      JSON.stringify({ text: "row" }) + "\n",
    );
  }
}, 60_000);

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("scanStoresForCleanup single-read", () => {
  test("reads agenda.jsonl exactly once per store", async () => {
    readFileCalls.length = 0;
    const result = await scanStoresForCleanup({ dataHomeRoot });
    expect(result.stores).toHaveLength(N);
    const agendaReads = readFileCalls.filter((p) => p.endsWith("agenda.jsonl"));
    expect(agendaReads).toHaveLength(N);
  });
});
