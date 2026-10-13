# Kolmaf-AI Desktop integration checkpoint

Status: **OFFLINE_LAB_INTEGRATED**

The TypeScript mock runtime is embedded in Kolmaf-AI Desktop under
`linux/labs/kol-mock-runtime/` as a development laboratory only.

## Boundary

- not imported by `src/kolmafa`;
- not registered in the frozen LinkBus provider set;
- not connected to the action broker or live relay writer;
- no live KoL fallback;
- KOL-WaterSheep is optional and read-only from the lab's perspective;
- parity recorder is `RECORD_ONLY` with no reward, action selection, online
  training, or Q-table update.

## Launch

From `linux/`:

```bash
scripts/run-kol-mock-lab test
scripts/run-kol-mock-lab smoke
scripts/run-kol-mock-lab watersheep-smoke
scripts/run-kol-mock-lab watersheep-baseline
scripts/run-kol-mock-lab watersheep-baseline-analysis
scripts/run-kol-mock-lab watersheep-order
scripts/run-kol-mock-lab watersheep-repeat
scripts/run-kol-mock-lab start
```

## Verification in this checkpoint

- TypeScript runtime tests include deterministic corpus, label-leak, recorder, HTTP, and routing contracts.
- TypeScript scenario smoke: **4/4 passed**
- Desktop portable mock-lab contract: **4/4 passed**
- Existing LinkBus portable contract: **13/13 passed**, 5 environment-specific tests deselected

Docker configuration is retained from the standalone lab but was not required
for this source-level integration checkpoint.

## Next fidelity step

Keep `KOL-WS-BASELINE-001` frozen; run the analysis/order/repeat robustness suites, then connect this lab sideways to the existing `kol-agent-sandbox` / pinned
`loathers/kolmafia-mock` compatibility stack and compare normalized observations.
Do not promote a mock mismatch or mock success into live execution authority.
