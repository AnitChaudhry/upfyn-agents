#!/usr/bin/env bash
# skill-statusline v2.0 — Core engine
# Reads Claude Code JSON from stdin, computes all fields, renders via layout

STATUSLINE_DIR="${HOME}/.claude/statusline"
CONFIG_FILE="${HOME}/.claude/statusline-config.json"

# ── 0. Read stdin JSON ──
input=$(cat)

# ── 1. Source modules ──
source "${STATUSLINE_DIR}/json-parser.sh"
source "${STATUSLINE_DIR}/helpers.sh"

# ── 2. Load config ──
active_theme="default"
active_layout="standard"
cfg_warn_threshold=85
cfg_bar_width=40
cfg_show_burn_rate="false"
cfg_show_vim="true"
cfg_show_agent="true"

if [ -f "$CONFIG_FILE" ]; then
  _cfg=$(cat "$CONFIG_FILE" 2>/dev/null)
  _t=$(echo "$_cfg" | grep -o '"theme"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*:.*"\(.*\)"/\1/')
  _l=$(echo "$_cfg" | grep -o '"layout"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*:.*"\(.*\)"/\1/')
  [ -n "$_t" ] && active_theme="$_t"
  [ -n "$_l" ] && active_layout="$_l"
  _w=$(echo "$_cfg" | grep -o '"compaction_warning_threshold"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | sed 's/.*:[[:space:]]*//')
  _bw=$(echo "$_cfg" | grep -o '"bar_width"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | sed 's/.*:[[:space:]]*//')
  _br=$(echo "$_cfg" | grep -o '"show_burn_rate"[[:space:]]*:[[:space:]]*true' | head -1)
  _sv=$(echo "$_cfg" | grep -o '"show_vim_mode"[[:space:]]*:[[:space:]]*false' | head -1)
  _sa=$(echo "$_cfg" | grep -o '"show_agent_name"[[:space:]]*:[[:space:]]*false' | head -1)
  [ -n "$_w" ] && cfg_warn_threshold="$_w"
  [ -n "$_bw" ] && cfg_bar_width="$_bw"
  [ -n "$_br" ] && cfg_show_burn_rate="true"
  [ -n "$_sv" ] && cfg_show_vim="false"
  [ -n "$_sa" ] && cfg_show_agent="false"
fi

# Allow env override (for ccsl preview)
[ -n "$STATUSLINE_THEME_OVERRIDE" ] && active_theme="$STATUSLINE_THEME_OVERRIDE"
[ -n "$STATUSLINE_LAYOUT_OVERRIDE" ] && active_layout="$STATUSLINE_LAYOUT_OVERRIDE"

# ── 3. Source theme ──
theme_file="${STATUSLINE_DIR}/themes/${active_theme}.sh"
if [ -f "$theme_file" ]; then
  source "$theme_file"
else
  source "${STATUSLINE_DIR}/themes/default.sh"
fi

# ── 4. Terminal width detection ──
SL_TERM_WIDTH=${COLUMNS:-0}
if [ "$SL_TERM_WIDTH" -eq 0 ] 2>/dev/null; then
  _tw=$(tput cols 2>/dev/null)
  [ -n "$_tw" ] && [ "$_tw" -gt 0 ] && SL_TERM_WIDTH="$_tw"
fi
[ "$SL_TERM_WIDTH" -eq 0 ] && SL_TERM_WIDTH=80

# Auto-downgrade layout for narrow terminals
if [ "$SL_TERM_WIDTH" -lt 60 ]; then
  active_layout="compact"
elif [ "$SL_TERM_WIDTH" -lt 80 ] && [ "$active_layout" = "full" ]; then
  active_layout="standard"
fi

# Dynamic bar width
BAR_WIDTH="$cfg_bar_width"
if [ "$SL_TERM_WIDTH" -gt 100 ]; then
  _dyn=$(( SL_TERM_WIDTH - 20 ))
  [ "$_dyn" -gt 60 ] && _dyn=60
  [ "$_dyn" -gt "$BAR_WIDTH" ] && BAR_WIDTH="$_dyn"
elif [ "$SL_TERM_WIDTH" -lt 70 ]; then
  BAR_WIDTH=20
fi

# ── 5. Initialize cache ──
_sl_cache_init

# ── 6. Parse ALL JSON fields ──

# --- 6a. Directory ---
SL_CWD=$(json_nested_val "workspace" "current_dir")
[ -z "$SL_CWD" ] && SL_CWD=$(json_val "cwd")
if [ -z "$SL_CWD" ]; then
  SL_DIR="~"
  clean_cwd=""
else
  clean_cwd=$(to_fwd "$SL_CWD")
  SL_DIR=$(echo "$clean_cwd" | awk -F'/' '{if(NF>3) print $(NF-2)"/"$(NF-1)"/"$NF; else if(NF>2) print $(NF-1)"/"$NF; else print $0}')
  [ -z "$SL_DIR" ] && SL_DIR="~"
fi

# --- 6b. Model ---
SL_MODEL_DISPLAY=$(json_nested_val "model" "display_name")
SL_MODEL_ID=$(json_nested_val "model" "id")
# Flat fallback
[ -z "$SL_MODEL_DISPLAY" ] && SL_MODEL_DISPLAY=$(json_val "display_name")
[ -z "$SL_MODEL_ID" ] && SL_MODEL_ID=$(json_val "id")
[ -z "$SL_MODEL_DISPLAY" ] && SL_MODEL_DISPLAY="unknown"

# Parse model from ID for reliable display (handles "Claude claude-opus-4-6" display_name)
SL_MODEL=""
if [ -n "$SL_MODEL_ID" ]; then
  _model_family=$(echo "$SL_MODEL_ID" | sed -n 's/^claude-\([a-z]*\)-.*/\1/p')
  _model_ver=$(echo "$SL_MODEL_ID" | sed -n 's/.*-\([0-9]\)-\([0-9]\)$/\1.\2/p')
  [ -z "$_model_ver" ] && _model_ver=$(echo "$SL_MODEL_ID" | sed -n 's/.*-\([0-9]\)-[0-9]\{8\}$/\1/p')
  if [ -n "$_model_family" ]; then
    _family_cap="$(echo "$_model_family" | sed 's/^\(.\)/\U\1/')"
    if [ -n "$_model_ver" ]; then
      SL_MODEL="${_family_cap} ${_model_ver}"
    else
      SL_MODEL="${_family_cap}"
    fi
  fi
fi
[ -z "$SL_MODEL" ] && SL_MODEL="$SL_MODEL_DISPLAY"

# --- 6c. Context — ACCURATE computation from current_usage ---
ctx_size=$(json_nested "context_window" "context_window_size")
cur_input=$(json_deep "context_window" "current_usage" "input_tokens")
cur_output=$(json_deep "context_window" "current_usage" "output_tokens")
cur_cache_create=$(json_deep "context_window" "current_usage" "cache_creation_input_tokens")
cur_cache_read=$(json_deep "context_window" "current_usage" "cache_read_input_tokens")

[ -z "$ctx_size" ] && ctx_size=200000
[ -z "$cur_input" ] && cur_input=0
[ -z "$cur_output" ] && cur_output=0
[ -z "$cur_cache_create" ] && cur_cache_create=0
[ -z "$cur_cache_read" ] && cur_cache_read=0

# Claude's formula: input + cache_creation + cache_read (output excluded from context %)
ctx_used=$(awk -v a="$cur_input" -v b="$cur_cache_create" -v c="$cur_cache_read" \
  'BEGIN { printf "%d", a + b + c }')

# Self-calculated percentage
calc_pct=0
if [ "$cur_input" -gt 0 ] 2>/dev/null; then
  calc_pct=$(awk -v used="$ctx_used" -v total="$ctx_size" \
    'BEGIN { if (total > 0) printf "%d", (used * 100) / total; else print 0 }')
fi

# Reported percentage as fallback
reported_pct=$(json_nested "context_window" "used_percentage")

# Use self-calculated if we have current_usage data, else fallback
if [ "$cur_input" -gt 0 ] 2>/dev/null; then
  SL_CTX_PCT="$calc_pct"
elif [ -n "$reported_pct" ] && [ "$reported_pct" != "null" ]; then
  SL_CTX_PCT=$(echo "$reported_pct" | cut -d. -f1)
else
  SL_CTX_PCT=0
fi

SL_CTX_REMAINING=$(( 100 - SL_CTX_PCT ))
[ "$SL_CTX_REMAINING" -lt 0 ] && SL_CTX_REMAINING=0

# Context color
if [ "$SL_CTX_PCT" -gt 90 ] 2>/dev/null; then
  CTX_CLR="$CLR_CTX_CRIT"
elif [ "$SL_CTX_PCT" -gt 75 ] 2>/dev/null; then
  CTX_CLR="$CLR_CTX_HIGH"
elif [ "$SL_CTX_PCT" -gt 40 ] 2>/dev/null; then
  CTX_CLR="$CLR_CTX_MED"
else
  CTX_CLR="$CLR_CTX_LOW"
fi

# Build context bar
filled=$(( SL_CTX_PCT * BAR_WIDTH / 100 ))
[ "$filled" -gt "$BAR_WIDTH" ] && filled=$BAR_WIDTH
empty=$(( BAR_WIDTH - filled ))
bar_filled=""; bar_empty=""
i=0; while [ $i -lt $filled ]; do bar_filled="${bar_filled}${BAR_FILLED}"; i=$((i+1)); done
i=0; while [ $i -lt $empty ]; do bar_empty="${bar_empty}${BAR_EMPTY}"; i=$((i+1)); done
SL_CTX_BAR="${CTX_CLR}${bar_filled}${CLR_RST}${CLR_BAR_EMPTY}${bar_empty}${CLR_RST} ${CTX_CLR}${SL_CTX_PCT}%${CLR_RST}"

# Compaction warning
SL_COMPACT_WARNING=""
if [ "$SL_CTX_PCT" -ge 95 ] 2>/dev/null; then
  SL_COMPACT_WARNING=" ${CLR_CTX_CRIT}${CLR_BOLD}COMPACTING${CLR_RST}"
elif [ "$SL_CTX_PCT" -ge "$cfg_warn_threshold" ] 2>/dev/null; then
  SL_COMPACT_WARNING=" ${CLR_CTX_HIGH}${SL_CTX_REMAINING}% left${CLR_RST}"
fi

# --- 6d. GitHub (with caching) ---
SL_BRANCH="no-git"
SL_GIT_DIRTY=""
SL_GITHUB=""
gh_user=""
gh_repo=""

if [ -n "$clean_cwd" ]; then
  SL_BRANCH=$(cache_get "git-branch" "git --no-optional-locks -C '$clean_cwd' symbolic-ref --short HEAD 2>/dev/null || git --no-optional-locks -C '$clean_cwd' rev-parse --short HEAD 2>/dev/null" 5)
  [ -z "$SL_BRANCH" ] && SL_BRANCH="no-git"

  if [ "$SL_BRANCH" != "no-git" ]; then
    remote_url=$(cache_get "git-remote" "git --no-optional-locks -C '$clean_cwd' remote get-url origin" 10)
    if [ -n "$remote_url" ]; then
      gh_user=$(echo "$remote_url" | sed 's|.*github\.com[:/]\([^/]*\)/.*|\1|')
      [ "$gh_user" = "$remote_url" ] && gh_user=""
      gh_repo=$(echo "$remote_url" | sed 's|.*/\([^/]*\)\.git$|\1|; s|.*/\([^/]*\)$|\1|')
      [ "$gh_repo" = "$remote_url" ] && gh_repo=""
    fi

    # Dirty check (shorter cache — changes more often)
    _staged=$(cache_get "git-staged" "git --no-optional-locks -C '$clean_cwd' diff --cached --quiet 2>/dev/null && echo clean || echo dirty" 3)
    _unstaged=$(cache_get "git-unstaged" "git --no-optional-locks -C '$clean_cwd' diff --quiet 2>/dev/null && echo clean || echo dirty" 3)
    [ "$_staged" = "dirty" ] && SL_GIT_DIRTY="${CLR_GIT_STAGED}+${CLR_RST}"
    [ "$_unstaged" = "dirty" ] && SL_GIT_DIRTY="${SL_GIT_DIRTY}${CLR_GIT_UNSTAGED}~${CLR_RST}"
  fi
fi

if [ -n "$gh_repo" ]; then
  SL_GITHUB="${gh_user}/${gh_repo}/${SL_BRANCH}"
else
  SL_GITHUB="$SL_BRANCH"
fi

# --- 6e. Cost ---
cost_raw=$(json_nested "cost" "total_cost_usd")
[ -z "$cost_raw" ] && cost_raw=$(json_num "total_cost_usd")
if [ -z "$cost_raw" ] || [ "$cost_raw" = "0" ]; then
  SL_COST='$0.00'
else
  SL_COST=$(awk -v c="$cost_raw" 'BEGIN { if (c < 0.01) printf "$%.4f", c; else printf "$%.2f", c }')
fi

# --- 6f. Tokens (window vs cumulative) ---
# Current window tokens (what's actually loaded — accurate)
[ -z "$cur_input" ] && cur_input=0
[ -z "$cur_output" ] && cur_output=0
SL_TOKENS_WIN_IN=$(fmt_tok "$cur_input")
SL_TOKENS_WIN_OUT=$(fmt_tok "$cur_output")

# Cumulative session tokens (grows forever, for reference)
cum_input=$(json_nested "context_window" "total_input_tokens")
cum_output=$(json_nested "context_window" "total_output_tokens")
# Flat fallback
[ -z "$cum_input" ] && cum_input=$(json_num "total_input_tokens")
[ -z "$cum_output" ] && cum_output=$(json_num "total_output_tokens")
[ -z "$cum_input" ] && cum_input=0
[ -z "$cum_output" ] && cum_output=0
SL_TOKENS_CUM_IN=$(fmt_tok "$cum_input")
SL_TOKENS_CUM_OUT=$(fmt_tok "$cum_output")

# --- 6g. Skill detection (with caching) ---
SL_SKILL="Idle"

_detect_skill() {
  local cwd="$1"
  local tpath="" search_path="$cwd" proj_hash proj_dir

  while [ -n "$search_path" ] && [ "$search_path" != "/" ]; do
    proj_hash=$(echo "$search_path" | sed 's|^/\([a-zA-Z]\)/|\U\1--|; s|^[A-Z]:/|&|; s|:/|--|; s|/|-|g')
    proj_dir="$HOME/.claude/projects/${proj_hash}"
    if [ -d "$proj_dir" ]; then
      tpath=$(ls -t "$proj_dir"/*.jsonl 2>/dev/null | head -1)
      [ -n "$tpath" ] && break
    fi
    search_path=$(echo "$search_path" | sed 's|/[^/]*$||')
  done

  if [ -n "$tpath" ] && [ -f "$tpath" ]; then
    local recent_block last_tool
    recent_block=$(tail -200 "$tpath" 2>/dev/null)
    last_tool=$(echo "$recent_block" | grep -o '"type":"tool_use","id":"[^"]*","name":"[^"]*"' | tail -1 | sed 's/.*"name":"\([^"]*\)".*/\1/')

    if [ -n "$last_tool" ]; then
      case "$last_tool" in
        Task)
          local agent_count
          agent_count=$(echo "$recent_block" | grep -c '"type":"tool_use","id":"[^"]*","name":"Task"')
          if [ "$agent_count" -gt 1 ]; then
            echo "${agent_count} Agents"
          else
            local agent_desc
            agent_desc=$(echo "$recent_block" | grep -o '"description":"[^"]*"' | tail -1 | sed 's/"description":"//;s/"$//')
            if [ -n "$agent_desc" ]; then
              echo "Agent($(echo "$agent_desc" | cut -c1-20))"
            else
              echo "Agent"
            fi
          fi ;;
        Read)            echo "Read" ;;
        Write)           echo "Write" ;;
        Edit)            echo "Edit" ;;
        MultiEdit)       echo "Multi Edit" ;;
        Glob)            echo "Search(Files)" ;;
        Grep)            echo "Search(Content)" ;;
        Bash)            echo "Terminal" ;;
        WebSearch)       echo "Web Search" ;;
        WebFetch)        echo "Web Fetch" ;;
        Skill)           echo "Skill" ;;
        AskUserQuestion) echo "Asking..." ;;
        EnterPlanMode)   echo "Planning" ;;
        ExitPlanMode)    echo "Plan Ready" ;;
        TaskCreate)      echo "Task Create" ;;
        TaskUpdate)      echo "Task Update" ;;
        TaskGet)         echo "Task Get" ;;
        TaskList)        echo "Task List" ;;
        TaskStop)        echo "Task Stop" ;;
        TaskOutput)      echo "Task Output" ;;
        NotebookEdit)    echo "Notebook" ;;
        *)               echo "$last_tool" ;;
      esac
      return
    fi
  fi

  # Fallback: check .ccs/task.md
  local task_file="${cwd}/.ccs/task.md"
  if [ -f "$task_file" ]; then
    local last_skill
    last_skill=$(grep -oE '/ccs-[a-z]+' "$task_file" 2>/dev/null | tail -1)
    [ -n "$last_skill" ] && { echo "$last_skill"; return; }
  fi

  echo "Idle"
}

