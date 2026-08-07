/**
 * Agenda Retirement Tests (retireAgendaWorkflow)
 *
 * Focused RED→GREEN assertions for the final Agenda product-surface removal.
 * These tests verify that Agenda tools, storage, paths, briefing-fact labels,
 * report consumer writes, and the `agenda` source kind are no longer present
 * in the active product surface — while legacy OpsFollowupSource records with
 * `source_kind: "agenda"` and `source_agenda_id` remain parseable for
 * backwards compatibility (AC8 parse-only).
 *
 * Contract refs: AC1 (no adv_agenda_* registered), AC2/AC3 (no Agenda consumer
 * writes for follow-ups), AC4 (designer concern semantics preserved), AC8
 * (legacy parse-only), SC1 (no unowned generic queue), DONT1 (no replacement
 * generic queue), DONT6 (do not weaken design-concern/ops/release semantics).
 */

import { describe, expect, it } from "vitest";
import { BriefingFactOutcomeSchema, OpsFollowupSourceSchema } from "../types";
import { ADV_TOOL_NAMES, createToolMap } from "../tool-registry";
import { getProjectPaths } from "../storage/json";
import { createDiskStore } from "../storage/store";
import {
  createTempDir,
  cleanupTempDir,
  createTestProject,
} from "../__tests__/setup";

const AGENDA_TOOL_PREFIX = "adv_agenda_";

describe("retireAgendaWorkflow — no adv_agenda_* tools registered (AC1)", () => {
  it("ADV_TOOL_NAMES contains no adv_agenda_* entries", () => {
    const offenders = ADV_TOOL_NAMES.filter((name) =>
      name.startsWith(AGENDA_TOOL_PREFIX),
    );
    expect(offenders).toEqual([]);
  });

  it("createToolMap does not register any adv_agenda_* tool", async () => {
    const tempDir = await createTempDir();
    await createTestProject(tempDir);
    const store = await createDiskStore(tempDir);
    await store.init();
    try {
      const map = createToolMap(store, tempDir);
      const offenders = Object.keys(map).filter((name) =>
        name.startsWith(AGENDA_TOOL_PREFIX),
      );
      expect(offenders).toEqual([]);
    } finally {
      store.close();
      await cleanupTempDir(tempDir);
    }
  });
});

describe("retireAgendaWorkflow — no Agenda storage/types modules", () => {
  it("types barrel no longer exports AgendaItemSchema / AgendaPrioritySchema", async () => {
    const types = await import("../types");
    expect((types as Record<string, unknown>).AgendaItemSchema).toBeUndefined();
    expect(
      (types as Record<string, unknown>).AgendaPrioritySchema,
    ).toBeUndefined();
    expect(
      (types as Record<string, unknown>).AgendaStatusSchema,
    ).toBeUndefined();
    expect((types as Record<string, unknown>).AgendaMetaSchema).toBeUndefined();
    expect(
      (types as Record<string, unknown>).AGENDA_PRIORITY_ORDER,
    ).toBeUndefined();
  });

  it("storage/agenda.ts module no longer exists on disk", async () => {
    await expect(import("../storage/agenda")).rejects.toThrow();
  });

  it("tools/agenda.ts module no longer exists on disk", async () => {
    await expect(import("../tools/agenda")).rejects.toThrow();
  });
});

describe("retireAgendaWorkflow — ProjectPaths has no agenda field", () => {
  it("getProjectPaths (in-repo) does not include an agenda path field", () => {
    const paths = getProjectPaths("/project");
    expect("agenda" in paths).toBe(false);
    expect(paths).not.toHaveProperty("agenda");
  });

  it("getProjectPaths (external) does not include an agenda path field", () => {
    const paths = getProjectPaths("/project", undefined, {
      externalRoot: "/ext/data/abc123",
    });
    expect("agenda" in paths).toBe(false);
    expect(paths).not.toHaveProperty("agenda");
  });
});

describe("retireAgendaWorkflow — briefing-fact labels renamed (AC1)", () => {
  it("BriefingFactOutcomeSchema no longer accepts 'agenda' as an outcome", () => {
    expect(BriefingFactOutcomeSchema.safeParse("agenda").success).toBe(false);
  });

  it("BriefingFactOutcomeSchema accepts the replacement 'report_follow_up' outcome", () => {
    expect(
      BriefingFactOutcomeSchema.safeParse("report_follow_up").success,
    ).toBe(true);
  });
});

