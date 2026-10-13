import type { Observation, WorldState } from "./types.ts";
import { projectObservation } from "./observation.ts";
import { XorShift64Star } from "./rng.ts";
import { sha256 } from "./util.ts";

export type ControlAction =
  | "proceed"
  | "reroute"
  | "restore"
  | "wait"
  | "reconcile"
  | "stop"
  | "need_context";

export type InteractionGroundTruth = {
  controlAction: ControlAction;
  requiredContext: string[];
  blockCurrentTask: boolean;
};

export type InteractionDefinition = {
  id: string;
  family: string;
  variant: ControlAction;
  title: string;
  description: string;
  core: boolean;
  groundTruth: InteractionGroundTruth;
};

type FamilyTemplate = {
  family: string;
  title: string;
  description: string;
  core: boolean;
  context: string[];
  setup: (state: WorldState, rng: XorShift64Star) => void;
};

const FAMILIES: FamilyTemplate[] = [
  {
    family: "quest-progress",
    title: "Quest progression",
    description: "Quest step, location, inventory, and recent progress must agree.",
    core: true,
    context: ["live_state", "quest_state", "recent_history"],
    setup: (s) => {
      s.location = "The Hidden Temple";
      s.quests.questL11Worship = "step2";
      s.properties.questL11Worship = "step2";
      s.inventory["stone wool"] = 1;
      s.properties.nextObjective = "advance worship quest";
      s.recentMessages.push("The current quest step and location agree.");
    },
  },
  {
    family: "choice-adventure",
    title: "Choice adventure",
    description: "Available choice options and current equipment constrain the next branch.",
    core: true,
    context: ["live_state", "choice_options", "equipment"],
    setup: (s) => {
      s.location = "The Penultimate Fantasy Airship";
      s.properties.choiceId = 182;
      s.properties.availableChoiceOptions = "1,4,5,6";
      s.properties.choiceEquipmentConditionMet = true;
      s.recentMessages.push("A choice adventure is open and its available options were captured.");
    },
  },
  {
    family: "combat-readiness",
    title: "Combat readiness",
    description: "HP, MP, expected monster, and the planned combat resource must be checked together.",
    core: true,
    context: ["live_state", "combat_state", "resource_budget"],
    setup: (s) => {
      s.location = "The Defiled Nook";
      s.player.hp = 72;
      s.player.maxHp = 100;
      s.player.mp = 46;
      s.player.maxMp = 80;
      s.properties.expectedMonster = "dirty old lihc";
      s.properties.minimumHpForPlan = 35;
      s.properties.minimumMpForPlan = 12;
      s.properties.combatResourceUsesLeft = 2;
      s.recentMessages.push("The expected combat is within the current HP/MP budget.");
    },
  },
  {
    family: "recovery",
    title: "HP / MP recovery",
    description: "A task may require local recovery before another turn is spent.",
    core: true,
    context: ["live_state", "combat_state", "inventory"],
    setup: (s) => {
      s.location = "The Haunted Library";
      s.player.hp = 65;
      s.player.maxHp = 100;
      s.player.mp = 38;
      s.player.maxMp = 80;
      s.inventory["mock healing item"] = 2;
      s.properties.minimumHpForNextTask = 30;
      s.properties.minimumMpForNextTask = 10;
      s.recentMessages.push("Current resources exceed the next task's stated minimums.");
    },
  },
  {
    family: "resource-allocation",
    title: "Limited resource allocation",
    description: "Pulls, backups, free kills, or similar limited resources may be reserved for later tasks.",
    core: true,
    context: ["live_state", "resource_budget", "route_state"],
    setup: (s) => {
      s.properties.resourceName = "backup camera use";
      s.properties.resourceUsesLeft = 5;
      s.properties.resourceUsesReserved = 2;
      s.properties.currentTaskBenefitTurns = 3;
      s.properties.laterTaskBenefitTurns = 1;
      s.recentMessages.push("The current task has a higher measured benefit than the later reservation.");
    },
  },
  {
    family: "wanderer-delay",
    title: "Delay and wanderer timing",
    description: "A location's remaining delay and a wanderer window can change which task should run now.",
    core: true,
    context: ["live_state", "route_state", "resource_budget"],
    setup: (s) => {
      s.location = "The Haunted Billiards Room";
      s.properties.locationDelayTotal = 5;
      s.properties.locationTurnsSpent = 5;
      s.properties.wandererDueInTurns = 8;
      s.properties.wandererCompatibleHere = true;
      s.recentMessages.push("The location delay is already exhausted; no timing window is immediately due.");
    },
  },
  {
    family: "post-adventure-readback",
    title: "Post-adventure verification",
    description: "Success-shaped script output must agree with authoritative state change.",
    core: true,
    context: ["live_state", "recent_history", "route_state"],
    setup: (s) => {
      s.location = "Noob Cave";
      s.properties.lastScriptResult = "SUCCESS";
      s.properties.expectedStateDelta = "turn +1 and location readback";
      s.properties.observedStateDelta = true;
      s.recentMessages.push("The script result and authoritative readback agree.");
    },
  },
  {
    family: "external-service",
    title: "External service fallback",
    description: "An optional service such as a monster source may be unavailable while local alternatives exist.",
    core: true,
    context: ["live_state", "external_service", "route_state"],
    setup: (s) => {
      s.properties.externalService = "mock monster source";
      s.properties.externalServiceReachable = true;
      s.properties.localFallbackCount = 2;
      s.properties.externalResourceRequired = false;
      s.recentMessages.push("The optional external service is reachable and local fallbacks also exist.");
    },
  },
  {
    family: "inventory-acquisition",
    title: "Inventory acquisition",
    description: "Required item counts and reachable acquisition sources determine whether the task can continue.",
    core: false,
    context: ["live_state", "inventory", "game_data"],
    setup: (s) => {
      s.inventory["required widget"] = 1;
      s.properties.requiredItem = "required widget";
      s.properties.requiredItemCount = 1;
      s.properties.reachableAcquisitionSources = 2;
      s.recentMessages.push("The required item is already present in sufficient quantity.");
    },
  },
  {
    family: "equipment-outfit",
    title: "Equipment and outfit constraints",
    description: "Required equipment, modifiers, and mutually exclusive slots can affect task readiness.",
    core: false,
    context: ["live_state", "equipment", "game_data"],
    setup: (s) => {
      s.properties.requiredOutfit = "mock quest disguise";
      s.properties.requiredOutfitComplete = true;
      s.properties.conflictingRequiredSlot = false;
      s.properties.targetModifier = "item drop";
      s.recentMessages.push("The required disguise is complete and no slot conflicts are present.");
    },
  },
  {
    family: "familiar-routing",
    title: "Familiar routing",
    description: "Familiar requirements, weight, and no-familiar constraints can alter task readiness.",
    core: false,
    context: ["live_state", "familiar_state", "route_state"],
    setup: (s) => {
      s.properties.currentFamiliar = "Mock Goose";
      s.properties.currentFamiliarWeight = 20;
      s.properties.minimumFamiliarWeight = 15;
      s.properties.familiarChangingAllowed = true;
      s.recentMessages.push("The current familiar satisfies the task's stated requirement.");
    },
  },
  {
    family: "adventure-budget",
    title: "Adventure budget",
    description: "Remaining adventures and turn-free generators determine whether ordinary tasks can continue.",
    core: false,
    context: ["live_state", "resource_budget", "route_state"],
    setup: (s) => {
      s.player.turnsRemaining = 42;
      s.properties.turnFreeAdventureGeneratorAvailable = true;
      s.properties.minimumAdventuresForRoute = 8;
      s.recentMessages.push("The route has substantially more adventures than its current reserve.");
    },
  },
  {
    family: "path-restriction",
    title: "Path-specific availability",
    description: "Current path rules can disable otherwise normal items, skills, or locations.",
    core: false,
    context: ["live_state", "game_data", "route_state"],
    setup: (s) => {
      s.properties.currentPath = "Mock Standard Path";
      s.properties.targetItemAllowed = true;
      s.properties.targetSkillAllowed = true;
      s.properties.targetLocationAccessible = true;
      s.recentMessages.push("The current path allows the relevant item, skill, and location.");
    },
  },
  {
    family: "daily-resource",
    title: "Daily resource cooldown",
    description: "Daily counters, cooldowns, and remaining uses can make a task ready now or later.",
    core: false,
    context: ["live_state", "resource_budget", "recent_history"],
    setup: (s) => {
      s.properties.dailyResource = "mock consult";
      s.properties.dailyUsesLeft = 2;
      s.properties.cooldownTurnsRemaining = 0;
      s.properties.resourceValidToday = true;
      s.recentMessages.push("A daily use remains and its cooldown is complete.");
    },
  },
  {
    family: "organ-budget",
    title: "Organ and diet budget",
    description: "Fullness, inebriety, spleen, and adventure goals can constrain consumption.",
    core: false,
    context: ["live_state", "resource_budget", "inventory"],
    setup: (s) => {
      s.properties.fullness = 10;
      s.properties.fullnessLimit = 15;
      s.properties.inebriety = 5;
      s.properties.inebrietyLimit = 15;
      s.properties.spleenUse = 3;
      s.properties.spleenLimit = 15;
      s.properties.plannedConsumptionFits = true;
      s.recentMessages.push("The planned consumption fits all current organ limits.");
    },
  },
  {
    family: "boss-gate",
    title: "Boss gate",
    description: "Quest step, key items, stats, and preparation state must all be ready before a boss attempt.",
    core: false,
    context: ["live_state", "quest_state", "combat_state", "inventory", "equipment"],
    setup: (s) => {
      s.location = "The Naughty Sorceress' Tower";
      s.quests.questL13Final = "step11";
      s.inventory["mock tower key"] = 1;
      s.properties.requiredKeyCount = 1;
      s.properties.bossPreparationComplete = true;
      s.properties.expectedBoss = "Mock Final Boss";
      s.recentMessages.push("Quest state, key inventory, and preparation checks currently agree.");
    },
  },
];

