#!/usr/bin/env bash
# Test: Each layout renders the correct number of rows

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0; TOTAL=0

assert_eq() {
  TOTAL=$((TOTAL+1))
  if [ "$1" = "$2" ]; then
    PASS=$((PASS+1))
    printf "  \033[32m✓\033[0m %s\n" "$3"
  else
    FAIL=$((FAIL+1))
    printf "  \033[31m✗\033[0m %s (expected %s, got %s)\n" "$3" "$1" "$2"
  fi
}

echo ""
echo "  Layout Tests"
echo "  ────────────"

FIXTURE="$SCRIPT_DIR/test/fixtures/sample-input.json"

for layout in compact standard full; do
  result=$(STATUSLINE_LAYOUT_OVERRIDE="$layout" bash -c "cat '$FIXTURE' | bash '$SCRIPT_DIR/lib/core.sh'" 2>/dev/null)
  # Count non-empty lines
  lines=$(echo "$result" | grep -c '.')

  case "$layout" in
    compact)  expected=2 ;;
    standard) expected=4 ;;
    full)     expected=6 ;;
  esac

  assert_eq "$expected" "$lines" "Layout '$layout' renders $expected rows"
done

echo ""
printf "  Results: %d/%d passed\n" "$PASS" "$TOTAL"
[ "$FAIL" -gt 0 ] && exit 1 || exit 0
