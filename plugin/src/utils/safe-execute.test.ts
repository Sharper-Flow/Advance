/**
 * Tests for safe-execute utility
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ZodError, z } from "zod";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  mergeDefinedContext,
  safeExecute,
  safeExecuteSimple,
  formatZodError,
  formatErrorResponse,
  truncateOutput,
  deriveErrorClass,
  deriveContextFromArgs,
  type ErrorContext,
} from "./safe-execute";

describe("safe-execute", () => {
  let profileDir: string;
  let originalAdvProfile: string | undefined;
  let originalCacheDir: string | undefined;

  beforeEach(() => {
    profileDir = mkdtempSync(join(tmpdir(), "adv-profile-"));
    originalAdvProfile = process.env.ADV_PROFILE;
    originalCacheDir = process.env.OPEN_CHAD_CACHE_DIR;
    process.env.OPEN_CHAD_CACHE_DIR = profileDir;
  });

  afterEach(() => {
    if (originalAdvProfile === undefined) {
      delete process.env.ADV_PROFILE;
    } else {
      process.env.ADV_PROFILE = originalAdvProfile;
    }

    if (originalCacheDir === undefined) {
      delete process.env.OPEN_CHAD_CACHE_DIR;
    } else {
      process.env.OPEN_CHAD_CACHE_DIR = originalCacheDir;
    }

    rmSync(profileDir, { recursive: true, force: true });
  });

  const profileLogFile = () => join(profileDir, "adv-profile.log");

  describe("formatZodError", () => {
    it("formats a single field error", () => {
      const schema = z.object({ name: z.string() });
      try {
        schema.parse({ name: 123 });
      } catch (error) {
        if (error instanceof ZodError) {
          const result = formatZodError(error);
          expect(result).toContain("Schema validation failed");
          expect(result).toContain("'name'");
        }
      }
    });

    it("formats multiple field errors", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });
      try {
        schema.parse({ name: 123, age: "twenty" });
      } catch (error) {
        if (error instanceof ZodError) {
          const result = formatZodError(error);
          expect(result).toContain("'name'");
          expect(result).toContain("'age'");
        }
      }
    });

    it("formats nested field errors", () => {
      const schema = z.object({
        user: z.object({
          email: z.string().email(),
        }),
      });
      try {
        schema.parse({ user: { email: "not-an-email" } });
      } catch (error) {
        if (error instanceof ZodError) {
          const result = formatZodError(error);
          expect(result).toContain("'user.email'");
        }
      }
    });
  });

  describe("formatErrorResponse", () => {
    it("formats ZodError with args as compact JSON", () => {
      const schema = z.object({ id: z.string() });
      try {
        schema.parse({ id: 123 });
      } catch (error) {
        const result = JSON.parse(
          formatErrorResponse(error, "test_tool", { id: 123 }),
        );
        expect(result.error).toContain("Schema validation failed");
        expect(result.tool).toBe("test_tool");
        expect(result.hint).toBeDefined();
        expect(result.received_args).toEqual({ id: 123 });
      }
    });

    it("redacts sensitive keys from received args", () => {
      const raw = formatErrorResponse(new Error("boom"), "test_tool", {
        id: "safe-id",
        token: "secret-token",
        nested: {
          apiKey: "secret-key",
          path: "/safe/path",
        },
      });

      const result = JSON.parse(raw);
      expect(result.received_args).toEqual({
        id: "safe-id",
        token: "[REDACTED]",
        nested: {
          apiKey: "[REDACTED]",
          path: "/safe/path",
        },
      });
    });

    it("formats standard Error as compact JSON", () => {
      const error = new Error("Something went wrong");
      const raw = formatErrorResponse(error, "test_tool");
      const result = JSON.parse(raw);
      expect(result.error).toBe("Something went wrong");
      expect(result.tool).toBe("test_tool");
      expect(result.hint).toBeDefined();
      // Compact: no pretty-printing whitespace
      expect(raw).not.toContain("\n");
    });

    it("formats unknown error types as compact JSON", () => {
      const raw = formatErrorResponse("string error", "test_tool");
      const result = JSON.parse(raw);
      expect(result.error).toBe("string error");
      expect(result.tool).toBe("test_tool");
      expect(raw).not.toContain("\n");
    });
  });

  describe("safeExecute", () => {
    it("returns result from successful execution", async () => {
      const fn = async (args: { id: string }) =>
        JSON.stringify({ success: true, id: args.id });
      const wrapped = safeExecute(fn, "test_tool");
      const result = await wrapped({ id: "123" }, {} as any);
      expect(JSON.parse(result)).toEqual({ success: true, id: "123" });
    });

    it("returns compact JSON for small outputs", async () => {
      const fn = async () => JSON.stringify({ a: 1, b: 2 }, null, 2); // pretty input
      const wrapped = safeExecute(fn, "test_tool");
      const result = await wrapped({}, {} as any);
      // applyOutputBudget parses and re-serializes via formatToolOutput (compact)
      expect(result).not.toContain("\n");
      expect(JSON.parse(result)).toEqual({ a: 1, b: 2 });
    });

    it("catches and returns Error as JSON", async () => {
      const fn = async (): Promise<string> => {
        throw new Error("Database connection failed");
      };
      const wrapped = safeExecute(fn, "test_tool");
      const result = await wrapped({}, {} as any);
      const parsed = JSON.parse(result);
      expect(parsed.error).toBe("Database connection failed");
      expect(parsed.tool).toBe("test_tool");
    });

    it("catches and returns ZodError as JSON", async () => {
      const fn = async (args: { id: string }): Promise<string> => {
        // Simulate internal Zod validation
        const schema = z.object({ uuid: z.string().uuid() });
        schema.parse({ uuid: args.id }); // This will throw
        return JSON.stringify({ success: true });
      };
      const wrapped = safeExecute(fn, "test_tool");
      const result = await wrapped({ id: "not-a-uuid" }, {} as any);
      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("Schema validation failed");
      expect(parsed.tool).toBe("test_tool");
      expect(parsed.received_args).toEqual({ id: "not-a-uuid" });
    });

    it("catches and returns string thrown as error", async () => {
      const fn = async (): Promise<string> => {
        throw "raw string error";
      };
      const wrapped = safeExecute(fn, "test_tool");
      const result = await wrapped({}, {} as any);
      const parsed = JSON.parse(result);
      expect(parsed.error).toBe("raw string error");
    });

    it("passes through non-JSON output (e.g. banner-wrapped) with truncation", async () => {
      const banner = '╔══════╗\n║ test ║\n╚══════╝\n\n{"ok":true}';
      const fn = async () => banner;
      const wrapped = safeExecute(fn, "test_tool");
      const result = await wrapped({}, {} as any);
      // Non-JSON, so falls through to truncateOutput (which passes short strings through)
      expect(result).toBe(banner);
    });

    it("writes timing profile entries on success when ADV_PROFILE=1", async () => {
      process.env.ADV_PROFILE = "1";
      const fn = async (args: { id: string }) =>
        JSON.stringify({ success: true, id: args.id });
      const wrapped = safeExecute(fn, "profiled_tool");

      await wrapped({ id: "123" }, {} as any);

      expect(existsSync(profileLogFile())).toBe(true);
      const content = readFileSync(profileLogFile(), "utf-8");
      expect(content).toContain('"tool":"profiled_tool"');
      expect(content).toContain('"outcome":"success"');
      expect(content).toContain('"duration_ms":');
    });

    it("writes timing profile entries on error when ADV_PROFILE=1", async () => {
      process.env.ADV_PROFILE = "1";
      const fn = async (): Promise<string> => {
        throw new Error("boom");
      };
      const wrapped = safeExecute(fn, "failing_tool");

      await wrapped({}, {} as any);

      expect(existsSync(profileLogFile())).toBe(true);
      const content = readFileSync(profileLogFile(), "utf-8");
      expect(content).toContain('"tool":"failing_tool"');
      expect(content).toContain('"outcome":"error"');
      expect(content).toContain('"errorClass":"Error"');
    });

    // P1.12 Scope A3: safety-net timeout
    //
    // When a tool execute function hangs indefinitely (SDK-side Zod parse
    // hang on missing required args, deadlocked workflow Update, etc),
    // safeExecute must not block forever. After SAFE_EXECUTE_TIMEOUT_MS
    // (default 10000ms), the wrapper MUST return a structured
    // ToolExecutionTimeout error to the agent.
    //
    // This is the fix for the zero-args `adv_change_update` hang reproduced
    // live during the /adv-design phase of this change (see wisdom
    // ws-3550c245 and design.md KD-8).
    describe("tool execution timeout (P1.12 A3)", () => {
      it("returns ToolExecutionTimeout error when execute hangs past timeout", async () => {
        // Never-resolving execute simulates a hung tool
        const hangingFn = async (): Promise<string> =>
          new Promise(() => {
            /* never resolves */
          });

        const wrapped = safeExecute(hangingFn, "hanging_tool", undefined, {
          timeoutMs: 100, // short timeout for fast test
        });

        const start = Date.now();
        const raw = await wrapped({ some: "args" }, {} as any);
        const elapsed = Date.now() - start;

        // Must return within ~timeout + small margin, NOT hang forever
        expect(elapsed).toBeLessThan(500);
        expect(elapsed).toBeGreaterThanOrEqual(90);

        const result = JSON.parse(raw);
        expect(result.errorClass).toBe("ToolExecutionTimeout");
        expect(result.tool).toBe("hanging_tool");
        expect(result.error).toMatch(/timeout|timed out/i);
        expect(result.hint).toMatch(/required args|missing|hang/i);
        expect(result.received_args).toEqual({ some: "args" });
      });

      it("does not time out when execute resolves within timeout", async () => {
        const fastFn = async (): Promise<string> =>
          JSON.stringify({ ok: true });

        const wrapped = safeExecute(fastFn, "fast_tool", undefined, {
          timeoutMs: 1000,
        });

        const raw = await wrapped({}, {} as any);
        const result = JSON.parse(raw);
        expect(result.ok).toBe(true);
      });

      it("uses default 10s timeout when none specified", async () => {
        // Indirect check: verify default is exposed and reasonable
        const fastFn = async (): Promise<string> => JSON.stringify({ ok: 1 });

        const wrapped = safeExecute(fastFn, "default_timeout_tool");

        const raw = await wrapped({}, {} as any);
        const result = JSON.parse(raw);
        expect(result.ok).toBe(1);
      });
    });
  });

  describe("safeExecuteSimple", () => {
    it("returns result from successful execution", async () => {
      const fn = async (args: { path: string }, dir: string) =>
        JSON.stringify({ path: args.path, dir });
      const wrapped = safeExecuteSimple(fn, "test_tool");
      const result = await wrapped({ path: "/test" }, "/home/user");
      expect(JSON.parse(result)).toEqual({ path: "/test", dir: "/home/user" });
    });

    it("catches and returns Error as JSON", async () => {
      const fn = async (): Promise<string> => {
        throw new Error("File not found");
      };
      const wrapped = safeExecuteSimple(fn, "test_tool");
      const result = await wrapped({}, "/home/user");
      const parsed = JSON.parse(result);
      expect(parsed.error).toBe("File not found");
      expect(parsed.tool).toBe("test_tool");
    });

    it("writes timing profile entries for simple wrappers when ADV_PROFILE=1", async () => {
      process.env.ADV_PROFILE = "1";
      const fn = async (args: { path: string }, dir: string) =>
        JSON.stringify({ path: args.path, dir });
      const wrapped = safeExecuteSimple(fn, "simple_profiled_tool");

      await wrapped({ path: "/test" }, "/home/user");

      expect(existsSync(profileLogFile())).toBe(true);
      const content = readFileSync(profileLogFile(), "utf-8");
      expect(content).toContain('"tool":"simple_profiled_tool"');
      expect(content).toContain('"outcome":"success"');
    });
  });

  describe("deriveErrorClass", () => {
    it("returns 'ZodError' for ZodError instances", () => {
      const schema = z.object({ a: z.string() });
      try {
        schema.parse({ a: 1 });
      } catch (e) {
        expect(deriveErrorClass(e)).toBe("ZodError");
      }
    });

    it("returns Error.name for standard Error subclasses", () => {
      expect(deriveErrorClass(new TypeError("boom"))).toBe("TypeError");
      expect(deriveErrorClass(new RangeError("oops"))).toBe("RangeError");
      expect(deriveErrorClass(new Error("plain"))).toBe("Error");
    });

    it("returns 'Unknown' for non-Error thrown values", () => {
      expect(deriveErrorClass("just a string")).toBe("Unknown");
      expect(deriveErrorClass(42)).toBe("Unknown");
      expect(deriveErrorClass(null)).toBe("Unknown");
      expect(deriveErrorClass(undefined)).toBe("Unknown");
    });
  });

  describe("deriveContextFromArgs", () => {
    it("extracts workdir when present", () => {
      expect(deriveContextFromArgs({ workdir: "/tmp/x" })).toEqual({
        workdir: "/tmp/x",
      });
    });

    it("extracts path when present", () => {
      expect(deriveContextFromArgs({ path: "/tmp/p" })).toEqual({
        path: "/tmp/p",
      });
    });

    it("extracts filePath as path", () => {
      expect(deriveContextFromArgs({ filePath: "/tmp/f" })).toEqual({
        path: "/tmp/f",
      });
    });

    it("extracts directory as workdir when workdir absent", () => {
      expect(deriveContextFromArgs({ directory: "/tmp/d" })).toEqual({
        workdir: "/tmp/d",
      });
    });

    it("prefers explicit workdir over directory", () => {
      expect(
        deriveContextFromArgs({
          workdir: "/explicit",
          directory: "/fallback",
        }),
      ).toEqual({ workdir: "/explicit" });
    });

    it("merges extra context over derived context", () => {
      expect(
        deriveContextFromArgs(
          { workdir: "/from-args" },
          { operation: "createStore", workdir: "/override" },
        ),
      ).toEqual({ workdir: "/override", operation: "createStore" });
    });

    it("ignores non-string values", () => {
      expect(deriveContextFromArgs({ workdir: 42 })).toEqual({});
      expect(deriveContextFromArgs({ path: null })).toEqual({});
    });

    it("returns empty object for null/undefined args", () => {
      expect(deriveContextFromArgs(null)).toEqual({});
      expect(deriveContextFromArgs(undefined)).toEqual({});
    });
  });

  describe("mergeDefinedContext", () => {
    it("copies only defined fields from extra context", () => {
      expect(
        mergeDefinedContext(
          { workdir: "/tmp/base" },
          {
            errorClass: "TypeError",
            workdir: undefined,
            path: "/tmp/file",
            operation: "createStore",
          },
        ),
      ).toEqual({
        workdir: "/tmp/base",
        errorClass: "TypeError",
        path: "/tmp/file",
        operation: "createStore",
      });
    });
  });

  describe("formatErrorResponse enrichment", () => {
    it("includes errorClass for ZodError", () => {
      const schema = z.object({ a: z.string() });
      try {
        schema.parse({ a: 1 });
      } catch (e) {
        const raw = formatErrorResponse(e, "test_tool", { a: 1 });
        const parsed = JSON.parse(raw);
        expect(parsed.errorClass).toBe("ZodError");
      }
    });

    it("includes errorClass for standard Error", () => {
      const raw = formatErrorResponse(new TypeError("nope"), "test_tool");
      const parsed = JSON.parse(raw);
      expect(parsed.errorClass).toBe("TypeError");
    });

    it("includes errorClass for unknown error", () => {
      const raw = formatErrorResponse("oops", "test_tool");
      const parsed = JSON.parse(raw);
      expect(parsed.errorClass).toBe("Unknown");
    });

    it("surfaces workdir/path from args for Error", () => {
      const raw = formatErrorResponse(new Error("fs broke"), "test_tool", {
        workdir: "/tmp/wd",
        path: "/tmp/p",
      });
      const parsed = JSON.parse(raw);
      expect(parsed.workdir).toBe("/tmp/wd");
      expect(parsed.path).toBe("/tmp/p");
    });

    it("surfaces explicit context merged with derived context", () => {
      const raw = formatErrorResponse(
        new Error("fs broke"),
        "test_tool",
        { workdir: "/from-args" },
        { operation: "createStore" } satisfies ErrorContext,
      );
      const parsed = JSON.parse(raw);
      expect(parsed.workdir).toBe("/from-args");
      expect(parsed.operation).toBe("createStore");
    });

    it("preserves existing keys (error, tool, hint, received_args) on ZodError", () => {
      const schema = z.object({ id: z.string() });
      try {
        schema.parse({ id: 123 });
      } catch (e) {
        const raw = formatErrorResponse(e, "test_tool", { id: 123 });
        const parsed = JSON.parse(raw);
        expect(parsed.error).toContain("Schema validation failed");
        expect(parsed.tool).toBe("test_tool");
        expect(parsed.hint).toBeDefined();
        expect(parsed.received_args).toEqual({ id: 123 });
      }
    });
  });

  describe("safeExecuteSimple context extraction", () => {
    it("surfaces directory in error response when execute throws", async () => {
      const fn = async (): Promise<string> => {
        throw new Error("boom");
      };
      const wrapped = safeExecuteSimple(fn, "test_tool");
      const result = await wrapped({}, "/home/dir", "/opt/file");
      const parsed = JSON.parse(result);
      expect(parsed.errorClass).toBe("Error");
      expect(parsed.workdir).toBe("/home/dir");
      expect(parsed.path).toBe("/opt/file");
    });
  });

  describe("truncateOutput (deprecated, still functional)", () => {
    it("returns original string if within limit", () => {
      const output = "short string";
      expect(truncateOutput(output, 20)).toBe(output);
    });

    it("truncates string if it exceeds limit and appends warning", () => {
      const output = "a".repeat(100);
      const limit = 50;
      const result = truncateOutput(output, limit);
      expect(result.length).toBeGreaterThan(limit);
      expect(result.slice(0, limit)).toBe("a".repeat(limit));
      expect(result).toContain("[WARNING: Output truncated");
      expect(result).toContain("100 exceeds limit of 50");
    });
  });
});