const ACTIONS: ControlAction[] = [
  "proceed",
  "reroute",
  "restore",
  "wait",
  "reconcile",
  "stop",
  "need_context",
];

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function neutralState(id: string, family: string, seed: number): WorldState {
  const rng = new XorShift64Star(BigInt(seed) + BigInt(Number(id.replace(/\D/g, "")) || 1));
  return {
    schema: "mock-kol/world-v1",
    runId: `interaction-${seed}-${id}`,
    scenarioId: id,
    scenarioFamily: family,
    seed,
    tick: 0,
    player: {
      name: "MockCannoli",
      playerId: 1079721,
      className: "Pastamancer",
      level: 11,
      turnsPlayed: 500 + rng.int(0, 20),
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
      sourceSnapshot: "COMPLETE",
      normalizedStateAgeSeconds: 1,
      alternativeTaskCount: 2,
    },
    recentMessages: ["Synthetic interaction state initialized."],
    anomalyFlags: [],
    mockOnly: true,
  };
}

function applyActionVariant(state: WorldState, action: ControlAction, family: FamilyTemplate): void {
  switch (action) {
    case "proceed":
      state.properties.currentTargetAccessible = true;
      state.properties.requiredResourceAvailable = true;
      state.recentMessages.push("Current preconditions are satisfied and the bounded target is available.");
      break;
    case "reroute":
      state.properties.currentTargetAccessible = false;
      state.properties.alternativeTaskCount = 2;
      state.properties.requiredResourceAvailable = true;
      state.recentMessages.push("The intended target is unavailable, while two other bounded tasks are currently available.");
      break;
    case "restore":
      state.player.hp = 8;
      state.player.mp = 2;
      state.inventory["mock healing item"] = 2;
      state.properties.minimumHpForNextTask = 35;
      state.properties.minimumMpForNextTask = 12;
      state.properties.localRecoverySourceAvailable = true;
      state.recentMessages.push("Current HP and MP are below the next task's stated minimums; a known local recovery source is available.");
      break;
    case "wait":
      state.properties.resourceWindowOpensInTurns = 3;
      state.properties.currentTaskWouldConsumeReservedWindow = true;
      state.properties.resourceReservedForLater = true;
      state.recentMessages.push("A reserved timing window opens after three turns, and spending here would consume that reserved opportunity.");
      break;
    case "reconcile":
      state.properties.normalizedLocation = state.location;
      state.properties.rawLastAdventure = "A Different Mock Location";
      state.properties.normalizedQuestMarker = "step2";
      state.properties.rawQuestMarker = "step1";
      state.anomalyFlags.push("state_source_conflict");
      state.recentMessages.push("Normalized state and a raw property disagree about the current location or quest marker.");
      break;
    case "stop":
      state.player.turnsRemaining = 0;
      state.properties.turnFreeAdventureGeneratorAvailable = false;
      state.properties.alternativeTaskCount = 0;
      state.properties.hardLimitReached = true;
      state.recentMessages.push("No adventures remain, no turn-free generator is available, and no bounded alternative task is ready.");
      break;
    case "need_context":
      state.properties.sourceSnapshot = "PARTIAL";
      state.properties.normalizedStateAgeSeconds = 90;
      delete state.properties.currentTargetAccessible;
      delete state.properties.requiredResourceAvailable;
      state.properties.unknownEntityId = 700000;
      state.recentMessages = ["The observation is partial and omits a required current-state field; one referenced entity is absent from the local data snapshot."];
      break;
  }

  if (family.family === "choice-adventure" && action === "need_context") {
    delete state.properties.availableChoiceOptions;
  }
  if (family.family === "quest-progress" && action === "need_context") {
    delete state.quests.questL11Worship;
  }
  if (family.family === "external-service" && action === "reroute") {
    state.properties.externalServiceReachable = false;
    state.properties.localFallbackCount = 2;
  }
  if (family.family === "external-service" && action === "stop") {
    state.properties.externalServiceReachable = false;
    state.properties.localFallbackCount = 0;
    state.properties.externalResourceRequired = true;
  }
  if (family.family === "wanderer-delay" && action === "wait") {
    state.properties.wandererDueInTurns = 1;
    state.properties.locationDelayTotal = 5;
    state.properties.locationTurnsSpent = 2;
  }
  if (family.family === "resource-allocation" && action === "wait") {
    state.properties.resourceUsesLeft = 2;
    state.properties.resourceUsesReserved = 2;
    state.properties.currentTaskBenefitTurns = 1;
    state.properties.laterTaskBenefitTurns = 4;
  }
  if (family.family === "post-adventure-readback" && action === "reconcile") {
    state.properties.lastScriptResult = "SUCCESS";
    state.properties.observedStateDelta = false;
  }
  if (family.family === "equipment-outfit" && action === "stop") {
    state.properties.requiredOutfitComplete = false;
    state.properties.conflictingRequiredSlot = true;
  }
  if (family.family === "path-restriction" && action === "reroute") {
    state.properties.targetLocationAccessible = false;
    state.properties.alternativeTaskCount = 3;
  }
  if (family.family === "daily-resource" && action === "wait") {
    state.properties.dailyUsesLeft = 2;
    state.properties.cooldownTurnsRemaining = 4;
  }
  if (family.family === "boss-gate" && action === "restore") {
    state.player.hp = 10;
    state.player.mp = 2;
    state.properties.minimumHpForNextTask = 80;
    state.properties.minimumMpForNextTask = 30;
  }
}

