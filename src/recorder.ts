import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { RecorderEntry, WorldState } from "./types.ts";

const AUTHORITY = {
  grantsAuthority: false as const,
  grantsExecutionPermission: false as const,
  mayModifyRuntime: false as const,
  mayTrainOnline: false as const,
};

export class ParityRecorder {
  private seq = 0;
  readonly path: string;

  constructor(path = process.env.RECORDER_PATH || "./data/parity-recorder.jsonl") {
    this.path = resolve(path);
    mkdirSync(dirname(this.path), { recursive: true });
    if (existsSync(this.path)) {
      const lines = readFileSync(this.path, "utf8").split("\n").filter(Boolean);
      this.seq = lines.length;
    }
  }

  append(state: WorldState, kind: string, payload: Record<string, unknown>): RecorderEntry {
    const entry: RecorderEntry = {
      schema: "kol-parity-recorder/event-v1",
      seq: ++this.seq,
      wallTime: new Date().toISOString(),
      logicalTick: state.tick,
      runId: state.runId,
      scenarioId: state.scenarioId,
      kind,
      payload,
      authority: AUTHORITY,
    };
    appendFileSync(this.path, JSON.stringify(entry) + "\n", "utf8");
    return entry;
  }

  recent(limit = 20): RecorderEntry[] {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, "utf8")
      .split("\n")
      .filter(Boolean)
      .slice(-Math.max(1, Math.min(limit, 500)))
      .map((line) => JSON.parse(line));
  }

  status(): Record<string, unknown> {
    return {
      mode: "RECORD_ONLY",
      path: this.path,
      entries: this.seq,
      mayChooseAction: false,
      mayModifySimulation: false,
      mayModifyContext: false,
      mayTrainOnline: false,
      mayUpdateQTable: false,
      mayGrantAuthority: false,
    };
  }
}
