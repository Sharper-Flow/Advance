#!/bin/bash
# Blind Model Comparison Test
# Compares Gemini 3 Flash Preview vs MiniMax M2.1 on a realistic research task.
# 
# Usage: ./scripts/model-blind-test.sh
# Requires: OPENROUTER_API_KEY environment variable

set -e

# Check for API key
if [ -z "$OPENROUTER_API_KEY" ]; then
    echo "Error: OPENROUTER_API_KEY environment variable is required"
    echo "Get your API key from: https://openrouter.ai/keys"
    exit 1
fi

# Test prompt (same for both models)
PROMPT='You are a technical research assistant. Your job is to provide accurate, well-researched answers.

**Research Question:**
I am building an MCP (Model Context Protocol) server as an OpenCode plugin. I need to understand:

1. What are the key considerations for tool timeout handling in MCP servers?
2. Should I use synchronous or asynchronous tool execution, and why?
3. What is the recommended way to report progress for long-running tools?

Provide a concise, actionable summary (max 300 words) with specific recommendations. If you are unsure about something, say so rather than guessing.'

# Models to test
MODEL_A="google/gemini-3-flash-preview"
MODEL_B="minimax/minimax-m2.1"

# Randomize order for blind test
if [ $((RANDOM % 2)) -eq 0 ]; then
    FIRST_MODEL="$MODEL_A"
    SECOND_MODEL="$MODEL_B"
    MAPPING_X="Gemini 3 Flash Preview"
    MAPPING_Y="MiniMax M2.1"
else
    FIRST_MODEL="$MODEL_B"
    SECOND_MODEL="$MODEL_A"
    MAPPING_X="MiniMax M2.1"
    MAPPING_Y="Gemini 3 Flash Preview"
fi

echo "======================================================================"
echo "MODEL BLIND COMPARISON TEST"
echo "======================================================================"
echo ""
echo "Test prompt (same for both models):"
echo "----------------------------------------------------------------------"
echo "$PROMPT"
echo "----------------------------------------------------------------------"
echo ""
echo "Running tests... (this may take 30-60 seconds)"
echo ""

# Function to call a model
call_model() {
    local model="$1"
    local start_time=$(date +%s%3N)
    
    local response=$(curl -s "https://openrouter.ai/api/v1/chat/completions" \
        -H "Authorization: Bearer $OPENROUTER_API_KEY" \
        -H "Content-Type: application/json" \
        -H "HTTP-Referer: https://github.com/anomalyco/opencode" \
        -H "X-Title: ADV Model Comparison Test" \
        -d '{
            "model": "'"$model"'",
            "messages": [{"role": "user", "content": "'"${PROMPT//\"/\\\"}"'"}],
            "temperature": 0.10,
            "max_tokens": 1024
        }')
    
    local end_time=$(date +%s%3N)
    local latency=$((end_time - start_time))
    
    # Extract content
    local content=$(echo "$response" | jq -r '.choices[0].message.content // "ERROR: No content"')
    local tokens=$(echo "$response" | jq -r '.usage.total_tokens // 0')
    
    echo "LATENCY:$latency"
    echo "TOKENS:$tokens"
    echo "CONTENT:$content"
}

# Test first model
echo "Testing Model X..."
RESULT_X=$(call_model "$FIRST_MODEL")
LATENCY_X=$(echo "$RESULT_X" | grep "^LATENCY:" | cut -d: -f2)
TOKENS_X=$(echo "$RESULT_X" | grep "^TOKENS:" | cut -d: -f2)
CONTENT_X=$(echo "$RESULT_X" | sed -n '/^CONTENT:/,$p' | sed 's/^CONTENT://')
echo "  Done (${LATENCY_X}ms, ${TOKENS_X} tokens)"

# Test second model
echo "Testing Model Y..."
RESULT_Y=$(call_model "$SECOND_MODEL")
LATENCY_Y=$(echo "$RESULT_Y" | grep "^LATENCY:" | cut -d: -f2)
TOKENS_Y=$(echo "$RESULT_Y" | grep "^TOKENS:" | cut -d: -f2)
CONTENT_Y=$(echo "$RESULT_Y" | sed -n '/^CONTENT:/,$p' | sed 's/^CONTENT://')
echo "  Done (${LATENCY_Y}ms, ${TOKENS_Y} tokens)"

# Display blind results
echo ""
echo "======================================================================"
echo "BLIND COMPARISON RESULTS"
echo "(Order randomized - you don't know which is which)"
echo "======================================================================"

echo ""
echo "##################################################"
echo "# RESPONSE X"
echo "# Latency: ${LATENCY_X}ms | Tokens: ${TOKENS_X}"
echo "##################################################"
echo ""
echo "$CONTENT_X"
echo ""
echo "--------------------------------------------------"

echo ""
echo "##################################################"
echo "# RESPONSE Y"
echo "# Latency: ${LATENCY_Y}ms | Tokens: ${TOKENS_Y}"
echo "##################################################"
echo ""
echo "$CONTENT_Y"
echo ""
echo "--------------------------------------------------"

# Ask for preference
echo ""
echo "======================================================================"
echo "EVALUATION"
echo "======================================================================"
echo ""
echo "Which response do you prefer? (X or Y)"
echo "Consider: accuracy, clarity, conciseness, actionability"
echo ""
read -p "Your choice (X/Y): " CHOICE

# Reveal
echo ""
echo "======================================================================"
echo "REVEAL"
echo "======================================================================"
echo ""
echo "X: $MAPPING_X"
echo "   Model ID: $FIRST_MODEL"
echo ""
echo "Y: $MAPPING_Y"
echo "   Model ID: $SECOND_MODEL"
echo ""

CHOICE_UPPER=$(echo "$CHOICE" | tr '[:lower:]' '[:upper:]')
if [ "$CHOICE_UPPER" = "X" ]; then
    echo "======================================================================"
    echo "RESULT: You preferred $MAPPING_X!"
    echo "======================================================================"
elif [ "$CHOICE_UPPER" = "Y" ]; then
    echo "======================================================================"
    echo "RESULT: You preferred $MAPPING_Y!"
    echo "======================================================================"
else
    echo "Invalid choice"
fi
