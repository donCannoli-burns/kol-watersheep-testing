# KoLmafia Sim Host 001

This directory is the first bounded implementation slice of the KoL Decision Foundry.

It is intentionally **not** a Kingdom of Loathing emulator and **not** an autonomous player. The goal of `KOLMAFIA-SIM-HOST-001` is to prove that a synthetic state can be loaded into a real, logged-out KoLmafia JVM through pymafia, read back through real ASH runtime functions, shown to WaterSheep/WaterGoat, and emitted as an auditable transition record.

## Current boundary

Implemented in this slice:

- pinned pymafia source revision;
- pinned KoLmafia revision input;
- no automatic KoLmafia JAR download;
- synthetic player HP/MP/adventures/Meat/level;
- synthetic KoLmafia preferences;
- synthetic inventory and effects using real KoLmafia data/runtime objects;
- bounded state-frame readback using real ASH runtime functions;
- local-only WaterGoat HTTP client;
- explicit non-authority fields in every transition;
- `GenericRequest.sessionId = null` enforced before/after host operations;
- one deterministic fixture and Python unit tests.

Not implemented yet:

- InstantSCCS teacher extraction;
- autoscend differential teacher;
- simulated game HTTP responses;
- encounters or kol-rng;
- task execution;
- live KoL fallback of any kind.

An unsupported or missing prerequisite blocks the run. It must never fall back to a live account.

## Runtime pin

The prototype pins pymafia to:

`MrFizzyBubbs/pymafia@f346a55d050bf52901424ad6f2c7f01ef4fbc468`

The default KoLmafia revision is `28063`, matching pymafia's checked-in compatibility revision at the time this slice was created. Override it only as a new experimental condition.

## Setup

Use Python 3.11.

```bash
python3.11 -m venv .venv-foundry
source .venv-foundry/bin/activate
pip install -e foundry
```

Place the **already downloaded, pinned** KoLmafia JAR at:

```text
.foundry/kolmafia/KoLmafia-28063.jar
```

The foundry deliberately refuses pymafia's normal automatic JAR download.

Run the contract-only tests:

```bash
PYTHONPATH=foundry/src python3.11 -m unittest discover -s foundry/tests -v
```

Run one offline state smoke without WaterGoat:

```bash
PYTHONPATH=foundry/src python3.11 -m kol_foundry smoke \
  --skip-watergoat \
  --out .foundry/evidence/sim-host-001.json
```

With local WaterGoat already running:

```bash
export WATERSHEEP_URL=http://127.0.0.1:8766/v1/decisions

PYTHONPATH=foundry/src python3.11 -m kol_foundry smoke \
  --out .foundry/evidence/sim-host-001-watergoat.json
```

## What success means

A successful smoke proves only:

```text
synthetic JSON
    ↓
real embedded KoLmafia JVM
    ↓
real KoLmafia state objects
    ↓
real ASH readback
    ↓
bounded state frame
    ↓
local WaterGoat (optional)
    ↓
transition record
```

It does **not** yet prove that InstantSCCS can be evaluated, that KoL requests can be simulated, or that a whole ascension can run offline.

The next milestone is to instrument InstantSCCS/Grimoire so the same host can enumerate `completed()`, `ready()`, and `getNextTask()` without executing the chosen task.
