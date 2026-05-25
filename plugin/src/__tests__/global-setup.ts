import { getDataHome } from "../utils/project-id";
import { cleanupSyntheticAdvDirs } from "./synthetic-cleanup";

export default async function setup() {
  const dataHome = getDataHome();
  const runId = `vitest-${process.pid}-${Date.now()}`;
  process.env.ADV_TEST_RUN_ID = runId;

  return async () => {
    await cleanupSyntheticAdvDirs(dataHome, { runId });
  };
}
