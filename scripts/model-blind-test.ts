#!/usr/bin/env bun
/**
 * Blind Model Comparison Test
 * 
 * Compares Gemini 3 Flash Preview vs MiniMax M2.1 on a realistic research task.
 * Run with: bun run scripts/model-blind-test.ts
 * 
 * Requires OPENROUTER_API_KEY environment variable.
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error("Error: OPENROUTER_API_KEY environment variable is required");
  console.error("Get your API key from: https://openrouter.ai/keys");
  process.exit(1);
}

// Models to compare
const MODELS = {
  "google/gemini-3-flash-preview": {
    name: "Gemini 3 Flash Preview",
    inputCost: 0.50,  // $/MTok
    outputCost: 3.00,
  },
  "minimax/minimax-m2.1": {
    name: "MiniMax M2.1", 
    inputCost: 0.27,
    outputCost: 1.10,
  }
};

// Realistic research prompt for adv-researcher subagent
const TEST_PROMPT = `You are a technical research assistant. Your job is to provide accurate, well-researched answers.

**Research Question:**
I'm building an MCP (Model Context Protocol) server as an OpenCode plugin. I need to understand:

1. What are the key considerations for tool timeout handling in MCP servers?
2. Should I use synchronous or asynchronous tool execution, and why?
3. What's the recommended way to report progress for long-running tools?

Provide a concise, actionable summary (max 300 words) with specific recommendations. If you're unsure about something, say so rather than guessing.`;

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model?: string;
}

async function callModel(modelId: string): Promise<{ content: string; tokens: number; latencyMs: number }> {
  const startTime = Date.now();
  
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/anomalyco/opencode",
      "X-Title": "ADV Model Comparison Test"
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "user", content: TEST_PROMPT }
      ],
      temperature: 0.10,  // Conservative, per user preference
      max_tokens: 1024,
    })
  });

  const latencyMs = Date.now() - startTime;
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error for ${modelId}: ${response.status} ${error}`);
  }

  const data = await response.json() as OpenRouterResponse;
  const content = data.choices?.[0]?.message?.content || "(no content)";
  const tokens = data.usage?.total_tokens || 0;
  
  return { content, tokens, latencyMs };
}

async function runBlindTest() {
  console.log("=".repeat(70));
  console.log("MODEL BLIND COMPARISON TEST");
  console.log("=".repeat(70));
  console.log("\nTest prompt (same for both models):");
  console.log("-".repeat(50));
  console.log(TEST_PROMPT);
  console.log("-".repeat(50));
  console.log("\nRunning tests... (this may take 30-60 seconds)\n");

  const modelIds = Object.keys(MODELS);
  const results: Array<{ id: string; content: string; tokens: number; latencyMs: number }> = [];

  // Run both models
  for (const modelId of modelIds) {
    try {
      console.log(`Testing ${MODELS[modelId as keyof typeof MODELS].name}...`);
      const result = await callModel(modelId);
      results.push({ id: modelId, ...result });
      console.log(`  Done (${result.latencyMs}ms, ${result.tokens} tokens)`);
    } catch (error) {
      console.error(`  Error: ${error}`);
      results.push({ id: modelId, content: `ERROR: ${error}`, tokens: 0, latencyMs: 0 });
    }
  }

  // Randomize order for blind comparison
  const shuffled = results.sort(() => Math.random() - 0.5);
  const labels = ["A", "B"];
  
  // Store mapping for reveal
  const mapping: Record<string, string> = {};
  shuffled.forEach((result, i) => {
    mapping[labels[i]] = result.id;
  });

  // Output blind results
  console.log("\n" + "=".repeat(70));
  console.log("BLIND COMPARISON RESULTS");
  console.log("(Order randomized - you don't know which is which)");
  console.log("=".repeat(70));

  shuffled.forEach((result, i) => {
    const label = labels[i];
    console.log(`\n${"#".repeat(50)}`);
    console.log(`# RESPONSE ${label}`);
    console.log(`# Latency: ${result.latencyMs}ms | Tokens: ${result.tokens}`);
    console.log(`${"#".repeat(50)}\n`);
    console.log(result.content);
    console.log("\n" + "-".repeat(50));
  });

  // Ask for preference
  console.log("\n" + "=".repeat(70));
  console.log("EVALUATION");
  console.log("=".repeat(70));
  console.log("\nWhich response do you prefer? (A or B)");
  console.log("Consider: accuracy, clarity, conciseness, actionability");
  console.log("\nPress Enter after typing your choice...");

  // Read user input
  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question("\nYour choice (A/B): ", (ans) => {
      rl.close();
      resolve(ans.toUpperCase().trim());
    });
  });

  // Reveal
  console.log("\n" + "=".repeat(70));
  console.log("REVEAL");
  console.log("=".repeat(70));
  
  labels.forEach((label) => {
    const modelId = mapping[label];
    const info = MODELS[modelId as keyof typeof MODELS];
    const isChoice = label === answer;
    console.log(`\n${label}: ${info.name}`);
    console.log(`   Model ID: ${modelId}`);
    console.log(`   Pricing: $${info.inputCost}/$${info.outputCost} per MTok (in/out)`);
    if (isChoice) {
      console.log(`   >>> YOUR CHOICE <<<`);
    }
  });

  const chosenModelId = mapping[answer];
  if (chosenModelId) {
    const chosen = MODELS[chosenModelId as keyof typeof MODELS];
    console.log(`\n${"=".repeat(70)}`);
    console.log(`RESULT: You preferred ${chosen.name}!`);
    console.log(`${"=".repeat(70)}`);
  } else {
    console.log("\nNo valid choice detected.");
  }
}

// Run the test
runBlindTest().catch(console.error);
