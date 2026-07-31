/**
 * Negative fixture: synchronous I/O in a non-startup library module.
 */
import { readFileSync } from "fs";

export const config = JSON.parse(readFileSync("./config.json", "utf8"));
