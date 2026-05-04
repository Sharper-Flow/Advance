import { getDataHome } from "../utils/project-id";
import {
  cleanupNewSyntheticAdvDirs,
  listSyntheticAdvDirs,
} from "./synthetic-cleanup";

export default async function setup() {
  const dataHome = getDataHome();
  const baseline = await listSyntheticAdvDirs(dataHome);
  const runId = `vitest-${process.pid}-${Date.now()}`;
  process.env.ADV_TEST_RUN_ID = runId;

  return async () => {
    await cleanupNewSyntheticAdvDirs(dataHome, baseline, { runId });
  };
}
