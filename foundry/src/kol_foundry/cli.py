from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from .contracts import WorldState
from .pymafia_host import FoundryBlocked
from .service import FoundryService, SmokeRequest
from .store import FoundryStore, StoreConflict
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
    session_id = args.session_id or ("ses_" + world.canonical_sha256()[:16])
    store = FoundryStore(args.db.expanduser().resolve())
    try:
        service = FoundryService(store)
        result = service.smoke(
            SmokeRequest(
                experiment_id=args.experiment_id,
                session_id=session_id,
                world=world,
                revision=args.revision,
                kolmafia_root=args.kolmafia_root.expanduser().resolve(),
                watergoat_url=args.watergoat_url,
                watergoat_timeout=args.timeout,
                query_student=not args.skip_watergoat,
            )
        )
        _write_json(args.out, result)
        return 0
    finally:
        store.close()


def export_session(args: argparse.Namespace) -> int:
    store = FoundryStore(args.db.expanduser().resolve())
    try:
        _write_json(args.out, store.export_session(args.session_id))
        return 0
    finally:
        store.close()


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Offline KoLmafia WaterSheep foundry control plane"
    )
    p.add_argument(
        "--db",
        type=Path,
        default=Path(
            os.environ.get("KOL_FOUNDRY_DB", ".foundry/state/foundry.sqlite3")
        ),
        help="durable session/run/event store",
    )
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser(
        "smoke", help="load one synthetic world and emit one durable transition"
    )
    s.add_argument(
        "--world",
        type=Path,
        default=Path("foundry/fixtures/synthetic-state-001.json"),
    )
    s.add_argument(
        "--kolmafia-root",
        type=Path,
        default=Path(
            os.environ.get("KOL_FOUNDRY_KOLMAFIA_ROOT", ".foundry/kolmafia")
        ),
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
    s.add_argument("--session-id")
    s.add_argument("--out", type=Path)
    s.set_defaults(func=smoke)

    e = sub.add_parser(
        "export-session", help="export a durable foundry session and its event stream"
    )
    e.add_argument("session_id")
    e.add_argument("--out", type=Path)
    e.set_defaults(func=export_session)

    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        return int(args.func(args))
    except (
        FoundryBlocked,
        watergoat.WaterGoatBlocked,
        StoreConflict,
        KeyError,
    ) as exc:
        print(f"BLOCKED: {exc}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
