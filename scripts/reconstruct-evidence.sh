#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cat "$ROOT/data/EVIDENCE_HASHES.txt"
echo
echo "These are SHA-256 values of the original completed-run source artifacts."
echo "The first publication commit mirrors aggregate reports and provenance, not the raw JSONL row corpus."