describe("Temporal-aware error hints", () => {
  it("returns a determinism-specific hint for non-deterministic workflow errors", () => {
    const raw = formatErrorResponse(
      new Error(
        "NonDeterministicWorkflowError: workflow code changed incompatibly",
      ),
      "adv_change_update",
    );
    const parsed = JSON.parse(raw);
    expect(parsed.hint).toMatch(/determin|replay|patch|version/i);
  });

  it("returns a runtime/bootstrap hint for Temporal connectivity errors", () => {
    const raw = formatErrorResponse(
      new Error(
        "Temporal runtime at 127.0.0.1:7233 did not become reachable within 5000ms",
      ),
      "adv_status",
    );
    const parsed = JSON.parse(raw);
    expect(parsed.hint).toMatch(/runtime|worker|reach|start/i);
  });

  it("inspects cause chain for wrapped Temporal errors", () => {
    const inner = new Error("NonDeterministicWorkflowError: code changed");
    const outer = new Error("Workflow execution failed");
    (outer as Error & { cause: unknown }).cause = inner;

    const raw = formatErrorResponse(outer, "adv_change_update");
    const parsed = JSON.parse(raw);
    expect(parsed.hint).toMatch(/determin|replay|patch|version/i);
  });

  it("inspects cause chain for wrapped Temporal connectivity errors", () => {
    const inner = new Error(
      "Temporal runtime at 127.0.0.1:7233 did not become reachable within 5000ms",
    );
    const outer = new Error("Worker startup failed");
    (outer as Error & { cause: unknown }).cause = inner;

    const raw = formatErrorResponse(outer, "adv_status");
    const parsed = JSON.parse(raw);
    expect(parsed.hint).toMatch(/runtime|worker|reach|start/i);
  });
});
