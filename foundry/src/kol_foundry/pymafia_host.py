from __future__ import annotations

from dataclasses import dataclass
import importlib
from pathlib import Path
import sys
from typing import Any

from .contracts import WorldState


class FoundryBlocked(RuntimeError):
    pass


@dataclass(frozen=True)
class RuntimeConfig:
    revision: int
    root: Path
    synthetic_user: str = "KoLFoundryOffline"


class PyMafiaHost:
    """Thin controller around an embedded, logged-out KoLmafia JVM.

    The prototype intentionally refuses pymafia's automatic JAR download. A pinned
    KoLmafia JAR must already exist in the configured root.

    This slice does NOT yet install a JVM-level network interceptor. It therefore
    executes only local state setters/readers and an ASH readback probe. The
    authenticated session is forced to null before and after every operation.
    Full outbound-network isolation is a later Docker/SimHttpClient milestone.
    """

    def __init__(self, config: RuntimeConfig):
        self.config = config
        self.km: Any | None = None
        self.ash: Any | None = None
        self._loaded_world: WorldState | None = None

    @property
    def jar_path(self) -> Path:
        return self.config.root / f"KoLmafia-{self.config.revision}.jar"

    def _assert_python(self) -> None:
        if not ((3, 10) <= sys.version_info[:2] < (3, 12)):
            raise FoundryBlocked(
                "pymafia currently requires Python >=3.10,<3.12; use Python 3.11."
            )

    def _assert_started(self) -> None:
        if self.km is None or self.ash is None:
            raise FoundryBlocked("KoLmafia host has not been started")

    def _assert_no_authenticated_session(self) -> None:
        self._assert_started()
        if self.km.GenericRequest.sessionId is not None:
            raise FoundryBlocked(
                "KoLmafia sessionId became non-null; refusing to continue"
            )

    def _reset_for_world(self, world: WorldState) -> None:
        km = self.km
        # KoLCharacter.reset() is a no-op when given the current username. Bind each
        # synthetic world to a distinct deterministic username so reset is real.
        username = (
            f"{self.config.synthetic_user}_{world.canonical_sha256()[:12]}"
        )
        km.KoLCharacter.reset("")
        km.Preferences.reset("")
        km.KoLCharacter.reset(username)
        km.Preferences.reset(username)
        km.GenericRequest.sessionId = None

    def start(self) -> None:
        self._assert_python()
        if not self.jar_path.is_file():
            raise FoundryBlocked(
                "pinned KoLmafia JAR is missing; automatic download is forbidden in "
                f"foundry mode: {self.jar_path}"
            )

        pymafia_config = importlib.import_module("pymafia.config")
        startup = importlib.import_module("pymafia.kolmafia")
        km_module = importlib.import_module("pymafia.kolmafia.km")

        pymafia_config.set_kolmafia_revision(self.config.revision)
        pymafia_config.set_kolmafia_directory(str(self.config.root))
        startup.start_kolmafia()

        self.km = km_module
        self.ash = importlib.import_module("pymafia.ash")

        # Prevent synthetic preference mutations from being persisted to disk.
        self.km.Preferences.saveSettingsToFile = False
        self.km.GenericRequest.sessionId = None
        self._assert_no_authenticated_session()

    def load_world(self, world: WorldState) -> None:
        self._assert_no_authenticated_session()
        km = self.km
        ash = self.ash

        self._reset_for_world(world)

        p = world.player
        km.KoLCharacter.setHP(p.hp, p.max_hp, p.max_hp)
        km.KoLCharacter.setMP(p.mp, p.max_mp, p.max_mp)
        km.KoLCharacter.setAdventuresLeft(p.adventures)
        km.KoLCharacter.setAvailableMeat(p.meat)
        km.KoLCharacter.setLevel(p.level)

        for key, value in world.properties.items():
            km.Preferences.setString(key, value)

        km.KoLConstants.inventory.clear()
        for name, count in world.inventory.items():
            item = ash.to_item(name)
            if int(item.id) <= 0:
                raise FoundryBlocked(f"unknown inventory item: {name!r}")
            km.ResultProcessor.processItem(int(item.id), int(count))

        km.KoLConstants.activeEffects.clear()
        for name, turns in world.effects.items():
            effect = ash.to_effect(name)
            if int(effect.id) <= 0:
                raise FoundryBlocked(f"unknown effect: {name!r}")
            km.KoLConstants.activeEffects.add(
                km.EffectPool.get(int(effect.id), int(turns))
            )

        km.KoLCharacter.recalculateAdjustments()
        self._loaded_world = world
        self._assert_no_authenticated_session()

    def state_frame(self) -> dict[str, Any]:
        self._assert_no_authenticated_session()
        if self._loaded_world is None:
            raise FoundryBlocked("no synthetic world is loaded")

        world = self._loaded_world
        ash = self.ash
        km = self.km

        frame = {
            "schema": "kol-foundry/state-frame-v0.1",
            "worldId": world.world_id,
            "player": {
                "hp": int(ash.my_hp()),
                "maxHp": int(ash.my_maxhp()),
                "mp": int(ash.my_mp()),
                "maxMp": int(ash.my_maxmp()),
                "adventures": int(ash.my_adventures()),
                "meat": int(ash.my_meat()),
                "level": int(ash.my_level()),
            },
            "properties": {
                key: str(km.Preferences.getString(key))
                for key in sorted(world.properties)
            },
            "inventory": {
                name: int(ash.item_amount(ash.to_item(name)))
                for name in sorted(world.inventory)
            },
            "effects": {
                name: int(ash.have_effect(ash.to_effect(name)))
                for name in sorted(world.effects)
            },
            "network": {
                "authenticatedSessionPresent": km.GenericRequest.sessionId is not None,
                "guardLevel": "NO_AUTH_SESSION_ONLY",
                "requestExecutionEnabled": False,
            },
        }
        self._assert_no_authenticated_session()
        return frame

    def probe_ash(self, expression: str = "my_adventures()") -> str:
        self._assert_no_authenticated_session()
        utils = importlib.import_module("pymafia.utils")
        output = str(utils.execute(f"ash {expression}"))
        self._assert_no_authenticated_session()
        return output
