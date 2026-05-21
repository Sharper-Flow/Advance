// rq-toolTitle01 rq-toolTitle02 rq-toolTitle03
// ADV tool titles are deterministic display-only metadata. They preserve
// structural tool names/args as authority and redact/bound display values.
export type AdvToolTitleKind = "read" | "write" | "execute" | "operator";

export interface AdvToolTitleResult {
  title: string;
  titleKind: AdvToolTitleKind;
  metadata: {
    adv: {
      toolName: string;
      title: string;
      titleKind: AdvToolTitleKind;
      changeId?: string;
      taskId?: string;
      gateId?: string;
    };
  };
}

const TITLE_MAX_LENGTH = 96;
const VALUE_MAX_LENGTH = 64;
const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
const OSC_SEQUENCE = new RegExp(
  `${escapeRegex(ESC)}\\][^${escapeRegex(BEL)}]*(?:${escapeRegex(BEL)}|${escapeRegex(ESC)}\\\\)`,
  "g",
);
const CSI_SEQUENCE = new RegExp(`${escapeRegex(ESC)}\\[[0-?]*[ -/]*[@-~]`, "g");

type TitleBuilder = (args: Record<string, unknown>) => {
  title: string;
  titleKind: AdvToolTitleKind;
};

const STATIC_TITLES: Record<
  string,
  { title: string; titleKind: AdvToolTitleKind }
> = {
  adv_change_list: { title: "List changes", titleKind: "read" },
  adv_wip_state: { title: "Show WIP state", titleKind: "read" },
  adv_status: { title: "Show ADV status", titleKind: "read" },
  adv_project_context: { title: "Show project context", titleKind: "read" },
  adv_project_wisdom_list: {
    title: "List project wisdom",
    titleKind: "read",
  },
  adv_task_ready: { title: "Show ready tasks", titleKind: "read" },
  adv_temporal_register_search_attributes: {
    title: "Register Temporal search attributes",
    titleKind: "operator",
  },
  adv_temporal_reconnect: {
    title: "Reconnect Temporal",
    titleKind: "operator",
  },
  adv_temporal_worker_restart: {
    title: "Restart Temporal worker",
    titleKind: "operator",
  },
  adv_worktree_triage: { title: "Triage worktrees", titleKind: "read" },
  adv_session_list: { title: "List sessions", titleKind: "read" },
  worktree_cleanup: { title: "Clean up worktrees", titleKind: "operator" },
  adv_worktree_cleanup: { title: "Clean up worktrees", titleKind: "operator" },
};

const TITLE_BUILDERS: Record<string, TitleBuilder> = {
  adv_spec: (args) =>
    byAction(args, "Manage specs", {
      list: "List specs",
      show: `Show spec${suffix(args, "capability")}`,
      search: `Search specs${suffix(args, "query")}`,
    }),
  adv_roadmap: (args) => read(`Show roadmap${suffix(args, "kind")}`),
  adv_backlog_state: (args) => read(`Show backlog${suffix(args, "kind")}`),
  adv_change_show: (args) => read(`Show change${suffix(args, "changeId")}`),
  adv_change_create: (args) => write(`Create change${suffix(args, "summary")}`),
  adv_change_update: (args) =>
    write(`Update change${suffix(args, "changeId")}`),
  adv_change_close: (args) => write(`Close change${suffix(args, "changeId")}`),
  adv_change_bulk_close: () => write("Bulk close changes"),
  adv_change_validate: (args) =>
    read(`Validate change${suffix(args, "changeId")}`),
  adv_change_archive: (args) =>
    write(`Archive change${suffix(args, "changeId")}`),
  adv_change_update_issues: (args) =>
    write(`Update change issues${suffix(args, "changeId")}`),
  adv_change_reenter: (args) =>
    write(`Re-enter change${suffix(args, "changeId")}`),
  adv_contract_mint: (args) =>
    write(`Mint contract${suffix(args, "changeId")}`),
  adv_contract_review_matrix_set: (args) =>
    write(`Set contract review${suffix(args, "changeId")}`),
  adv_task_show: (args) => read(`Show task${suffix(args, "taskId")}`),
  adv_task_list: (args) => read(`List tasks${suffix(args, "changeId")}`),
  adv_task_update: (args) => write(`Update task${suffix(args, "taskId")}`),
  adv_task_add: (args) => write(`Add task${suffix(args, "changeId")}`),
  adv_task_cancel: () => write("Cancel tasks"),
  adv_task_reclassify_tdd: (args) =>
    write(`Reclassify TDD${suffix(args, "taskId")}`),
  adv_wisdom_add: (args) => write(`Add wisdom${suffix(args, "changeId")}`),
  adv_wisdom_list: (args) => read(`List wisdom${suffix(args, "changeId")}`),
  adv_snapshot_health: (args) =>
    operator(`Check snapshot health${suffix(args, "action")}`),
  adv_investment_report: (args) =>
    read(`Show investment${suffix(args, "changeId")}`),
  adv_agenda_list: () => read("List agenda"),
  adv_agenda_add: (args) => write(`Add agenda item${suffix(args, "title")}`),
  adv_agenda_start: (args) =>
    write(`Start agenda item${suffix(args, "itemId")}`),
  adv_agenda_complete: (args) =>
    write(`Complete agenda item${suffix(args, "itemId")}`),
  adv_agenda_cancel: (args) =>
    write(`Cancel agenda item${suffix(args, "itemId")}`),
  adv_agenda_prioritize: (args) =>
    write(`Prioritize agenda item${suffix(args, "itemId")}`),
  adv_project_metadata: (args) =>
    byAction(args, "Project metadata", {
      read: `Read project metadata${suffix(args, "key")}`,
      write: `Write project metadata${suffix(args, "key")}`,
      list: "List project metadata",
    }),
  adv_temporal_diagnose: (args) =>
    operator(`Diagnose Temporal${suffix(args, "changeId")}`),
  adv_gate_status: (args) =>
    read(`Show gate status${suffix(args, "changeId")}`),
  adv_gate_complete: (args) => write(`Complete gate${suffix(args, "gateId")}`),
  adv_run_test: (args) => execute(`Run test${suffix(args, "command")}`),
  adv_task_checkpoint: (args) =>
    execute(`Checkpoint task${suffix(args, "taskId")}`),
  adv_reflect: (args) => write(`Reflect on change${suffix(args, "changeId")}`),
  adv_conformance: (args) =>
    operator(`Run conformance${suffix(args, "action")}`),
  adv_worktree_create: (args) =>
    operator(`Create worktree${suffix(args, "branch")}`),
  adv_worktree_resume: (args) =>
    operator(`Resume worktree${suffix(args, "changeId", "branch")}`),
  adv_worktree_delete: (args) =>
    operator(`Delete worktree${suffix(args, "branch")}`),
  worktree_create: (args) =>
    operator(`Create worktree${suffix(args, "branch")}`),
  worktree_delete: (args) =>
    operator(`Delete worktree${suffix(args, "branch")}`),
  adv_session_show: (args) => read(`Show session${suffix(args, "sessionId")}`),
};

