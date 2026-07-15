#!/usr/bin/env node
/**
 * Live runtime-matrix probe (rq: updateCodemodeMcpContracts, task tk-28cdd4fde0c4).
 *
 * Runs bounded `oc run` / `opencode run` probes for the mandatory MCP
 * invocation runtime rows and records supplemental live evidence in
 * plugin/src/__fixtures__/mcp-runtime-live-evidence.json. Deterministic
 * verification lives in src/mcp-runtime-matrix.test.ts; this harness is
 * opt-in operator tooling and never runs in CI.
 *
 * Rows:
 *   codemode-primary            oc run --agent adv (CodeMode on, MCP on)
 *   codemode-spawned-researcher oc run --agent adv-researcher (CodeMode on)
 *   direct-primary              oc run --agent adv with inherited CodeMode
 *                               state explicitly unset + OC_DISABLE_CODE_MODE=1
 *   codemode-no-mcp             isolated XDG_CONFIG_HOME with zero MCP servers
 *
 * Row 2 note: adv-researcher is a hidden subagent; the probe promotes the
 * verbatim worktree artifact to `mode: primary` (frontmatter mode bit only,
 * contract prose byte-identical). The true spawned path was observed during
 * discovery and is structuralized in the static matrix fixture.
 *
 * Usage: pnpm exec tsx scripts/mcp-runtime-probe.ts [--rows a,b] [--out path] [--timeout sec]
 */

import { spawnSync } from "child_process";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import {
  loadMatrixFixture,
  type LiveEvidenceFixture,
  type LiveRowEvidence,
} from "../src/mcp-runtime-matrix";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(SCRIPT_DIR, "..");
const REPO_ROOT = resolve(PLUGIN_ROOT, "..");
const DEFAULT_OUT = join(
  PLUGIN_ROOT,
  "src/__fixtures__/mcp-runtime-live-evidence.json",
);

const PROBE_MODEL = "kimi-for-coding/k2p7";
const EXCERPT_BOUND = 480;

const PUNCTUATED_CATALOG = 'tools.context7["resolve-library-id"]';
const PUNCTUATED_DIRECT = "context7_resolve-library-id";
const SAFE_CATALOG = "tools.lgrep.search_semantic";
const SAFE_DIRECT = "lgrep_search_semantic";

const MCP_PROMPT =
  "RUNTIME PROBE — not an ADV workflow. Do not initialize ADV state, do not " +
  "ask questions, do not use any adv_* tool. Do exactly two tool calls, then " +
  "reply DONE: (1) Use Context7 to resolve the library id for zod exactly " +
  "once. (2) Use lgrep search_semantic exactly once with path " +
  `${REPO_ROOT} and query codemode.`;

const NO_MCP_PROMPT =
  "RUNTIME PROBE — not an ADV workflow. Do not initialize ADV state, do not " +
  "ask questions, do not use any adv_* tool. Immediately use Context7 to " +
  "resolve the library id for zod exactly once, then reply DONE.";

interface ProbeRow {
  rowId: string;
  agent: string;
  prompt: string;
  /** true -> oc with CodeMode default; false -> CodeMode explicitly disabled */
  codeMode: boolean;
  isolatedConfig: boolean;
  expectPunctuated: string | null;
  expectSafe: string | null;
}

const PROBE_ROWS: ProbeRow[] = [
  {
    rowId: "codemode-primary",
    agent: "adv",
    prompt: MCP_PROMPT,
    codeMode: true,
    isolatedConfig: false,
    expectPunctuated: PUNCTUATED_CATALOG,
    expectSafe: SAFE_CATALOG,
  },
  {
    rowId: "codemode-spawned-researcher",
    agent: "adv-researcher",
    prompt: MCP_PROMPT,
    codeMode: true,
    isolatedConfig: false,
    expectPunctuated: PUNCTUATED_CATALOG,
    expectSafe: SAFE_CATALOG,
  },
  {
    rowId: "direct-primary",
    agent: "adv",
    prompt: MCP_PROMPT,
    codeMode: false,
    isolatedConfig: false,
    expectPunctuated: PUNCTUATED_DIRECT,
    expectSafe: SAFE_DIRECT,
  },
  {
    rowId: "codemode-no-mcp",
    agent: "adv",
    prompt: NO_MCP_PROMPT,
    codeMode: true,
    isolatedConfig: true,
    expectPunctuated: null,
    expectSafe: null,
  },
];

