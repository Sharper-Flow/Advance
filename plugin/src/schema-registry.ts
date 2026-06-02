import { z, type ZodTypeAny } from "zod";
import {
  ChangeSchema,
  DeltaSchema,
  ProjectConfigSchema,
  RequirementSchema,
  ScenarioSchema,
  SpecSchema,
  TaskSchema,
} from "./types";

// Public `$id` values intentionally use the canonical trunk URL. Feature-branch
// validation uses the committed local artifacts plus `schemas:check`; external
// consumers should resolve these IDs after changes land on trunk.
export const ADV_SCHEMA_BASE_URL =
  "https://raw.githubusercontent.com/Sharper-Flow/Advance/trunk/plugin/schemas/";

export const JSON_SCHEMA_DIALECT = "http://json-schema.org/draft-07/schema#";

export interface PublicJsonSchemaEntry {
  name: string;
  filename: string;
  title: string;
  schema: ZodTypeAny;
}

export const PUBLIC_JSON_SCHEMAS: PublicJsonSchemaEntry[] = [
  {
    name: "change",
    filename: "change.schema.json",
    title: "ADV Change",
    schema: ChangeSchema,
  },
  {
    name: "delta",
    filename: "delta.schema.json",
    title: "ADV Delta",
    schema: DeltaSchema,
  },
  {
    name: "project",
    filename: "project.schema.json",
    title: "ADV Project Configuration",
    schema: ProjectConfigSchema,
  },
  {
    name: "requirement",
    filename: "requirement.schema.json",
    title: "ADV Requirement",
    schema: RequirementSchema,
  },
  {
    name: "scenario",
    filename: "scenario.schema.json",
    title: "ADV Requirement Scenario",
    schema: ScenarioSchema,
  },
  {
    name: "spec",
    filename: "spec.schema.json",
    title: "ADV Specification",
    schema: SpecSchema,
  },
  {
    name: "task",
    filename: "task.schema.json",
    title: "ADV Task",
    schema: TaskSchema,
  },
] as const;

export function schemaUrl(filename: string): string {
  return `${ADV_SCHEMA_BASE_URL}${filename}`;
}

export const CHANGE_SCHEMA_URL = schemaUrl("change.schema.json");
export const SPEC_SCHEMA_URL = schemaUrl("spec.schema.json");

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested)]),
    );
  }

  return value;
}

export function renderJsonSchemaObject(
  entry: PublicJsonSchemaEntry,
): Record<string, unknown> {
  const generated = z.toJSONSchema(entry.schema, {
    target: "draft-07",
    cycles: "ref",
    reused: "inline",
  }) as Record<string, unknown>;

  return sortJsonValue({
    ...generated,
    $schema: JSON_SCHEMA_DIALECT,
    $id: schemaUrl(entry.filename),
    title: entry.title,
  }) as Record<string, unknown>;
}

export function renderJsonSchemaFile(entry: PublicJsonSchemaEntry): string {
  return `${JSON.stringify(renderJsonSchemaObject(entry), null, 2)}\n`;
}

export function renderAllJsonSchemas(): Record<string, string> {
  return Object.fromEntries(
    PUBLIC_JSON_SCHEMAS.map((entry) => [
      entry.filename,
      renderJsonSchemaFile(entry),
    ]),
  );
}
