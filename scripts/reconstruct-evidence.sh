#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

rebuild() {
  local parts="$1"
  local out="$2"
  cat "$parts"/part-*.jsonl > "$out"
  sha256sum "$out"
}

mkdir -p "$ROOT/.reconstructed"
rebuild "$ROOT/data/baselines/KOL-WS-BASELINE-001/results" "$ROOT/.reconstructed/KOL-WS-BASELINE-001-results.jsonl"
rebuild "$ROOT/data/evals/KOL-WS-REPEAT-001/results" "$ROOT/.reconstructed/KOL-WS-REPEAT-001-results.jsonl"
