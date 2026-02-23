#!/usr/bin/env bash
# skill-statusline v2 — Test runner
# Runs all test scripts and reports results

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TOTAL=0; PASSED=0; FAILED=0

# Set up a temporary statusline directory for tests
export HOME="$SCRIPT_DIR/.test-home"
mkdir -p "$HOME/.claude/statusline/themes" 2>/dev/null
mkdir -p "$HOME/.claude/statusline/layouts" 2>/dev/null

# Copy files to test home
cp "$SCRIPT_DIR/lib/"*.sh "$HOME/.claude/statusline/" 2>/dev/null
cp "$SCRIPT_DIR/themes/"*.sh "$HOME/.claude/statusline/themes/" 2>/dev/null
cp "$SCRIPT_DIR/layouts/"*.sh "$HOME/.claude/statusline/layouts/" 2>/dev/null

# Write default config
cat > "$HOME/.claude/statusline-config.json" << 'EOF'
{"version":2,"theme":"default","layout":"standard","options":{}}
EOF

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   skill-statusline v2 — Test Suite   ║"
echo "  ╚══════════════════════════════════════╝"

for test_file in "$SCRIPT_DIR"/test/test-*.sh; do
  test_name=$(basename "$test_file" .sh | sed 's/test-//')
  TOTAL=$((TOTAL+1))

  if bash "$test_file" 2>/dev/null; then
    PASSED=$((PASSED+1))
  else
    FAILED=$((FAILED+1))
    echo ""
    printf "  \033[31m✗ SUITE FAILED: %s\033[0m\n" "$test_name"
  fi
done

# Cleanup test home
rm -rf "$SCRIPT_DIR/.test-home" 2>/dev/null

echo ""
echo "  ══════════════════════════════════════"
if [ "$FAILED" -eq 0 ]; then
  printf "  \033[32m✓ All %d test suites passed\033[0m\n" "$TOTAL"
else
  printf "  \033[31m✗ %d/%d test suites failed\033[0m\n" "$FAILED" "$TOTAL"
fi
echo ""

[ "$FAILED" -gt 0 ] && exit 1 || exit 0
