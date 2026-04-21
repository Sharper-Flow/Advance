import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeJsonlAtomic } from "./jsonl-atomic-writer";

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = join(
    tmpdir(),
    `jsonl-atomic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await mkdir(tmpRoot, { recursive: true });
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("writeJsonlAtomic", () => {
  it("writes one JSON object per line with trailing newline", async () => {
    const target = join(tmpRoot, "out.jsonl");
    await writeJsonlAtomic(target, [
      { id: "a", n: 1 },
      { id: "b", n: 2 },
    ]);
    const contents = await readFile(target, "utf8");
    expect(contents).toBe('{"id":"a","n":1}\n{"id":"b","n":2}\n');
  });

  it("accepts an empty list and writes an empty file (no lines)", async () => {
    const target = join(tmpRoot, "empty.jsonl");
    await writeJsonlAtomic(target, []);
    const contents = await readFile(target, "utf8");
    expect(contents).toBe("");
  });

  it("overwrites an existing file atomically (rename semantics)", async () => {
    const target = join(tmpRoot, "target.jsonl");
    await writeFile(target, "pre-existing content\n");
    await writeJsonlAtomic(target, [{ id: "new" }]);
    const contents = await readFile(target, "utf8");
    expect(contents).toBe('{"id":"new"}\n');
  });

  it("does not leave the tmp file behind after success", async () => {
    const target = join(tmpRoot, "tidy.jsonl");
    await writeJsonlAtomic(target, [{ id: "x" }]);
    const entries = await readdir(tmpRoot);
    expect(entries.sort()).toEqual(["tidy.jsonl"]);
  });

  it("does not leave a partial target file when serialization throws", async () => {
    const target = join(tmpRoot, "fails.jsonl");
    const cyclic: Record<string, unknown> = { id: "x" };
    cyclic.self = cyclic;
    await expect(writeJsonlAtomic(target, [cyclic])).rejects.toThrow();
    const entries = await readdir(tmpRoot);
    // The target file must not exist (rename never happened).
    expect(entries.filter((e) => e === "fails.jsonl")).toEqual([]);
  });

  it("serializes concurrent writes to the same target without torn writes", async () => {
    const target = join(tmpRoot, "concurrent.jsonl");
    const writers = Array.from({ length: 20 }, (_, i) =>
      writeJsonlAtomic(target, [{ id: String(i), n: i }]),
    );
    await Promise.all(writers);
    const contents = await readFile(target, "utf8");
    // Whatever writer landed last, the file must be parseable line-by-line
    // with no partial lines, and must contain exactly one record.
    const lines = contents.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
