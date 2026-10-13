# Interaction Curriculum v2

This suite expands the original static KoL-shaped baseline into a balanced control-decision curriculum.

## Behavioral references

The scenario *shapes* were derived from reading current KoL automation projects:

- [loathers/autoscend](https://github.com/loathers/autoscend) at commit `dad5b842a896e90e6ac9d344cd15a2bc78764cf6`
- [Kasekopf/loopstar](https://github.com/Kasekopf/loopstar) at commit `c47c8e6f344689e2a62213171fb69abad60e4091`

No source code from either project is copied into this suite. They are behavioral references for the kinds of interactions real KoL automation must handle.

Observed patterns used as inspiration include:

- task readiness and alternate-task selection;
- quest-property and normalized-state reconciliation;
- choice adventures whose valid branch depends on available options/equipment;
- HP/MP recovery before combat;
- limited-use resource allocation and saved uses;
- location delay and wanderer timing;
- explicit adventure exhaustion / stop conditions;
- post-adventure verification instead of trusting success-shaped output;
- optional external-service failure with local fallback;
- path-specific availability constraints;
- outfit/familiar constraints;
- cooldowns, daily counters, organ budgets, and boss gates.

## Corpus

Full profile: **112 scenarios = 16 families × 7 control outcomes**.

Core profile: **56 scenarios = 8 families × 7 control outcomes**.

The seven evaluator labels are balanced by construction:

1. `proceed`
2. `reroute`
3. `restore`
4. `wait`
5. `reconcile`
6. `stop`
7. `need_context`

The model sees opaque IDs (`interaction-0001` etc.) and bounded synthetic KoLmafia-shaped state. Family names, evaluator labels, and ground truth stay outside the observation.

## Why this is different from BASELINE-001

`KOL-WS-BASELINE-001` is frozen and must not change.

The old baseline tested broad domain/context/depth/anomaly classification. This suite asks a more operational but still **advisory** question:

> What should a deterministic control layer do *before* spending the next adventure on the current task?

WaterSheep still has no authority. The answer is recorded and scored; deterministic code remains the authority boundary.

## Run

Fast/core profile:

```bash
export WATERSHEEP_URL=http://127.0.0.1:8766/v1/decisions
EVAL_ID=KOL-WS-INTERACTION-001 ./run-kol-mock-lab watersheep-interactions
```

Full 112-case profile:

```bash
INTERACTION_PROFILE=full \
EVAL_ID=KOL-WS-INTERACTION-FULL-001 \
./run-kol-mock-lab watersheep-interactions
```

Useful slices:

```bash
INTERACTION_ACTIONS=reconcile,need_context \
EVAL_ID=KOL-WS-INTERACTION-STATE-001 \
./run-kol-mock-lab watersheep-interactions

INTERACTION_FAMILIES=choice-adventure,combat-readiness,post-adventure-readback \
EVAL_ID=KOL-WS-INTERACTION-CONTROL-001 \
./run-kol-mock-lab watersheep-interactions
```

Completed manifests are immutable. Use a new `EVAL_ID` for a different profile, selection, model checkpoint, prompt, or experimental condition.

## Primary metrics

- control-action accuracy;
- 7×7 control-action confusion matrix;
- context micro precision / recall / F1;
- direct-current-task block accuracy and Brier score;
- per-family control accuracy;
- per-expected-action accuracy;
- latency.

Because the expected control labels are balanced, a strong attractor such as the earlier `runtime` collapse will be immediately visible in the prediction distribution and confusion matrix.
