#!/usr/bin/env bash
# Test: JSON field parsing — all fields extract correctly from nested JSON

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0; TOTAL=0

assert_contains() {
  TOTAL=$((TOTAL+1))
  if echo "$1" | grep -q "$2"; then
    PASS=$((PASS+1))
    printf "  \033[32m✓\033[0m %s\n" "$3"
  else
    FAIL=$((FAIL+1))
    printf "  \033[31m✗\033[0m %s (expected '%s')\n" "$3" "$2"
  fi
}

echo ""
echo "  Field Parsing Tests"
echo "  ───────────────────"

# Use standard fixture
result=$(cat "$SCRIPT_DIR/test/fixtures/sample-input.json" | bash "$SCRIPT_DIR/lib/core.sh" 2>/dev/null)

# Strip ANSI codes for clean matching
clean=$(echo "$result" | sed $'s/\033\\[[0-9;]*m//g')

# Model
assert_contains "$clean" "Opus 4.6" "Model: display_name + version extracted"

# Cost
assert_contains "$clean" '1.23' "Cost: $1.23 from nested cost object"

# Directory (the fixture cwd is /home/user/project)
assert_contains "$clean" "user/project" "Dir: last path segments shown"

echo ""
printf "  Results: %d/%d passed\n" "$PASS" "$TOTAL"
[ "$FAIL" -gt 0 ] && exit 1 || exit 0
