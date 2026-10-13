import type { Observation, WorldState } from "./types.ts";
import { projectObservation } from "./observation.ts";
import { XorShift64Star } from "./rng.ts";
import { clone, sha256 } from "./util.ts";
import { INTERACTION_CONTROL_QUESTIONS } from "./interaction-scenarios.ts";

export type MinPairTarget = "restore" | "wait" | "reconcile" | "need_context" | "stop";

export type MinPairDefinition = {
  id: string;
  family: string;
  target: MinPairTarget;
  mutation: string;
  changedPath: string;
  baseExpectedAction: string;
  variantExpectedAction: string;
};

type FamilyTemplate = {
  family: string;
  setup: (state: WorldState, rng: XorShift64Star) => void;
};

type MutationTemplate = {
  name: string;
  target: MinPairTarget;
  changedPath: string;
  baseExpectedAction: string;
  variantExpectedAction: string;
  prepare: (state: WorldState) => void;
  mutate: (state: WorldState) => void;
};

const FAMILIES: FamilyTemplate[] = [
  {
    family: "quest-progress",
    setup: (s) => {
      s.location = "The Hidden Temple";
      s.quests.questL11Worship = "step2";
      s.properties.questL11Worship = "step2";
      s.inventory["stone wool"] = 1;
      s.properties.nextObjective = "advance current quest";
    },
  },
  {
    family: "choice-adventure",
    setup: (s) => {
      s.location = "The Penultimate Fantasy Airship";
      s.properties.choiceId = 182;
      s.properties.availableChoiceOptions = "1,4,5,6";
      s.properties.choiceEquipmentConditionMet = true;
    },
  },
  {
    family: "combat-readiness",
    setup: (s) => {
      s.location = "The Defiled Nook";
      s.properties.expectedMonster = "dirty old lihc";
      s.properties.combatPlan = "one spell then attack";
      s.properties.combatResourceUsesLeft = 2;
    },
  },
  {
    family: "inventory-acquisition",
    setup: (s) => {
      s.location = "The Typical Tavern";
      s.inventory["required widget"] = 1;
      s.properties.requiredItem = "required widget";
      s.properties.requiredItemCount = 1;
    },
  },
  {
    family: "equipment-outfit",
    setup: (s) => {
      s.location = "The Haunted Library";
      s.properties.requiredOutfit = "mock quest disguise";
      s.properties.requiredOutfitComplete = true;
      s.properties.conflictingRequiredSlot = false;
    },
  },
  {
    family: "familiar-routing",
    setup: (s) => {
      s.properties.currentFamiliar = "Mock Goose";
      s.properties.currentFamiliarWeight = 20;
      s.properties.minimumFamiliarWeight = 15;
      s.properties.familiarChangingAllowed = true;
    },
  },
  {
    family: "daily-resource",
    setup: (s) => {
      s.properties.dailyResource = "mock consult";
      s.properties.dailyUsesLeft = 2;
      s.properties.resourceValidToday = true;
    },
  },
  {
    family: "adventure-budget",
    setup: (s) => {
      s.player.turnsRemaining = 20;
      s.properties.minimumAdventuresForRoute = 5;
      s.properties.turnFreeAdventureGeneratorAvailable = true;
    },
  },
  {
    family: "post-adventure-readback",
    setup: (s) => {
      s.location = "Noob Cave";
      s.properties.lastScriptResult = "SUCCESS";
      s.properties.expectedStateDelta = "turn +1 and location readback";
      s.properties.observedStateDelta = true;
    },
  },
  {
    family: "boss-gate",
    setup: (s) => {
      s.location = "The Naughty Sorceress' Tower";
      s.quests.questL13Final = "step11";
      s.inventory["mock tower key"] = 1;
      s.properties.requiredKeyCount = 1;
      s.properties.bossPreparationComplete = true;
    },
  },
];

