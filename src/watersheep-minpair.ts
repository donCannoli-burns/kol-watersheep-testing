import { ParityRecorder } from "./recorder.ts";
import {
  MINPAIR_DEFINITIONS,
  MINPAIR_PAIR_IDS,
  MINPAIR_QUESTIONS,
  createMinPair,
  minPairCorpusHash,
} from "./minpair-scenarios.ts";
import { projectObservation } from "./observation.ts";
import {
  appendJsonl,
  ensureMutableRun,
  mean,
  median,
  n,
  numericProbabilityMap,
  readJsonl,
  round,
  safeDiv,
  totalVariation,
  writeJson,
} from "./eval-util.ts";
import { classifyWithWaterSheepQuestions, waterSheepEndpoint } from "./watersheep.ts";
import { sha256 } from "./util.ts";

type Side = "base" | "variant";

type MinPairRow = {
  schema: "kol-watersheep/minpair-result-v1";
  evalId: string;
  selectionHash: string;
  pairId: string;
  side: Side;
  family: string;
  target: string;
  mutation: string;
  changedPath: string;
  changedPaths: string[];
  seed: number;
  observationId: string;
  stateDigest: string;
  expectedAction: string;
  expectedBlock: boolean;
  prediction: {
    action: string | null;
    confidence: number | null;
    probabilities: Record<string, number>;
    blockProbability: number | null;
  };
  model: string | null;
  latencyMs: number | null;
  status: string;
  rawResponse: Record<string, unknown>;
};

function csv(name: string): Set<string> {
  return new Set((process.env[name] || "").split(",").map((x) => x.trim()).filter(Boolean));
}

function distribution(answer: any): Record<string, number> {
  for (const candidate of [
    answer?.probabilities,
    answer?.probs,
    answer?.distribution,
    answer?.scores,
  ]) {
    const parsed = numericProbabilityMap(candidate);
    if (Object.keys(parsed).length) return parsed;
  }
  return {};
}

function parse(response: Record<string, unknown>) {
  const result = response.result as { model?: string; answers?: Record<string, any> } | undefined;
  const answers = result?.answers || {};
  const action = answers.control_action || {};
  return {
    model: result?.model || null,
    action: typeof action.choice === "string" ? action.choice : null,
    confidence: n(action.confidence),
    probabilities: distribution(action),
    blockProbability: n(answers.block_current_task?.noul),
  };
}

function expectedBlock(action: string): boolean {
  return action !== "proceed";
}

