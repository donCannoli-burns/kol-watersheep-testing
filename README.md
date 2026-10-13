# KoL × WaterSheep Testing

A small, deterministic **KoL/KoLmafia-shaped mock environment, recorder, and evaluation harness** for testing [WaterSheep][watersheep] locally.

> **Upstream model:** [SamratDuttaOfficial/WaterSheep][watersheep]. This repository is only a KoL-specific test rig; it does not replace or rebrand WaterSheep. If this experiment is useful to you, please star the original project too.

This repository is intentionally narrow. It does **not** emulate all of Kingdom of Loathing or KoLmafia, does not connect to live KoL, and should never receive live credentials or session material. The point is to create controlled, replayable decision problems that look enough like KoL/KoLmafia state to measure a small decision model without risking a live account.

> **Current status:** two frozen experiments are published here: `KOL-WS-BASELINE-001` and `KOL-WS-REPEAT-001`. The option-order suite is implemented but has not yet been published as a completed result.

> **Experimental branch:** `experiment/interaction-curriculum-v2` adds a new balanced KoL automation-interaction curriculum inspired by behavioral patterns in autoscend and Loopstar. It adds **56 core / 112 full** deterministic scenarios across seven control outcomes without modifying the frozen baseline. See [`docs/INTERACTION_CURRICULUM.md`](docs/INTERACTION_CURRICULUM.md).

> **Interaction results now published:** the completed 56-case core, 112-case full, 16-case state slice, and 21-case control slice are summarized in [`docs/INTERACTION_RESULTS.md`](docs/INTERACTION_RESULTS.md). The full suite reached **63.39%** control-action accuracy with a stable signature: proceed 16/16, reroute 16/16, need_context 15/16, reconcile 14/16, wait 8/16, restore 2/16, stop 0/16.
>
> **Next suite:** [`KOL-WS-MINPAIR-001`](docs/MINPAIR-001.md) contains **250 deterministic one-fact pairs / 500 model observations** to test directional probability movement at the restore, wait, reconcile, need-context, and reroute→stop boundaries.

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

The first frozen run completed all **100/100 final scenarios successfully** against model ID `watersheep-20260928-125452`. The public aggregate report is the [`baseline manifest`](data/baselines/KOL-WS-BASELINE-001/manifest.json); preserved transient collection failures are in [`failures.jsonl`](data/baselines/KOL-WS-BASELINE-001/failures.jsonl). The SHA-256 of the original completed local `results.jsonl` is published in [`data/EVIDENCE_HASHES.txt`](data/EVIDENCE_HASHES.txt). [4]

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

The main baseline failure mode is easy to see in the derived analysis: the model predicted `runtime` for **98/100** domain questions and `combat` for the other 2. In other words, the 12% domain accuracy is not a subtle miss; the current domain prompt/label formulation has a strong `runtime` attractor. The corresponding reasoning-depth output also collapses heavily toward `uncertain` (**86/100**). See the publication [`baseline analysis summary`](data/analyses/KOL-WS-BASELINE-001-analysis-summary.json), which records the SHA-256 of the full local analysis artifact and the source results it was derived from. [5]

The anomaly signal is more promising. When each family is paired against its own clean case, anomalous perturbations moved the anomaly probability upward in **85%** of the 60 anomalous pairs, with mean delta **+0.384672**. Contradiction, instruction-like contamination, irrelevant noise, and unknown-entity variants moved upward in **10/10 families each**. Missing-context was much weaker: only **4/10** families moved upward. Benign perturbations averaged **-0.053417** relative to their clean pair. [5]

The same analysis reports anomaly ECE **0.224052** on this corpus. That should be read alongside the Brier score rather than as a claim that the probabilities are already well calibrated for KoL. [5]

Context selection is asymmetric as well. Overall precision is high, but recall is much lower. In the per-label analysis, `market_data` reached precision/recall **1.0/1.0** on 10 supported cases, `live_state` **1.0/0.65**, and `quest_reference` **1.0/0.70**; meanwhile `player_memory` and `script_docs` had zero recall in this baseline. [5]

#### Collection failures are preserved

The final corpus contains 100 successful rows, but collection was not magically failure-free. Two aborted attempts for `baseline-0047` were appended to [`failures.jsonl`](data/baselines/KOL-WS-BASELINE-001/failures.jsonl) before the scenario later completed successfully. They are intentionally published rather than removed from provenance. [4]

