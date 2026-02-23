#!/usr/bin/env bash
# Test: v1 backward compatibility — flat JSON still renders

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
echo "  Backward Compatibility Tests"
echo "  ────────────────────────────"

# Test with v1-style flat JSON (what the old script expected)
v1_json='{"display_name":"Sonnet","id":"claude-sonnet-4-6","current_dir":"/home/user/project","used_percentage":25,"total_cost_usd":0.50,"total_input_tokens":15000,"total_output_tokens":5000}'

# Force v1 fallback by overriding HOME so core.sh is not found
result=$(echo "$v1_json" | HOME="/tmp/sl-compat-test-$$" bash "$SCRIPT_DIR/bin/statusline.sh" 2>/dev/null)
clean=$(echo "$result" | sed $'s/\033\\[[0-9;]*m//g')

assert_contains "$clean" "Sonnet" "v1 fallback: model name rendered"
assert_contains "$clean" "25%" "v1 fallback: context percentage shown"
assert_contains "$clean" "0.50" "v1 fallback: cost shown"

echo ""
printf "  Results: %d/%d passed\n" "$PASS" "$TOTAL"
[ "$FAIL" -gt 0 ] && exit 1 || exit 0
