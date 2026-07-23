import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { FutureWorkContextPacket } from "../types/future-work.js";
import {
  assertEpicAggregatePackets,
  assertPacketSize,
  ContextPacketTooLargeError,
  EpicAggregatePacketsExceededError,
  parsePacket,
} from "./context-packet-validation.js";

function repeat(char: string, count: number): string {
  return Array.from({ length: count }).fill(char).join("");
}

function buildLargePacket(byteTarget: number): FutureWorkContextPacket {
  const background = repeat("b", 4096);
  const references = Array.from({ length: 12 }, () => ({
    label: repeat("l", 200),
    locator: repeat("x", 2048),
  }));
  const constraints = Array.from({ length: 12 }, () => repeat("c", 512));
  const avoidances = Array.from({ length: 12 }, () => repeat("a", 512));
  const designSeed = repeat("d", 6144);

  const packet: FutureWorkContextPacket = {
    background,
    references,
    constraints,
    avoidances,
    design_seed: designSeed,
  };

  const current = Buffer.byteLength(JSON.stringify(packet), "utf8");
  if (current >= byteTarget) {
    return packet;
  }

  // If we still need more bytes, extend background until we hit the target.
  // Note: this intentionally exceeds the schema's 4096-byte background bound,
  // so it must only be fed to the byte-size helpers, not parsePacket.
  const extraNeeded = byteTarget - current + 1;
  (packet as any).background = repeat("b", 4096 + extraNeeded);
  return packet;
}

describe("parsePacket", () => {
  it("parses a valid minimal packet", () => {
    const input = {
      background: "background text",
      constraints: ["keep it simple"],
    };
    expect(parsePacket(input)).toEqual(input);
  });

  it("parses a fully populated valid packet", () => {
    const input: FutureWorkContextPacket = {
      background: repeat("b", 4096),
      references: Array.from({ length: 12 }, (_, i) => ({
        label: `ref-${i}`,
        locator: `https://example.com/${i}`,
      })),
      constraints: Array.from({ length: 12 }, () => repeat("c", 512)),
      avoidances: Array.from({ length: 12 }, () => repeat("a", 512)),
      design_seed: repeat("d", 6144),
      cross_project_target: {
        project_hint: "hint",
        target_path: "/path/to/target",
        repo_url: "https://github.com/example/repo",
      },
    };
    expect(parsePacket(input)).toEqual(input);
  });

  it("throws a ZodError when references exceed the array bound", () => {
    const input: FutureWorkContextPacket = {
      references: Array.from({ length: 13 }, (_, i) => ({
        label: `ref-${i}`,
        locator: `https://example.com/${i}`,
      })),
    };
    expect(() => parsePacket(input)).toThrow(z.ZodError);
  });

  it("throws a ZodError when background exceeds the per-field bound", () => {
    const input: FutureWorkContextPacket = {
      background: repeat("b", 4097),
    };
    expect(() => parsePacket(input)).toThrow(z.ZodError);
  });

  it("throws a ZodError when a reference locator exceeds the per-field bound", () => {
    const input: FutureWorkContextPacket = {
      references: [{ label: "ok", locator: repeat("x", 2049) }],
    };
    expect(() => parsePacket(input)).toThrow(z.ZodError);
  });
});

describe("assertPacketSize", () => {
  it("passes for a small packet", () => {
    const packet = parsePacket({ background: "tiny" });
    expect(() => assertPacketSize(packet)).not.toThrow();
  });

  it("passes for a packet just under 16 KiB", () => {
    const packet: FutureWorkContextPacket = {
      background: repeat("b", 4096),
      references: Array.from({ length: 2 }, () => ({
        label: repeat("l", 50),
        locator: repeat("x", 100),
      })),
    };
    expect(Buffer.byteLength(JSON.stringify(packet), "utf8")).toBeLessThan(
      16384,
    );
    expect(() => assertPacketSize(packet)).not.toThrow();
  });

  it("throws ContextPacketTooLargeError for a packet over 16 KiB", () => {
    const packet = buildLargePacket(16384);
    const actual = Buffer.byteLength(JSON.stringify(packet), "utf8");
    expect(actual).toBeGreaterThan(16384);

    expect(() => assertPacketSize(packet)).toThrow(ContextPacketTooLargeError);
    try {
      assertPacketSize(packet);
    } catch (err) {
      expect(err).toBeInstanceOf(ContextPacketTooLargeError);
      expect((err as ContextPacketTooLargeError).actualBytes).toBe(actual);
    }
  });
});

describe("assertEpicAggregatePackets", () => {
  function entryWithPacket(packet: FutureWorkContextPacket) {
    return { entry_id: "e1", kind: "shell" as const, context_packet: packet };
  }

  it("passes when the aggregate is under 256 KiB", () => {
    const entries = [
      entryWithPacket({ background: repeat("b", 100) }),
      entryWithPacket({ background: repeat("b", 100) }),
    ];
    expect(() => assertEpicAggregatePackets(entries)).not.toThrow();
  });

  it("ignores entries that carry no context_packet", () => {
    const entries = [
      { entry_id: "e1", kind: "shell" as const },
      entryWithPacket(buildLargePacket(16384)),
    ];
    // Only the large packet counts; aggregate is the same as the single packet.
    expect(() => assertEpicAggregatePackets(entries)).not.toThrow();
  });

  it("throws EpicAggregatePacketsExceededError when aggregate exceeds 256 KiB", () => {
    const entries = Array.from({ length: 50 }, () =>
      entryWithPacket({ design_seed: repeat("d", 6144) }),
    );

    expect(() => assertEpicAggregatePackets(entries)).toThrow(
      EpicAggregatePacketsExceededError,
    );
    try {
      assertEpicAggregatePackets(entries);
    } catch (err) {
      expect(err).toBeInstanceOf(EpicAggregatePacketsExceededError);
      const typed = err as EpicAggregatePacketsExceededError;
      expect(typed.actualBytes).toBeGreaterThan(262144);
      expect(typed.limit).toBe(262144);
    }
  });

  it("includes an optional incomingBytes parameter in the aggregate", () => {
    const entries = [entryWithPacket({ design_seed: repeat("d", 1000) })];

    expect(() => assertEpicAggregatePackets(entries, 262150)).toThrow(
      EpicAggregatePacketsExceededError,
    );

    const aggregate = Buffer.byteLength(
      JSON.stringify(entries[0].context_packet ?? {}),
      "utf8",
    );
    try {
      assertEpicAggregatePackets(entries, 262150);
    } catch (err) {
      expect(err).toBeInstanceOf(EpicAggregatePacketsExceededError);
      expect((err as EpicAggregatePacketsExceededError).actualBytes).toBe(
        aggregate + 262150,
      );
    }
  });
});
