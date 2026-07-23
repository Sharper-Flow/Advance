import { describe, expect, it } from "vitest";

import { EpicShellEntrySchema } from "./epics";
import { BacklogItemSchema } from "./backlog";
import { FutureWorkContextPacketSchema } from "./future-work";

describe("FutureWorkContextPacketSchema", () => {
  const validPacket = {
    background: "some background",
    references: [
      { label: "ref 1", locator: "https://example.com/1" },
      { label: "ref 2", locator: "https://example.com/2" },
    ],
    constraints: ["must be fast", "must be safe"],
    avoidances: ["avoid global state", "avoid polling"],
    design_seed: "seed design note",
    cross_project_target: {
      project_hint: "hint",
      target_path: "/repo/target",
      repo_url: "https://github.com/example/repo",
    },
  };

  it("parses an EpicShellEntry with context_packet populated", () => {
    const entry = {
      kind: "shell" as const,
      entry_id: "entry-1",
      order: 1,
      title: "Shell title",
      success_hint: "make it work",
      context_packet: validPacket,
    };
    const result = EpicShellEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it("parses an EpicShellEntry without context_packet (backward compatible)", () => {
    const entry = {
      kind: "shell" as const,
      entry_id: "entry-2",
      order: 2,
      title: "Shell title",
      success_hint: "make it work",
    };
    const result = EpicShellEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it("parses a BacklogItem with context_packet populated", () => {
    const item = {
      id: "item-1",
      title: "Item title",
      success_hint: "make it work",
      status: "active" as const,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      context_packet: validPacket,
    };
    const result = BacklogItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it("parses a BacklogItem without context_packet (backward compatible)", () => {
    const item = {
      id: "item-2",
      title: "Item title",
      success_hint: "make it work",
      status: "active" as const,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const result = BacklogItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it("rejects background longer than 4096 characters", () => {
    const result = FutureWorkContextPacketSchema.safeParse({
      background: "x".repeat(4097),
    });
    expect(result.success).toBe(false);
  });

  it("rejects references arrays longer than 12 items", () => {
    const result = FutureWorkContextPacketSchema.safeParse({
      references: Array.from({ length: 13 }, (_, i) => ({
        label: `ref ${i}`,
        locator: `https://example.com/${i}`,
      })),
    });
    expect(result.success).toBe(false);
  });

  it("rejects constraint strings longer than 512 characters", () => {
    const result = FutureWorkContextPacketSchema.safeParse({
      constraints: ["x".repeat(513)],
    });
    expect(result.success).toBe(false);
  });

  it("rejects design_seed longer than 6144 characters", () => {
    const result = FutureWorkContextPacketSchema.safeParse({
      design_seed: "x".repeat(6145),
    });
    expect(result.success).toBe(false);
  });
});