function contextsFor(family: FamilyTemplate, action: ControlAction): string[] {
  const extras: Record<ControlAction, string[]> = {
    proceed: [],
    reroute: ["route_state"],
    restore: ["combat_state", "inventory"],
    wait: ["resource_budget", "route_state"],
    reconcile: ["live_state", "recent_history"],
    stop: ["live_state", "resource_budget"],
    need_context: ["game_data", "live_state"],
  };
  return unique([...family.context, ...extras[action]]);
}

export const INTERACTION_DEFINITIONS: Record<string, InteractionDefinition> = {};
const familyById = new Map<string, FamilyTemplate>();
let serial = 1;
for (const family of FAMILIES) {
  for (const action of ACTIONS) {
    const id = `interaction-${String(serial).padStart(4, "0")}`;
    INTERACTION_DEFINITIONS[id] = {
      id,
      family: family.family,
      variant: action,
      title: `${family.title} · ${action}`,
      description: family.description,
      core: family.core,
      groundTruth: {
        controlAction: action,
        requiredContext: contextsFor(family, action),
        blockCurrentTask: action !== "proceed",
      },
    };
    familyById.set(id, family);
    serial++;
  }
}

export const INTERACTION_SCENARIO_IDS = Object.keys(INTERACTION_DEFINITIONS);
export const CORE_INTERACTION_SCENARIO_IDS = INTERACTION_SCENARIO_IDS.filter(
  (id) => INTERACTION_DEFINITIONS[id].core,
);

