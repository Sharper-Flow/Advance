import { describe, expect, it, vi } from "vitest";

import { normalizeWorktreeConfig } from "./index.js";

const logger = () => ({ warn: vi.fn() });

describe("normalizeWorktreeConfig", () => {
  it("defaults new configs to warp mode", () => {
    expect(normalizeWorktreeConfig({})).toMatchObject({
      mode: "warp",
      inline: true,
      sync: { copyFiles: [], symlinkDirs: [], exclude: [] },
      hooks: { postCreate: [], preDelete: [] },
    });
  });

  it("maps legacy inline true to terminal mode and warns", () => {
    const log = logger();

    expect(normalizeWorktreeConfig({ inline: true }, log)).toMatchObject({
      mode: "terminal",
      inline: true,
    });
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Deprecated worktree config "inline"'),
    );
  });

  it("maps legacy inline false to spawn mode and warns", () => {
    const log = logger();

    expect(normalizeWorktreeConfig({ inline: false }, log)).toMatchObject({
      mode: "spawn",
      inline: false,
    });
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Deprecated worktree config "inline"'),
    );
  });

  it("lets mode win when both mode and legacy inline are set", () => {
    const log = logger();

    expect(
      normalizeWorktreeConfig({ mode: "warp", inline: false }, log),
    ).toMatchObject({ mode: "warp", inline: true });
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Ignoring deprecated worktree config "inline"'),
    );
  });

  it("preserves sync and hook config while normalizing mode", () => {
    expect(
      normalizeWorktreeConfig({
        mode: "terminal",
        sync: { copyFiles: [".env"], symlinkDirs: ["node_modules"] },
        hooks: { postCreate: ["pnpm install"] },
      }),
    ).toMatchObject({
      mode: "terminal",
      inline: true,
      sync: { copyFiles: [".env"], symlinkDirs: ["node_modules"], exclude: [] },
      hooks: { postCreate: ["pnpm install"], preDelete: [] },
    });
  });

  it("rejects unknown modes structurally", () => {
    expect(() => normalizeWorktreeConfig({ mode: "inline" })).toThrow();
  });
});
