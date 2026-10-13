# KoL × WaterSheep Testing

A small, deterministic **KoL/KoLmafia-shaped mock environment, recorder, and evaluation harness** for testing [WaterSheep][watersheep] locally.

This repository is intentionally narrow. It does **not** emulate all of Kingdom of Loathing or KoLmafia, does not connect to live KoL, and should never receive live credentials or session material. The point is to create controlled, replayable decision problems that look enough like KoL/KoLmafia state to measure a small decision model without risking a live account.

> **Current status:** two frozen experiments are published here: `KOL-WS-BASELINE-001` and `KOL-WS-REPEAT-001`. The option-order suite is implemented but has not yet been published as a completed result.

## Why this exists

[WaterSheep][watersheep] describes itself as a decision model that returns calibrated answers for yes/no, choice, score, and multi-label questions. This repo asks a more domain-specific question: **what happens when that kind of small local model is used as a System-1-style assessor over KoL/KoLmafia-shaped evidence?** [1]

The harness therefore separates four things:

```text
synthetic KoL state
      │
      ▼
deterministic mock runtime
      │
      ├── bounded observation shown to the model
      └── hidden evaluator truth
                  │
                  ▼
              WaterSheep
                  │
                  ▼
       probability-bearing answers
                  │
                  ▼
       append-only result evidence
                  │
                  ▼
          scorer / analysis
```

The mock surfaces are inspired by KoLmafia-shaped state and by prior TypeScript mocking work such as [`loathers/kolmafia-mock`][kolmafia-mock], but this repository does not claim full KoLmafia compatibility and does not vendor either KoLmafia or `kolmafia-mock`. [2][3]

## Experimental setup

The baseline corpus is deterministic from seed `20261011`. It contains **100 scenarios = 10 families × 10 variants**. Scenario IDs exposed to the model are opaque (`baseline-0001` … `baseline-0100`) so the family/variant labels are not leaked through the ID.

Families:

- quest
- effects
- inventory
- equipment
- combat
- runtime
- script
- economy
- social
- general

Variants:

- clean
- recent transition
- irrelevant noise
- missing context
- stale property
- contradiction
- instruction-like contamination
- unknown entity
- resource pressure
- compound reasoning

For each observation the evaluator keeps hidden truth for:

- domain;
- required context classes;
- reasoning depth;
- whether the observation should be treated as anomalous.

WaterSheep receives the bounded observation plus a fixed four-question routing request and returns probability-bearing answers for domain, context needed, reasoning depth, and anomaly likelihood. Ground-truth labels stay on the evaluator side. The request/response code is in [`src/watersheep.ts`](src/watersheep.ts), and the deterministic corpus generator is in [`src/scenarios.ts`](src/scenarios.ts).

### Authority boundary

This is an **inference-only mock lab**. WaterSheep does not execute KoL actions, grant permission, update a Q-table, or train online. Those constraints are recorded in the result/manifest artifacts as well as the runtime code.

## Current results

### 1. `KOL-WS-BASELINE-001`

The first frozen run completed all **100/100 final scenarios successfully** against model ID `watersheep-20260928-125452`. The complete machine-readable report is the [`baseline manifest`](data/baselines/KOL-WS-BASELINE-001/manifest.json), with all raw per-scenario rows preserved in the [`results/` parts](data/baselines/KOL-WS-BASELINE-001/results/). Concatenating the numbered parts reproduces the original `results.jsonl` byte-for-byte. [4]

| Metric | Result |
|---|---:|
| Domain accuracy | **0.12** |
| Context micro precision | **0.9000** |
| Context micro recall | **0.5204** |
| Context micro F1 | **0.6595** |
| Reasoning-depth accuracy | **0.30** |
| Reasoning-depth `uncertain` rate | **0.86** |
| Anomaly accuracy | **0.73** |
| Anomaly Brier score | **0.190146** |
| Mean request latency | **5837.4 ms** |

The main baseline failure mode is easy to see in the derived analysis: the model predicted `runtime` for **98/100** domain questions and `combat` for the other 2. In other words, the 12% domain accuracy is not a subtle miss; the current domain prompt/label formulation has a strong `runtime` attractor. The corresponding reasoning-depth output also collapses heavily toward `uncertain` (**86/100**). See the frozen [`baseline analysis`](data/analyses/KOL-WS-BASELINE-001-analysis-v1.json). [5]

