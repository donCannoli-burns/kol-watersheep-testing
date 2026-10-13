import unittest

from kol_foundry.contracts import WorldState
from kol_foundry.watergoat import WaterGoatBlocked, build_request, validated_endpoint


SAMPLE = {
    "worldId": "test-world",
    "player": {
        "hp": 10,
        "maxHp": 20,
        "mp": 5,
        "maxMp": 10,
        "adventures": 11,
        "meat": 1234,
        "level": 3,
    },
    "properties": {"b": "2", "a": "1"},
    "inventory": {"seal tooth": 1},
    "effects": {},
    "candidates": ["A", "B"],
}


class ContractTests(unittest.TestCase):
    def test_world_hash_is_deterministic(self):
        a = WorldState.from_dict(SAMPLE)
        b = WorldState.from_dict(
            {
                **SAMPLE,
                "properties": {"a": "1", "b": "2"},
            }
        )
        self.assertEqual(a.canonical_sha256(), b.canonical_sha256())

    def test_request_is_advisory_choice(self):
        world = WorldState.from_dict(SAMPLE)
        req = build_request(world.to_dict(), world.candidates)
        self.assertEqual(req["questions"]["next_task"]["type"], "choice")
        self.assertEqual(set(req["questions"]["next_task"]["criteria"]), {"A", "B"})

    def test_local_model_endpoint_is_allowed(self):
        self.assertEqual(
            validated_endpoint("http://127.0.0.1:8766"),
            "http://127.0.0.1:8766/v1/decisions",
        )

    def test_remote_model_endpoint_is_blocked(self):
        with self.assertRaises(WaterGoatBlocked):
            validated_endpoint("https://example.com/v1/decisions")


if __name__ == "__main__":
    unittest.main()
