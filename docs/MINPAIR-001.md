# KOL-WS-MINPAIR-001

> **Derived-hash correction:** the first 25-pair local pilot used the original observation projection, where the one factual mutation also changed the derived `stateDigest` and `observationId` strings sent to WaterSheep. Those two opaque hashes are now replaced with fixed `MINPAIR_REDACTED` values for model input. The pilot should not be mixed with the corrected run. Use a fresh `EVAL_ID`, recommended `KOL-WS-MINPAIR-002`.

`KOL-WS-MINPAIR-001` is a **500-observation / 250-pair** directional benchmark built in response to the interaction-curriculum results.

## Why minimal pairs

The 112-case interaction benchmark showed a stable categorical signature:

- `proceed`: 16/16
- `reroute`: 16/16
- `need_context`: 15/16
- `reconcile`: 14/16
- `wait`: 8/16
- `restore`: 2/16
- `stop`: 0/16, with all 16 mapped to `reroute`

Argmax accuracy alone cannot tell us whether WaterSheep failed to *notice the changed fact* or noticed it but kept the wrong category on top.

MINPAIR-001 therefore asks a different question:

> When exactly one KoL-shaped fact changes, does probability mass move in the expected direction?

## Design

There are **250 matched pairs**. Each pair produces two model observations:

1. base
2. one-fact variant

Total inference observations: **500**.

Construction:

```text
10 KoL interaction backgrounds
× 5 target boundaries
× 5 one-fact mutations per boundary
= 250 pairs
= 500 observations
```

Every pair is machine-checked before inference. If more than one state path differs, the run aborts.

### Ten KoL backgrounds

- quest progress
- choice adventure
- combat readiness
- inventory acquisition
- equipment / outfit
- familiar routing
- daily resource
- adventure budget
- post-adventure readback
- boss gate

### Five boundaries

Each target has exactly **50 pairs**.

| Boundary | Base action | Variant action | Example single change |
|---|---|---|---|
| restore | proceed | restore | HP 60 → 8 |
| wait | proceed | wait | cooldown 0 → 4 turns |
| reconcile | proceed | reconcile | raw quest step2 → step1 |
| need_context | proceed | need_context | complete snapshot → partial |
| stop | reroute | stop | alternate task count 1 → 0 |

The stop design is intentionally `reroute → stop`, not `proceed → stop`. That directly isolates the observed failure where all 16 stop cases were classified as reroute.

## Five mutation types per target

### restore

- HP crosses the minimum
- MP crosses the minimum
- adventures reach zero while a local generator exists
- required effect expires
- local prerequisite charge is exhausted

### wait

- cooldown activates
- wanderer window becomes imminent
- consult window becomes near
- resource window becomes temporarily unavailable
- day-count preference crosses the day-2 boundary

### reconcile

- raw quest marker diverges from normalized state
- raw location diverges
- SUCCESS-shaped script readback loses its state delta
- raw item count diverges
- raw effect duration diverges

### need_context

- snapshot becomes partial
- choice options become unknown
- quest fact becomes unknown
- entity disappears from local typed data
- live readback becomes too old to trust

### stop

In every stop pair, the current target is already unavailable and exactly one bounded fallback remains. The only changed fact removes that last fallback:

- alternate task count
- local external-service fallback
- valid choice fallback
- item acquisition source
- turn-free fallback

## Primary metrics

For each pair:

- base argmax accuracy;
- variant argmax accuracy;
- full winner-transition accuracy;
- target probability delta;
- source probability delta;
- target-vs-source margin delta;
- total variation distance;
- binary block probability delta when the pair crosses block=false → block=true.

Aggregate metrics include:

- target-direction success rate;
- margin-direction success rate;
- probability-vector coverage;
- block-direction success rate;
- per-target results;
- per-family results.

WaterSheep documents that choice answers include a probability for every option. The runner still reports probability-vector coverage explicitly and does not invent missing probabilities.

## Runtime expectations

At the recent ~5.8 s mean latency, a full 500-observation run is a substantial CPU test. The run is resumable and can be safely chunked without changing the selection hash.

Run 25 pairs (50 observations) at a time:

```bash
export WATERSHEEP_URL=http://127.0.0.1:8766/v1/decisions

MINPAIR_MAX_NEW_PAIRS=25 \
EVAL_ID=KOL-WS-MINPAIR-002 \
./run-kol-mock-lab watersheep-minpair
```

Run the same command repeatedly. It resumes from the existing JSONL until all 250 pairs are complete.

Or run the whole suite in one invocation:

```bash
EVAL_ID=KOL-WS-MINPAIR-002 \
./run-kol-mock-lab watersheep-minpair
```

Useful slices:

```bash
MINPAIR_TARGETS=stop \
EVAL_ID=KOL-WS-MINPAIR-STOP-001 \
./run-kol-mock-lab watersheep-minpair

MINPAIR_TARGETS=restore,wait \
EVAL_ID=KOL-WS-MINPAIR-RESOURCE-001 \
./run-kol-mock-lab watersheep-minpair
```

As with the other suites, completed manifests are immutable. Different selections or question wording require a new `EVAL_ID`.
