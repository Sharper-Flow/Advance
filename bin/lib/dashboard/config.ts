import { isAbsolute } from "path";

import type {
  DashboardConfig,
  DashboardConfigParseResult,
  DashboardDegradedSource,
  DashboardParseError,
  DashboardProjectConfig,
  DashboardProjectConfigResult,
} from "./types";

const DEFAULT_REFRESH_SECONDS = 45;
const MIN_REFRESH_SECONDS = 30;
const MAX_REFRESH_SECONDS = 60;
const REDACTED = "[REDACTED]";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseProject(
  raw: unknown,
  index: number,
): { project?: DashboardProjectConfig; result: DashboardProjectConfigResult; errors: DashboardParseError[] } {
  const errors: DashboardParseError[] = [];
  const fallbackId = `project-${index + 1}`;
  if (!isRecord(raw)) {
    const degraded = degradedProject(fallbackId, "PROJECT_NOT_OBJECT", "Project entry must be an object.");
    errors.push({ code: degraded.degraded.code, message: degraded.degraded.message, path: `projects.${index}` });
    return { result: degraded, errors };
  }

  const id = nonEmptyString(raw.id) ? raw.id.trim() : fallbackId;
  const label = nonEmptyString(raw.label) ? raw.label.trim() : id;
  const path = nonEmptyString(raw.path) ? raw.path.trim() : "";
  const github = isRecord(raw.github) ? raw.github : {};
  const owner = nonEmptyString(github.owner) ? github.owner.trim() : "";
  const repo = nonEmptyString(github.repo) ? github.repo.trim() : "";

  if (!path) {
    return invalidProject(id, "PROJECT_PATH_MISSING", "Project path is required.", `projects.${index}.path`, errors);
  }
  if (!isAbsolute(path)) {
    return invalidProject(id, "PROJECT_PATH_NOT_ABSOLUTE", "Project path must be absolute.", `projects.${index}.path`, errors);
  }
  if (!owner || !repo) {
    return invalidProject(id, "PROJECT_GITHUB_MISSING", "GitHub owner and repo are required.", `projects.${index}.github`, errors);
  }

  return {
    project: { id, label, path, github: { owner, repo } },
    result: { id, ok: true },
    errors,
  };
}

function invalidProject(
  id: string,
  code: string,
  message: string,
  path: string,
  errors: DashboardParseError[],
): { result: DashboardProjectConfigResult; errors: DashboardParseError[] } {
  const degraded = degradedProject(id, code, message);
  errors.push({ code, message, path });
  return { result: degraded, errors };
}

function degradedProject(
  id: string,
  code: string,
  message: string,
): { id: string; ok: false; degraded: DashboardDegradedSource } {
  return { id, ok: false, degraded: { source: "config", code, message } };
}

export function parseDashboardConfig(raw: unknown): DashboardConfigParseResult {
  const errors: DashboardParseError[] = [];
  const projectResults: DashboardProjectConfigResult[] = [];
  const projects: DashboardProjectConfig[] = [];

  if (!isRecord(raw)) {
    return {
      ok: false,
      projectResults,
      errors: [{ code: "CONFIG_NOT_OBJECT", message: "Dashboard config must be an object.", path: "$" }],
    };
  }

  if (raw.schema_version !== 1) {
    errors.push({ code: "INVALID_SCHEMA_VERSION", message: "Dashboard config schema_version must be 1.", path: "schema_version" });
  }

  const refreshSeconds =
    raw.refresh_seconds === undefined ? DEFAULT_REFRESH_SECONDS : Number(raw.refresh_seconds);
  if (
    !Number.isInteger(refreshSeconds) ||
    refreshSeconds < MIN_REFRESH_SECONDS ||
    refreshSeconds > MAX_REFRESH_SECONDS
  ) {
    errors.push({
      code: "INVALID_REFRESH_SECONDS",
      message: "refresh_seconds must be an integer from 30 to 60.",
      path: "refresh_seconds",
    });
  }

  if (!Array.isArray(raw.projects) || raw.projects.length === 0) {
    errors.push({ code: "PROJECTS_MISSING", message: "At least one project is required.", path: "projects" });
  } else {
    raw.projects.forEach((entry, index) => {
      const parsed = parseProject(entry, index);
      projectResults.push(parsed.result);
      errors.push(...parsed.errors);
      if (parsed.project) projects.push(parsed.project);
    });
  }

  const fatalErrors = errors.filter((error) =>
    ["CONFIG_NOT_OBJECT", "INVALID_SCHEMA_VERSION", "INVALID_REFRESH_SECONDS", "PROJECTS_MISSING"].includes(error.code),
  );
  if (fatalErrors.length > 0 || projects.length === 0) return { ok: false, projectResults, errors };

  return {
    ok: true,
    config: { schema_version: 1, refresh_seconds: refreshSeconds, projects },
    projectResults,
    errors,
  };
}

export function sanitizeDashboardState<T>(value: T): T {
  return sanitizeValue(value) as T;
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!isRecord(value)) return sanitizeString(value);

  const clean: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (isSecretKey(key)) continue;
    clean[key] = sanitizeValue(nested);
  }
  return clean;
}

function sanitizeString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value
    .replace(/\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]+\b/g, REDACTED)
    .replace(/\b(?:token|authorization|secret|password)\b/gi, REDACTED);
}

function isSecretKey(key: string): boolean {
  return /token|authorization|secret|password/i.test(key);
}

export type {
  DashboardConfig,
  DashboardConfigParseResult,
  DashboardDegradedSource,
  DashboardParseError,
  DashboardProjectConfig,
  DashboardProjectConfigResult,
} from "./types";
