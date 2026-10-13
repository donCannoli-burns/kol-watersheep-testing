import { ParityRecorder } from "./recorder.ts";
import {
  CORE_INTERACTION_SCENARIO_IDS,
  INTERACTION_CONTROL_QUESTIONS,
  INTERACTION_DEFINITIONS,
  INTERACTION_SCENARIO_IDS,
  createInteractionScenario,
  interactionCorpusHash,
} from "./interaction-scenarios.ts";
import { projectObservation } from "./observation.ts";
import {
  appendJsonl,
  ensureMutableRun,
  mean,
  n,
  readJsonl,
  round,
  safeDiv,
  writeJson,
} from "./eval-util.ts";
import { classifyWithWaterSheepQuestions, waterSheepEndpoint } from "./watersheep.ts";
import { sha256 } from "./util.ts";

type ResultRow = {
  schema: "kol-watersheep/interaction-result-v1";
  evalId: string;
  selectionHash: string;
  scenarioId: string;
  family: string;
  variant: string;
  seed: number;
  observationId: string;
  stateDigest: string;
  groundTruth: {
    controlAction: string;
    requiredContext: string[];
    blockCurrentTask: boolean;
  };
  prediction: {
    controlAction: string | null;
    controlConfidence: number | null;
    contextNeeded: string[];
    blockProbability: number | null;
  };
  score: {
    controlCorrect: boolean;
    contextTp: number;
    contextFp: number;
    contextFn: number;
    blockCorrect: boolean;
    blockSquaredError: number;
  };
  model: string | null;
  latencyMs: number | null;
  status: string;
  rawResponse: Record<string, unknown>;
};

function csv(name: string): Set<string> {
  return new Set((process.env[name] || "").split(",").map((x) => x.trim()).filter(Boolean));
}

function parse(response: Record<string, unknown>) {
  const result = response.result as { model?: string; answers?: Record<string, any> } | undefined;
  const answers = result?.answers || {};
  return {
    model: result?.model || null,
    controlAction: typeof answers.control_action?.choice === "string" ? answers.control_action.choice : null,
    controlConfidence: n(answers.control_action?.confidence),
    contextNeeded: Array.isArray(answers.context_needed?.choices)
      ? answers.context_needed.choices.map(String).sort()
      : [],
    blockProbability: n(answers.block_current_task?.noul),
  };
}

function score(row: Omit<ResultRow, "score">): ResultRow["score"] {
  const expected = new Set(row.groundTruth.requiredContext);
  const actual = new Set(row.prediction.contextNeeded);
  let tp = 0, fp = 0, fn = 0;
  for (const item of actual) expected.has(item) ? tp++ : fp++;
  for (const item of expected) if (!actual.has(item)) fn++;
  const p = row.prediction.blockProbability ?? 0.5;
  const y = row.groundTruth.blockCurrentTask ? 1 : 0;
  return {
    controlCorrect: row.prediction.controlAction === row.groundTruth.controlAction,
    contextTp: tp,
    contextFp: fp,
    contextFn: fn,
    blockCorrect: (p >= 0.5) === row.groundTruth.blockCurrentTask,
    blockSquaredError: round((p - y) ** 2, 6),
  };
}

function confusion(rows: ResultRow[]) {
  const labels = ["proceed", "reroute", "restore", "wait", "reconcile", "stop", "need_context"];
  return Object.fromEntries(labels.map((truth) => [
    truth,
    Object.fromEntries(labels.map((pred) => [
      pred,
      rows.filter((r) => r.groundTruth.controlAction === truth && r.prediction.controlAction === pred).length,
    ])),
  ]));
}

