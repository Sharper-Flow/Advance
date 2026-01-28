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
    it("formats ZodError with args", () => {
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

    it("formats standard Error", () => {
      const error = new Error("Something went wrong");
      const result = JSON.parse(formatErrorResponse(error, "test_tool"));
      expect(result.error).toBe("Something went wrong");
      expect(result.tool).toBe("test_tool");
      expect(result.hint).toBeDefined();
    });

    it("formats unknown error types", () => {
      const result = JSON.parse(formatErrorResponse("string error", "test_tool"));
      expect(result.error).toBe("string error");
      expect(result.tool).toBe("test_tool");
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
});
