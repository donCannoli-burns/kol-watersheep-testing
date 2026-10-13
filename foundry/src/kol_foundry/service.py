from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .contracts import FoundryTransition, WorldState
from .pymafia_host import PyMafiaHost, RuntimeConfig
from .store import FoundryStore
from . import watergoat


@dataclass(frozen=True)
class SmokeRequest:
    experiment_id: str
    session_id: str
    world: WorldState
    revision: int
    kolmafia_root: Path
    watergoat_url: str
    watergoat_timeout: float
    query_student: bool


class FoundryService:
    """Control plane for foundry sessions.

    OpenCode-inspired boundary:
      * Store owns durable sessions/runs/events.
      * PyMafiaHost owns the KoLmafia execution runtime.
      * WaterGoat is an advisory sidecar.
      * The service composes them but never grants live action authority.
    """

    def __init__(self, store: FoundryStore):
        self.store = store

    def smoke(self, request: SmokeRequest) -> dict[str, Any]:
        world_hash = request.world.canonical_sha256()
        self.store.ensure_session(request.session_id, world_hash)
        run = self.store.begin_run(request.session_id, request.experiment_id)
        self.store.event(
            run.run_id,
            "run.started",
            {
                "experimentId": request.experiment_id,
                "worldId": request.world.world_id,
                "worldSha256": world_hash,
            },
        )

        try:
            host = PyMafiaHost(
                RuntimeConfig(
                    revision=request.revision,
                    root=request.kolmafia_root,
                )
            )
            host.start()
            self.store.event(
                run.run_id,
                "runtime.started",
                {
                    "host": "pymafia-jpype",
                    "kolmafiaRevision": request.revision,
                    "networkGuard": "NO_AUTH_SESSION_ONLY",
                },
            )

            host.load_world(request.world)
            frame = host.state_frame()
            self.store.event(run.run_id, "state.loaded", frame)

            probe = {
                "expression": "my_adventures()",
                "output": host.probe_ash("my_adventures()"),
            }
            self.store.event(run.run_id, "runtime.probed", probe)

            student = None
            if request.query_student:
                student = watergoat.query(
                    frame,
                    request.world.candidates,
                    endpoint=request.watergoat_url,
                    timeout_seconds=request.watergoat_timeout,
                )
                self.store.event(run.run_id, "student.queried", student)

            transition = FoundryTransition(
                schema="kol-foundry/transition-v0.1",
                experiment_id=request.experiment_id,
                world_sha256=world_hash,
                runtime={
                    "host": "pymafia-jpype",
                    "kolmafiaRevision": request.revision,
                    "pymafiaPin": "f346a55d050bf52901424ad6f2c7f01ef4fbc468",
                    "mode": "NO_AUTH_SESSION",
                    "networkGuard": "NO_AUTH_SESSION_ONLY",
                },
                state=frame,
                runtime_probe=probe,
                student=student,
                teacher={
                    "status": "NOT_WIRED",
                    "reason": (
                        "InstantSCCS teacher extraction is the next bounded milestone."
                    ),
                },
                authority={
                    "studentMayExecute": False,
                    "teacherMayExecute": False,
                    "liveFallbackAllowed": False,
                    "authenticatedSessionAllowed": False,
                },
            ).to_dict()

            self.store.event(run.run_id, "transition.emitted", transition)
            self.store.finish_run(run.run_id, "COMPLETE", transition)
            return {
                "sessionId": request.session_id,
                "runId": run.run_id,
                "transition": transition,
            }
        except Exception as exc:
            self.store.event(
                run.run_id,
                "run.blocked",
                {"errorType": type(exc).__name__, "message": str(exc)},
            )
            self.store.finish_run(run.run_id, "BLOCKED", None)
            raise
