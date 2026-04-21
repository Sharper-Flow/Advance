import { describe, expect, it } from "vitest";
import * as activities from "./activities";
import * as workflows from "./workflows";

describe("temporal worker bundle registration", () => {
  it("activities barrel exports migrateSingleProjectActivity", () => {
    expect(typeof activities.migrateSingleProjectActivity).toBe("function");
  });

  it("workflows barrel exports migrateAllProjectsWorkflow", () => {
    expect(typeof workflows.migrateAllProjectsWorkflow).toBe("function");
  });
});