function pairSummary(rows: MinPairRow[], selectedIds: string[]) {
  const ok = rows.filter((r) => r.status === "ok");
  const reports = selectedIds.map((pairId) => {
    const def = MINPAIR_DEFINITIONS[pairId];
    const base = ok.find((r) => r.pairId === pairId && r.side === "base");
    const variant = ok.find((r) => r.pairId === pairId && r.side === "variant");
    if (!base || !variant) {
      return {
        pairId,
        family: def.family,
        target: def.target,
        complete: false,
        exactOneFact: false,
        vectorAvailable: false,
      };
    }

    const exactOneFact =
      base.changedPaths.length === 1 &&
      base.changedPaths[0] === def.changedPath &&
      variant.changedPaths.length === 1 &&
      variant.changedPaths[0] === def.changedPath;

    const target = def.variantExpectedAction;
    const source = def.baseExpectedAction;
    const vectorAvailable =
      target in base.prediction.probabilities &&
      target in variant.prediction.probabilities &&
      source in base.prediction.probabilities &&
      source in variant.prediction.probabilities;

    const targetDelta = vectorAvailable
      ? variant.prediction.probabilities[target] - base.prediction.probabilities[target]
      : null;
    const sourceDelta = vectorAvailable
      ? variant.prediction.probabilities[source] - base.prediction.probabilities[source]
      : null;
    const marginDelta = vectorAvailable
      ? (
          variant.prediction.probabilities[target] - variant.prediction.probabilities[source]
        ) - (
          base.prediction.probabilities[target] - base.prediction.probabilities[source]
        )
      : null;
    const tv = vectorAvailable
      ? totalVariation(base.prediction.probabilities, variant.prediction.probabilities)
      : null;

    const blockComparable =
      base.expectedBlock !== variant.expectedBlock &&
      base.prediction.blockProbability !== null &&
      variant.prediction.blockProbability !== null;
    const blockDelta = blockComparable
      ? (variant.prediction.blockProbability as number) - (base.prediction.blockProbability as number)
      : null;

    return {
      pairId,
      family: def.family,
      target: def.target,
      mutation: def.mutation,
      changedPath: def.changedPath,
      complete: true,
      exactOneFact,
      vectorAvailable,
      baseCorrect: base.prediction.action === def.baseExpectedAction,
      variantCorrect: variant.prediction.action === def.variantExpectedAction,
      winnerTransitionCorrect:
        base.prediction.action === def.baseExpectedAction &&
        variant.prediction.action === def.variantExpectedAction,
      targetDelta: targetDelta === null ? null : round(targetDelta, 8),
      sourceDelta: sourceDelta === null ? null : round(sourceDelta, 8),
      marginDelta: marginDelta === null ? null : round(marginDelta, 8),
      totalVariation: tv === null ? null : round(tv, 8),
      targetDirectionSuccess: targetDelta === null ? null : targetDelta > 0,
      sourceDirectionSuccess: sourceDelta === null ? null : sourceDelta < 0,
      marginDirectionSuccess: marginDelta === null ? null : marginDelta > 0,
      blockComparable,
      blockDelta: blockDelta === null ? null : round(blockDelta, 8),
      blockDirectionSuccess: blockDelta === null ? null : blockDelta > 0,
    };
  });

  const complete = reports.filter((r) => r.complete) as any[];
  const vector = complete.filter((r) => r.vectorAvailable);
  const block = complete.filter((r) => r.blockComparable);
  const targetDeltas = vector.map((r) => r.targetDelta as number);
  const marginDeltas = vector.map((r) => r.marginDelta as number);
  const tvs = vector.map((r) => r.totalVariation as number);

  function aggregate(xs: any[]) {
    const withVector = xs.filter((r) => r.vectorAvailable);
    const withBlock = xs.filter((r) => r.blockComparable);
    return {
      pairs: xs.length,
      exactOneFactRate: round(safeDiv(xs.filter((r) => r.exactOneFact).length, xs.length)),
      baseActionAccuracy: round(safeDiv(xs.filter((r) => r.baseCorrect).length, xs.length)),
      variantActionAccuracy: round(safeDiv(xs.filter((r) => r.variantCorrect).length, xs.length)),
      winnerTransitionAccuracy: round(safeDiv(xs.filter((r) => r.winnerTransitionCorrect).length, xs.length)),
      probabilityVectorCoverage: round(safeDiv(withVector.length, xs.length)),
      targetDirectionSuccessRate: round(safeDiv(withVector.filter((r) => r.targetDirectionSuccess).length, withVector.length)),
      marginDirectionSuccessRate: round(safeDiv(withVector.filter((r) => r.marginDirectionSuccess).length, withVector.length)),
      meanTargetProbabilityDelta: round(mean(withVector.map((r) => r.targetDelta as number)) || 0, 8),
      meanMarginDelta: round(mean(withVector.map((r) => r.marginDelta as number)) || 0, 8),
      blockDirectionCoverage: round(safeDiv(withBlock.length, xs.length)),
      blockDirectionSuccessRate: round(safeDiv(withBlock.filter((r) => r.blockDirectionSuccess).length, withBlock.length)),
    };
  }

  const targets = [...new Set(selectedIds.map((id) => MINPAIR_DEFINITIONS[id].target))].sort();
  const families = [...new Set(selectedIds.map((id) => MINPAIR_DEFINITIONS[id].family))].sort();

  return {
    totalRows: rows.length,
    successfulRows: ok.length,
    failedRows: rows.length - ok.length,
    selectedPairs: selectedIds.length,
    expectedObservations: selectedIds.length * 2,
    completePairs: complete.length,
    exactOneFactPairs: complete.filter((r) => r.exactOneFact).length,
    metrics: {
      exactOneFactRate: round(safeDiv(complete.filter((r) => r.exactOneFact).length, complete.length)),
      baseActionAccuracy: round(safeDiv(complete.filter((r) => r.baseCorrect).length, complete.length)),
      variantActionAccuracy: round(safeDiv(complete.filter((r) => r.variantCorrect).length, complete.length)),
      winnerTransitionAccuracy: round(safeDiv(complete.filter((r) => r.winnerTransitionCorrect).length, complete.length)),
      probabilityVectorCoverage: round(safeDiv(vector.length, complete.length)),
      targetDirectionSuccessRate: round(safeDiv(vector.filter((r) => r.targetDirectionSuccess).length, vector.length)),
      sourceDirectionSuccessRate: round(safeDiv(vector.filter((r) => r.sourceDirectionSuccess).length, vector.length)),
      marginDirectionSuccessRate: round(safeDiv(vector.filter((r) => r.marginDirectionSuccess).length, vector.length)),
      meanTargetProbabilityDelta: round(mean(targetDeltas) || 0, 8),
      medianTargetProbabilityDelta: round(median(targetDeltas) || 0, 8),
      meanMarginDelta: round(mean(marginDeltas) || 0, 8),
      meanTotalVariation: round(mean(tvs) || 0, 8),
      blockDirectionCoverage: round(safeDiv(block.length, complete.length)),
      blockDirectionSuccessRate: round(safeDiv(block.filter((r) => r.blockDirectionSuccess).length, block.length)),
      meanLatencyMs: round(mean(ok.map((r) => r.latencyMs).filter((x): x is number => x !== null)) || 0, 1),
    },
    byTarget: Object.fromEntries(targets.map((target) => [
      target,
      aggregate(complete.filter((r) => r.target === target)),
    ])),
    byFamily: Object.fromEntries(families.map((family) => [
      family,
      aggregate(complete.filter((r) => r.family === family)),
    ])),
    pairs: reports,
  };
}