The anomaly signal is more promising. When each family is paired against its own clean case, anomalous perturbations moved the anomaly probability upward in **85%** of the 60 anomalous pairs, with mean delta **+0.384672**. Contradiction, instruction-like contamination, irrelevant noise, and unknown-entity variants moved upward in **10/10 families each**. Missing-context was much weaker: only **4/10** families moved upward. Benign perturbations averaged **-0.053417** relative to their clean pair. [5]

The same analysis reports anomaly ECE **0.224052** on this corpus. That should be read alongside the Brier score rather than as a claim that the probabilities are already well calibrated for KoL. [5]

Context selection is asymmetric as well. Overall precision is high, but recall is much lower. In the per-label analysis, `market_data` reached precision/recall **1.0/1.0** on 10 supported cases, `live_state` **1.0/0.65**, and `quest_reference` **1.0/0.70**; meanwhile `player_memory` and `script_docs` had zero recall in this baseline. [5]

#### Collection failures are preserved

The final corpus contains 100 successful rows, but collection was not magically failure-free. Two aborted attempts for `baseline-0047` were appended to [`failures.jsonl`](data/baselines/KOL-WS-BASELINE-001/failures.jsonl) before the scenario later completed successfully. They are intentionally published rather than removed from provenance. [4]

Baseline evidence hashes:

```text
results.jsonl  a44134e0ff638655586aeb6ac99e8885583092ae55e3e6b06bfebc670643eb40
manifest.json  8621c667832bae4b6b37f20b67952c785ec09cf465816181bc34d25297c297ea
analysis-v1    ed9c6b46ab1f267798a2a43d78d532d4778dadc9a33a7426ef83f4e2aee3f8b0
```

The analysis itself records and verifies the baseline results/manifest SHA-256 values and confirms the corpus hash and question-set hash still match the current deterministic generator. [5]

### 2. `KOL-WS-REPEAT-001`

The repeatability suite selected the 10 contradiction scenarios — one from each family — and sent the **identical observation and identical four-question request five times each**: 50 inference calls total. The complete report is in the [`repeat manifest`](data/evals/KOL-WS-REPEAT-001/manifest.json), with raw rows preserved in the [`results/` parts](data/evals/KOL-WS-REPEAT-001/results/). Concatenating the numbered parts reproduces the original `results.jsonl` byte-for-byte. [6]

| Metric | Result |
|---|---:|
| Successful calls | **50 / 50** |
| Complete scenarios | **10 / 10** |
| Repeats per scenario | **5** |
| Exact scenario rate | **1.0** |
| Exact repeat-comparison rate | **1.0** |
| Maximum numeric probability drift | **0** |
| Mean request latency | **8959 ms** |

So, within the scope of this experiment, WaterSheep showed **perfect observed repeatability**: every compared answer object matched across identical repeats, with zero observed numeric probability drift. This is intentionally a scoped claim about these 10 scenarios and this model checkpoint, not a claim of universal determinism. [6]

Repeat evidence hashes:

```text
results.jsonl  b606017aa7ec25ce2fc02ccd8907928c01f76bc4fb0e8da0dda1d28d18ec6a37
manifest.json  8fe436338e875cd5f897f50224e9b670c65a3f8dc4a27c1f13d0b7e9934fe1a8
```

### Reconstruct and verify the frozen JSONL evidence

The raw result rows are split into 10-row text parts only to keep the GitHub evidence easy to browse and upload. Reconstruct the exact original byte streams and verify the published SHA-256 values with:

```bash
./scripts/reconstruct-evidence.sh
```

Expected hashes:

```text
KOL-WS-BASELINE-001  a44134e0ff638655586aeb6ac99e8885583092ae55e3e6b06bfebc670643eb40
KOL-WS-REPEAT-001    b606017aa7ec25ce2fc02ccd8907928c01f76bc4fb0e8da0dda1d28d18ec6a37
```

## What the current evidence supports

The current runs support a fairly narrow interpretation:

- WaterSheep was **highly repeatable** on identical KoL-shaped contradiction inputs in `KOL-WS-REPEAT-001`. [6]
- The baseline anomaly output contains a useful directional signal for several perturbation types, especially contradiction, instruction-like contamination, irrelevant noise, and unknown entities. [5]
- The current domain routing formulation performs poorly and is dominated by a `runtime` attractor. [4][5]
- Context predictions are precise when emitted but miss substantial required context, so the present model output should not be used as authority to discard context. [4][5]
- Reasoning-depth routing is not useful yet under the current formulation because `uncertain` dominates the output. [4][5]

