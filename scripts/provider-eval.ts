#!/usr/bin/env bun
/**
 * Provider Evaluation Harness
 *
 * Compares LLM instruction adherence with and without provider-specific hints.
 * Uses IFEval-style deterministic rubric scoring (no LLM judge).
 *
 * Usage:
 *   bun run scripts/provider-eval.ts --provider glm
 *   bun run scripts/provider-eval.ts --provider kimi
 *   bun run scripts/provider-eval.ts --all
 *
 * Requires OPENROUTER_API_KEY environment variable.
 */

import { parseArgs } from "node:util";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join, basename } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TestPrompt {
  id: string;
  category: string;
  provider_targets: string[];
  query: string;
  expected_patterns: string[];
  forbidden_patterns: string[];
  notes?: string;
}

interface TestPromptFile {
  version: number;
  provider: string;
  prompts: TestPrompt[];
}

interface ProviderConfig {
  model_id: string;
  name: string;
  hint_file: string;
  prompt_files: string[];
}

interface ScoreResult {
  prompt_id: string;
  variant: "baseline" | "with_hint";
  dimension_scores: {
    rule_retention: number;
    tool_routing: number;
    scope_discipline: number;
    provider_specific: number;
    extraneous_output: number;
  };
  aggregate: number;
  details: {
    expected_hits: string[];
    expected_misses: string[];
    forbidden_hits: string[];
  };
}

interface ResponseData {
  prompt_id: string;
  variant: "baseline" | "with_hint";
  content: string;
  tokens: number;
  latency_ms: number;
  model: string;
  error?: string;
}

interface ProviderScorecard {
  provider: string;
  model_id: string;
  run_id: string;
  timestamp: string;
  baseline: {
    aggregate: number;
    dimension_averages: Record<string, number>;
    prompts_run: number;
    prompts_skipped: number;
  };
  with_hint: {
    aggregate: number;
    dimension_averages: Record<string, number>;
    prompts_run: number;
    prompts_skipped: number;
  };
  delta: {
    aggregate: number;
    dimensions: Record<string, number>;
  };
  prompts_total: number;
  cost_estimate_usd: number;
}

interface PromptSizeMetric {
  bytes: number;
  lines: number;
}

