import * as fs from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";

export const ADV_DEBUG_ENABLED = process.env.ADV_DEBUG === "1";

const getDebugLogPath = (): string => {
  const debugDir =
    process.env.OPEN_CHAD_CACHE_DIR ?? process.env.TMPDIR ?? tmpdir();
  return join(debugDir, "adv-debug.log");
};

export const appendDebugLog = (scope: string, msg: string): void => {
  if (!ADV_DEBUG_ENABLED) {
    return;
  }

  try {
    const logPath = getDebugLogPath();
    fs.mkdirSync(dirname(logPath), { recursive: true });
    fs.appendFileSync(
      logPath,
      `${new Date().toISOString()} [${scope}] ${msg}\n`,
    );
  } catch {
    // ignore debug logging failures
  }
};