Original completed-run source-artifact hashes:

```text
results.jsonl  a44134e0ff638655586aeb6ac99e8885583092ae55e3e6b06bfebc670643eb40
manifest.json  8621c667832bae4b6b37f20b67952c785ec09cf465816181bc34d25297c297ea
analysis-v1    ed9c6b46ab1f267798a2a43d78d532d4778dadc9a33a7426ef83f4e2aee3f8b0
```

Those hashes identify the original local completed-run artifacts. The GitHub publication manifest is normalized JSON and is **not** claimed byte-identical to the source manifest. The analysis summary records the source hashes and the corpus/question-set hashes used for provenance. [5]

### 2. `KOL-WS-REPEAT-001`

The repeatability suite selected the 10 contradiction scenarios — one from each family — and sent the **identical observation and identical four-question request five times each**: 50 inference calls total. The public aggregate report is the [`repeat manifest`](data/evals/KOL-WS-REPEAT-001/manifest.json); the SHA-256 of the original completed local `results.jsonl` is preserved in [`data/EVIDENCE_HASHES.txt`](data/EVIDENCE_HASHES.txt). [6]

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

Original repeat source-artifact hashes:

```text
results.jsonl  b606017aa7ec25ce2fc02ccd8907928c01f76bc4fb0e8da0dda1d28d18ec6a37
manifest.json  8fe436338e875cd5f897f50224e9b670c65a3f8dc4a27c1f13d0b7e9934fe1a8
```

As with the baseline, these are hashes of the original completed local artifacts. The first public import mirrors the aggregate report and provenance hashes; it does not claim that the normalized GitHub JSON has the same byte hash.

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

The public repo runs directly from TypeScript source using `tsx`.

```bash
git clone https://github.com/donCannoli-burns/kol-watersheep-testing.git
cd kol-watersheep-testing
npm install

./run-kol-mock-lab test
./run-kol-mock-lab smoke
```

The repository includes the no-inference analysis source and a published condensed analysis summary. Re-running that analysis requires the original row-level `results.jsonl`; the first public import publishes its SHA-256 and aggregate evidence rather than mirroring the full raw row corpus.

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
src/                         TypeScript runtime + eval source
tests/                       source tests
docs/                        architecture/provenance notes
data/
  baselines/
    KOL-WS-BASELINE-001/     aggregate manifest + preserved failures
  analyses/                  publication analysis summary
  evals/
    KOL-WS-REPEAT-001/       aggregate repeatability manifest
  EVIDENCE_HASHES.txt        hashes of original completed-run artifacts
run-kol-mock-lab             source launcher
```

## References / citations

1. **WaterSheep** — original open-weight decision model. The upstream repository describes it as returning calibrated answers to yes/no, choice, score, and multi-label questions and is licensed Apache-2.0: [SamratDuttaOfficial/WaterSheep][watersheep].
2. **KoLmafia** — the desktop client whose state vocabulary and runtime shape inform parts of this synthetic test surface: [kolmafia/kolmafia][kolmafia].
3. **kolmafia-mock** — related TypeScript KoLmafia mocking work: [loathers/kolmafia-mock][kolmafia-mock].
4. **`KOL-WS-BASELINE-001` evidence** — [`manifest.json`](data/baselines/KOL-WS-BASELINE-001/manifest.json), [`failures.jsonl`](data/baselines/KOL-WS-BASELINE-001/failures.jsonl), and [`EVIDENCE_HASHES.txt`](data/EVIDENCE_HASHES.txt).
5. **Baseline derived analysis** — [`KOL-WS-BASELINE-001-analysis-summary.json`](data/analyses/KOL-WS-BASELINE-001-analysis-summary.json).
6. **`KOL-WS-REPEAT-001` evidence** — [`manifest.json`](data/evals/KOL-WS-REPEAT-001/manifest.json) and [`EVIDENCE_HASHES.txt`](data/EVIDENCE_HASHES.txt).

## License

The harness code in this repository is MIT licensed. WaterSheep is a separate upstream project and is not vendored here; see its own Apache-2.0 license. KoLmafia and other referenced projects retain their own licenses.

[watersheep]: https://github.com/SamratDuttaOfficial/WaterSheep
[kolmafia]: https://github.com/kolmafia/kolmafia
[kolmafia-mock]: https://github.com/loathers/kolmafia-mock
