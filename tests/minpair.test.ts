import assert from "node:assert/strict";
import test from "node:test";
import {
  MINPAIR_DEFINITIONS,
  MINPAIR_PAIR_IDS,
  MINPAIR_QUESTIONS,
  createMinPair,
  minPairObservations,
} from "../src/minpair-scenarios.ts";

const TARGETS = ["restore", "wait", "reconcile", "need_context", "stop"];

test("MINPAIR-001 contains 250 pairs / 500 model observations", () => {
  assert.equal(MINPAIR_PAIR_IDS.length, 250);
  assert.equal(MINPAIR_PAIR_IDS.length * 2, 500);
});

test("MINPAIR-001 is balanced across 10 families and five target boundaries", () => {
  const families = new Set(MINPAIR_PAIR_IDS.map((id) => MINPAIR_DEFINITIONS[id].family));
  assert.equal(families.size, 10);
  for (const target of TARGETS) {
    assert.equal(MINPAIR_PAIR_IDS.filter((id) => MINPAIR_DEFINITIONS[id].target === target).length, 50);
  }
  for (const family of families) {
    assert.equal(MINPAIR_PAIR_IDS.filter((id) => MINPAIR_DEFINITIONS[id].family === family).length, 25);
  }
});

test("every minimal pair changes exactly one model-state fact", () => {
  for (const id of MINPAIR_PAIR_IDS) {
    const def = MINPAIR_DEFINITIONS[id];
    const pair = createMinPair(id);
    assert.deepEqual(pair.changedPaths, [def.changedPath], id);
    assert.equal(pair.base.scenarioId, pair.variant.scenarioId);
    assert.equal(pair.base.runId, pair.variant.runId);
  }
});

test("minimal pairs are deterministic", () => {
  for (const id of MINPAIR_PAIR_IDS) {
    const a = minPairObservations(id);
    const b = minPairObservations(id);
    assert.equal(a.base.observationId, b.base.observationId);
    assert.equal(a.variant.observationId, b.variant.observationId);
    assert.deepEqual(a.changedPaths, b.changedPaths);
  }
});

test("MINPAIR evaluator labels stay outside model observations", () => {
  for (const id of MINPAIR_PAIR_IDS) {
    const def = MINPAIR_DEFINITIONS[id];
    const pair = minPairObservations(id);
    assert.match(id, /^minpair-\d{4}$/);
    for (const observation of [pair.base, pair.variant]) {
      const text = JSON.stringify(observation);
      assert.ok(!text.includes('"variantExpectedAction"'));
      assert.ok(!text.includes('"baseExpectedAction"'));
      assert.ok(!text.includes('"changedPath"'));
      assert.ok(!text.includes('"groundTruth"'));
      assert.ok(!text.includes(def.mutation));
    }
  }
});

test("MINPAIR questions are advisory only", () => {
  const text = JSON.stringify(MINPAIR_QUESTIONS).toLowerCase();
  assert.ok(!text.includes("commitpermit"));
  assert.ok(!text.includes("grant permission"));
  assert.ok(!text.includes("execute this"));
});