if [ -n "$clean_cwd" ]; then
  SL_SKILL=$(cache_get "skill-label" "_detect_skill '$clean_cwd'" 2)
fi

# --- 6h. New fields ---

# Session duration
dur_ms=$(json_nested "cost" "total_duration_ms")
[ -z "$dur_ms" ] && dur_ms=0
SL_DURATION=$(fmt_duration "$dur_ms")

# Lines changed
SL_LINES_ADDED=$(json_nested "cost" "total_lines_added")
SL_LINES_REMOVED=$(json_nested "cost" "total_lines_removed")
[ -z "$SL_LINES_ADDED" ] && SL_LINES_ADDED=0
[ -z "$SL_LINES_REMOVED" ] && SL_LINES_REMOVED=0

# API duration
api_ms=$(json_nested "cost" "total_api_duration_ms")
[ -z "$api_ms" ] && api_ms=0
SL_API_DURATION=$(fmt_duration "$api_ms")

# Vim mode (absent when vim is off)
SL_VIM_MODE=""
if [ "$cfg_show_vim" = "true" ]; then
  SL_VIM_MODE=$(json_nested_val "vim" "mode")
fi

# Agent name (absent when not in agent mode)
SL_AGENT_NAME=""
if [ "$cfg_show_agent" = "true" ]; then
  SL_AGENT_NAME=$(json_nested_val "agent" "name")
