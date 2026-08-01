/**
 * Neutral filesystem helpers for specs.
 *
 * These helpers intentionally do not import from `storage/json.ts` (which
 * contains command/archive reachability). They are safe for pure metadata and
 * read-model consumers.
 */

import { readdir } from "fs/promises";
import { join } from "path";
import { ZodError } from "zod";
import { SpecSchema } from "../types";
import type { Spec } from "../types";
import { atomicWriteFile } from "../utils/fs";
import {
  readBoundedProjectionDocument,
  PROJECTION_DOCUMENT_BYTE_LIMIT,
} from "./change-projection-reader";

export interface ListSpecsInput {
  specsDir: string;
}

export type ListSpecsResult =
  | { ok: true; specs: string[] }
  | { ok: false; error: string; specs?: undefined };

export async function listSpecsFilesystem(
  input: ListSpecsInput,
): Promise<ListSpecsResult> {
  try {
    const specs = await listSpecDirs(input.specsDir);
    return { ok: true, specs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `listSpecs failed: ${message}` };
  }
}

export interface ShowSpecInput {
  specsDir: string;
  capability: string;
  /**
   * Optional byte limit for the bounded read. Defaults to
   * PROJECTION_DOCUMENT_BYTE_LIMIT. Intended for tests and callers that need
   * stricter caps.
   */
  limitBytes?: number;
}

export type ShowSpecResult =
  | { ok: true; content: string; path: string }
  | { ok: false; error: string; content?: undefined; path?: undefined };

export async function readSpecFilesystem(
  input: ShowSpecInput,
): Promise<ShowSpecResult> {
  const path = join(input.specsDir, input.capability, "spec.json");
  const result = await readBoundedProjectionDocument(
    path,
    input.limitBytes ?? PROJECTION_DOCUMENT_BYTE_LIMIT,
  );
  switch (result.kind) {
    case "ok":
      return { ok: true, content: result.content, path };
    case "not_found":
      return {
        ok: false,
        error: `Spec not found: ${input.capability} (${path})`,
      };
    case "oversized":
      return {
        ok: false,
        error: `Read failed (oversized): spec ${input.capability} is ${result.actual} bytes > ${result.limit} byte limit (${path})`,
      };
    case "corrupt":
      return {
        ok: false,
        error: `Read failed (corrupt): ${result.error} (${path})`,
      };
    case "unreadable":
      return {
        ok: false,
        error: `Read failed (unreadable): ${result.error} (${path})`,
      };
    default: {
      const _exhaustive: never = result;
      return { ok: false, error: `Read failed (unknown): ${path}` };
    }
  }
}

function formatZodError(
  error: ZodError,
  context: { type: string; id: string; path: string },
): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join(".");
    return `  - ${path || "(root)"}: ${issue.message}`;
  });
  return (
    `Schema validation failed for ${context.type} "${context.id}":\n` +
    `File: ${context.path}\n` +
    `Issues:\n${issues.join("\n")}\n` +
    `Hint: Ensure the ${context.type}.json matches the schema.`
  );
}

export type SpecLoadResult =
  | { success: true; data: Spec | null }
  | {
      success: false;
      error: string;
      type:
        | "schema_error"
        | "read_error"
        | "oversized"
        | "corrupt"
        | "unreadable";
    };

export async function listSpecDirs(specsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(specsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
    return [];
  }
}

export async function loadSpec(
  specsDir: string,
  capability: string,
): Promise<SpecLoadResult> {
  const specPath = join(specsDir, capability, "spec.json");

  const readResult = await readBoundedProjectionDocument(specPath);
  if (readResult.kind !== "ok") {
    switch (readResult.kind) {
      case "not_found":
        return { success: true, data: null };
      case "oversized":
        return {
          success: false,
          error: `Spec ${capability} exceeds byte limit: ${readResult.actual} bytes > ${readResult.limit} bytes (${specPath})`,
          type: "oversized",
        };
      case "corrupt":
        return {
          success: false,
          error: `Spec ${capability} is corrupt: ${readResult.error} (${specPath})`,
          type: "corrupt",
        };
      case "unreadable":
        return {
          success: false,
          error: `Failed to read spec ${capability}: ${readResult.error} (${specPath})`,
          type: "unreadable",
        };
      default: {
        const _exhaustive: never = readResult;
        return {
          success: false,
          error: `Unexpected projection read outcome for spec ${capability} (${specPath})`,
          type: "read_error",
        };
      }
    }
  }

  try {
    return {
      success: true,
      data: SpecSchema.parse(JSON.parse(readResult.content)),
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: formatZodError(error, {
          type: "spec",
          id: capability,
          path: specPath,
        }),
        type: "schema_error",
      };
    }
    return {
      success: false,
      error: `Failed to load spec ${capability}: ${String(error)}`,
      type: "corrupt",
    };
  }
}

export async function loadAllSpecs(
  specsDir: string,
): Promise<Map<string, Spec>> {
  const specs = new Map<string, Spec>();
  const dirs = await listSpecDirs(specsDir);

  for (const dir of dirs) {
    const spec = await loadSpec(specsDir, dir);
    if (spec.success && spec.data) {
      specs.set(spec.data.name, spec.data);
    }
  }

  return specs;
}

export async function saveSpec(specsDir: string, spec: Spec): Promise<string> {
  const specDir = join(specsDir, spec.name);
  const specPath = join(specDir, "spec.json");

  await atomicWriteFile(specPath, JSON.stringify(spec, null, 2));

  return specPath;
}