export function formatAdvToolTitle(
  toolName: string,
  rawArgs: unknown,
): AdvToolTitleResult {
  const args = asRecord(rawArgs);
  const base = STATIC_TITLES[toolName] ??
    TITLE_BUILDERS[toolName]?.(args) ?? {
      title: titleizeToolName(toolName),
      titleKind: "operator" as const,
    };
  const title = truncate(base.title, TITLE_MAX_LENGTH);
  const ids = extractDisplayIds(args);

  return {
    title,
    titleKind: base.titleKind,
    metadata: {
      adv: {
        toolName,
        title,
        titleKind: base.titleKind,
        ...ids,
      },
    },
  };
}

export function hasExplicitAdvToolTitle(toolName: string): boolean {
  return toolName in STATIC_TITLES || toolName in TITLE_BUILDERS;
}

function read(title: string) {
  return { title, titleKind: "read" as const };
}

function write(title: string) {
  return { title, titleKind: "write" as const };
}

function execute(title: string) {
  return { title, titleKind: "execute" as const };
}

function operator(title: string) {
  return { title, titleKind: "operator" as const };
}

function byAction(
  args: Record<string, unknown>,
  fallback: string,
  titles: Record<string, string>,
) {
  const action = typeof args.action === "string" ? args.action : "";
  const title = titles[action] ?? fallback;
  return action === "show" ||
    action === "read" ||
    action === "list" ||
    action === "search"
    ? read(title)
    : write(title);
}

function suffix(args: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return `: ${sanitizeDisplayValue(key, value)}`;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return `: ${String(value)}`;
    }
  }
  return "";
}

function extractDisplayIds(args: Record<string, unknown>) {
  const result: { changeId?: string; taskId?: string; gateId?: string } = {};
  for (const key of ["changeId", "taskId", "gateId"] as const) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) {
      result[key] = sanitizeDisplayValue(key, value);
    }
  }
  return result;
}

function asRecord(rawArgs: unknown): Record<string, unknown> {
  return rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
    ? (rawArgs as Record<string, unknown>)
    : {};
}

function sanitizeDisplayValue(key: string, value: string): string {
  if (isSensitiveKey(key)) return "[redacted]";
  return truncate(
    redactSensitivePatterns(stripControlSequences(value)),
    VALUE_MAX_LENGTH,
  );
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[_-]/g, "").toLowerCase();
  return [
    "password",
    "passwd",
    "pwd",
    "token",
    "secret",
    "apikey",
    "credential",
    "privatekey",
  ].some((sensitive) => normalized.includes(sensitive));
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripControlSequences(value: string): string {
  return value
    .replace(OSC_SEQUENCE, "")
    .replace(CSI_SEQUENCE, "")
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      return code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? " " : char;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function redactSensitivePatterns(value: string): string {
  return value
    .replace(/(authorization\s*:\s*bearer\s+)[^\s"']+/gi, "$1[redacted]")
    .replace(
      /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*)=([^\s]+)/gi,
      "$1=[redacted]",
    )
    .replace(
      /(--?(?:token|secret|password|api-key|private-key|credential)(?:=|\s+))[^\s]+/gi,
      "$1[redacted]",
    );
}

function titleizeToolName(toolName: string): string {
  const name = toolName.replace(/^adv_/, "").replace(/_/g, " ");
  return name.charAt(0).toUpperCase() + name.slice(1);
}
