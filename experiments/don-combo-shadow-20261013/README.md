# don_combo × WaterSheep shadow-route experiment

This branch archives the **testing result**, not the don_combo implementation. The production/project code remains in [donCannoli-burns/don_combo](https://github.com/donCannoli-burns/don_combo); this repository remains the central place for KoL-specific WaterSheep testing.

Upstream model: [SamratDuttaOfficial/WaterSheep](https://github.com/SamratDuttaOfficial/WaterSheep).

## Experiment question

The frozen Shadow Route Lab asks:

> **Does dynamic reassessment beat Combo's deterministic next target?**

The test deliberately separates three layers:

- **FACT** — KoLmafia-local state, Combo's rare corpus, and the local observation ledger.
- **MODEL** — WaterSheep score mass from a blinded evidence contract.
- **POLICY** — fixed utility weights outside the model.

Known rare coordinates/counts, Combo target identity/order, candidate source labels, baseline membership, and Combo-derived outcome labels were withheld from WaterSheep input. The runtime was **shadow-only** and granted the model **no execution authority**.

## Source snapshot

The summary is derived from the frozen HTML snapshot:

```text
don_combo-shadow-2026-10-13T13-03-48-228Z-a50e606ddf0f(1).html
SHA-256: 8a11414f1535b61e2b5193b0a20d9b07c157b52226fed0a5cc65386b5cb61348
snapshot schema: don-combo-html-snapshot/v0.6
runtime schema:  don-combo-matrix-runtime/v0.8-ts
runtime generated: 2026-10-13T13:03:48.228Z
snapshot exported:  2026-10-13T13:04:08.391Z
```

The snapshot itself is not committed on this branch; the source filename and hash bind this summary to the local frozen artifact.

## Run result

The bounded run completed exactly as requested:

| Field | Result |
|---|---:|
| Requested combs | **46** |
| Completed combs | **46** |
| End reason | `requested_combs_completed` |
| Interrupt consumed | **false** |
| ML events before | **922** |
| ML events after | **968** |
| ML event delta | **46** |
| ML trace span complete | **true** |
| Baseline parity / verification | **PASS / true** |

The source runtime reports 823 recorded beachfronts, a rare corpus containing 1,001 rare-tile records covering 846 unique rare fronts, and 115 false-rare records.

## WaterSheep shadow boundary

The latest frozen comparison state did **not** produce a valid live shadow ranking:

| Field | Snapshot value |
|---|---:|
| Combo deterministic baseline | minute **7884**, row **8**, col **2** |
| Candidate pool size | **0** |
| Baseline rank in pool | `null` |
| Shadow top minute | `null` |
| Agreement | **false** |
| Evidence maturity | **COLD_START** |
| Ranking separation | **LOW** |
| WaterSheep status | **offline** |
| WaterSheep error | `Empty JSON string` |
| Calibration | `UNVALIDATED_FOR_KOL_BEACH` |

The UI inspector happened to have minute **210** selected as an observed candidate, but the machine-readable comparison packet reports `pool_size: 0`, `shadow_top_minute: null`, and no valid top-vs-baseline comparison. Therefore minute 210 is **not treated as a proven WaterSheep route winner** in this summary.

### Result of the route question

**Inconclusive / negative for the "beats Combo" claim in this snapshot.**

The run proves the shadow instrumentation and tracing path can survive a bounded 46-comb run while preserving deterministic Combo parity, but the exported state does **not** contain a valid ranked WaterSheep candidate pool. It therefore cannot establish that dynamic reassessment beat Combo's deterministic next target.

## ML trace corpus

The frozen artifact contains a larger trace window than the final 46-comb bounded run:

| Metric | Result |
|---|---:|
| Total ML events | **968** |
| Events embedded in artifact | **500** |
| Predicted events | **500** |
| Untraced events | **0** |
| Mean prediction latency | **1095.85 ms** |
| Snapshot-history entries | **205** |

Observed outcomes in those 500 traced events:

| Outcome | Count | Share |
|---|---:|---:|
| `rough_fallback` | **405** | **81.0%** |
| `twinkle_fallback` | **92** | **18.4%** |
| `rare_target` | **3** | **0.6%** |

These are highly imbalanced observational outcomes, not a balanced classifier benchmark.

## The three rare-target examples

All three rare-target events had a ready WaterSheep prediction before the actual comb:

| Minute | Rare outcome | WaterSheep `rare` mass | Highest shown mass | Model utility | Policy utility | Latency |
|---|---|---:|---:|---:|---:|---:|
| **210** | gems + cursed swash buckle | **0.0365** | twinkle **0.3818** | 0.338172 | 0.418172 | 928 ms |
| **1105** | piece of driftwood | **0.037896** | twinkle **0.353865** | 0.339080 | 0.419080 | 1438 ms |
| **5706** | gems + cursed tricorn hat | **0.0383** | twinkle **0.3415** | 0.333070 | 0.369639 | 938 ms |

That is an important negative result: on these three observed rare-target events, the model's `rare` score mass remained only about **3.65–3.83%** and did not dominate the distribution; `twinkle` was the largest shown component each time.

With only three positive rare examples, this is **not enough to estimate rare-detection accuracy or calibration**. It does, however, show that this version of the score mass should not yet be interpreted as a direct calibrated "rare probability."

## What this experiment supports

The frozen evidence supports these claims:

1. A bounded **46/46** don_combo run completed with a complete matching **+46 event** ML trace span.
2. Combo baseline parity remained intact and the model had **no execution authority**.
3. The broader artifact preserved **500/500 traced predictions** with no untraced events and about **1.096 s** mean prediction latency.
4. Three actual rare-target outcomes occurred in that trace window.
5. WaterSheep's raw `rare` mass was **not strongly separated** on those three examples.
6. The final exported route-comparison state was **COLD_START / empty-pool / WaterSheep offline**, so it does not demonstrate a shadow route outperforming Combo.

## What it does not support

This branch does **not** claim:

- that WaterSheep can currently predict KoL beach rares;
- that minute 210 was a validated WaterSheep-selected route target;
- that dynamic routing beat Combo;
- that the six score-mass labels are calibrated probabilities for KoL beach outcomes;
- that the 500-event trace is balanced or sufficient for performance estimation;
- that model output can execute, authorize, or replace Combo policy.

## Next useful test

The clean next experiment is to turn this into a frozen evaluation rather than another live anecdote:

1. keep Combo's real route and rare labels hidden from WaterSheep;
2. collect a fixed post-hoc event corpus with pre-action model outputs;
3. freeze the corpus by SHA-256;
4. evaluate score separation and ranking offline;
5. report rare-target performance separately from the heavily dominant rough/twinkle outcomes;
6. only then compare a shadow policy against the deterministic Combo baseline.

That would let this central test repo answer the actual question without changing `don_combo` itself.

## Provenance

- Implementation repository: [donCannoli-burns/don_combo](https://github.com/donCannoli-burns/don_combo)
- Test archive repository: [donCannoli-burns/kol-watersheep-testing](https://github.com/donCannoli-burns/kol-watersheep-testing)
- Upstream model: [SamratDuttaOfficial/WaterSheep](https://github.com/SamratDuttaOfficial/WaterSheep)
- Source snapshot SHA-256: `8a11414f1535b61e2b5193b0a20d9b07c157b52226fed0a5cc65386b5cb61348`