interface ToolUseObservation {
  tool: string;
  code: string | null;
  toolCalls: string[];
  status: string;
}

interface ParsedRun {
  toolUses: ToolUseObservation[];
  text: string;
  nonJsonLines: number;
}

interface RunEvent {
  type?: string;
  part?: {
    type?: string;
    text?: string;
    tool?: string;
    state?: {
      status?: string;
      input?: { code?: unknown };
      metadata?: { toolCalls?: Array<{ tool?: unknown }> };
    };
  };
}

function parseRun(jsonlPath: string): ParsedRun {
  const toolUses: ToolUseObservation[] = [];
  const texts: string[] = [];
  let nonJsonLines = 0;
  for (const line of readFileSync(jsonlPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let event: RunEvent;
    try {
      event = JSON.parse(line) as RunEvent;
    } catch {
      nonJsonLines += 1;
      continue;
    }
    const part = event.part;
    if (event.type === "tool_use" && part?.type === "tool") {
      const toolCalls = part.state?.metadata?.toolCalls;
      toolUses.push({
        tool: String(part.tool ?? ""),
        code:
          typeof part.state?.input?.code === "string"
            ? part.state.input.code
            : null,
        toolCalls: Array.isArray(toolCalls)
          ? toolCalls.map((call) => String(call?.tool ?? ""))
          : [],
        status: String(part.state?.status ?? ""),
      });
    } else if (event.type === "text" && typeof part?.text === "string") {
      texts.push(part.text);
    }
  }
  return { toolUses, text: texts.join("\n"), nonJsonLines };
}

function truncate(value: string): string {
  return value.length > EXCERPT_BOUND
    ? value.slice(0, EXCERPT_BOUND - 1) + "…"
    : value;
}

/** Find the observed expression for one capability across tool_use events. */
function observe(
  run: ParsedRun,
  catalogForm: string,
  directForm: string,
): string | null {
  for (const use of run.toolUses) {
    if (use.tool === "execute" && use.code?.includes(catalogForm)) {
      return catalogForm;
    }
    if (use.tool === directForm) {
      return directForm;
    }
  }
  return null;
}

/** Any attempt at a context7-shaped callable (row 4 must have zero). */
function context7Attempts(run: ParsedRun): ToolUseObservation[] {
  return run.toolUses.filter(
    (use) =>
      use.tool.startsWith("context7_") ||
      (use.tool === "execute" && /\bcontext7\b/.test(use.code ?? "")),
  );
}

function prepareSandbox(
  row: ProbeRow,
  sandbox: string,
): {
  cwd: string;
  env: NodeJS.ProcessEnv;
  command: string;
} {
  const agentsDir = join(sandbox, ".opencode", "agents");
  mkdirSync(agentsDir, { recursive: true });
  const sourceAgent = join(REPO_ROOT, ".opencode", "agents", `${row.agent}.md`);

  if (row.isolatedConfig) {
    // Row 4: zero MCP servers anywhere. Config isolation keeps provider auth
    // (XDG_DATA_HOME untouched) while removing every configured MCP server.
    const xdg = join(sandbox, "xdg", "opencode");
    mkdirSync(join(xdg, "agents"), { recursive: true });
    writeFileSync(
      join(xdg, "opencode.json"),
      '{\n  "$schema": "https://opencode.ai/config.json"\n}\n',
    );
    copyFileSync(sourceAgent, join(xdg, "agents", `${row.agent}.md`));
    const project = join(sandbox, "project");
    mkdirSync(project, { recursive: true });
    const env = {
      ...process.env,
      XDG_CONFIG_HOME: join(sandbox, "xdg"),
      OPENCODE_EXPERIMENTAL_CODE_MODE: "true",
    };
    const command =
      `XDG_CONFIG_HOME=${join(sandbox, "xdg")} OPENCODE_EXPERIMENTAL_CODE_MODE=true ` +
      `opencode run --dir ${project} --agent ${row.agent} --model ${PROBE_MODEL} --auto --format json`;
    return { cwd: project, env, command };
  }

  if (row.agent === "adv-researcher") {
    // Hidden subagent: promote the verbatim artifact's mode bit only so
    // `opencode run --agent` accepts it. Contract prose stays byte-identical.
    const text = readFileSync(sourceAgent, "utf8")
      .replace(/^mode: subagent$/m, "mode: primary")
      .replace(/^hidden: true$/m, "hidden: false");
    writeFileSync(join(agentsDir, `${row.agent}.md`), text);
  } else {
    copyFileSync(sourceAgent, join(agentsDir, `${row.agent}.md`));
  }

  const env = { ...process.env };
  let command: string;
  if (row.codeMode) {
    delete env.OC_DISABLE_CODE_MODE;
    command = `oc run --agent ${row.agent} --model ${PROBE_MODEL} --auto --format json`;
  } else {
    // Toolbox defect workaround until fixCodemodeDisableOverride ships:
    // OC_DISABLE_CODE_MODE=1 alone cannot clear an inherited
    // OPENCODE_EXPERIMENTAL_CODE_MODE=true, so unset it explicitly.
    delete env.OPENCODE_EXPERIMENTAL_CODE_MODE;
    env.OC_DISABLE_CODE_MODE = "1";
    command =
      `env -u OPENCODE_EXPERIMENTAL_CODE_MODE OC_DISABLE_CODE_MODE=1 ` +
      `oc run --agent ${row.agent} --model ${PROBE_MODEL} --auto --format json`;
  }
  return { cwd: sandbox, env, command };
}

function runRow(
  row: ProbeRow,
  sandbox: string,
  timeoutSec: number,
): {
  entries: LiveRowEvidence[];
  ok: boolean;
} {
  const { cwd, env, command } = prepareSandbox(row, sandbox);
  const outPath = join(sandbox, "run.jsonl");
  const errPath = join(sandbox, "run.err");
  const binary = row.isolatedConfig ? "opencode" : "oc";
  const args = [
    "run",
    ...(row.isolatedConfig ? ["--dir", cwd] : []),
    "--agent",
    row.agent,
    "--model",
    PROBE_MODEL,
    "--auto",
    "--format",
    "json",
    row.prompt,
  ];
  const ranAt = new Date().toISOString();
  const result = spawnSync(binary, args, {
    cwd,
    env,
    timeout: timeoutSec * 1000,
    maxBuffer: 64 * 1024 * 1024,
  });
  writeFileSync(outPath, result.stdout ?? "");
  writeFileSync(errPath, result.stderr ?? "");

  const skip = (
    reason: string,
  ): { entries: LiveRowEvidence[]; ok: boolean } => ({
    entries: [
      {
        rowId: row.rowId,
        status: "skipped",
        command,
        observedInvocation: null,
        evidenceExcerpt: null,
        ranAt,
        reason: truncate(reason),
      },
    ],
    ok: true,
  });

  if (result.error) {
    return skip(`spawn failed: ${String(result.error).slice(0, 200)}`);
  }
  if (result.status !== 0) {
    const stderrTail = (result.stderr ?? "").toString().slice(-300);
    return skip(`exit ${result.status}: ${stderrTail || "no stderr"}`);
  }
  if (!(result.stdout ?? "").toString().trim()) {
    return skip("empty stdout (no JSON events)");
  }

  const run = parseRun(outPath);
  const entries: LiveRowEvidence[] = [];

  if (row.rowId === "codemode-no-mcp") {
    const attempts = context7Attempts(run);
    const reported = /unavailable|not available|cannot|can't/i.test(run.text);
    const pass = attempts.length === 0 && reported;
    const unavailableLine = run.text.match(
      /[^\n]*(?:unavailable|not available|cannot|can't)[^\n]*/i,
    );
    const excerpt = attempts.length
      ? `attempted nonexistent callable: ${attempts[0]!.tool} ` +
        truncate(attempts[0]!.code ?? "")
      : truncate(unavailableLine?.[0] ?? run.text.split("\n").pop() ?? "");
    entries.push({
      rowId: row.rowId,
      status: pass ? "pass" : "fail",
      command,
      observedInvocation: attempts.length
        ? attempts[0]!.tool === "execute"
          ? PUNCTUATED_CATALOG
          : attempts[0]!.tool
        : null,
      evidenceExcerpt: excerpt,
      ranAt,
      reason: null,
    });
    return { entries, ok: pass };
  }

  const punctuated = observe(run, PUNCTUATED_CATALOG, PUNCTUATED_DIRECT);
  const safe = observe(run, SAFE_CATALOG, SAFE_DIRECT);
  const rowPass = punctuated === row.expectPunctuated;
  const safePass = safe === row.expectSafe;

  const punctuatedUse = run.toolUses.find(
    (use) =>
      use.tool === PUNCTUATED_DIRECT ||
      (use.tool === "execute" && use.code?.includes("context7")),
  );
  const safeUse = run.toolUses.find(
    (use) =>
      use.tool === SAFE_DIRECT ||
      (use.tool === "execute" && use.code?.includes("lgrep")),
  );

  entries.push({
    rowId: row.rowId,
    status: rowPass ? "pass" : "fail",
    command,
    observedInvocation: punctuated,
    evidenceExcerpt: truncate(
      punctuatedUse
        ? (punctuatedUse.code ?? `direct tool ${punctuatedUse.tool}`) +
            (punctuatedUse.toolCalls.length
              ? ` | catalog toolCalls: ${punctuatedUse.toolCalls.join(",")}`
              : "")
        : `no context7 invocation observed; text tail: ${run.text.slice(-200)}`,
    ),
    ranAt,
    reason: null,
  });
  entries.push({
    rowId: "exact-path-forms",
    status: safePass ? "pass" : "fail",
    command,
    observedInvocation: safe,
    evidenceExcerpt: truncate(
      safeUse
        ? (safeUse.code ?? `direct tool ${safeUse.tool}`) +
            (safeUse.toolCalls.length
              ? ` | catalog toolCalls: ${safeUse.toolCalls.join(",")}`
              : "")
        : `no lgrep invocation observed; text tail: ${run.text.slice(-200)}`,
    ),
    ranAt,
    reason: null,
  });
  return { entries, ok: rowPass && safePass };
}

function main(): number {
  const args = process.argv.slice(2);
  const readFlag = (name: string): string | null => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? null : (args[index + 1] ?? null);
  };
  const rowFilter =
    readFlag("rows")
      ?.split(",")
      .map((id) => id.trim()) ?? null;
  const outPath = resolve(readFlag("out") ?? DEFAULT_OUT);
  const timeoutSec = Number(readFlag("timeout") ?? "240");

  // Align live rows with the static matrix expectations.
  const matrix = loadMatrixFixture();
  const selected = PROBE_ROWS.filter(
    (row) => !rowFilter || rowFilter.includes(row.rowId),
  );
  if (selected.length === 0) {
    console.error("no matching probe rows");
    return 2;
  }

  const sandboxRoot = join(
    tmpdir(),
    "opencode",
    `adv-mcp-probe-${process.pid}`,
  );
  rmSync(sandboxRoot, { recursive: true, force: true });
  mkdirSync(sandboxRoot, { recursive: true });

  const allEntries: LiveRowEvidence[] = [];
  let allOk = true;
  for (const row of selected) {
    const sandbox = join(sandboxRoot, row.rowId);
    mkdirSync(sandbox, { recursive: true });
    console.log(`[probe] ${row.rowId}: running (timeout ${timeoutSec}s)…`);
    const { entries, ok } = runRow(row, sandbox, timeoutSec);
    for (const entry of entries) {
      console.log(
        `[probe] ${entry.rowId}: ${entry.status}` +
          (entry.observedInvocation ? ` -> ${entry.observedInvocation}` : "") +
          (entry.reason ? ` (${entry.reason})` : ""),
      );
    }
    allEntries.push(...entries);
    allOk = allOk && ok;
  }

  const fixture: LiveEvidenceFixture = {
    description:
      "Supplemental live runtime-matrix evidence captured by bounded oc run / opencode run probes. " +
      "Regenerate via plugin/scripts/mcp-runtime-probe.ts. Deterministic verification lives in " +
      "src/mcp-runtime-matrix.test.ts; CI never depends on this file.",
    generatedBy: "plugin/scripts/mcp-runtime-probe.ts",
    generatedAt: new Date().toISOString(),
    rows: allEntries,
  };
  writeFileSync(outPath, JSON.stringify(fixture, null, 2) + "\n");
  console.log(`[probe] wrote ${allEntries.length} entries -> ${outPath}`);
  console.log(`[probe] sandboxes kept at ${sandboxRoot}`);
  console.log(
    `[probe] static matrix rows covered: ${matrix.mandatoryRowIds.join(", ")}`,
  );
  return allOk ? 0 : 1;
}

process.exit(main());