async function main() {
  const evalId = process.env.EVAL_ID || "KOL-WS-MINPAIR-001";
  const seed = Number(process.env.MINPAIR_SEED || 20261013);
  const familyFilter = csv("MINPAIR_FAMILIES");
  const targetFilter = csv("MINPAIR_TARGETS");
  const maxNewPairs = Math.max(0, Number(process.env.MINPAIR_MAX_NEW_PAIRS || 0));

  let ids = [...MINPAIR_PAIR_IDS];
  if (familyFilter.size) ids = ids.filter((id) => familyFilter.has(MINPAIR_DEFINITIONS[id].family));
  if (targetFilter.size) ids = ids.filter((id) => targetFilter.has(MINPAIR_DEFINITIONS[id].target));
  if (!ids.length) throw new Error("minpair evaluation selected zero pairs");

  const selectionHash = sha256({
    seed,
    ids,
    definitions: ids.map((id) => MINPAIR_DEFINITIONS[id]),
    questions: MINPAIR_QUESTIONS,
  });

  const paths = ensureMutableRun(process.env.EVAL_DIR || `./data/evals/${evalId}`);
  const recorder = new ParityRecorder(`${paths.root}/recorder.jsonl`);
  const existing = readJsonl<MinPairRow>(paths.resultsPath);
  if (existing.some((r) => r.selectionHash !== selectionHash)) {
    throw new Error(`existing ${evalId} rows have a different selection hash; use a new EVAL_ID`);
  }

  const completedKeys = new Set(existing.map((r) => `${r.pairId}/${r.side}`));
  let pendingIds = ids.filter((id) =>
    !completedKeys.has(`${id}/base`) || !completedKeys.has(`${id}/variant`)
  );
  if (maxNewPairs > 0) pendingIds = pendingIds.slice(0, maxNewPairs);

  console.log(`WaterSheep endpoint: ${waterSheepEndpoint()}`);
  console.log(`${evalId} · ${ids.length} minimal pairs · ${ids.length * 2} observations · seed=${seed}`);
  console.log(`corpus_sha256=${minPairCorpusHash()}`);
  console.log(`selection_sha256=${selectionHash}`);
  if (existing.length) console.log(`resume: ${existing.length} observation row(s) already recorded`);
  if (maxNewPairs > 0) console.log(`bounded run: at most ${maxNewPairs} pending pair(s) this invocation`);

  let done = existing.length;
  for (const pairId of pendingIds) {
    const def = MINPAIR_DEFINITIONS[pairId];
    const pair = createMinPair(pairId, seed);
    if (pair.changedPaths.length !== 1 || pair.changedPaths[0] !== def.changedPath) {
      throw new Error(
        `${pairId} is not a true one-fact pair: expected ${def.changedPath}, got ${pair.changedPaths.join(",")}`,
      );
    }

    for (const side of ["base", "variant"] as Side[]) {
      const key = `${pairId}/${side}`;
      if (completedKeys.has(key)) continue;

      const state = side === "base" ? pair.base : pair.variant;
      const observation = projectObservation(state);
      const expectedAction = side === "base" ? def.baseExpectedAction : def.variantExpectedAction;
      const response = await classifyWithWaterSheepQuestions(observation, MINPAIR_QUESTIONS);
      const p = parse(response);
      const row: MinPairRow = {
        schema: "kol-watersheep/minpair-result-v1",
        evalId,
        selectionHash,
        pairId,
        side,
        family: def.family,
        target: def.target,
        mutation: def.mutation,
        changedPath: def.changedPath,
        changedPaths: pair.changedPaths,
        seed,
        observationId: observation.observationId,
        stateDigest: observation.stateDigest,
        expectedAction,
        expectedBlock: expectedBlock(expectedAction),
        prediction: {
          action: p.action,
          confidence: p.confidence,
          probabilities: p.probabilities,
          blockProbability: p.blockProbability,
        },
        model: p.model,
        latencyMs: n(response.latencyMs),
        status: String(response.status || "unknown"),
        rawResponse: response,
      };

      if (row.status !== "ok") {
        appendJsonl(paths.failuresPath, row);
        writeJson(paths.checkpointPath, {
          schema: "kol-watersheep/minpair-report-v1",
          evalId,
          status: "BLOCKED_TRANSIENT_FAILURE",
          selectionHash,
          failedKey: key,
          summary: pairSummary(readJsonl<MinPairRow>(paths.resultsPath), ids),
        });
        console.error(`${key}: ${row.status.toUpperCase()} - stopping; rerun retries this observation`);
        process.exitCode = 1;
        return;
      }

      appendJsonl(paths.resultsPath, row);
      completedKeys.add(key);
      recorder.append(state, "watersheep.minpair_classified", {
        evalId,
        pairId,
        side,
        changedPath: def.changedPath,
        expectedAction,
        response,
      });
      done++;
      const targetProb = p.probabilities[def.variantExpectedAction];
      console.log(
        `[${String(done).padStart(3, "0")}/${ids.length * 2}] ${pairId} ${def.family} ${side} expected=${expectedAction} pred=${p.action || "?"} targetP=${typeof targetProb === "number" ? targetProb.toFixed(3) : "?"} ${row.latencyMs ?? "?"}ms`,
      );
    }

    writeJson(paths.checkpointPath, {
      schema: "kol-watersheep/minpair-report-v1",
      evalId,
      status: "RUNNING",
      selectionHash,
      endpoint: waterSheepEndpoint(),
      summary: pairSummary(readJsonl<MinPairRow>(paths.resultsPath), ids),
    });
  }

  const rows = readJsonl<MinPairRow>(paths.resultsPath);
  const complete = ids.every((id) =>
    rows.some((r) => r.pairId === id && r.side === "base" && r.status === "ok") &&
    rows.some((r) => r.pairId === id && r.side === "variant" && r.status === "ok")
  );
  const report = {
    schema: "kol-watersheep/minpair-report-v1",
    evalId,
    status: complete ? "COMPLETE" : "PARTIAL",
    generatedAt: new Date().toISOString(),
    endpoint: waterSheepEndpoint(),
    seed,
    corpusHash: minPairCorpusHash(),
    selectionHash,
    selectedPairIds: ids,
    summary: pairSummary(rows, ids),
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
  console.log(JSON.stringify(report.summary.metrics, null, 2));
  console.log(`complete pairs: ${report.summary.completePairs}/${ids.length}`);
  console.log(`results: ${paths.resultsPath}`);
  console.log(`${complete ? "manifest" : "checkpoint"}: ${complete ? paths.manifestPath : paths.checkpointPath}`);
}

main().catch((error) => {
  console.error(`BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
