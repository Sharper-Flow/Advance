/**
 * Tests for safe-execute utility
 */

import { describe, expect, it } from "vitest";
import { ZodError, z } from "zod";
import {
  safeExecute,
  safeExecuteSimple,
  formatZodError,
  formatErrorResponse,
  truncateOutput,
} from "./safe-execute";

describe("safe-execute", () => {
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
