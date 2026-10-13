import tempfile
from pathlib import Path
import unittest

from kol_foundry.store import FoundryStore, StoreConflict


class StoreTests(unittest.TestCase):
    def test_session_run_event_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = FoundryStore(Path(tmp) / "foundry.db")
            try:
                session = store.ensure_session("ses_1", "abc")
                self.assertEqual(session.world_sha256, "abc")

                run = store.begin_run("ses_1", "EXP-1")
                store.event(run.run_id, "state.loaded", {"hp": 5})
                store.finish_run(run.run_id, "COMPLETE", {"ok": True})

                exported = store.export_session("ses_1")
                self.assertEqual(exported["session"]["session_id"], "ses_1")
                self.assertEqual(len(exported["runs"]), 1)
                self.assertEqual(exported["runs"][0]["status"], "COMPLETE")
                self.assertEqual(exported["runs"][0]["events"][0]["kind"], "state.loaded")
                self.assertEqual(exported["runs"][0]["transition"], {"ok": True})
            finally:
                store.close()

    def test_session_id_cannot_be_rebound(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = FoundryStore(Path(tmp) / "foundry.db")
            try:
                store.ensure_session("ses_1", "abc")
                with self.assertRaises(StoreConflict):
                    store.ensure_session("ses_1", "different")
            finally:
                store.close()


if __name__ == "__main__":
    unittest.main()