const MUTATIONS: MutationTemplate[] = [
  // proceed -> restore
  {
    name: "hp-crosses-minimum",
    target: "restore",
    changedPath: "player.hp",
    baseExpectedAction: "proceed",
    variantExpectedAction: "restore",
    prepare: (s) => {
      s.player.hp = 60;
      s.player.maxHp = 100;
      s.properties.minimumHpForNextTask = 35;
      s.properties.localRecoverySourceAvailable = true;
    },
    mutate: (s) => { s.player.hp = 8; },
  },
  {
    name: "mp-crosses-minimum",
    target: "restore",
    changedPath: "player.mp",
    baseExpectedAction: "proceed",
    variantExpectedAction: "restore",
    prepare: (s) => {
      s.player.mp = 40;
      s.player.maxMp = 80;
      s.properties.minimumMpForNextTask = 12;
      s.properties.localRecoverySourceAvailable = true;
    },
    mutate: (s) => { s.player.mp = 2; },
  },
  {
    name: "adventures-drop-to-zero-with-generator",
    target: "restore",
    changedPath: "player.turnsRemaining",
    baseExpectedAction: "proceed",
    variantExpectedAction: "restore",
    prepare: (s) => {
      s.player.turnsRemaining = 12;
      s.properties.minimumAdventuresForTask = 1;
      s.properties.turnFreeAdventureGeneratorAvailable = true;
    },
    mutate: (s) => { s.player.turnsRemaining = 0; },
  },
  {
    name: "required-effect-expires",
    target: "restore",
    changedPath: "effects.Mock Defensive Buff",
    baseExpectedAction: "proceed",
    variantExpectedAction: "restore",
    prepare: (s) => {
      s.effects["Mock Defensive Buff"] = 3;
      s.properties.minimumRequiredEffectTurns = 1;
      s.properties.localEffectRefreshAvailable = true;
    },
    mutate: (s) => { s.effects["Mock Defensive Buff"] = 0; },
  },
  {
    name: "local-charge-exhausted",
    target: "restore",
    changedPath: "properties.localPrerequisiteCharges",
    baseExpectedAction: "proceed",
    variantExpectedAction: "restore",
    prepare: (s) => {
      s.properties.localPrerequisiteCharges = 2;
      s.properties.minimumPrerequisiteCharges = 1;
      s.properties.localPrerequisiteRecoveryAvailable = true;
    },
    mutate: (s) => { s.properties.localPrerequisiteCharges = 0; },
  },

  // proceed -> wait
  {
    name: "cooldown-activates",
    target: "wait",
    changedPath: "properties.cooldownTurnsRemaining",
    baseExpectedAction: "proceed",
    variantExpectedAction: "wait",
    prepare: (s) => {
      s.properties.cooldownTurnsRemaining = 0;
      s.properties.resourceStillUsefulAfterCooldown = true;
    },
    mutate: (s) => { s.properties.cooldownTurnsRemaining = 4; },
  },
  {
    name: "wanderer-window-becomes-imminent",
    target: "wait",
    changedPath: "properties.wandererDueInTurns",
    baseExpectedAction: "proceed",
    variantExpectedAction: "wait",
    prepare: (s) => {
      s.properties.wandererDueInTurns = 8;
      s.properties.currentTaskWouldConsumeReservedWindow = true;
      s.properties.wandererCompatibleElsewhere = true;
    },
    mutate: (s) => { s.properties.wandererDueInTurns = 1; },
  },
  {
    name: "consult-window-becomes-near",
    target: "wait",
    changedPath: "properties.nextConsultInTurns",
    baseExpectedAction: "proceed",
    variantExpectedAction: "wait",
    prepare: (s) => {
      s.properties.nextConsultInTurns = 20;
      s.properties.reserveEnvironmentWithinTurns = 10;
      s.properties.consultsLeftToday = 2;
    },
    mutate: (s) => { s.properties.nextConsultInTurns = 5; },
  },
  {
    name: "resource-window-closes-temporarily",
    target: "wait",
    changedPath: "properties.resourceWindowOpensInTurns",
    baseExpectedAction: "proceed",
    variantExpectedAction: "wait",
    prepare: (s) => {
      s.properties.resourceWindowOpensInTurns = 0;
      s.properties.resourceWorthWaitingFor = true;
    },
    mutate: (s) => { s.properties.resourceWindowOpensInTurns = 3; },
  },
  {
    name: "day-count-crosses-preferred-boundary",
    target: "wait",
    changedPath: "properties.dayCount",
    baseExpectedAction: "proceed",
    variantExpectedAction: "wait",
    prepare: (s) => {
      s.properties.dayCount = 2;
      s.properties.preferDay2ForCurrentTask = true;
    },
    mutate: (s) => { s.properties.dayCount = 1; },
  },

  // proceed -> reconcile
  {
    name: "raw-quest-marker-diverges",
    target: "reconcile",
    changedPath: "properties.rawQuestMarker",
    baseExpectedAction: "proceed",
    variantExpectedAction: "reconcile",
    prepare: (s) => {
      s.properties.normalizedQuestMarker = "step2";
      s.properties.rawQuestMarker = "step2";
    },
    mutate: (s) => { s.properties.rawQuestMarker = "step1"; },
  },
  {
    name: "raw-location-diverges",
    target: "reconcile",
    changedPath: "properties.rawLastAdventure",
    baseExpectedAction: "proceed",
    variantExpectedAction: "reconcile",
    prepare: (s) => {
      s.properties.normalizedLocation = s.location;
      s.properties.rawLastAdventure = s.location;
    },
    mutate: (s) => { s.properties.rawLastAdventure = "A Different Mock Location"; },
  },
  {
    name: "success-readback-loses-delta",
    target: "reconcile",
    changedPath: "properties.observedStateDelta",
    baseExpectedAction: "proceed",
    variantExpectedAction: "reconcile",
    prepare: (s) => {
      s.properties.lastScriptResult = "SUCCESS";
      s.properties.observedStateDelta = true;
    },
    mutate: (s) => { s.properties.observedStateDelta = false; },
  },
  {
    name: "raw-item-count-diverges",
    target: "reconcile",
    changedPath: "properties.rawRequiredItemCount",
    baseExpectedAction: "proceed",
    variantExpectedAction: "reconcile",
    prepare: (s) => {
      s.inventory["mock counted item"] = 2;
      s.properties.rawRequiredItemCount = 2;
    },
    mutate: (s) => { s.properties.rawRequiredItemCount = 0; },
  },
  {
    name: "raw-effect-duration-diverges",
    target: "reconcile",
    changedPath: "properties.rawEffectTurns",
    baseExpectedAction: "proceed",
    variantExpectedAction: "reconcile",
    prepare: (s) => {
      s.effects["Mock Tracked Effect"] = 3;
      s.properties.rawEffectTurns = 3;
    },
    mutate: (s) => { s.properties.rawEffectTurns = 9; },
  },

  // proceed -> need_context
  {
    name: "snapshot-becomes-partial",
    target: "need_context",
    changedPath: "properties.sourceSnapshot",
    baseExpectedAction: "proceed",
    variantExpectedAction: "need_context",
    prepare: (s) => { s.properties.sourceSnapshot = "COMPLETE"; },
    mutate: (s) => { s.properties.sourceSnapshot = "PARTIAL"; },
  },
  {
    name: "choice-options-become-unknown",
    target: "need_context",
    changedPath: "properties.currentChoiceOptionsKnown",
    baseExpectedAction: "proceed",
    variantExpectedAction: "need_context",
    prepare: (s) => { s.properties.currentChoiceOptionsKnown = true; },
    mutate: (s) => { s.properties.currentChoiceOptionsKnown = false; },
  },
  {
    name: "quest-fact-becomes-unknown",
    target: "need_context",
    changedPath: "properties.currentQuestFact",
    baseExpectedAction: "proceed",
    variantExpectedAction: "need_context",
    prepare: (s) => { s.properties.currentQuestFact = "step2"; },
    mutate: (s) => { s.properties.currentQuestFact = null; },
  },
  {
    name: "entity-leaves-local-data",
    target: "need_context",
    changedPath: "properties.entityInLocalData",
    baseExpectedAction: "proceed",
    variantExpectedAction: "need_context",
    prepare: (s) => { s.properties.entityInLocalData = true; },
    mutate: (s) => { s.properties.entityInLocalData = false; },
  },
  {
    name: "live-readback-becomes-stale",
    target: "need_context",
    changedPath: "properties.liveReadbackAgeSeconds",
    baseExpectedAction: "proceed",
    variantExpectedAction: "need_context",
    prepare: (s) => {
      s.properties.liveReadbackAgeSeconds = 1;
      s.properties.maxTrustedReadbackAgeSeconds = 30;
    },
    mutate: (s) => { s.properties.liveReadbackAgeSeconds = 300; },
  },

  // reroute -> stop
  {
    name: "last-alternative-task-disappears",
    target: "stop",
    changedPath: "properties.alternativeTaskCount",
    baseExpectedAction: "reroute",
    variantExpectedAction: "stop",
    prepare: (s) => {
      s.properties.currentTargetAccessible = false;
      s.properties.alternativeTaskCount = 1;
    },
    mutate: (s) => { s.properties.alternativeTaskCount = 0; },
  },
  {
    name: "last-service-fallback-disappears",
    target: "stop",
    changedPath: "properties.localFallbackCount",
    baseExpectedAction: "reroute",
    variantExpectedAction: "stop",
    prepare: (s) => {
      s.properties.currentTargetAccessible = false;
      s.properties.externalServiceReachable = false;
      s.properties.localFallbackCount = 1;
    },
    mutate: (s) => { s.properties.localFallbackCount = 0; },
  },
  {
    name: "last-choice-fallback-disappears",
    target: "stop",
    changedPath: "properties.validChoiceFallbackCount",
    baseExpectedAction: "reroute",
    variantExpectedAction: "stop",
    prepare: (s) => {
      s.properties.currentTargetAccessible = false;
      s.properties.validChoiceFallbackCount = 1;
    },
    mutate: (s) => { s.properties.validChoiceFallbackCount = 0; },
  },
  {
    name: "last-acquisition-source-disappears",
    target: "stop",
    changedPath: "properties.reachableAcquisitionSources",
    baseExpectedAction: "reroute",
    variantExpectedAction: "stop",
    prepare: (s) => {
      s.properties.currentTargetAccessible = false;
      s.properties.reachableAcquisitionSources = 1;
    },
    mutate: (s) => { s.properties.reachableAcquisitionSources = 0; },
  },
  {
    name: "last-turn-free-fallback-disappears",
    target: "stop",
    changedPath: "properties.turnFreeFallbackCount",
    baseExpectedAction: "reroute",
    variantExpectedAction: "stop",
    prepare: (s) => {
      s.player.turnsRemaining = 0;
      s.properties.currentTargetAccessible = false;
      s.properties.turnFreeFallbackCount = 1;
    },
    mutate: (s) => { s.properties.turnFreeFallbackCount = 0; },
  },
];

