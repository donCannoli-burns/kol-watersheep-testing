import { applyScenarioAction, createScenario, SCENARIOS } from "./scenarios.ts";
import { projectObservation } from "./observation.ts";
import { ParityRecorder } from "./recorder.ts";
import type { Observation, WorldState } from "./types.ts";

export class MockKolRuntime {
  state: WorldState;
  readonly recorder: ParityRecorder;

  constructor(scenario = process.env.SCENARIO || "hidden-temple", seed = Number(process.env.SEED || 7), recorder?: ParityRecorder) {
    this.recorder = recorder || new ParityRecorder();
    this.state = createScenario(scenario, seed);
    const obs = this.observation();
    this.recorder.append(this.state, "run.started", {
      scenario: SCENARIOS[this.state.scenarioId],
      observationId: obs.observationId,
      stateDigest: obs.stateDigest,
    });
  }

  reset(scenario = "hidden-temple", seed = 7): Observation {
    this.state = createScenario(scenario, seed);
    const obs = this.observation();
    this.recorder.append(this.state, "run.reset", {
      scenario: SCENARIOS[scenario],
      observationId: obs.observationId,
      stateDigest: obs.stateDigest,
    });
    return obs;
  }

  observation(): Observation {
    return projectObservation(this.state);
  }

  step(action: string): { before: Observation; after: Observation; result: ReturnType<typeof applyScenarioAction>["result"] } {
    const before = this.observation();
    const { state, result } = applyScenarioAction(this.state, action);
    this.state = state;
    const after = this.observation();
    this.recorder.append(this.state, "transition.applied", {
      action,
      result,
      beforeObservationId: before.observationId,
      beforeStateDigest: before.stateDigest,
      afterObservationId: after.observationId,
      afterStateDigest: after.stateDigest,
    });
    return { before, after, result };
  }
}
