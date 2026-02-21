#!/usr/bin/env bash
# benchmark.sh — Compare a0 (TypeScript) vs a0go (Go native) performance
#
# Usage:
#   ./benchmark.sh              # run all benchmarks
#   ./benchmark.sh --rounds 10  # custom number of rounds per scenario

set -euo pipefail

# Ensure Go and GOPATH/bin are in PATH (needed when bash is invoked from PowerShell)
export PATH="$HOME/go/bin:/c/Program Files/Go/bin:$PATH"

ROUNDS=5
while [[ $# -gt 0 ]]; do
  case $1 in
    --rounds) ROUNDS="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

SCENARIOS_DIR="packages/scenarios/scenarios"

# Scenarios: pure computation, exit 0, no capabilities needed
SCENARIOS=(
  arithmetic
  for-loop
  fn-basic
  fn-recursive
  map-fn
  filter-block
  match-ok
  loop-basic
  stdlib-filter-find-sort
  stdlib-lists
  stdlib-records
  stdlib-strings
)

# Resolve CLI paths (support both Unix and Windows .exe names)
A0=$(command -v a0 || command -v a0.exe || true)
A0GO=$(command -v a0go || command -v a0go.exe || true)

if [[ -z "$A0" ]]; then
  echo "ERROR: a0 (TypeScript CLI) not found in PATH" >&2
  exit 1
fi
if [[ -z "$A0GO" ]]; then
  echo "ERROR: a0go (Go CLI) not found in PATH" >&2
  exit 1
fi

# Find the .a0 source file for a scenario (parse cmd from scenario.json)
find_source() {
  local dir="$1"
  local f
  for f in "$dir"/*.a0; do
    if [[ -f "$f" ]]; then
      echo "$f"
      return
    fi
  done
}

# Get milliseconds since epoch using bash EPOCHREALTIME (bash 5+) or fallback
if [[ -n "${EPOCHREALTIME:-}" ]]; then
  now_ms() {
    local t="$EPOCHREALTIME"
    local sec="${t%%.*}"
    local frac="${t##*.}"
    # Pad/trim to 3 digits for milliseconds
    frac="${frac}000"
    echo "${sec}${frac:0:3}"
  }
else
  # Fallback: powershell for Windows
  now_ms() {
    powershell -NoProfile -Command '[long]([DateTime]::UtcNow - [DateTime]::new(1970,1,1)).TotalMilliseconds'
  }
fi

# Time a command, return elapsed milliseconds
time_ms() {
  local start end
  start=$(now_ms)
  "$@" >/dev/null 2>&1 || true
  end=$(now_ms)
  echo $(( end - start ))
}

# Header
printf "\n"
printf "A0 Performance Benchmark: TypeScript (a0) vs Go (a0go)\n"
printf "=======================================================\n"
printf "Rounds per scenario: %d\n\n" "$ROUNDS"
printf "%-28s %10s %10s %10s\n" "SCENARIO" "a0 (ms)" "a0go (ms)" "SPEEDUP"
printf "%-28s %10s %10s %10s\n" "----------------------------" "----------" "----------" "----------"

total_ts=0
total_go=0
count=0

for scenario in "${SCENARIOS[@]}"; do
  dir="$SCENARIOS_DIR/$scenario"
  if [[ ! -d "$dir" ]]; then
    printf "%-28s %10s\n" "$scenario" "SKIP (missing)"
    continue
  fi

  source_file=$(find_source "$dir")
  if [[ -z "$source_file" ]]; then
    printf "%-28s %10s\n" "$scenario" "SKIP (no .a0)"
    continue
  fi

  # Warmup (1 run each, discarded)
  "$A0" run "$source_file" --unsafe-allow-all >/dev/null 2>&1 || true
  "$A0GO" run "$source_file" --unsafe-allow-all >/dev/null 2>&1 || true

  # Benchmark a0 (TypeScript)
  ts_total=0
  for ((i = 0; i < ROUNDS; i++)); do
    ms=$(time_ms "$A0" run "$source_file" --unsafe-allow-all)
    ts_total=$((ts_total + ms))
  done
  ts_avg=$((ts_total / ROUNDS))

  # Benchmark a0go (Go)
  go_total=0
  for ((i = 0; i < ROUNDS; i++)); do
    ms=$(time_ms "$A0GO" run "$source_file" --unsafe-allow-all)
    go_total=$((go_total + ms))
  done
  go_avg=$((go_total / ROUNDS))

  # Compute speedup (integer math: multiply by 10 for one decimal place)
  if [[ $go_avg -gt 0 ]]; then
    speedup_x10=$(( ts_avg * 10 / go_avg ))
    speedup_whole=$(( speedup_x10 / 10 ))
    speedup_frac=$(( speedup_x10 % 10 ))
    speedup="${speedup_whole}.${speedup_frac}x"
  else
    speedup="n/a"
  fi

  printf "%-28s %10d %10d %10s\n" "$scenario" "$ts_avg" "$go_avg" "$speedup"

  total_ts=$((total_ts + ts_avg))
  total_go=$((total_go + go_avg))
  count=$((count + 1))
done

printf "%-28s %10s %10s %10s\n" "----------------------------" "----------" "----------" "----------"

if [[ $count -gt 0 ]]; then
  avg_ts=$((total_ts / count))
  avg_go=$((total_go / count))
  if [[ $avg_go -gt 0 ]]; then
    speedup_x10=$(( avg_ts * 10 / avg_go ))
    speedup_whole=$(( speedup_x10 / 10 ))
    speedup_frac=$(( speedup_x10 % 10 ))
    avg_speedup="${speedup_whole}.${speedup_frac}x"
  else
    avg_speedup="n/a"
  fi
  printf "%-28s %10d %10d %10s\n" "AVERAGE" "$avg_ts" "$avg_go" "$avg_speedup"
fi

printf "\n"
