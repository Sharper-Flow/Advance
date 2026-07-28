/**
 * Launcher aggregate writer.
 *
 * Command adapters route aggregate launcher-projection writes through this
 * helper rather than calling `atomicWriteFile` directly.
 */

import { atomicWriteFile } from "../utils/fs";
import type { LauncherProjection } from "./launcher-projection";

export async function writeLauncherProjection(
  path: string,
  projection: LauncherProjection,
): Promise<void> {
  await atomicWriteFile(path, `${JSON.stringify(projection, null, 2)}\n`);
}