What these runs **do not** establish:

- performance against live KoL or live KoLmafia;
- safety or correctness of autonomous actions;
- general WaterSheep accuracy outside this synthetic corpus;
- cross-hardware latency performance;
- universal determinism;
- that the current label wording is optimal.

The artifacts do not yet record enough host hardware metadata for a meaningful hardware-normalized latency claim, so the published latency values should be treated as run-local observations.

## Next experiment: option-order sensitivity

`KOL-WS-ORDER-001` is implemented in [`src/watersheep-order.ts`](src/watersheep-order.ts) but **no completed result is claimed here yet**. It holds the observation fixed while permuting the insertion order of domain labels and records winner flips plus probability-vector drift. Because `KOL-WS-REPEAT-001` observed zero repeat drift, order sensitivity can be separated more cleanly from ordinary run-to-run variation.

## Run it locally

Requirements:

- Node.js 20+
- a local WaterSheep service for inference suites

The compiled `dist/` runtime is committed so you do not need a TypeScript toolchain merely to reproduce the shipped tests.

```bash
git clone https://github.com/donCannoli-burns/kol-watersheep-testing.git
cd kol-watersheep-testing

./run-kol-mock-lab test
./run-kol-mock-lab smoke
```

Run the analysis over the already-published frozen baseline without making a new model call:

```bash
./run-kol-mock-lab watersheep-baseline-analysis
```

For new inference runs, start WaterSheep separately and point the harness at it:

```bash
export WATERSHEEP_URL=http://127.0.0.1:8766/v1/decisions

# New baseline: use a NEW ID rather than overwriting KOL-WS-BASELINE-001
BASELINE_ID=KOL-WS-BASELINE-002 ./run-kol-mock-lab watersheep-baseline

# Robustness suites
EVAL_ID=KOL-WS-ORDER-001 ./run-kol-mock-lab watersheep-order
EVAL_ID=KOL-WS-REPEAT-002 ./run-kol-mock-lab watersheep-repeat
```

Completed manifests are treated as immutable. New checkpoint, model, prompt wording, selection, or experimental condition should get a new experiment ID rather than rewriting old evidence.

## Repository layout

```text
src/                         TypeScript source
dist/                        committed runnable JS + tests
tests/                       source tests
docs/                        architecture/provenance notes
data/
  baselines/
    KOL-WS-BASELINE-001/     frozen baseline rows + manifest + failures
  analyses/                  derived no-inference analysis
  evals/
    KOL-WS-REPEAT-001/       frozen repeatability rows + manifest
run-kol-mock-lab             standalone launcher
```

## References / citations

1. **WaterSheep** — original open-weight decision model. The upstream repository describes it as returning calibrated answers to yes/no, choice, score, and multi-label questions and is licensed Apache-2.0: [SamratDuttaOfficial/WaterSheep][watersheep].
2. **KoLmafia** — the desktop client whose state vocabulary and runtime shape inform parts of this synthetic test surface: [kolmafia/kolmafia][kolmafia].
3. **kolmafia-mock** — related TypeScript KoLmafia mocking work: [loathers/kolmafia-mock][kolmafia-mock].
4. **`KOL-WS-BASELINE-001` evidence** — [`manifest.json`](data/baselines/KOL-WS-BASELINE-001/manifest.json), [`results/`](data/baselines/KOL-WS-BASELINE-001/results/), and [`failures.jsonl`](data/baselines/KOL-WS-BASELINE-001/failures.jsonl).
5. **Baseline derived analysis** — [`KOL-WS-BASELINE-001-analysis-v1.json`](data/analyses/KOL-WS-BASELINE-001-analysis-v1.json).
6. **`KOL-WS-REPEAT-001` evidence** — [`manifest.json`](data/evals/KOL-WS-REPEAT-001/manifest.json) and [`results/`](data/evals/KOL-WS-REPEAT-001/results/).

## License

The harness code in this repository is MIT licensed. WaterSheep is a separate upstream project and is not vendored here; see its own Apache-2.0 license. KoLmafia and other referenced projects retain their own licenses.

[watersheep]: https://github.com/SamratDuttaOfficial/WaterSheep
[kolmafia]: https://github.com/kolmafia/kolmafia
[kolmafia-mock]: https://github.com/loathers/kolmafia-mock
