/**
 * Positive fixture: synchronous I/O at worker startup.
 */
import { readFileSync } from "fs";

const config = JSON.parse(readFileSync("./config.json", "utf8"));

export function startWorker(): void {
  console.log("starting worker with config", config);
}
