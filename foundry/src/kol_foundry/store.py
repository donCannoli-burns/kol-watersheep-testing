from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
from typing import Any
from uuid import uuid4


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class SessionRecord:
    session_id: str
    world_sha256: str
    created_at: str


@dataclass(frozen=True)
class RunRecord:
    run_id: str
    session_id: str
    experiment_id: str
    status: str
    started_at: str
    completed_at: str | None


class StoreConflict(RuntimeError):
    pass


class FoundryStore:
    """Small durable control-plane store inspired by OpenCode's session/run split.

    This database stores orchestration metadata and event payloads. KoLmafia remains
    the execution runtime; the store never grants execution authority.
    """

    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS sessions (
              session_id TEXT PRIMARY KEY,
              world_sha256 TEXT NOT NULL,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS runs (
              run_id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL REFERENCES sessions(session_id),
              experiment_id TEXT NOT NULL,
              status TEXT NOT NULL,
              started_at TEXT NOT NULL,
              completed_at TEXT,
              transition_json TEXT
            );

            CREATE TABLE IF NOT EXISTS events (
              seq INTEGER PRIMARY KEY AUTOINCREMENT,
              run_id TEXT NOT NULL REFERENCES runs(run_id),
              kind TEXT NOT NULL,
              created_at TEXT NOT NULL,
              payload_json TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS events_run_seq
              ON events(run_id, seq);
            """
        )
        self.db.commit()

    def close(self) -> None:
        self.db.close()

    def ensure_session(self, session_id: str, world_sha256: str) -> SessionRecord:
        row = self.db.execute(
            "SELECT session_id, world_sha256, created_at FROM sessions WHERE session_id=?",
            (session_id,),
        ).fetchone()
        if row is not None:
            if row["world_sha256"] != world_sha256:
                raise StoreConflict(
                    f"session {session_id!r} is already bound to a different world hash"
                )
            return SessionRecord(**dict(row))

        created_at = _now()
        self.db.execute(
            "INSERT INTO sessions(session_id, world_sha256, created_at) VALUES (?, ?, ?)",
            (session_id, world_sha256, created_at),
        )
        self.db.commit()
        return SessionRecord(session_id, world_sha256, created_at)

    def begin_run(self, session_id: str, experiment_id: str) -> RunRecord:
        run_id = "run_" + uuid4().hex
        started_at = _now()
        self.db.execute(
            """
            INSERT INTO runs(run_id, session_id, experiment_id, status, started_at)
            VALUES (?, ?, ?, 'RUNNING', ?)
            """,
            (run_id, session_id, experiment_id, started_at),
        )
        self.db.commit()
        return RunRecord(run_id, session_id, experiment_id, "RUNNING", started_at, None)

    def event(self, run_id: str, kind: str, payload: dict[str, Any]) -> int:
        cur = self.db.execute(
            "INSERT INTO events(run_id, kind, created_at, payload_json) VALUES (?, ?, ?, ?)",
            (
                run_id,
                kind,
                _now(),
                json.dumps(payload, sort_keys=True, separators=(",", ":")),
            ),
        )
        self.db.commit()
        return int(cur.lastrowid)

    def finish_run(
        self, run_id: str, status: str, transition: dict[str, Any] | None
    ) -> None:
        if status not in {"COMPLETE", "BLOCKED", "FAILED"}:
            raise ValueError(f"invalid terminal run status: {status}")
        transition_json = (
            None
            if transition is None
            else json.dumps(transition, sort_keys=True, separators=(",", ":"))
        )
        self.db.execute(
            """
            UPDATE runs
               SET status=?, completed_at=?, transition_json=?
             WHERE run_id=?
            """,
            (status, _now(), transition_json, run_id),
        )
        self.db.commit()

    def export_session(self, session_id: str) -> dict[str, Any]:
        session = self.db.execute(
            "SELECT * FROM sessions WHERE session_id=?", (session_id,)
        ).fetchone()
        if session is None:
            raise KeyError(session_id)

        runs = self.db.execute(
            "SELECT * FROM runs WHERE session_id=? ORDER BY started_at, run_id",
            (session_id,),
        ).fetchall()

        exported_runs: list[dict[str, Any]] = []
        for run in runs:
            events = self.db.execute(
                "SELECT seq, kind, created_at, payload_json FROM events WHERE run_id=? ORDER BY seq",
                (run["run_id"],),
            ).fetchall()
            exported_runs.append(
                {
                    **dict(run),
                    "transition": (
                        None
                        if run["transition_json"] is None
                        else json.loads(run["transition_json"])
                    ),
                    "events": [
                        {
                            "seq": event["seq"],
                            "kind": event["kind"],
                            "createdAt": event["created_at"],
                            "payload": json.loads(event["payload_json"]),
                        }
                        for event in events
                    ],
                }
            )
            exported_runs[-1].pop("transition_json", None)

        return {
            "schema": "kol-foundry/session-export-v0.1",
            "session": dict(session),
            "runs": exported_runs,
        }
