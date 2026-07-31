/**
 * Negative fixture: synchronous I/O deferred to a function call.
 */
import { readFileSync } from "fs";

export function loadConfig(): unknown {
  return JSON.parse(readFileSync("./config.json", "utf8"));
}

export function startWorker(): void {
  const config = loadConfig();
  console.log("starting worker with config", config);
}
