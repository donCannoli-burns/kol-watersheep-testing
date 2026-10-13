import type { Observation, WorldState } from "./types.ts";
import { sha256 } from "./util.ts";

export function projectObservation(state: WorldState): Observation {
  // The lab intentionally exposes the bounded simulated inventory rather than a
  // hand-picked family-specific list. That lets the benchmark include both
  // useful and irrelevant items without leaking evaluator knowledge into the
  // observation projection.
  const relevantInventory = Object.fromEntries(
    Object.entries(state.inventory)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 24),
  );

  const digestInput = {
    player: state.player,
    location: state.location,
    inventory: state.inventory,
    effects: state.effects,
    quests: state.quests,
    properties: state.properties,
    anomalyFlags: state.anomalyFlags,
  };
  const stateDigest = sha256(digestInput);

  const body = {
    schema: "mock-kol/observation-v1" as const,
    source: "kolmafia-mock-runtime" as const,
    mock: true as const,
    runId: state.runId,
    scenarioId: state.scenarioId,
    tick: state.tick,
    stateDigest,
    player: {
      className: state.player.className,
      level: state.player.level,
      turnsRemaining: state.player.turnsRemaining,
      meat: state.player.meat,
      hp: state.player.hp,
      maxHp: state.player.maxHp,
      mp: state.player.mp,
      maxMp: state.player.maxMp,
    },
    location: state.location,
    quests: state.quests,
    relevantInventory,
    effects: state.effects,
    properties: state.properties,
    recentMessages: state.recentMessages,
    anomalyFlags: state.anomalyFlags,
  };

  return { ...body, observationId: sha256(body) };
}

export function observationAsText(observation: Observation): string {
  return [
    `source: ${observation.source}`,
    `mock: ${observation.mock}`,
    `scenario: ${observation.scenarioId}`,
    `tick: ${observation.tick}`,
    `class: ${observation.player.className}`,
    `level: ${observation.player.level}`,
    `turns_remaining: ${observation.player.turnsRemaining}`,
    `meat: ${observation.player.meat}`,
    `location: ${observation.location}`,
    `quests: ${JSON.stringify(observation.quests)}`,
    `inventory: ${JSON.stringify(observation.relevantInventory)}`,
    `effects: ${JSON.stringify(observation.effects)}`,
    `properties: ${JSON.stringify(observation.properties)}`,
    `recent_messages: ${JSON.stringify(observation.recentMessages)}`,
    `anomaly_flags: ${JSON.stringify(observation.anomalyFlags)}`,
  ].join("\n");
}
