from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from .contracts import FoundryTransition, WorldState
from .pymafia_host import FoundryBlocked, PyMafiaHost, RuntimeConfig
from . import watergoat


def _load_world(path: Path) -> WorldState:
    return WorldState.from_dict(json.loads(path.read_text(encoding="utf-8")))


def _write_json(path: Path | None, value: dict[str, Any]) -> None:
    text = json.dumps(value, indent=2, sort_keys=True) + "\n"
    if path is None:
        print(text, end="")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def smoke(args: argparse.Namespace) -> int:
    world = _load_world(args.world)
    host = PyMafiaHost(
        RuntimeConfig(
            revision=args.revision,
            root=args.kolmafia_root.expanduser().resolve(),
        )
    )
    host.start()
    host.load_world(world)

    frame = host.state_frame()
    probe = {
        "expression": "my_adventures()",
        "output": host.probe_ash("my_adventures()"),
    }

    student = None
    if not args.skip_watergoat:
        student = watergoat.query(
            frame,
            world.candidates,
            endpoint=args.watergoat_url,
            timeout_seconds=args.timeout,
        )

    transition = FoundryTransition(
        schema="kol-foundry/transition-v0.1",
        experiment_id=args.experiment_id,
        world_sha256=world.canonical_sha256(),
        runtime={
            "host": "pymafia-jpype",
            "kolmafiaRevision": args.revision,
            "pymafiaPin": "f346a55d050bf52901424ad6f2c7f01ef4fbc468",
            "mode": "OFFLINE_NO_SESSION",
        },
        state=frame,
        runtime_probe=probe,
        student=student,
        teacher={
            "status": "NOT_WIRED",
            "reason": "InstantSCCS teacher extraction is the next bounded milestone.",
        },
        authority={
            "studentMayExecute": False,
            "teacherMayExecute": False,
            "liveFallbackAllowed": False,
            "authenticatedSessionAllowed": False,
        },
    )
    _write_json(args.out, transition.to_dict())
    return 0


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Offline KoLmafia WaterSheep foundry host")
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser("smoke", help="load one synthetic world and emit one transition")
    s.add_argument(
        "--world",
        type=Path,
        default=Path("foundry/fixtures/synthetic-state-001.json"),
    )
    s.add_argument(
        "--kolmafia-root",
        type=Path,
        default=Path(os.environ.get("KOL_FOUNDRY_KOLMAFIA_ROOT", ".foundry/kolmafia")),
    )
    s.add_argument(
        "--revision",
        type=int,
        default=int(os.environ.get("KOL_FOUNDRY_KOLMAFIA_REVISION", "28063")),
    )
    s.add_argument(
        "--watergoat-url",
        default=os.environ.get(
            "WATERSHEEP_URL", "http://127.0.0.1:8766/v1/decisions"
        ),
    )
    s.add_argument("--timeout", type=float, default=30.0)
    s.add_argument("--skip-watergoat", action="store_true")
    s.add_argument("--experiment-id", default="KOLMAFIA-SIM-HOST-001")
    s.add_argument("--out", type=Path)
    s.set_defaults(func=smoke)
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        return int(args.func(args))
    except (FoundryBlocked, watergoat.WaterGoatBlocked) as exc:
        print(f"BLOCKED: {exc}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