function baseState(pairId: string, family: string, seed: number): WorldState {
  const rng = new XorShift64Star(BigInt(seed) + BigInt(Number(pairId.replace(/\D/g, "")) || 1));
  return {
    schema: "mock-kol/world-v1",
    runId: `minpair-${seed}-${pairId}`,
    scenarioId: pairId,
    scenarioFamily: family,
    seed,
    tick: 0,
    player: {
      name: "MockCannoli",
      playerId: 1079721,
      className: "Pastamancer",
      level: 11,
      turnsPlayed: 600 + rng.int(0, 20),
      turnsRemaining: 40,
      meat: 15000 + rng.int(0, 2000),
      hp: 80,
      maxHp: 100,
      mp: 50,
      maxMp: 80,
    },
    location: "The Right Side of the Tracks",
    inventory: { "worthless trinket": 1 },
    effects: {},
    quests: {},
    properties: {
      mockRuntime: true,
      currentTargetAccessible: true,
    },
    recentMessages: ["Synthetic minimal-pair state initialized."],
    anomalyFlags: [],
    mockOnly: true,
  };
}

function diffPaths(a: unknown, b: unknown, prefix = ""): string[] {
  if (Object.is(a, b)) return [];

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return [prefix || "<root>"];
    if (a.length !== b.length) return [prefix || "<root>"];
    return a.flatMap((value, index) =>
      diffPaths(value, b[index], `${prefix}[${index}]`)
    );
  }

  if (
    a === null || b === null ||
    typeof a !== "object" || typeof b !== "object"
  ) {
    return [prefix || "<root>"];
  }

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(ao), ...Object.keys(bo)])].sort();
  return keys.flatMap((key) => diffPaths(ao[key], bo[key], prefix ? `${prefix}.${key}` : key));
}

