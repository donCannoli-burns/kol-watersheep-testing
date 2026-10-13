# Interaction Curriculum Results

These publication summaries preserve the completed aggregate results reported by the experiment operator. The original local `results.jsonl` and manifest bytes are not copied here yet, so this branch does **not** claim byte-for-byte identity with those local artifacts.

All four runs use interaction corpus:

```text
b5497229969312f8eb861d129949f96798d3a7c1eb25e76440a7648de0769f8a
```

## Headline results

| Run | Cases | Control accuracy | Context F1 | Block accuracy | Mean latency |
|---|---:|---:|---:|---:|---:|
| KOL-WS-INTERACTION-001 | 56 | **64.29%** | 0.6537 | 66.07% | 5864.8 ms |
| KOL-WS-INTERACTION-FULL-001 | 112 | **63.39%** | 0.6406 | 58.93% | 5773.6 ms |
| KOL-WS-INTERACTION-STATE-001 | 16 | **87.5%** | 0.6783 | 12.5% | 5284.6 ms |
| KOL-WS-INTERACTION-CONTROL-001 | 21 | **61.9%** | 0.6154 | 66.67% | 5562.5 ms |

## Full 112-case control signature

Expected label count is exactly 16 for every class.

| Expected | Correct | Accuracy | Dominant error |
|---|---:|---:|---|
| proceed | 16/16 | **100%** | — |
| reroute | 16/16 | **100%** | — |
| need_context | 15/16 | **93.75%** | 1 → reconcile |
| reconcile | 14/16 | **87.5%** | 2 → proceed |
| wait | 8/16 | **50%** | 7 → proceed; 1 → reconcile |
| restore | 2/16 | **12.5%** | 8 → reroute; 4 → reconcile; 2 → proceed |
| stop | 0/16 | **0%** | **16 → reroute** |

Prediction totals:

```text
reroute       40
proceed       27
reconcile     20
need_context  15
wait           8
restore        2
stop           0
```

The stable failure signature is therefore not random error. Under the current wording, WaterSheep strongly distinguishes `proceed`, `reroute`, `reconcile`, and `need_context`, partially recognizes `wait`, rarely emits `restore`, and never emits `stop`. Every full-suite `stop` case was mapped to `reroute`.

## Core → full stability

The 56-case core accuracy was 64.29%; the 112-case full accuracy was 63.39%, a difference of only **0.90 percentage points** after doubling the interaction-family count. That makes the broad control signature more interesting than a one-family prompt artifact.

## Next experiment

The next suite is `KOL-WS-MINPAIR-001`: 250 deterministic minimal pairs / **500 total model observations**. It is designed to test whether the relevant probability mass moves when one KoL-shaped fact changes, especially around the weak `restore`, `wait`, and `stop` boundaries.
