/**
 * Neutral filesystem helpers for specs.
 *
 * These helpers intentionally do not import from `storage/json.ts` (which
 * contains command/archive reachability). They are safe for pure metadata and
 * read-model consumers.
 */

import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { ZodError } from "zod";
import { SpecSchema } from "../types";
import type { Spec } from "../types";
import { atomicWriteFile } from "../utils/fs";

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
}

export type ShowSpecResult =
  | { ok: true; content: string; path: string }
  | { ok: false; error: string; content?: undefined; path?: undefined };

export async function readSpecFilesystem(
  input: ShowSpecInput,
): Promise<ShowSpecResult> {
  const path = join(input.specsDir, input.capability, "spec.json");
  try {
    const content = await readFile(path, "utf-8");
    return { ok: true, content, path };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error:
        code === "ENOENT"
          ? `Spec not found: ${input.capability} (${path})`
          : `Read failed (${code ?? "unknown"}): ${message}`,
    };
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
  | { success: false; error: string; type: "schema_error" | "read_error" };

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

  try {
    const content = await readFile(specPath, "utf-8");
    return { success: true, data: SpecSchema.parse(JSON.parse(content)) };
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
    } else if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { success: true, data: null };
    } else {
      return {
        success: false,
        error: `Failed to load spec ${capability}: ${String(error)}`,
        type: "read_error",
      };
    }
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