export const MINPAIR_DEFINITIONS: Record<string, MinPairDefinition> = {};
const familyByPair = new Map<string, FamilyTemplate>();
const mutationByPair = new Map<string, MutationTemplate>();

let serial = 1;
for (const family of FAMILIES) {
  for (const target of ["restore", "wait", "reconcile", "need_context", "stop"] as MinPairTarget[]) {
    for (const mutation of MUTATIONS.filter((m) => m.target === target)) {
      const id = `minpair-${String(serial).padStart(4, "0")}`;
      MINPAIR_DEFINITIONS[id] = {
        id,
        family: family.family,
        target,
        mutation: mutation.name,
        changedPath: mutation.changedPath,
        baseExpectedAction: mutation.baseExpectedAction,
        variantExpectedAction: mutation.variantExpectedAction,
      };
      familyByPair.set(id, family);
      mutationByPair.set(id, mutation);
      serial++;
    }
  }
}

export const MINPAIR_PAIR_IDS = Object.keys(MINPAIR_DEFINITIONS);
export const MINPAIR_QUESTIONS = INTERACTION_CONTROL_QUESTIONS;

export function createMinPair(id: string, seed = 20261013): {
  base: WorldState;
  variant: WorldState;
  changedPaths: string[];
} {
  const def = MINPAIR_DEFINITIONS[id];
  const family = familyByPair.get(id);
  const mutation = mutationByPair.get(id);
  if (!def || !family || !mutation) throw new Error(`unknown minpair: ${id}`);

  const base = baseState(id, family.family, seed);
  const rng = new XorShift64Star(BigInt(seed) + BigInt(Number(id.replace(/\D/g, "")) || 1));
  family.setup(base, rng);
  mutation.prepare(base);

  const variant = clone(base);
  mutation.mutate(variant);
  const changedPaths = diffPaths(base, variant);
  return { base, variant, changedPaths };
}

export function minPairObservations(id: string, seed = 20261013): {
  base: Observation;
  variant: Observation;
  changedPaths: string[];
} {
  const pair = createMinPair(id, seed);
  return {
    base: projectObservation(pair.base),
    variant: projectObservation(pair.variant),
    changedPaths: pair.changedPaths,
  };
}

export function minPairCorpusHash(): string {
  return sha256(MINPAIR_PAIR_IDS.map((id) => {
    const def = MINPAIR_DEFINITIONS[id];
    const pair = minPairObservations(id);
    return {
      definition: def,
      baseStateDigest: pair.base.stateDigest,
      variantStateDigest: pair.variant.stateDigest,
      changedPaths: pair.changedPaths,
    };
  }));
}
