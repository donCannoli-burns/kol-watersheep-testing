# KoLmafia Sim Host 001

This directory is the first bounded implementation slice of the KoL Decision Foundry.

It is intentionally **not** a Kingdom of Loathing emulator and **not** an autonomous player. The goal of `KOLMAFIA-SIM-HOST-001` is to prove that a synthetic state can be loaded into a real, logged-out KoLmafia JVM through pymafia, read back through real ASH runtime functions, shown to WaterSheep/WaterGoat, and emitted as an auditable transition record.

## Harness shape

The outer control plane now deliberately borrows the useful shape of OpenCode rather than making the KoL runtime itself own orchestration:

```text
client / Relay / CLI
        │
        ▼
durable foundry session
        │
        ├── run/event store
        │
        └── export/replay surface
                │
                ▼
        pymafia execution worker
                │
                ▼
       embedded KoLmafia JVM
                │
        synthetic state only
                │
       ┌────────┴─────────┐
       ▼                  ▼
teacher adapter       WaterGoat
(next milestone)      advisory only
```

The SQLite store owns **sessions, runs, and ordered events**. It does not own KoL state and it cannot authorize an action. The pymafia host is the execution worker. This mirrors the useful server/session/execution separation of OpenCode without making OpenCode a dependency of the experiment.

## Existing KoL context planes

The foundry reuses two existing local-first projects rather than inventing a second memory/context taxonomy.

`kol-goblin-docs` is the optional **KoLmafia-local context witness**. Its generated `data/kol-goblin-docs/runtime.tsv` remains observation/context only. The foundry records the full file hash for provenance, exposes only a safe allowlist of version/gameday/install/authority fields, and redacts `player`, `player_id`, `loginScript`, and `logoutScript` from ordinary transition evidence.

`kol-html-matrix` is the optional **retrieval/planning reference plane**. The foundry verifies `source-manifest.json` hashes before admitting the plane, then carries only compact evidence such as matrix identity, authority invariants, workflow IDs, runtime-node IDs, and stable `mem://` pointers. In particular, the matrix already defines:

```text
runtime:vector      VEKTOR Browser Retrieval Plane
runtime:graph       GraphCore Agent Route Runtime
runtime:nanoclock   NanoClock Scheduler Mirror
runtime:learning    Adaptive Retrieval Overlay

wf-state            live-state inspection
wf-pymafia          embedded KoLmafia/pymafia development
wf-verify           post-mutation verification
```

Those planes are never promoted to execution authority. This preserves their own invariant that observation/reference material does not authorize mutation.

Optional inputs are explicit rather than auto-discovered from a live KoLmafia home:

```bash
./run-kol-foundry smoke \
  --goblin-runtime ~/.kolmafia/data/kol-goblin-docs/runtime.tsv \
  --html-matrix-root ~/.kolmafia/data/html-matrix \
  --skip-watergoat
```

For a fully isolated simulator, point these arguments at the **isolated foundry KoLmafia home**, not the user's live account home.

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
- durable SQLite session/run/event ledger;
- session export for replay/debugging;
- explicit non-authority fields in every transition;
- `GenericRequest.sessionId = null` enforced before/after host operations;
- preference file writes disabled for the synthetic user;
- one deterministic fixture and Python unit tests;
- optional, integrity-checked Goblin Docs + HTML Matrix context witnesses.

Not implemented yet:

- InstantSCCS teacher extraction;
- autoscend differential teacher;
- simulated game HTTP responses;
- JVM-level outbound network interception;
- encounters or kol-rng;
- task execution;
- live KoL fallback of any kind.

An unsupported or missing prerequisite blocks the run. It must never intentionally fall back to a live account.

### Network safety status

The current prototype is **NO_AUTH_SESSION_ONLY**, not yet a cryptographic or namespace-level network sandbox.

It performs only local state setters/readers and an ASH readback probe. No request-producing task is executed in this milestone. Full outbound-network isolation belongs to the Docker/SimHttpClient milestone, where an unsupported request must fail closed rather than reaching real KoL.

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

Run the contract/store tests:

```bash
./run-kol-foundry test
```

Run one state smoke without WaterGoat:

```bash
./run-kol-foundry smoke \
  --skip-watergoat \
  --out .foundry/evidence/sim-host-001.json
```

With local WaterGoat already running:

```bash
export WATERSHEEP_URL=http://127.0.0.1:8766/v1/decisions

./run-kol-foundry smoke \
  --out .foundry/evidence/sim-host-001-watergoat.json
```

The default deterministic session ID is derived from the synthetic world hash. Export the durable session/event history with:

```bash
./run-kol-foundry export-session ses_<world-hash-prefix> \
  --out .foundry/evidence/session-export.json
```

## What success means

A successful smoke proves only:

```text
synthetic JSON
    + optional Goblin Docs / HTML Matrix witnesses
    ↓
durable foundry session
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
ordered events + transition record
```

It does **not** yet prove that InstantSCCS can be evaluated, that KoL requests can be simulated, that outbound JVM networking is fully blocked, or that a whole ascension can run offline.

The next milestone is to instrument InstantSCCS/Grimoire so the same host can enumerate `completed()`, `ready()`, and `getNextTask()` without executing the chosen task.
