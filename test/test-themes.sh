#!/usr/bin/env bash
# Test: All themes source without error and define required variables

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0; TOTAL=0

REQUIRED_VARS="CLR_RST CLR_BOLD CLR_SKILL CLR_MODEL CLR_DIR CLR_GITHUB CLR_TOKENS CLR_COST CLR_CTX_LOW CLR_CTX_MED CLR_CTX_HIGH CLR_CTX_CRIT CLR_SEP CLR_BAR_EMPTY BAR_FILLED BAR_EMPTY SEP_CHAR"

echo ""
echo "  Theme Tests"
echo "  ───────────"

for theme_file in "$SCRIPT_DIR"/themes/*.sh; do
  theme_name=$(basename "$theme_file" .sh)
  TOTAL=$((TOTAL+1))

  # Source the theme and check all required vars are non-empty
  missing=""
  eval_result=$(bash -c "
    source '$theme_file' 2>/dev/null
    for var in $REQUIRED_VARS; do
      eval val=\\\"\\\$\$var\\\"
      [ -z \"\$val\" ] && echo \"MISSING:\$var\"
    done
  " 2>/dev/null)

  if [ -z "$eval_result" ]; then
    PASS=$((PASS+1))
    printf "  \033[32m✓\033[0m Theme '%s': all %d vars defined\n" "$theme_name" $(echo "$REQUIRED_VARS" | wc -w)
  else
    FAIL=$((FAIL+1))
    missing=$(echo "$eval_result" | sed 's/MISSING://g' | tr '\n' ', ')
    printf "  \033[31m✗\033[0m Theme '%s': missing: %s\n" "$theme_name" "$missing"
  fi
done

echo ""
printf "  Results: %d/%d passed\n" "$PASS" "$TOTAL"
[ "$FAIL" -gt 0 ] && exit 1 || exit 0