export const INTERACTION_CONTROL_QUESTIONS = {
  control_action: {
    type: "choice",
    instructions:
      "Given only this mock KoL/KoLmafia observation, what should a deterministic control layer do before spending the next adventure on the current task?",
    criteria: {
      proceed: "current task evidence is sufficient and its preconditions are satisfied",
      reroute: "current target is not ready, but another bounded task is available",
      restore: "recover immediately required HP, MP, adventures, or a similarly local prerequisite first",
      wait: "intentionally defer because a timing window, cooldown, or reserved resource makes spending now undesirable",
      reconcile: "contradictory or stale state sources must be reconciled before trusting the current task",
      stop: "no bounded valid next step is available; halt for caller or user intervention",
      need_context: "the observation is too incomplete or unknown to choose a control action reliably",
    },
  },
  context_needed: {
    type: "multi",
    instructions: "Which evidence classes materially matter to this control decision?",
    threshold: 0.35,
    criteria: {
      live_state: "current authoritative KoLmafia state",
      quest_state: "quest progress and quest properties",
      choice_options: "currently available choice-adventure options",
      combat_state: "HP, MP, monster, combat readiness, or combat resource state",
      inventory: "current item counts and local consumables",
      equipment: "equipped items, outfit requirements, and slot conflicts",
      familiar_state: "current familiar, familiar weight, or familiar restrictions",
      resource_budget: "limited-use resources, adventures, cooldowns, or reserves",
      route_state: "task availability, delay, priorities, and alternate bounded tasks",
      recent_history: "recent transitions and post-action readback",
      game_data: "typed KoL entities, path rules, or mechanics reference",
      user_config: "explicit user options or saved-resource preferences",
      external_service: "availability of optional external services",
    },
  },
  block_current_task: {
    type: "noul",
    instructions:
      "Should the current task be blocked before spending another adventure on it, even if a different bounded task may still be available?",
  },
} as const;

export function createInteractionScenario(id: string, seed = 20261013): WorldState {
  const def = INTERACTION_DEFINITIONS[id];
  const family = familyById.get(id);
  if (!def || !family) throw new Error(`unknown interaction scenario: ${id}`);
  const state = neutralState(id, family.family, seed);
  const rng = new XorShift64Star(BigInt(seed) + BigInt(Number(id.replace(/\D/g, "")) || 1));
  family.setup(state, rng);
  applyActionVariant(state, def.variant, family);
  return state;
}

export function interactionObservation(id: string, seed = 20261013): Observation {
  return projectObservation(createInteractionScenario(id, seed));
}

export function interactionCorpusHash(): string {
  return sha256(
    INTERACTION_SCENARIO_IDS.map((id) => ({
      definition: INTERACTION_DEFINITIONS[id],
      observation: interactionObservation(id),
    })),
  );
}
