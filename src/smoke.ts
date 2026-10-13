import { MockKolRuntime } from "./runtime.ts";
import { STARTER_SCENARIO_IDS } from "./scenarios.ts";
for (const scenario of STARTER_SCENARIO_IDS) {
  const rt = new MockKolRuntime(scenario, 7);
  const before = rt.observation();
  const action = scenario === "runtime-drift" || scenario === "script-noop" ? "reconcile" : "advance";
  const step = rt.step(action);
  if (before.observationId === step.after.observationId) throw new Error(`${scenario}: state-changing action did not change observation`);
  console.log(`${scenario}: PASS ${before.observationId.slice(0, 8)} -> ${step.after.observationId.slice(0, 8)}`);
}
