from __future__ import annotations

from dataclasses import asdict, dataclass, field
from hashlib import sha256
import json
from typing import Any


@dataclass(frozen=True)
class PlayerState:
    hp: int
    max_hp: int
    mp: int
    max_mp: int
    adventures: int
    meat: int
    level: int

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "PlayerState":
        return cls(
            hp=int(raw["hp"]),
            max_hp=int(raw["maxHp"]),
            mp=int(raw["mp"]),
            max_mp=int(raw["maxMp"]),
            adventures=int(raw["adventures"]),
            meat=int(raw["meat"]),
            level=int(raw["level"]),
        )

    def to_dict(self) -> dict[str, int]:
        return {
            "hp": self.hp,
            "maxHp": self.max_hp,
            "mp": self.mp,
            "maxMp": self.max_mp,
            "adventures": self.adventures,
            "meat": self.meat,
            "level": self.level,
        }


@dataclass(frozen=True)
class WorldState:
    world_id: str
    player: PlayerState
    properties: dict[str, str] = field(default_factory=dict)
    inventory: dict[str, int] = field(default_factory=dict)
    effects: dict[str, int] = field(default_factory=dict)
    candidates: tuple[str, ...] = ()

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "WorldState":
        return cls(
            world_id=str(raw["worldId"]),
            player=PlayerState.from_dict(dict(raw["player"])),
            properties={str(k): str(v) for k, v in dict(raw.get("properties", {})).items()},
            inventory={str(k): int(v) for k, v in dict(raw.get("inventory", {})).items()},
            effects={str(k): int(v) for k, v in dict(raw.get("effects", {})).items()},
            candidates=tuple(str(x) for x in raw.get("candidates", [])),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "worldId": self.world_id,
            "player": self.player.to_dict(),
            "properties": dict(sorted(self.properties.items())),
            "inventory": dict(sorted(self.inventory.items())),
            "effects": dict(sorted(self.effects.items())),
            "candidates": list(self.candidates),
        }

    def canonical_sha256(self) -> str:
        payload = json.dumps(
            self.to_dict(), sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode("utf-8")
        return sha256(payload).hexdigest()


@dataclass(frozen=True)
class FoundryTransition:
    schema: str
    experiment_id: str
    world_sha256: str
    runtime: dict[str, Any]
    state: dict[str, Any]
    runtime_probe: dict[str, Any]
    student: dict[str, Any] | None
    teacher: dict[str, Any]
    authority: dict[str, bool]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
