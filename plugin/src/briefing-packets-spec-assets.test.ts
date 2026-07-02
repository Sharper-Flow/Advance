import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { SpecSchema } from "./types";

const REPO_ROOT = resolve(__dirname, "../..");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadSpec(name: string): ReturnType<typeof SpecSchema.parse> {
  return SpecSchema.parse(
    readJson(join(REPO_ROOT, ".adv/specs", name, "spec.json")),
  );
}

describe("briefing packet spec law", () => {
  test("subagent-reports spec defines briefing packet projection and anchor contract", () => {
    const spec = loadSpec("subagent-reports");
    const requirement = spec.requirements.find(
      (req) => req.id === "rq-subagentReports21",
    );
    expect(requirement).toBeDefined();

    const text = JSON.stringify(requirement);
    for (const anchor of [
      "SUBAGENT_REPORT_FIELD_SOURCES",
      "getSubagentReportPacketAnchors",
      "unavailable markers",
      "audit-only",
      "bounded",
      "lane-specific",
    ]) {
      expect(text).toContain(anchor);
    }
  });

  test("advance-workflow spec defines briefing packet read projection and no standalone tool", () => {
    const spec = loadSpec("advance-workflow");
    const requirement = spec.requirements.find(
      (req) => req.id === "rq-briefingPacketReadProjection01",
    );
    expect(requirement).toBeDefined();

    const text = JSON.stringify(requirement);
    for (const anchor of [
      "read-only projections",
      "Without a Standalone Tool",
      "adv_briefing_packet",
      "audit-only",
    ]) {
      expect(text).toContain(anchor);
    }
  });

  test("advance-workflow spec defines archive digest idempotency", () => {
    const spec = loadSpec("advance-workflow");
    const requirement = spec.requirements.find(
      (req) => req.id === "rq-briefingPacketArchiveDigest01",
    );
    expect(requirement).toBeDefined();

    const text = JSON.stringify(requirement);
    for (const anchor of ["Idempotent", "digest", "Transient", "durable"]) {
      expect(text).toContain(anchor);
    }
  });

  test("advance-epics spec defines compact optional Epic briefing context", () => {
    const spec = loadSpec("advance-epics");
    const requirement = spec.requirements.find(
      (req) => req.id === "rq-epicBriefingContext01",
    );
    expect(requirement).toBeDefined();

    const text = JSON.stringify(requirement);
    for (const anchor of ["compact", "optional", "membership", "order"]) {
      expect(text).toContain(anchor);
    }
  });
});
