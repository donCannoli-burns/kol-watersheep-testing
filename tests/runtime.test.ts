import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ParityRecorder } from "../src/recorder.ts";
import { MockKolRuntime } from "../src/runtime.ts";
import { BASELINE_SCENARIOS, BASELINE_SCENARIO_IDS, createScenario } from "../src/scenarios.ts";
import { projectObservation } from "../src/observation.ts";
import { waterSheepEndpoint, waterSheepRequest, waterSheepRequestWithQuestions } from "../src/watersheep.ts";
import { createMockServer } from "../src/server.ts";

function tempRecorder(): ParityRecorder {
  const dir = mkdtempSync(join(tmpdir(), "kol-mock-runtime-"));
  return new ParityRecorder(join(dir, "events.jsonl"));
}

test("same scenario + seed produces identical initial observation", () => {
  const a = projectObservation(createScenario("hidden-temple", 7));
  const b = projectObservation(createScenario("hidden-temple", 7));
  assert.equal(a.observationId, b.observationId);
  assert.equal(a.stateDigest, b.stateDigest);
});

test("hidden temple advance changes bounded state deterministically", () => {
  const rt = new MockKolRuntime("hidden-temple", 7, tempRecorder());
  const { after } = rt.step("advance");
  assert.equal(after.quests.questL11Worship, "step3");
  assert.equal(after.relevantInventory["nostril of the serpent"], 1);
});

test("runtime drift is explicit and reconcilable", () => {
  const rt = new MockKolRuntime("runtime-drift", 7, tempRecorder());
  assert.ok(rt.observation().anomalyFlags.includes("quest_property_mismatch"));
  rt.step("reconcile");
  assert.ok(!rt.observation().anomalyFlags.includes("quest_property_mismatch"));
});

test("WaterSheep request has routing questions but no execution question", () => {
  const req = waterSheepRequest(projectObservation(createScenario("hidden-temple", 7)));
  const text = JSON.stringify(req).toLowerCase();
  assert.ok(text.includes("context_needed"));
  assert.ok(!text.includes("safe_to_execute"));
  assert.ok(!text.includes("commitpermit"));
  assert.ok(!text.includes("approve this action"));
});



test("WaterSheep custom-question request does not silently add routing questions", () => {
  const observation = projectObservation(createScenario("hidden-temple", 7));
  const req = waterSheepRequestWithQuestions(observation, {
    domain: { type: "choice", instructions: "test", criteria: { quest: "q", runtime: "r" } },
  }) as { questions: Record<string, unknown> };
  assert.deepEqual(Object.keys(req.questions), ["domain"]);
});

test("recorder is append-only telemetry and does not invent reward", () => {
  const recorder = tempRecorder();
  const rt = new MockKolRuntime("script-noop", 7, recorder);
  rt.step("reconcile");
  const lines = readFileSync(recorder.path, "utf8").trim().split("\n").map(JSON.parse);
  assert.ok(lines.length >= 2);
  for (const line of lines) {
    assert.equal(line.authority.grantsAuthority, false);
    assert.equal(line.authority.mayTrainOnline, false);
    assert.equal("reward" in line, false);
  }
});

test("HTTP health endpoint declares mock-only and no live fallback", async () => {
  const server = createMockServer(new MockKolRuntime("hidden-temple", 7, tempRecorder()));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === "object");
  const response = await fetch(`http://127.0.0.1:${addr.port}/health`);
  const body = await response.json();
  assert.equal(body.mockOnly, true);
  assert.equal(body.liveFallback, false);
  assert.equal(body.recorder.mode, "RECORD_ONLY");
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});


test("WaterSheep URL accepts either a base URL or a full decisions endpoint", () => {
  assert.equal(waterSheepEndpoint("http://127.0.0.1:8766"), "http://127.0.0.1:8766/v1/decisions");
  assert.equal(waterSheepEndpoint("http://127.0.0.1:8766/"), "http://127.0.0.1:8766/v1/decisions");
  assert.equal(waterSheepEndpoint("http://127.0.0.1:8766/v1/decisions"), "http://127.0.0.1:8766/v1/decisions");
  assert.equal(waterSheepEndpoint("http://127.0.0.1:8766/v1/systemone"), "http://127.0.0.1:8766/v1/systemone");
});

test("baseline corpus contains 100 opaque deterministic scenarios", () => {
  assert.equal(BASELINE_SCENARIO_IDS.length, 100);
  const families = new Set(BASELINE_SCENARIO_IDS.map((id) => BASELINE_SCENARIOS[id].family));
  const variants = new Set(BASELINE_SCENARIO_IDS.map((id) => BASELINE_SCENARIOS[id].variant));
  assert.equal(families.size, 10);
  assert.equal(variants.size, 10);
  for (const id of BASELINE_SCENARIO_IDS) {
    assert.match(id, /^baseline-\d{4}$/);
    const def = BASELINE_SCENARIOS[id];
    assert.ok(!id.includes(def.family));
    assert.ok(!id.includes(def.variant || "__missing__"));
  }
});

test("baseline scenarios are deterministic and keep evaluator labels outside observations", () => {
  for (const id of BASELINE_SCENARIO_IDS) {
    const a = projectObservation(createScenario(id, 20261011));
    const b = projectObservation(createScenario(id, 20261011));
    assert.equal(a.observationId, b.observationId);
    assert.equal(a.stateDigest, b.stateDigest);
    const text = JSON.stringify(a).toLowerCase();
    const def = BASELINE_SCENARIOS[id];
    assert.ok(!text.includes(`"family":"${def.family}"`));
    assert.ok(!text.includes(`"variant":"${def.variant}"`));
  }
});
