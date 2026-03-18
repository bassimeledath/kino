#!/usr/bin/env bash
set -euo pipefail

# Kino Benchmark — Scores the app for swarmy
# Outputs JSON with "score" field to stdout. All logs to stderr.
# Compatible with bash 3.2 (macOS default)

PORT="${KINO_CDP_PORT:-9222}"
BASELINES_DIR="${KINO_BASELINES_DIR:-benchmarks/baselines}"
HUMAN_SCORES="${KINO_HUMAN_SCORES:-benchmarks/human-scores.json}"
AB="agent-browser"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

log() { echo "[benchmark] $*" >&2; }

# ── Preflight ───────────────────────────────────────
command -v "$AB" >/dev/null || { echo '{"score":0,"error":"agent-browser not found"}'; exit 2; }

# ── Build the app ───────────────────────────────────
log "Building Kino..."
cd "$PROJECT_DIR"
if ! npm run build >/dev/null 2>&1; then
  log "Build failed"
  echo '{"score":0,"error":"build failed"}'
  exit 0
fi

# ── Launch Kino with CDP ────────────────────────────
log "Launching Kino on CDP port $PORT..."
npx electron ./dist/main/index.js --remote-debugging-port=$PORT &>/dev/null &
KINO_PID=$!
trap "kill $KINO_PID 2>/dev/null; wait $KINO_PID 2>/dev/null" EXIT

# Wait for CDP
CDP_READY=false
for i in $(seq 1 20); do
  if curl -sf "http://localhost:$PORT/json/version" >/dev/null 2>&1; then
    CDP_READY=true
    break
  fi
  sleep 1
done

if [ "$CDP_READY" = false ]; then
  log "CDP connection timeout"
  echo '{"score":0,"error":"CDP timeout"}'
  exit 0
fi

log "CDP connected"
sleep 2

# ── Feature Checks (simple variables, bash 3 compatible) ──

pass=0
total=0
checks_json=""

check() {
  local name="$1"
  local result="$2"  # "1" or "0"
  total=$((total + 1))
  pass=$((pass + result))
  if [ "$result" = "1" ]; then
    log "  $name: PASS"
    val="true"
  else
    log "  $name: FAIL"
    val="false"
  fi
  if [ -n "$checks_json" ]; then checks_json="$checks_json,"; fi
  checks_json="$checks_json\"$name\":$val"
}

# Launch check
title=$($AB get title --json 2>/dev/null || echo '{}')
if echo "$title" | grep -q '"title"'; then
  check "launch" 1
else
  check "launch" 0
fi

# Console errors
$AB eval "window.__errs=[]; window.addEventListener('error', e => window.__errs.push(e.message))" >/dev/null 2>&1 || true
sleep 1
err_result=$($AB eval "window.__errs?.length ?? -1" --json 2>/dev/null || echo '{}')
if echo "$err_result" | grep -q '"data":0\|"data":"0"'; then
  check "no_errors" 1
else
  check "no_errors" 0
fi

# UI element checks
for elem in record-btn settings export-btn zoom-toggle; do
  result=$($AB is visible "[data-testid=$elem]" --json 2>/dev/null || echo '{}')
  if echo "$result" | grep -q 'true'; then
    check "$elem" 1
  else
    check "$elem" 0
  fi
done

# Record flow — click record, check stop button appears
$AB click "[data-testid=record-btn]" >/dev/null 2>&1 || true
sleep 2
stop_result=$($AB is visible "[data-testid=stop-btn]" --json 2>/dev/null || echo '{}')
if echo "$stop_result" | grep -q 'true'; then
  check "record_flow" 1
else
  check "record_flow" 0
fi
$AB click "[data-testid=stop-btn]" >/dev/null 2>&1 || true
sleep 1

# Timeline visible after recording
timeline_result=$($AB is visible "[data-testid=timeline]" --json 2>/dev/null || echo '{}')
if echo "$timeline_result" | grep -q 'true'; then
  check "timeline" 1
else
  check "timeline" 0
fi

# Settings panel opens
$AB click "[data-testid=settings]" >/dev/null 2>&1 || true
sleep 1
settings_result=$($AB is visible "[data-testid=settings-panel]" --json 2>/dev/null || echo '{}')
if echo "$settings_result" | grep -q 'true'; then
  check "settings_open" 1
else
  check "settings_open" 0
fi

# ── Calculate auto feature score ────────────────────
if [ "$total" -gt 0 ]; then
  auto_feature_score=$(echo "scale=4; $pass / $total" | bc)
else
  auto_feature_score="0"
fi
log "Auto features: $pass/$total = $auto_feature_score"

# ── Visual Diff Checks ─────────────────────────────
visual_score="0"
visual_count=0
visual_sum="0"

if [ -d "$BASELINES_DIR" ] && ls "$BASELINES_DIR"/*.png >/dev/null 2>&1; then
  for baseline in "$BASELINES_DIR"/*.png; do
    name=$(basename "$baseline" .png)
    result=$($AB diff screenshot --baseline "$baseline" --json 2>/dev/null || echo '{}')
    mismatch=$(echo "$result" | grep -o '"mismatchPercentage":[0-9.]*' | head -1 | cut -d: -f2 || echo "1")
    if [ -z "$mismatch" ]; then mismatch="1"; fi
    similarity=$(echo "scale=4; 1 - $mismatch" | bc 2>/dev/null || echo "0")
    if [ "$(echo "$similarity < 0" | bc)" = "1" ]; then similarity="0"; fi
    visual_sum=$(echo "$visual_sum + $similarity" | bc)
    visual_count=$((visual_count + 1))
    log "  visual_$name: $similarity"
  done
  if [ "$visual_count" -gt 0 ]; then
    visual_score=$(echo "scale=4; $visual_sum / $visual_count" | bc)
  fi
fi
log "Visual score: $visual_score"

# ── Human Scores ───────────────────────────────────
has_human=false
human_score="0"
human_round="null"

if [ -f "$HUMAN_SCORES" ]; then
  human_raw=$(python3 -c "import json; d=json.load(open('$HUMAN_SCORES')); print(sum(d['scores'].values())/len(d['scores']))" 2>/dev/null || echo "0")
  human_score=$(echo "scale=4; $human_raw / 5" | bc 2>/dev/null || echo "0")
  human_round=$(python3 -c "import json; print(json.load(open('$HUMAN_SCORES'))['round'])" 2>/dev/null || echo "null")
  has_human=true
fi
log "Human score: $human_score (has_human=$has_human)"

# ── Final Score ─────────────────────────────────────
if [ "$has_human" = true ]; then
  final=$(echo "scale=4; 0.35 * $auto_feature_score + 0.25 * $visual_score + 0.40 * $human_score" | bc)
else
  final=$(echo "scale=4; 0.55 * $auto_feature_score + 0.45 * $visual_score" | bc)
fi

# Clamp to [0, 1]
final=$(echo "$final" | awk '{if ($1 > 1) print 1; else if ($1 < 0) print 0; else print $1}')
log "Final score: $final"

# ── Output ──────────────────────────────────────────
cat <<OUTJSON
{"score":$final,"breakdown":{"auto_features":{"score":$auto_feature_score,"weight":0.35,"pass":$pass,"total":$total,"checks":{$checks_json}},"auto_visual":{"score":$visual_score,"weight":0.25},"human":{"score":$human_score,"weight":$([ "$has_human" = true ] && echo "0.40" || echo "0"),"round":$human_round}}}
OUTJSON
