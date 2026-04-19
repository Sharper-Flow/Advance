import { describe, expect, it } from "vitest";
import {
  recordProjectMigrationEvent,
  recordProjectWisdomExport,
  recordTemporalFoundationEvent,
} from "./activities";

describe("temporal activities", () => {
  it("records foundation events for change or project scope", async () => {
    const result = await recordTemporalFoundationEvent({
      scope: "project",
      id: "proj1",
    });
    expect(result.scope).toBe("project");
    expect(result.id).toBe("proj1");
    expect(typeof result.recordedAt).toBe("string");
  });

  it("records project wisdom export metadata", async () => {
    const result = await recordProjectWisdomExport({
      projectId: "proj1",
      entryCount: 4,
    });
    expect(result.projectId).toBe("proj1");
    expect(result.entryCount).toBe(4);
    expect(typeof result.exportedAt).toBe("string");
  });

  it("records project migration events", async () => {
    const result = await recordProjectMigrationEvent({
      projectId: "proj1",
      key: "changes-import",
      status: "done",
    });
    expect(result.projectId).toBe("proj1");
    expect(result.key).toBe("changes-import");
    expect(result.status).toBe("done");
    expect(typeof result.recordedAt).toBe("string");
  });
});