fi

# Cache stats (formatted)
SL_CACHE_CREATE=$(fmt_tok "$cur_cache_create")
SL_CACHE_READ=$(fmt_tok "$cur_cache_read")

# Burn rate (cost per minute)
SL_BURN_RATE=""
if [ "$cfg_show_burn_rate" = "true" ] && [ "$dur_ms" -gt 60000 ] 2>/dev/null; then
  SL_BURN_RATE=$(awk -v cost="$cost_raw" -v ms="$dur_ms" \
    'BEGIN { if (ms > 0 && cost+0 > 0) { rate = cost / (ms / 60000); printf "$%.2f/m", rate } }')
fi

# Exceeds 200k flag
SL_EXCEEDS_200K=""
[ -n "$(json_bool "exceeds_200k_tokens")" ] && SL_EXCEEDS_200K="true"

# Version
SL_VERSION=$(json_val "version")

# ── 7. Dynamic column widths ──
SL_C1=$(( SL_TERM_WIDTH / 2 - 4 ))
[ "$SL_C1" -lt 25 ] && SL_C1=25
[ "$SL_C1" -gt 42 ] && SL_C1=42

# ── 8. Source layout and render ──
layout_file="${STATUSLINE_DIR}/layouts/${active_layout}.sh"
if [ -f "$layout_file" ]; then
  source "$layout_file"
else
  source "${STATUSLINE_DIR}/layouts/standard.sh"
fi

render_layout