function summary(rows: ResultRow[], selectedIds: string[]) {
  const ok = rows.filter((r) => r.status === "ok");
  const tp = ok.reduce((a, r) => a + r.score.contextTp, 0);
  const fp = ok.reduce((a, r) => a + r.score.contextFp, 0);
  const fn = ok.reduce((a, r) => a + r.score.contextFn, 0);
  const precision = safeDiv(tp, tp + fp);
  const recall = safeDiv(tp, tp + fn);
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const latencies = ok.map((r) => r.latencyMs).filter((x): x is number => x !== null);
  const families = [...new Set(selectedIds.map((id) => INTERACTION_DEFINITIONS[id].family))].sort();
  const actions = [...new Set(selectedIds.map((id) => INTERACTION_DEFINITIONS[id].groundTruth.controlAction))].sort();

  return {
    totalRows: rows.length,
    successfulRows: ok.length,
    failedRows: rows.length - ok.length,
    selectedScenarios: selectedIds.length,
    metrics: {
      controlActionAccuracy: round(safeDiv(ok.filter((r) => r.score.controlCorrect).length, ok.length)),
      contextMicroPrecision: round(precision),
      contextMicroRecall: round(recall),
      contextMicroF1: round(f1),
      blockAccuracy: round(safeDiv(ok.filter((r) => r.score.blockCorrect).length, ok.length)),
      blockBrier: round(safeDiv(ok.reduce((a, r) => a + r.score.blockSquaredError, 0), ok.length), 6),
      meanLatencyMs: round(mean(latencies) || 0, 1),
    },
    expectedActionCounts: Object.fromEntries(actions.map((action) => [
      action,
      selectedIds.filter((id) => INTERACTION_DEFINITIONS[id].groundTruth.controlAction === action).length,
    ])),
    predictedActionCounts: Object.fromEntries(actions.map((action) => [
      action,
      ok.filter((r) => r.prediction.controlAction === action).length,
    ])),
    confusion: confusion(ok),
    byFamily: Object.fromEntries(families.map((family) => {
      const xs = ok.filter((r) => r.family === family);
      return [family, {
        rows: xs.length,
        controlActionAccuracy: round(safeDiv(xs.filter((r) => r.score.controlCorrect).length, xs.length)),
        blockAccuracy: round(safeDiv(xs.filter((r) => r.score.blockCorrect).length, xs.length)),
      }];
    })),
    byExpectedAction: Object.fromEntries(actions.map((action) => {
      const xs = ok.filter((r) => r.groundTruth.controlAction === action);
      return [action, {
        rows: xs.length,
        accuracy: round(safeDiv(xs.filter((r) => r.score.controlCorrect).length, xs.length)),
        meanBlockProbability: round(mean(xs.map((r) => r.prediction.blockProbability).filter((x): x is number => x !== null)) || 0, 6),
      }];
    })),
  };
}