describe("retireAgendaWorkflow — legacy OpsFollowupSource parse-only (AC8)", () => {
  it("OpsFollowupSourceSchema still parses legacy 'agenda' source_kind records", () => {
    const legacyRecord = {
      source_change_id: "change-legacy-1",
      source_kind: "agenda",
      source_agenda_id: "ag-legacy01",
    };
    const parsed = OpsFollowupSourceSchema.safeParse(legacyRecord);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.source_kind).toBe("agenda");
      expect(parsed.data.source_agenda_id).toBe("ag-legacy01");
    }
  });

  it("OpsFollowupSourceSchema still parses modern source_kind values", () => {
    const modernRecord = {
      source_change_id: "change-modern-1",
      source_kind: "required_follow_up",
      source_report_key: "report:abc:1",
    };
    const parsed = OpsFollowupSourceSchema.safeParse(modernRecord);
    expect(parsed.success).toBe(true);
  });
});

describe("retireAgendaWorkflow — adv_followup_promote rejects agenda source (AC1)", () => {
  it("followup tool module does not export 'agenda' in its SOURCE_KIND_SCHEMA input enum", async () => {
    // The tool input schema must refuse new agenda promotions. We verify by
    // reading the module source: the SOURCE_KIND_SCHEMA in followup.ts should
    // no longer include "agenda" as an accepted enum value.
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(new URL(".", import.meta.url).pathname, "followup.ts"),
      "utf8",
    );
    // The local SOURCE_KIND_SCHEMA used for tool input must not list "agenda".
    // OpsFollowupSourceSchema in types/changes.ts keeps it for parse-only
    // compatibility; the tool-level input schema is what gates new writes.
    const localSchemaMatch = src.match(
      /const SOURCE_KIND_SCHEMA = z\.enum\(\[([\s\S]*?)\]\)/,
    );
    expect(localSchemaMatch).not.toBeNull();
    if (localSchemaMatch) {
      expect(localSchemaMatch[1]).not.toContain('"agenda"');
    }
  });
});

describe("retireAgendaWorkflow — no storage/agenda imports (AC1)", () => {
  it("tool-registry.ts does not import from tools/agenda", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(new URL(".", import.meta.url).pathname, "../tool-registry.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']\.\/tools\/agenda["']/);
  });

  it("subagent-report.ts does not import from storage/agenda", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(new URL(".", import.meta.url).pathname, "subagent-report.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']\.\.\/storage\/agenda["']/);
    expect(src).not.toMatch(/addAgendaItem|loadAgenda/);
  });

  it("types/index.ts does not re-export from types/agenda", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const src = readFileSync(
      resolve(new URL(".", import.meta.url).pathname, "../types/index.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']\.\/agenda["']/);
  });
});

describe("retireAgendaWorkflow — tool surface has no active agenda references (AC1)", () => {
  it("no registered tool's description references agenda as an active product surface", async () => {
    const tempDir = await createTempDir();
    await createTestProject(tempDir);
    const store = await createDiskStore(tempDir);
    await store.init();
    try {
      const map = createToolMap(store, tempDir);
      const offenders: Array<{ tool: string; description: string }> = [];
      for (const [name, tool] of Object.entries(map)) {
        const desc = (tool as { description?: string }).description ?? "";
        // Parse-only legacy/retired context is acceptable; active product
        // surface references are not. We split sentences and flag any that
        // mention "agenda" without a parse-only/legacy/retired qualifier.
        const sentences = desc.split(/[.!]\s+/);
        for (const sentence of sentences) {
          if (
            /\bagenda\b/i.test(sentence) &&
            !/parse-only|legacy|retired|reject/i.test(sentence)
          ) {
            offenders.push({
              tool: name,
              description: sentence.trim().slice(0, 200),
            });
            break;
          }
        }
      }
      expect(offenders).toEqual([]);
    } finally {
      store.close();
      await cleanupTempDir(tempDir);
    }
  });
});
