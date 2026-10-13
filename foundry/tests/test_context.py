import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from kol_foundry.context import (
    ContextPlaneError,
    load_goblin_runtime,
    load_html_matrix,
)


class ContextPlaneTests(unittest.TestCase):
    def test_goblin_runtime_redacts_identity_and_hooks(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "runtime.tsv"
            path.write_text(
                "\n".join(
                    [
                        "generated_at\t2026-10-13T17:00:00",
                        "kolmafia_revision\t29307",
                        "player\tSensitiveName",
                        "player_id\t123456",
                        "loginScript\tsecret hook",
                        "html_matrix_installed\ttrue",
                        "authority_note\tDocumentation and observation are not execution permission.",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            witness = load_goblin_runtime(path)
            self.assertEqual(witness["status"], "LOADED")
            self.assertEqual(witness["fields"]["kolmafia_revision"], "29307")
            self.assertNotIn("player", witness["fields"])
            self.assertIn("player", witness["redactedKeys"])
            self.assertFalse(witness["mayAuthorizeExecution"])

    def test_html_matrix_checks_hashes_and_extracts_runtime_nodes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            master = {
                "schema": "matrix/v1",
                "workspace_id": "ws",
                "generated_at": "now",
                "agent_start": "start",
                "authority_invariants": ["Observation evidence does not authorize execution."],
                "workflows": [
                    {"id": "wf-pymafia", "name": "py", "steps": ["a"], "note": "n"},
                    {"id": "wf-other", "name": "other", "steps": []},
                ],
            }
            hyper = {
                "nodes": [
                    {
                        "id": "runtime:learning",
                        "name": "Adaptive Retrieval Overlay",
                        "authority": "preference-only",
                        "tier": "T1",
                        "effect": "local-state",
                        "pointer": "mem://doc-runtime/0007#abc",
                        "provenance": "fixture",
                    },
                    {"id": "other", "name": "ignored"},
                ]
            }
            master_bytes = json.dumps(master, separators=(",", ":")).encode()
            hyper_bytes = json.dumps(hyper, separators=(",", ":")).encode()
            (root / "agent-master-index.json").write_bytes(master_bytes)
            (root / "hyper-data.json").write_bytes(hyper_bytes)
            manifest = {
                "agent_plane": {
                    "agent_master_index": {
                        "sha256": hashlib.sha256(master_bytes).hexdigest()
                    },
                    "hyper_data": {
                        "sha256": hashlib.sha256(hyper_bytes).hexdigest()
                    },
                }
            }
            (root / "source-manifest.json").write_text(
                json.dumps(manifest), encoding="utf-8"
            )

            witness = load_html_matrix(root)
            self.assertEqual(witness["status"], "LOADED")
            self.assertEqual(witness["runtimeNodes"][0]["id"], "runtime:learning")
            self.assertEqual(witness["workflows"][0]["id"], "wf-pymafia")
            self.assertFalse(witness["mayAuthorizeExecution"])

    def test_html_matrix_hash_mismatch_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "agent-master-index.json").write_text("{}", encoding="utf-8")
            (root / "hyper-data.json").write_text('{"nodes":[]}', encoding="utf-8")
            (root / "source-manifest.json").write_text(
                json.dumps(
                    {
                        "agent_plane": {
                            "agent_master_index": {"sha256": "wrong"},
                            "hyper_data": {},
                        }
                    }
                ),
                encoding="utf-8",
            )
            with self.assertRaises(ContextPlaneError):
                load_html_matrix(root)


if __name__ == "__main__":
    unittest.main()
