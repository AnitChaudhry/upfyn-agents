#!/usr/bin/env bash
# skill-statusline v2 — JSON parser (no jq, pure grep/sed)
# Handles both flat and nested Claude Code JSON structures

# ── Flat parsers (v1 compat fallback) ──

# Extract a quoted string value: json_val "key" → value
json_val() {
  echo "$input" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed 's/.*:.*"\(.*\)"/\1/'
}

# Extract a numeric value: json_num "key" → number
json_num() {
  echo "$input" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*[0-9.]*" | head -1 | sed 's/.*:[[:space:]]*//'
}

# ── Nested parsers (v2 — handles Claude Code's real JSON structure) ──

# Extract numeric from single-nested object: json_nested "context_window" "used_percentage"
json_nested() {
  local parent="$1" key="$2"
  local block
  block=$(echo "$input" | sed -n 's/.*"'"$parent"'"[[:space:]]*:[[:space:]]*{\([^}]*\)}.*/\1/p' | head -1)
  if [ -n "$block" ]; then
    echo "$block" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*[0-9.]*" | head -1 | sed 's/.*:[[:space:]]*//'
  fi
}

# Extract string from single-nested object: json_nested_val "model" "display_name"
json_nested_val() {
  local parent="$1" key="$2"
  local block
  block=$(echo "$input" | sed -n 's/.*"'"$parent"'"[[:space:]]*:[[:space:]]*{\([^}]*\)}.*/\1/p' | head -1)
  if [ -n "$block" ]; then
    echo "$block" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed 's/.*:.*"\(.*\)"/\1/'
  fi
}

# Extract numeric from double-nested: json_deep "context_window" "current_usage" "input_tokens"
# Handles: {"context_window":{..."current_usage":{"input_tokens":8500}...}}
json_deep() {
  local p1="$1" p2="$2" key="$3"
  local outer inner
  # Get everything inside the outer object (greedy — captures nested braces)
  outer=$(echo "$input" | sed -n 's/.*"'"$p1"'"[[:space:]]*:[[:space:]]*{\(.*\)}/\1/p' | head -1)
  if [ -n "$outer" ]; then
    # Now extract the inner object
    inner=$(echo "$outer" | sed -n 's/.*"'"$p2"'"[[:space:]]*:[[:space:]]*{\([^}]*\)}.*/\1/p' | head -1)
    if [ -n "$inner" ]; then
      echo "$inner" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*[0-9.]*" | head -1 | sed 's/.*:[[:space:]]*//'
    fi
  fi
}

# Extract string from double-nested: json_deep_val "context_window" "current_usage" "mode"
json_deep_val() {
  local p1="$1" p2="$2" key="$3"
  local outer inner
  outer=$(echo "$input" | sed -n 's/.*"'"$p1"'"[[:space:]]*:[[:space:]]*{\(.*\)}/\1/p' | head -1)
  if [ -n "$outer" ]; then
    inner=$(echo "$outer" | sed -n 's/.*"'"$p2"'"[[:space:]]*:[[:space:]]*{\([^}]*\)}.*/\1/p' | head -1)
    if [ -n "$inner" ]; then
      echo "$inner" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed 's/.*:.*"\(.*\)"/\1/'
    fi
  fi
}

# Extract boolean: json_bool "exceeds_200k_tokens" → "true" or ""
json_bool() {
  echo "$input" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*true" | head -1 | sed 's/.*:[[:space:]]*//'
}
