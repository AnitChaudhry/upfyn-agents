#!/usr/bin/env bash
# Test: Context % accuracy
# Verifies the P0-CRITICAL bug fix — context bar must show accurate percentages

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0; TOTAL=0

assert_contains() {
  TOTAL=$((TOTAL+1))
  if echo "$1" | grep -q "$2"; then
    PASS=$((PASS+1))
    printf "  \033[32m✓\033[0m %s\n" "$3"
  else
    FAIL=$((FAIL+1))
    printf "  \033[31m✗\033[0m %s (expected to find '%s')\n" "$3" "$2"
  fi
}

assert_not_contains() {
  TOTAL=$((TOTAL+1))
  if ! echo "$1" | grep -q "$2"; then
    PASS=$((PASS+1))
    printf "  \033[32m✓\033[0m %s\n" "$3"
  else
    FAIL=$((FAIL+1))
    printf "  \033[31m✗\033[0m %s (should NOT contain '%s')\n" "$3" "$2"
  fi
}

echo ""
echo "  Context Accuracy Tests"
echo "  ─────────────────────"

# Test 1: Standard fixture — 46% context (85000+5000+2000 = 92000/200000)
result=$(cat "$SCRIPT_DIR/test/fixtures/sample-input.json" | bash "$SCRIPT_DIR/lib/core.sh" 2>/dev/null)
assert_contains "$result" "46%" "Standard fixture: 92k/200k = 46%"

# Test 2: High context fixture — 92% (170000+10000+4000 = 184000/200000)
result=$(cat "$SCRIPT_DIR/test/fixtures/high-context.json" | bash "$SCRIPT_DIR/lib/core.sh" 2>/dev/null)
assert_contains "$result" "92%" "High context fixture: 184k/200k = 92%"
# The old v1 would show 77% (the stale reported value) — verify we DON'T
assert_not_contains "$result" "77%" "High context does NOT show stale 77%"

# Test 3: High context should trigger compaction warning
assert_contains "$result" "left" "High context shows remaining % warning"

# Test 4: Empty fields — should show 0% not crash
result=$(cat "$SCRIPT_DIR/test/fixtures/empty-fields.json" | bash "$SCRIPT_DIR/lib/core.sh" 2>/dev/null)
assert_contains "$result" "0%" "Empty fields gracefully shows 0%"

# Test 5: Zero context window (edge case)
result=$(echo '{"context_window":{"context_window_size":0,"current_usage":{"input_tokens":0,"output_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}' | bash "$SCRIPT_DIR/lib/core.sh" 2>/dev/null)
assert_contains "$result" "0%" "Zero window size shows 0% (no division by zero)"

echo ""
printf "  Results: %d/%d passed\n" "$PASS" "$TOTAL"
[ "$FAIL" -gt 0 ] && exit 1 || exit 0
