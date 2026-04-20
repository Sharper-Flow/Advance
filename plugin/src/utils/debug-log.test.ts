/**
 * Logger Tests
 *
 * Verifies severity routing, console format, file-sink gating, and
 * backward-compatibility of the appendDebugLog shim.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "fs";

describe("debug-log logger", () => {
  let tempDir: string;
  let originalAdvDebug: string | undefined;
  let originalCacheDir: string | undefined;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "adv-logger-"));
    originalAdvDebug = process.env.ADV_DEBUG;
    originalCacheDir = process.env.OPEN_CHAD_CACHE_DIR;
    process.env.OPEN_CHAD_CACHE_DIR = tempDir;
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalAdvDebug === undefined) {
      delete process.env.ADV_DEBUG;
    } else {
      process.env.ADV_DEBUG = originalAdvDebug;
    }
    if (originalCacheDir === undefined) {
      delete process.env.OPEN_CHAD_CACHE_DIR;
    } else {
      process.env.OPEN_CHAD_CACHE_DIR = originalCacheDir;
    }
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  const logFile = () => join(tempDir, "adv-debug.log");

  describe("createLogger", () => {
    test("exports LogLevel and LogMeta types via createLogger signature", async () => {
      const mod = await import("./debug-log");
      expect(typeof mod.createLogger).toBe("function");
      const log = mod.createLogger("test");
      expect(typeof log.debug).toBe("function");
      expect(typeof log.info).toBe("function");
      expect(typeof log.warn).toBe("function");
      expect(typeof log.error).toBe("function");
    });

    test("warn writes to console.warn in normal runs", async () => {
      delete process.env.ADV_DEBUG;
      const { createLogger } = await import("./debug-log");
      const log = createLogger("scope-a");
      log.warn("something happened");
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain("[adv:scope-a]");
      expect(warnSpy.mock.calls[0][0]).toContain("something happened");
    });

    test("error writes to console.error in normal runs", async () => {
      delete process.env.ADV_DEBUG;
      const { createLogger } = await import("./debug-log");
      const log = createLogger("scope-b");
      log.error("oh no");
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][0]).toContain("[adv:scope-b]");
      expect(errorSpy.mock.calls[0][0]).toContain("oh no");
    });

    test("debug does NOT emit console output in any mode", async () => {
      process.env.ADV_DEBUG = "1";
      const { createLogger } = await import("./debug-log");
      const log = createLogger("scope-c");
      log.debug("noisy");
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    test("info does NOT emit console output", async () => {
      delete process.env.ADV_DEBUG;
      const { createLogger } = await import("./debug-log");
      const log = createLogger("scope-d");
      log.info("stay quiet");
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    test("debug writes to file sink only when ADV_DEBUG=1", async () => {
      process.env.ADV_DEBUG = "1";
      const { createLogger } = await import("./debug-log");
      const log = createLogger("scope-e");
      log.debug("debug-on");
      expect(existsSync(logFile())).toBe(true);
      const content = readFileSync(logFile(), "utf-8");
      expect(content).toContain("[scope-e]");
      expect(content).toContain("debug-on");
    });

    test("debug does NOT write to file when ADV_DEBUG is off", async () => {
      delete process.env.ADV_DEBUG;
      const { createLogger } = await import("./debug-log");
      const log = createLogger("scope-f");
      log.debug("debug-off");
      expect(existsSync(logFile())).toBe(false);
    });

    test("warn writes to file sink when ADV_DEBUG=1 in addition to console", async () => {
      process.env.ADV_DEBUG = "1";
      const { createLogger } = await import("./debug-log");
      const log = createLogger("scope-g");
      log.warn("warn-dual");
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(existsSync(logFile())).toBe(true);
      const content = readFileSync(logFile(), "utf-8");
      expect(content).toContain("[scope-g]");
      expect(content).toContain("warn-dual");
    });

    test("error writes to file sink when ADV_DEBUG=1 in addition to console", async () => {
      process.env.ADV_DEBUG = "1";
      const { createLogger } = await import("./debug-log");
      const log = createLogger("scope-h");
      log.error("err-dual");
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(existsSync(logFile())).toBe(true);
      const content = readFileSync(logFile(), "utf-8");
      expect(content).toContain("[scope-h]");
      expect(content).toContain("err-dual");
    });

    test("serializes structured metadata when provided", async () => {
      process.env.ADV_DEBUG = "1";
      const { createLogger } = await import("./debug-log");
      const log = createLogger("scope-i");
      log.warn("with-meta", { userId: 42, kind: "test" });
      const out = warnSpy.mock.calls[0][0] as string;
      expect(out).toContain("with-meta");
      expect(out).toMatch(/userId/);
      expect(out).toMatch(/42/);
    });
  });

  describe("appendDebugLog compatibility shim", () => {
    test("appendDebugLog is still exported", async () => {
      const mod = await import("./debug-log");
      expect(typeof mod.appendDebugLog).toBe("function");
    });

    test("appendDebugLog delegates to debug-level file sink when ADV_DEBUG=1", async () => {
      process.env.ADV_DEBUG = "1";
      const { appendDebugLog } = await import("./debug-log");
      appendDebugLog("legacy", "legacy-msg");
      expect(existsSync(logFile())).toBe(true);
      const content = readFileSync(logFile(), "utf-8");
      expect(content).toContain("[legacy]");
      expect(content).toContain("legacy-msg");
    });

    test("appendDebugLog is silent when ADV_DEBUG is off", async () => {
      delete process.env.ADV_DEBUG;
      const { appendDebugLog } = await import("./debug-log");
      appendDebugLog("legacy", "legacy-off");
      expect(existsSync(logFile())).toBe(false);
    });

    test("appendDebugLog does NOT emit to console", async () => {
      delete process.env.ADV_DEBUG;
      const { appendDebugLog } = await import("./debug-log");
      appendDebugLog("legacy", "quiet");
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe("ADV_DEBUG_ENABLED constant", () => {
    test("module exports ADV_DEBUG_ENABLED derived from env at load time", async () => {
      const mod = await import("./debug-log");
      // Just assert the export exists as a boolean
      expect(typeof mod.ADV_DEBUG_ENABLED).toBe("boolean");
    });
  });

  // Ensure fs import is retained so file-sink paths exercise real fs.
  test("_sanity: fs.readFileSync available", () => {
    expect(typeof fs.readFileSync).toBe("function");
  });
});