interface PromptSizeMetrics {
  generated_provider_file: PromptSizeMetric | null;
  selected_agent_runtime_prompt: PromptSizeMetric;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CONFIG = {
  temperature: 0,
  max_tokens: 4096,
  base_url: "https://openrouter.ai/api/v1/chat/completions",
  retry: { attempts: 3, delays: [5000, 10000, 20000] },
};

const REPO_ROOT = join(import.meta.dir, "..");
const SCRIPTS_DIR = import.meta.dir;
const PROMPTS_DIR = join(SCRIPTS_DIR, "provider-eval-prompts");
const RESULTS_DIR = join(SCRIPTS_DIR, "provider-eval-results");

const PROVIDERS: Record<string, ProviderConfig> = {
  glm: {
    model_id: "z-ai/glm-5.1",
    name: "GLM-5.1",
    hint_file: join(REPO_ROOT, ".opencode/agent-parts/providers/glm.md"),
    prompt_files: ["shared.yaml", "glm.yaml"],
  },
  kimi: {
    model_id: "moonshotai/kimi-k2.6",
    name: "Kimi K2.6",
    hint_file: join(REPO_ROOT, ".opencode/agent-parts/providers/kimi.md"),
    prompt_files: ["shared.yaml", "kimi.yaml"],
  },
  claude: {
    model_id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    hint_file: join(REPO_ROOT, ".opencode/agent-parts/providers/claude.md"),
    prompt_files: ["shared.yaml", "claude.yaml"],
  },
  gpt: {
    model_id: "openai/gpt-5.4",
    name: "GPT-5.4",
    hint_file: join(REPO_ROOT, ".opencode/agent-parts/providers/gpt.md"),
    prompt_files: ["shared.yaml", "gpt.yaml"],
  },
};

// Filler phrases that indicate extraneous output
const FILLER_PATTERNS = [
  /\bI'd be happy to\b/i,
  /\bSure!?\s*/i,
  /\bCertainly!?\s*/i,
  /\bOf course!?\s*/i,
  /\bLet me help\b/i,
  /\bI'll help you\b/i,
  /\bI can (help|assist)\b/i,
  /\bGreat question!?\s*/i,
];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseCLI() {
  const { values } = parseArgs({
    options: {
      provider: { type: "string", short: "p" },
      all: { type: "boolean", short: "a", default: false },
      temperature: { type: "string" },
      "max-tokens": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });

  if (values.help) {
    console.log(`Provider Evaluation Harness

Usage:
  bun run scripts/provider-eval.ts --provider <glm|kimi|claude|gpt>
  bun run scripts/provider-eval.ts --all
  bun run scripts/provider-eval.ts --help

Options:
  -p, --provider <name>   Run evaluation for a specific provider
  -a, --all               Run evaluation for all configured providers
  --temperature <num>     Override default temperature (default: 0)
  --max-tokens <num>      Override max output tokens (default: 4096)
  -h, --help              Show this help

Requires OPENROUTER_API_KEY environment variable.
Results stored in scripts/provider-eval-results/<run-id>/`);
    process.exit(0);
  }

  if (values.temperature) {
    CONFIG.temperature = parseFloat(values.temperature);
  }
  if (values["max-tokens"]) {
    CONFIG.max_tokens = parseInt(values["max-tokens"], 10);
  }

  if (values.all) {
    return { providers: Object.keys(PROVIDERS) };
  }

  const providerName = values.provider;
  if (!providerName) {
    console.error(
      "Error: --provider <name> or --all required. Use --help for usage.",
    );
    process.exit(1);
  }

  if (!PROVIDERS[providerName]) {
    console.error(
      `Error: unknown provider "${providerName}". Available: ${Object.keys(PROVIDERS).join(", ")}`,
    );
    process.exit(1);
  }

  return { providers: [providerName] };
}

// ---------------------------------------------------------------------------
// Prompt Composition (mirrors sync-global.sh lines 342-374)
// ---------------------------------------------------------------------------

/**
 * Strip YAML frontmatter (--- delimited) from adv.md content.
 */
function stripFrontmatter(content: string): string {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return content;
  const end = trimmed.indexOf("---", 3);
  if (end === -1) return content;
  return trimmed.slice(end + 3).trimStart();
}

function composeSystemPrompt(
  canonicalContent: string,
  hintContent: string | null,
): string {
  const stripped = stripFrontmatter(canonicalContent);

  if (!hintContent) return stripped; // baseline: no hint

  // Replicates sync-global.sh concatenated prompt file:
  // agent-parts/advance/adv-{provider}.md = canonical body + provider hint
  return `${stripped}\n\n${hintContent}`;
}

function countLines(content: string): number {
  if (content.length === 0) return 0;
  return content.split(/\r?\n/).length;
}

function sizeOfContent(content: string): PromptSizeMetric {
  return {
    bytes: Buffer.byteLength(content, "utf8"),
    lines: countLines(content),
  };
}

function formatSize(metric: PromptSizeMetric): string {
  return `${metric.lines} lines / ${metric.bytes} bytes`;
}

function collectPromptSizeMetrics(input: {
  generatedProviderPath: string;
  runtimePrompt: string;
}): PromptSizeMetrics {
  const generated_provider_file = existsSync(input.generatedProviderPath)
    ? {
        bytes: statSync(input.generatedProviderPath).size,
        lines: countLines(readFileSync(input.generatedProviderPath, "utf8")),
      }
    : null;

  return {
    generated_provider_file,
    selected_agent_runtime_prompt: sizeOfContent(input.runtimePrompt),
  };
}

function loadCanonicalAdvPrompt(globalHome: string): {
  source: string;
  content: string;
} {
  const localCanonical = join(REPO_ROOT, ".opencode/agents/adv.md");
  const globalPromptPart = join(
    globalHome,
    "opencode/agent-parts/advance/adv.md",
  );

  if (existsSync(localCanonical)) {
    return {
      source: localCanonical,
      content: readFileSync(localCanonical, "utf8"),
    };
  }

  if (existsSync(globalPromptPart)) {
    return {
      source: globalPromptPart,
      content: readFileSync(globalPromptPart, "utf8"),
    };
  }

  console.error(
    `Error: canonical ADV prompt not found at ${localCanonical} or ${globalPromptPart}`,
  );
  process.exit(1);
}

function loadProviderHint(
  providerName: string,
  config: ProviderConfig,
  globalHome: string,
): { source: string; content: string } | null {
  const globalHintPart = join(
    globalHome,
    "opencode/agent-parts/advance/providers",
    `${providerName}.md`,
  );

  if (existsSync(config.hint_file)) {
    return {
      source: config.hint_file,
      content: readFileSync(config.hint_file, "utf8"),
    };
  }

  if (existsSync(globalHintPart)) {
    return {
      source: globalHintPart,
      content: readFileSync(globalHintPart, "utf8"),
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// OpenRouter API Client
// ---------------------------------------------------------------------------

interface APIResponse {
  content: string;
  tokens: number;
  latency_ms: number;
  model: string;
}

async function callOpenRouter(
  systemPrompt: string,
  userQuery: string,
  modelId: string,
): Promise<APIResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable required");
  }

  const body = {
    model: modelId,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userQuery },
    ],
    temperature: CONFIG.temperature,
    max_tokens: CONFIG.max_tokens,
  };

  for (let attempt = 0; attempt < CONFIG.retry.attempts; attempt++) {
    const start = Date.now();

    try {
      const response = await fetch(CONFIG.base_url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/anomalyco/opencode",
          "X-Title": "ADV Provider Eval",
        },
        body: JSON.stringify(body),
      });

      const latency_ms = Date.now() - start;

      if (response.status === 429 || response.status >= 500) {
        const delay = CONFIG.retry.delays[attempt] ?? 20000;
        console.log(
          `    Retry ${attempt + 1}/${CONFIG.retry.attempts} after ${response.status} (waiting ${delay}ms)`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} ${errorText}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage?: { total_tokens: number };
        model?: string;
      };

      return {
        content: data.choices?.[0]?.message?.content ?? "(no content)",
        tokens: data.usage?.total_tokens ?? 0,
        latency_ms,
        model: data.model ?? modelId,
      };
    } catch (err) {
      if (
        attempt < CONFIG.retry.attempts - 1 &&
        err instanceof Error &&
        !err.message.startsWith("API error")
      ) {
        const delay = CONFIG.retry.delays[attempt] ?? 20000;
        console.log(
          `    Network error, retry ${attempt + 1}/${CONFIG.retry.attempts} (waiting ${delay}ms)`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Failed after ${CONFIG.retry.attempts} attempts`);
}

// ---------------------------------------------------------------------------
// Rubric Scorer
// ---------------------------------------------------------------------------

function matchesPattern(text: string, pattern: string): boolean {
  try {
    return new RegExp(pattern, "i").test(text);
  } catch {
    return text.toLowerCase().includes(pattern.toLowerCase());
  }
}

function countFillerRatio(text: string): number {
  let fillerCount = 0;
  for (const pat of FILLER_PATTERNS) {
    if (pat.test(text)) fillerCount++;
  }
  // Normalize: 0 fillers = 1.0 (best), 3+ = 0.0 (worst)
  return Math.max(0, 1 - fillerCount / 3);
}

function scoreResponse(prompt: TestPrompt, response: string): ScoreResult {
  // Rule retention: expected patterns must appear, forbidden must not
  const expected_hits: string[] = [];
  const expected_misses: string[] = [];
  const forbidden_hits: string[] = [];

  for (const pat of prompt.expected_patterns) {
    if (matchesPattern(response, pat)) {
      expected_hits.push(pat);
    } else {
      expected_misses.push(pat);
    }
  }

  for (const pat of prompt.forbidden_patterns) {
    if (matchesPattern(response, pat)) {
      forbidden_hits.push(pat);
    }
  }

  const rule_retention =
    prompt.expected_patterns.length + prompt.forbidden_patterns.length > 0
      ? (expected_hits.length +
          (prompt.forbidden_patterns.length - forbidden_hits.length)) /
        (prompt.expected_patterns.length + prompt.forbidden_patterns.length)
      : 1;

  // Tool routing: check if expected tool names appear
  const tool_routing =
    prompt.expected_patterns.length > 0
      ? expected_hits.length / prompt.expected_patterns.length
      : 1;

  // Scope discipline: no forbidden patterns = 1.0
  const scope_discipline =
    prompt.forbidden_patterns.length > 0
      ? 1 - forbidden_hits.length / prompt.forbidden_patterns.length
      : 1;

  // Provider-specific: placeholder for per-provider checks (always 1 in generic scorer)
  const provider_specific = 1;

  // Extraneous output: low filler ratio = good
  const extraneous_output = countFillerRatio(response);

  // Weighted aggregate
  const aggregate =
    rule_retention * 0.3 +
    tool_routing * 0.25 +
    scope_discipline * 0.25 +
    provider_specific * 0.1 +
    extraneous_output * 0.1;

  return {
    prompt_id: prompt.id,
    variant: "baseline", // will be overridden by caller
    dimension_scores: {
      rule_retention: Math.round(rule_retention * 100) / 100,
      tool_routing: Math.round(tool_routing * 100) / 100,
      scope_discipline: Math.round(scope_discipline * 100) / 100,
      provider_specific: Math.round(provider_specific * 100) / 100,
      extraneous_output: Math.round(extraneous_output * 100) / 100,
    },
    aggregate: Math.round(aggregate * 1000) / 1000,
    details: { expected_hits, expected_misses, forbidden_hits },
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function loadPrompts(providerName: string): TestPrompt[] {
  const config = PROVIDERS[providerName];
  if (!config) return [];

  const prompts: TestPrompt[] = [];

  for (const file of config.prompt_files) {
    const filePath = join(PROMPTS_DIR, file);
    if (!existsSync(filePath)) {
      console.log(`  ⚠  Prompt file not found: ${file} (skipping)`);
      continue;
    }

    const raw = readFileSync(filePath, "utf-8");
    const parsed = Bun.YAML.parse(raw) as TestPromptFile;

    if (!parsed?.prompts) {
      console.log(`  ⚠  No prompts found in ${file}`);
      continue;
    }

    for (const p of parsed.prompts) {
      if (
        p.provider_targets &&
        !p.provider_targets.includes(providerName) &&
        parsed.provider !== "shared"
      ) {
        continue;
      }
      prompts.push(p);
    }
  }

  return prompts;
}

async function runEvaluation(providerName: string): Promise<void> {
  const config = PROVIDERS[providerName];
  if (!config) {
    console.error(`Unknown provider: ${providerName}`);
    return;
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`Provider Evaluation: ${config.name} (${config.model_id})`);
  console.log(`${"=".repeat(70)}\n`);

  // Load canonical ADV prompt from repo source, falling back to synced prompt parts.
  // Generated provider agent files include frontmatter; canonical source stays
  // the repo/local prompt parts so metrics can separate body size from agent
  // wrapper size.
  const globalHome =
    process.env.XDG_CONFIG_HOME || join(process.env.HOME || "/tmp", ".config");
  const canonical = loadCanonicalAdvPrompt(globalHome);
  const canonicalContent = canonical.content;
  console.log(`  Canonical source: ${canonical.source}`);

  // Load provider hint from repo source, falling back to synced prompt parts.
  const hint = loadProviderHint(providerName, config, globalHome);
  const hintContent = hint?.content ?? null;
  if (hint) {
    console.log(
      `Provider hint loaded: ${basename(hint.source)} (${hint.content.split("\n").length} lines)`,
    );
  } else {
    console.log(`⚠  No provider hint found at ${config.hint_file}`);
  }

  // Compose system prompts
  const baselinePrompt = composeSystemPrompt(canonicalContent, null);
  const hintPrompt = composeSystemPrompt(canonicalContent, hintContent);
  const promptMetrics = collectPromptSizeMetrics({
    generatedProviderPath: join(
      globalHome,
      "opencode/agents",
      `adv-${providerName}.md`,
    ),
    runtimePrompt: hintPrompt,
  });

  console.log(`System prompt A (baseline): ${baselinePrompt.length} chars`);
  console.log(`System prompt B (with hint): ${hintPrompt.length} chars`);
  console.log(`Delta: +${hintPrompt.length - baselinePrompt.length} chars`);
  if (promptMetrics.generated_provider_file) {
    console.log(
      `Generated provider file: ${formatSize(promptMetrics.generated_provider_file)}`,
    );
  } else {
    console.log("Generated provider file: unavailable");
  }
  console.log(
    `Selected-agent runtime prompt: ${formatSize(promptMetrics.selected_agent_runtime_prompt)}\n`,
  );

  // Load test prompts
  const prompts = loadPrompts(providerName);
  if (prompts.length === 0) {
    console.error(
      "No test prompts loaded. Check YAML files in provider-eval-prompts/",
    );
    process.exit(1);
  }
  console.log(`Loaded ${prompts.length} test prompts\n`);

  // Run evaluations
  const responses: ResponseData[] = [];
  const scores: ScoreResult[] = [];
  let totalTokens = 0;
  let skipped = 0;

  for (const prompt of prompts) {
    console.log(`  Testing ${prompt.id}...`);

    for (const variant of ["baseline", "with_hint"] as const) {
      const sysPrompt = variant === "baseline" ? baselinePrompt : hintPrompt;

      try {
        const result = await callOpenRouter(
          sysPrompt,
          prompt.query,
          config.model_id,
        );
        totalTokens += result.tokens;

        const response: ResponseData = {
          prompt_id: prompt.id,
          variant,
          content: result.content,
          tokens: result.tokens,
          latency_ms: result.latency_ms,
          model: result.model,
        };
        responses.push(response);

        const score = scoreResponse(prompt, result.content);
        score.variant = variant;
        scores.push(score);

        const mark =
          score.aggregate >= 0.8 ? "✓" : score.aggregate >= 0.5 ? "~" : "✗";
        console.log(
          `    ${variant}: ${mark} ${score.aggregate.toFixed(3)} (${result.latency_ms}ms, ${result.tokens} tokens)`,
        );
      } catch (err) {
        skipped++;
        responses.push({
          prompt_id: prompt.id,
          variant,
          content: `ERROR: ${err}`,
          tokens: 0,
          latency_ms: 0,
          model: config.model_id,
          error: String(err),
        });
        console.log(`    ${variant}: SKIPPED (${err})`);
      }
    }
  }

  // Compute scorecard
  const baselineScores = scores.filter((s) => s.variant === "baseline");
  const hintScores = scores.filter((s) => s.variant === "with_hint");

  function dimensionAvg(
    scoreList: ScoreResult[],
    dim: keyof ScoreResult["dimension_scores"],
  ): number {
    if (scoreList.length === 0) return 0;
    return (
      Math.round(
        (scoreList.reduce((sum, s) => sum + s.dimension_scores[dim], 0) /
          scoreList.length) *
          1000,
      ) / 1000
    );
  }

  function aggregateAvg(scoreList: ScoreResult[]): number {
    if (scoreList.length === 0) return 0;
    return (
      Math.round(
        (scoreList.reduce((sum, s) => sum + s.aggregate, 0) /
          scoreList.length) *
          1000,
      ) / 1000
    );
  }

  const dimensions = [
    "rule_retention",
    "tool_routing",
    "scope_discipline",
    "provider_specific",
    "extraneous_output",
  ] as const;

  const scorecard: ProviderScorecard = {
    provider: providerName,
    model_id: config.model_id,
    run_id: `run-${Date.now()}`,
    timestamp: new Date().toISOString(),
    baseline: {
      aggregate: aggregateAvg(baselineScores),
      dimension_averages: Object.fromEntries(
        dimensions.map((d) => [d, dimensionAvg(baselineScores, d)]),
      ),
      prompts_run: baselineScores.length,
      prompts_skipped: skipped / 2,
    },
    with_hint: {
      aggregate: aggregateAvg(hintScores),
      dimension_averages: Object.fromEntries(
        dimensions.map((d) => [d, dimensionAvg(hintScores, d)]),
      ),
      prompts_run: hintScores.length,
      prompts_skipped: skipped / 2,
    },
    delta: {
      aggregate:
        Math.round(
          (aggregateAvg(hintScores) - aggregateAvg(baselineScores)) * 1000,
        ) / 1000,
      dimensions: Object.fromEntries(
        dimensions.map((d) => [
          d,
          Math.round(
            (dimensionAvg(hintScores, d) - dimensionAvg(baselineScores, d)) *
              1000,
          ) / 1000,
        ]),
      ),
    },
    prompts_total: prompts.length,
    cost_estimate_usd: Math.round(totalTokens * 0.005 * 100) / 100, // rough estimate
  };

  // Persist results
  const runDir = join(RESULTS_DIR, scorecard.run_id);
  mkdirSync(runDir, { recursive: true });

  writeFileSync(
    join(runDir, "scorecard.json"),
    JSON.stringify(scorecard, null, 2),
  );
  writeFileSync(
    join(runDir, "responses.json"),
    JSON.stringify(responses, null, 2),
  );

  // Human-readable output
  const comparisonMd = formatComparison(scorecard, scores);
  writeFileSync(join(runDir, "comparison.md"), comparisonMd);

  console.log(`\n${"=".repeat(70)}`);
  console.log("SCORECARD SUMMARY");
  console.log(`${"=".repeat(70)}`);
  console.log(
    `\n  Baseline aggregate: ${scorecard.baseline.aggregate.toFixed(3)}`,
  );
  console.log(
    `  With-hint aggregate: ${scorecard.with_hint.aggregate.toFixed(3)}`,
  );
  console.log(
    `  Delta: ${scorecard.delta.aggregate >= 0 ? "+" : ""}${scorecard.delta.aggregate.toFixed(3)}`,
  );
  console.log(`\n  Dimensions:`);
  for (const dim of dimensions) {
    const b = scorecard.baseline.dimension_averages[dim];
    const h = scorecard.with_hint.dimension_averages[dim];
    const d = scorecard.delta.dimensions[dim];
    const arrow = d > 0 ? "↑" : d < 0 ? "↓" : "→";
    console.log(
      `    ${dim}: ${b.toFixed(2)} → ${h.toFixed(2)} ${arrow} ${d >= 0 ? "+" : ""}${d.toFixed(2)}`,
    );
  }
  console.log(`\n  Prompts: ${scorecard.prompts_total} (${skipped} skipped)`);
  console.log(
    `  Tokens: ${totalTokens} (~$${scorecard.cost_estimate_usd.toFixed(2)})`,
  );
  console.log(`\n  Results: ${runDir}/`);
  console.log(`    scorecard.json`);
  console.log(`    responses.json`);
  console.log(`    comparison.md`);
}

// ---------------------------------------------------------------------------
// Output Formatting
// ---------------------------------------------------------------------------

function formatComparison(
  scorecard: ProviderScorecard,
  scores: ScoreResult[],
): string {
  const lines: string[] = [];

  lines.push(
    `# Provider Evaluation: ${scorecard.provider} (${scorecard.model_id})`,
  );
  lines.push(`Run: ${scorecard.run_id} | ${scorecard.timestamp}`);
  lines.push("");

  lines.push("## Aggregate Scores");
  lines.push("");
  lines.push(`| Variant | Score |`);
  lines.push(`|---------|-------|`);
  lines.push(
    `| Baseline (no hint) | ${scorecard.baseline.aggregate.toFixed(3)} |`,
  );
  lines.push(`| With hint | ${scorecard.with_hint.aggregate.toFixed(3)} |`);
  lines.push(
    `| **Delta** | **${scorecard.delta.aggregate >= 0 ? "+" : ""}${scorecard.delta.aggregate.toFixed(3)}** |`,
  );
  lines.push("");

  lines.push("## Dimension Breakdown");
  lines.push("");
  lines.push("| Dimension | Baseline | With hint | Delta |");
  lines.push("|-----------|----------|-----------|-------|");
  for (const dim of [
    "rule_retention",
    "tool_routing",
    "scope_discipline",
    "provider_specific",
    "extraneous_output",
  ]) {
    const b = scorecard.baseline.dimension_averages[dim];
    const h = scorecard.with_hint.dimension_averages[dim];
    const d = scorecard.delta.dimensions[dim];
    lines.push(
      `| ${dim} | ${b.toFixed(2)} | ${h.toFixed(2)} | ${d >= 0 ? "+" : ""}${d.toFixed(2)} |`,
    );
  }
  lines.push("");

  lines.push("## Per-Prompt Scores");
  lines.push("");
  lines.push(
    "| Prompt | Variant | Rule Ret | Tool Route | Scope | Extraneous | Aggregate |",
  );
  lines.push(
    "|--------|---------|----------|------------|-------|------------|-----------|",
  );
  for (const s of scores) {
    const mark = s.aggregate >= 0.8 ? "✓" : s.aggregate >= 0.5 ? "~" : "✗";
    lines.push(
      `| ${s.prompt_id} | ${s.variant} | ${s.dimension_scores.rule_retention.toFixed(2)} | ${s.dimension_scores.tool_routing.toFixed(2)} | ${s.dimension_scores.scope_discipline.toFixed(2)} | ${s.dimension_scores.extraneous_output.toFixed(2)} | ${mark} ${s.aggregate.toFixed(3)} |`,
    );
  }
  lines.push("");

  // Show failures
  const failures = scores.filter((s) => s.aggregate < 0.5);
  if (failures.length > 0) {
    lines.push("## Failures (score < 0.5)");
    lines.push("");
    for (const f of failures) {
      lines.push(`### ${f.prompt_id} (${f.variant})`);
      if (f.details.expected_misses.length > 0) {
        lines.push(
          `- **Missing expected patterns:** ${f.details.expected_misses.join(", ")}`,
        );
      }
      if (f.details.forbidden_hits.length > 0) {
        lines.push(
          `- **Forbidden patterns found:** ${f.details.forbidden_hits.join(", ")}`,
        );
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { providers } = parseCLI();

  console.log("Provider Evaluation Harness");
  console.log(
    `Temperature: ${CONFIG.temperature} | Max tokens: ${CONFIG.max_tokens}`,
  );
  console.log(`Providers: ${providers.join(", ")}`);
  console.log("");

  for (const provider of providers) {
    await runEvaluation(provider);
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
