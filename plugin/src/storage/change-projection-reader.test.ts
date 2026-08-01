import { afterEach, describe, expect, it, vi } from "vitest";
import { readBoundedProjectionDocument } from "./change-projection-reader";
import { join } from "path";
import { mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";

const openCalls: Array<{ path: string; flags: string | number | undefined }> =
  [];

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    open: async (path: string | Buffer | URL, flags?: string | number) => {
      openCalls.push({ path: String(path), flags });

      if (typeof path === "string" && path.endsWith("grows.json")) {
        // Fake handle: first stat reports a file that fits, but the read stream
        // is larger than the cap (simulating a concurrent append). The bounded
        // reader must detect the extra byte after filling the cap and return
        // oversized without buffering beyond the cap. A second stat returns the
        // grown size for the diagnostic.
        const fakeContent = "a".repeat(20);
        let readPosition = 0;
        let statCalls = 0;
        return {
          stat: async () => {
            statCalls += 1;
            return {
              size: statCalls === 1 ? 10 : 20,
              isFile: () => true,
            } as unknown as import("fs").Stats;
          },
          read: async (
            buffer: Buffer,
            offset: number,
            length: number,
            position: number | null,
          ) => {
            const pos = position ?? readPosition;
            const available = Math.max(0, fakeContent.length - pos);
            const toRead = Math.min(length, available);
            buffer.fill(
              fakeContent.slice(pos, pos + toRead),
              offset,
              offset + toRead,
            );
            if (position === null) readPosition += toRead;
            return { bytesRead: toRead, buffer };
          },
          close: async () => {},
        } as unknown as import("fs/promises").FileHandle;
      }

      return actual.open(path, flags);
    },
  };
});

describe("readBoundedProjectionDocument", () => {
  let testDir: string;

  afterEach(async () => {
    vi.restoreAllMocks();
    openCalls.length = 0;
    if (testDir) {
      await rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  async function makeTestDir(): Promise<string> {
    testDir = join(
      tmpdir(),
      `bounded-read-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(testDir, { recursive: true });
    return testDir;
  }

  it("returns ok for a file within the byte limit", async () => {
    const dir = await makeTestDir();
    const filePath = join(dir, "small.json");
    await writeFile(filePath, '{"hello":"world"}', "utf-8");

    const result = await readBoundedProjectionDocument(filePath, 100);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.content).toBe('{"hello":"world"}');
    expect(result.bytesRead).toBe(17);
  });

  it("returns not_found for a missing file", async () => {
    const dir = await makeTestDir();
    const result = await readBoundedProjectionDocument(
      join(dir, "missing.json"),
      100,
    );
    expect(result.kind).toBe("not_found");
  });

  it("returns oversized without buffering content for a file above the limit", async () => {
    const dir = await makeTestDir();
    const filePath = join(dir, "large.json");
    await writeFile(filePath, "x".repeat(101), "utf-8");

    const result = await readBoundedProjectionDocument(filePath, 100);
    expect(result.kind).toBe("oversized");
    if (result.kind !== "oversized") return;
    expect(result.limit).toBe(100);
    expect(result.actual).toBe(101);
  });

  it("returns unreadable when the path is a directory", async () => {
    const dir = await makeTestDir();
    const dirPath = join(dir, "not-a-file");
    await mkdir(dirPath, { recursive: true });

    const result = await readBoundedProjectionDocument(dirPath, 100);
    expect(result.kind).toBe("unreadable");
  });

  it("returns oversized if the file grows during the bounded read", async () => {
    const dir = await makeTestDir();
    const filePath = join(dir, "grows.json");
    // Seed a real file with the same size the fake handle reports; the mock
    // replaces the handle with one that simulates growth.
    await writeFile(filePath, "a".repeat(10), "utf-8");

    const result = await readBoundedProjectionDocument(filePath, 10);
    expect(result.kind).toBe("oversized");
    if (result.kind !== "oversized") return;
    expect(result.limit).toBe(10);
    expect(result.actual).toBe(20);
  });
});
