# v0.1 architecture

```text
scenario generator
      |
      v
mock KoL world reducer
      |
      +--> KoLmafia-shaped structured observation
      |          |
      |          +--> optional KOL-WaterSheep /v1/decisions (read only)
      |
      +--> relay-like HTML views
      |
      +--> parity recorder JSONL (record only)
```

## Non-goals

v0.1 is not a complete Kingdom of Loathing implementation, not wire-compatible KoLmafia, not an execution authority, not a training loop, and not a Q-learning policy.

Its job is to generate deterministic, replayable, stateful observations that resemble the kinds of evidence an agent would receive around KoLmafia.

## Scenario curriculum

1. `hidden-temple` — quest + inventory progression.
2. `effect-expiry` — effect duration changes between observations.
3. `runtime-drift` — normalized quest state disagrees with a raw preference.
4. `script-noop` — success-shaped result with no authoritative state delta.

The next fidelity layers should add combat, crafting, mall/economy telemetry, quest families, unknown/new data, stale observations, partial responses, and fixture replay.
