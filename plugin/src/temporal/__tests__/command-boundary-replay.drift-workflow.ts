import { proxyActivities, sleep } from "@temporalio/workflow";

const { commandBoundaryActivity } = proxyActivities<{
  commandBoundaryActivity(): Promise<void>;
}>({ startToCloseTimeout: "1 minute" });

export async function commandBoundaryReplayWorkflow(): Promise<void> {
  await sleep(1);
  await commandBoundaryActivity();
}
