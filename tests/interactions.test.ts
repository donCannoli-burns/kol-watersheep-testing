import assert from "node:assert/strict";
import test from "node:test";
import {
  CORE_INTERACTION_SCENARIO_IDS,
  INTERACTION_CONTROL_QUESTIONS,
  INTERACTION_DEFINITIONS,
  INTERACTION_SCENARIO_IDS,
  createInteractionScenario,
  interactionObservation,
} from "../src/interaction-scenarios.ts";

const ACTIONS = ["proceed", "reroute", "restore", "wait", "reconcile", "stop", "need_context"];

test("interaction curriculum is 16 families × 7 balanced control outcomes", () => {
  assert.equal(INTERACTION_SCENARIO_IDS.length, 112);
  const families = new Set(INTERACTION_SCENARIO_IDS.map((id) => INTERACTION_DEFINITIONS[id].family));
  assert.equal(families.size, 16);
  for (const action of ACTIONS) {
    assert.equal(
      INTERACTION_SCENARIO_IDS.filter((id) => INTERACTION_DEFINITIONS[id].groundTruth.controlAction === action).length,
      16,
    );
  }
});

test("core interaction profile is 8 families × 7 balanced outcomes", () => {
  assert.equal(CORE_INTERACTION_SCENARIO_IDS.length, 56);
  const families = new Set(CORE_INTERACTION_SCENARIO_IDS.map((id) => INTERACTION_DEFINITIONS[id].family));
  assert.equal(families.size, 8);
  for (const action of ACTIONS) {
    assert.equal(
      CORE_INTERACTION_SCENARIO_IDS.filter((id) => INTERACTION_DEFINITIONS[id].groundTruth.controlAction === action).length,
      8,
    );
  }
});

test("interaction observations are deterministic and evaluator truth is not embedded", () => {
  for (const id of INTERACTION_SCENARIO_IDS) {
    const a = interactionObservation(id, 20261013);
    const b = interactionObservation(id, 20261013);
    assert.equal(a.observationId, b.observationId);
    assert.equal(a.stateDigest, b.stateDigest);
    assert.match(id, /^interaction-\d{4}$/);
    const text = JSON.stringify(a);
    assert.ok(!text.includes("controlAction"));
    assert.ok(!text.includes("groundTruth"));
  }
});

test("interaction suite remains mock-only", () => {
  for (const id of CORE_INTERACTION_SCENARIO_IDS) {
    const state = createInteractionScenario(id);
    assert.equal(state.mockOnly, true);
  }
  const q = JSON.stringify(INTERACTION_CONTROL_QUESTIONS).toLowerCase();
  assert.ok(!q.includes("commitpermit"));
  assert.ok(!q.includes("grant permission"));
  assert.ok(!q.includes("execute this"));
});