async function main() {
  const evalId = process.env.EVAL_ID || "KOL-WS-INTERACTION-001";
  const seed = Number(process.env.INTERACTION_SEED || 20261013);
  const profile = (process.env.INTERACTION_PROFILE || "core").toLowerCase();
  const familyFilter = csv("INTERACTION_FAMILIES");
  const actionFilter = csv("INTERACTION_ACTIONS");
  const limit = Math.max(0, Number(process.env.INTERACTION_LIMIT || 0));

  let ids = profile === "full" ? [...INTERACTION_SCENARIO_IDS] : [...CORE_INTERACTION_SCENARIO_IDS];
  if (familyFilter.size) ids = ids.filter((id) => familyFilter.has(INTERACTION_DEFINITIONS[id].family));
  if (actionFilter.size) ids = ids.filter((id) => actionFilter.has(INTERACTION_DEFINITIONS[id].groundTruth.controlAction));
  if (limit > 0) ids = ids.slice(0, limit);
  if (!ids.length) throw new Error("interaction evaluation selected zero scenarios");

  const selectionHash = sha256({
    seed,
    profile,
    ids,
    definitions: ids.map((id) => INTERACTION_DEFINITIONS[id]),
    questions: INTERACTION_CONTROL_QUESTIONS,
  });
  const paths = ensureMutableRun(process.env.EVAL_DIR || `./data/evals/${evalId}`);
  const recorder = new ParityRecorder(`${paths.root}/recorder.jsonl`);
  const existing = readJsonl<ResultRow>(paths.resultsPath);
  if (existing.some((r) => r.selectionHash !== selectionHash)) {
    throw new Error(`existing ${evalId} rows have a different selection hash; use a new EVAL_ID`);
  }
  const completed = new Set(existing.map((r) => r.scenarioId));
  const work = ids.filter((id) => !completed.has(id));

  console.log(`WaterSheep endpoint: ${waterSheepEndpoint()}`);
  console.log(`${evalId} · profile=${profile} · ${ids.length} interaction scenarios · seed=${seed}`);
  console.log(`corpus_sha256=${interactionCorpusHash()}`);
  console.log(`selection_sha256=${selectionHash}`);
  if (existing.length) console.log(`resume: ${existing.length} row(s) already recorded`);

  let done = existing.length;
  for (const id of work) {
    const def = INTERACTION_DEFINITIONS[id];
    const state = createInteractionScenario(id, seed);
    const observation = projectObservation(state);
    const response = await classifyWithWaterSheepQuestions(observation, INTERACTION_CONTROL_QUESTIONS);
    const p = parse(response);

    const base: Omit<ResultRow, "score"> = {
      schema: "kol-watersheep/interaction-result-v1",
      evalId,
      selectionHash,
      scenarioId: id,
      family: def.family,
      variant: def.variant,
      seed,
      observationId: observation.observationId,
      stateDigest: observation.stateDigest,
      groundTruth: def.groundTruth,
      prediction: {
        controlAction: p.controlAction,
        controlConfidence: p.controlConfidence,
        contextNeeded: p.contextNeeded,
        blockProbability: p.blockProbability,
      },
      model: p.model,
      latencyMs: n(response.latencyMs),
      status: String(response.status || "unknown"),
      rawResponse: response,
    };
    const row: ResultRow = { ...base, score: score(base) };

    if (row.status !== "ok") {
      appendJsonl(paths.failuresPath, row);
      writeJson(paths.checkpointPath, {
        schema: "kol-watersheep/interaction-report-v1",
        evalId,
        status: "BLOCKED_TRANSIENT_FAILURE",
        selectionHash,
        failedScenarioId: id,
        summary: summary(readJsonl<ResultRow>(paths.resultsPath), ids),
      });
      console.error(`${id}: ${row.status.toUpperCase()} - stopping; rerun retries this scenario`);
      process.exitCode = 1;
      return;
    }

    appendJsonl(paths.resultsPath, row);
    recorder.append(state, "watersheep.interaction_classified", {
      evalId,
      observationId: observation.observationId,
      groundTruth: def.groundTruth,
      response,
    });
    done++;
    console.log(
      `[${String(done).padStart(3, "0")}/${ids.length}] ${id} ${def.family} truth=${def.variant} pred=${p.controlAction || "?"} block=${p.blockProbability?.toFixed(3) ?? "?"} ${row.score.controlCorrect ? "OK" : "MISS"} ${row.latencyMs ?? "?"}ms`,
    );
    writeJson(paths.checkpointPath, {
      schema: "kol-watersheep/interaction-report-v1",
      evalId,
      status: "RUNNING",
      selectionHash,
      endpoint: waterSheepEndpoint(),
      summary: summary(readJsonl<ResultRow>(paths.resultsPath), ids),
    });
  }

  const rows = readJsonl<ResultRow>(paths.resultsPath);
  const complete = ids.every((id) => rows.some((r) => r.scenarioId === id));
  const report = {
    schema: "kol-watersheep/interaction-report-v1",
    evalId,
    status: complete ? "COMPLETE" : "PARTIAL",
    generatedAt: new Date().toISOString(),
    endpoint: waterSheepEndpoint(),
    seed,
    profile,
    corpusHash: interactionCorpusHash(),
    selectionHash,
    selectedScenarioIds: ids,
    summary: summary(rows, ids),
    provenance: {
      behavioralReferences: {
        autoscend: {
          repository: "loathers/autoscend",
          commit: "dad5b842a896e90e6ac9d344cd15a2bc78764cf6",
        },
        loopstar: {
          repository: "Kasekopf/loopstar",
          commit: "c47c8e6f344689e2a62213171fb69abad60e4091",
        },
      },
      copiedSourceCode: false,
    },
    authority: {
      mockOnly: true,
      inferenceOnly: true,
      grantsAuthority: false,
      grantsExecutionPermission: false,
      mayTrainOnline: false,
    },
  };
  writeJson(paths.checkpointPath, report);
  if (complete) writeJson(paths.manifestPath, report);

  console.log(`\n${evalId}: ${report.status}`);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`results: ${paths.resultsPath}`);
  console.log(`${complete ? "manifest" : "checkpoint"}: ${complete ? paths.manifestPath : paths.checkpointPath}`);
}

main().catch((error) => {
  console.error(`BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
