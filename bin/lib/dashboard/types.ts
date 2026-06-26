export type DashboardSourceName = "config" | "adv" | "github" | "ops";

export interface DashboardDegradedSource {
  source: DashboardSourceName;
  code: string;
  message: string;
  last_success_at?: string;
  retry_after_seconds?: number;
  rate_limit_reset_at?: string;
  setup?: {
    title: string;
    message: string;
    commands: string[];
    env_vars: string[];
  };
}

export interface DashboardGithubConfig {
  owner: string;
  repo: string;
}

export interface DashboardProjectConfig {
  id: string;
  label: string;
  path: string;
  github: DashboardGithubConfig;
}

export interface DashboardConfig {
  schema_version: 1;
  refresh_seconds: number;
  projects: DashboardProjectConfig[];
}

export type DashboardProjectConfigResult =
  | { id: string; ok: true }
  | { id: string; ok: false; degraded: DashboardDegradedSource };

export interface DashboardParseError {
  code: string;
  message: string;
  path: string;
}

export type DashboardConfigParseResult =
  | {
      ok: true;
      config: DashboardConfig;
      projectResults: DashboardProjectConfigResult[];
      errors: DashboardParseError[];
    }
  | {
      ok: false;
      projectResults: DashboardProjectConfigResult[];
      errors: DashboardParseError[];
    };

export interface DashboardState {
  schema_version: 1;
  generated_at: string;
  refresh_seconds: number;
  projects: unknown[];
  sources?: unknown[];
}
