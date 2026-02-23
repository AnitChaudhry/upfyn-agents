#!/usr/bin/env bash
# skill-statusline v2 — Shared helpers

# Convert any path to forward slashes (safe on all OS)
to_fwd() {
  echo "$1" | tr '\\' '/' | sed 's|//\+|/|g'
}

# Right-pad a colored string to a visible width
rpad() {
  local str="$1" w="$2"
  local plain
  plain=$(printf '%b' "$str" | sed $'s/\033\\[[0-9;]*m//g')
  local vlen=${#plain}
  local need=$(( w - vlen ))
  printf '%b' "$str"
  [ "$need" -gt 0 ] && printf "%${need}s" ""
}

# Format token count with k/M suffixes
fmt_tok() {
  awk -v t="$1" 'BEGIN {
    if (t >= 1000000) printf "%.1fM", t/1000000
    else if (t >= 1000) printf "%.0fk", t/1000
    else printf "%d", t
  }'
}

# Format duration from milliseconds to human-readable
fmt_duration() {
  awk -v ms="$1" 'BEGIN {
    s = int(ms / 1000)
    if (s < 60) printf "%ds", s
    else if (s < 3600) printf "%dm%ds", int(s/60), s%60
    else printf "%dh%dm", int(s/3600), int((s%3600)/60)
  }'
}

# ── Filesystem caching with TTL ──

CACHE_DIR="/tmp/sl-cache-${USER:-unknown}"
CACHE_TTL="${SL_CACHE_TTL:-5}"

_sl_cache_init() {
  [ -d "$CACHE_DIR" ] || mkdir -p "$CACHE_DIR" 2>/dev/null
}

# cache_get "key" "command" [ttl_seconds]
# Returns cached result if fresh, otherwise runs command and caches
cache_get() {
  local key="$1" cmd="$2" ttl="${3:-$CACHE_TTL}"
  local f="${CACHE_DIR}/${key}"

  if [ -f "$f" ]; then
    local now mtime age
    now=$(date +%s)
    # Cross-platform stat: Linux/Git Bash vs macOS
    if stat -c %Y /dev/null >/dev/null 2>&1; then
      mtime=$(stat -c %Y "$f" 2>/dev/null)
    else
      mtime=$(stat -f %m "$f" 2>/dev/null)
    fi
    if [ -n "$mtime" ]; then
      age=$(( now - mtime ))
      if [ "$age" -lt "$ttl" ]; then
        cat "$f"
        return 0
      fi
    fi
  fi

  local result
  result=$(eval "$cmd" 2>/dev/null)
  printf '%s' "$result" > "$f" 2>/dev/null
  printf '%s' "$result"
}

# Clear all cached data
cache_clear() {
  [ -d "$CACHE_DIR" ] && rm -f "${CACHE_DIR}"/* 2>/dev/null
}
