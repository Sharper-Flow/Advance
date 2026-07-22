import { describe, expect, it } from "vitest";
import { z } from "zod";

import { includeSnapshotSchema } from "./shared-args";

describe("includeSnapshotSchema", () => {
  it("exports an object with an optional include property", () => {
    const shape = includeSnapshotSchema.shape;
    expect(shape).toHaveProperty("include");
    expect(shape.include).toBeDefined();
  });

  it("include is an object with optional snapshot boolean", () => {
    const includeShape = (
      includeSnapshotSchema.shape.include as z.ZodOptional<
        z.ZodObject<z.ZodRawShape>
      >
    ).unwrap();
    expect(includeShape.shape).toHaveProperty("snapshot");
    const snapshotField = includeShape.shape
      .snapshot as z.ZodOptional<z.ZodBoolean>;
    expect(snapshotField.unwrap()).toBeInstanceOf(z.ZodBoolean);
  });

  it("parses undefined (no include) without error", () => {
    const result = includeSnapshotSchema.parse({});
    expect(result.include).toBeUndefined();
  });

  it("parses empty include object without error", () => {
    const result = includeSnapshotSchema.parse({ include: {} });
    expect(result.include).toEqual({});
  });

  it("parses include.snapshot=true", () => {
    const result = includeSnapshotSchema.parse({ include: { snapshot: true } });
    expect(result.include?.snapshot).toBe(true);
  });

  it("parses include.snapshot=false", () => {
    const result = includeSnapshotSchema.parse({
      include: { snapshot: false },
    });
    expect(result.include?.snapshot).toBe(false);
  });

  it("parses include.snapshot=undefined", () => {
    const result = includeSnapshotSchema.parse({
      include: { snapshot: undefined },
    });
    expect(result.include?.snapshot).toBeUndefined();
  });

  it("describes the snapshot field with the canonical wording", () => {
    const includeShape = (
      includeSnapshotSchema.shape.include as z.ZodOptional<
        z.ZodObject<z.ZodRawShape>
      >
    ).unwrap();
    const snapshotField = includeShape.shape
      .snapshot as z.ZodOptional<z.ZodBoolean>;
    const description =
      snapshotField.description ?? snapshotField.unwrap().description;
    expect(description).toContain("_contextSnapshot");
  });

  it("can be spread into a larger schema via .shape (like targetPathSchema)", () => {
    const combined = z.object({
      changeId: z.string(),
      ...includeSnapshotSchema.shape,
    });
    expect(combined.parse({ changeId: "test" }).changeId).toBe("test");
    expect(
      combined.parse({ changeId: "test", include: { snapshot: true } }).include
        ?.snapshot,
    ).toBe(true);
  });
});
