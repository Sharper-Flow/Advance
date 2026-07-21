import { proxyActivities, sleep } from "@temporalio/workflow";

const { commandBoundaryActivity } = proxyActivities<{
  commandBoundaryActivity(): Promise<void>;
}>({ startToCloseTimeout: "1 minute" });

export async function commandBoundaryReplayWorkflow(): Promise<void> {
  await commandBoundaryActivity();
  await sleep(1);
}
