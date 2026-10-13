export type Scalar = string | number | boolean | null;

export interface PlayerState {
  name: string;
  playerId: number;
  className: string;
  level: number;
  turnsPlayed: number;
  turnsRemaining: number;
  meat: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
}

export interface WorldState {
  schema: "mock-kol/world-v1";
  runId: string;
  scenarioId: string;
  scenarioFamily: string;
  seed: number;
  tick: number;
  player: PlayerState;
  location: string;
  inventory: Record<string, number>;
  effects: Record<string, number>;
  quests: Record<string, string>;
  properties: Record<string, Scalar>;
  recentMessages: string[];
  anomalyFlags: string[];
  mockOnly: true;
}

export interface GroundTruth {
  domain: string;
  requiredContext: string[];
  reasoningDepth: "routine" | "moderate" | "deep" | "uncertain";
  anomalyExpected: boolean;
}

export interface ScenarioDefinition {
  id: string;
  family: string;
  variant?: string;
  title: string;
  description: string;
  groundTruth: GroundTruth;
  benchmark?: boolean;
}

export interface Observation {
  schema: "mock-kol/observation-v1";
  source: "kolmafia-mock-runtime";
  mock: true;
  runId: string;
  scenarioId: string;
  tick: number;
  observationId: string;
  stateDigest: string;
  player: Pick<PlayerState, "className" | "level" | "turnsRemaining" | "meat" | "hp" | "maxHp" | "mp" | "maxMp">;
  location: string;
  quests: Record<string, string>;
  relevantInventory: Record<string, number>;
  effects: Record<string, number>;
  properties: Record<string, Scalar>;
  recentMessages: string[];
  anomalyFlags: string[];
}

export interface TransitionResult {
  action: string;
  events: string[];
  changed: boolean;
  terminal: boolean;
}

export interface RecorderEntry {
  schema: "kol-parity-recorder/event-v1";
  seq: number;
  wallTime: string;
  logicalTick: number;
  runId: string;
  scenarioId: string;
  kind: string;
  payload: Record<string, unknown>;
  authority: {
    grantsAuthority: false;
    grantsExecutionPermission: false;
    mayModifyRuntime: false;
    mayTrainOnline: false;
  };
}
